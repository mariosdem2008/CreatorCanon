/**
 * Worksheet Forge — turns a framework/playbook canon into a fillable worksheet.
 *
 * Pipeline:
 *   1. Filter canons to type ∈ {framework, playbook, pattern}.
 *   2. decomposeBodyToFields (pure code): subheadings → text_long;
 *      imperative bullets → text_short.
 *   3. detectDecisionBranches (pure code): "if X, [then Y]" → decision_branch.
 *   4. Codex authors setupQuestion + outputRubric + estimatedMinutes.
 *   5. Emit WorksheetComponent per canon.
 */

import type {
  CodexClient,
  CanonRef,
  ComposeInput,
  WorksheetComponent,
  WorksheetField,
} from '../types';

const ELIGIBLE_TYPES = new Set(['framework', 'playbook', 'pattern']);

const SUBHEADING_RE = /^##\s+(.+)$/gm;
const BULLET_RE = /^[-*]\s+(.+)$/gm;
/**
 * Captures sentences of the form "If <condition>, <action>." Limit the
 * <condition> chunk to ~120 chars so we don't over-greedy match across
 * sentence boundaries.
 */
const CONDITIONAL_RE = /\bIf\s+([^,.;\n]{4,120}),\s+([^.\n]{4,200})\./gi;

function slugify(s: string, fallback: string): string {
  const slug = s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
  return slug.length > 0 ? slug : fallback;
}

export function detectDecisionBranches(body: string): Array<{
  trigger: string;
  thenSteps: string[];
}> {
  const matches = [...body.matchAll(CONDITIONAL_RE)];
  return matches.map((m) => ({
    trigger: m[1]!.trim(),
    thenSteps: [m[2]!.trim()],
  }));
}

export function decomposeBodyToFields(body: string): WorksheetField[] {
  const fields: WorksheetField[] = [];
  const seenIds = new Set<string>();
  let counter = 0;

  // Subheadings → text_long.
  for (const match of body.matchAll(SUBHEADING_RE)) {
    counter += 1;
    const label = match[1]!.trim();
    const id = slugify(label, `field_${counter}`);
    if (seenIds.has(id)) continue;
    seenIds.add(id);
    fields.push({ id, type: 'text_long', label });
  }

  // Bullet imperatives → text_short.
  for (const match of body.matchAll(BULLET_RE)) {
    counter += 1;
    const raw = match[1]!.trim();
    // Skip non-imperative bullets (sub-bullets often start lower-case).
    if (raw.length < 6) continue;
    const id = slugify(raw, `field_${counter}`);
    if (seenIds.has(id)) continue;
    seenIds.add(id);
    fields.push({ id, type: 'text_short', label: raw });
  }

  // Decision branches → decision_branch.
  const branches = detectDecisionBranches(body);
  for (const b of branches) {
    counter += 1;
    const id = slugify(b.trigger, `branch_${counter}`);
    if (seenIds.has(id)) continue;
    seenIds.add(id);
    fields.push({
      id,
      type: 'decision_branch',
      label: `If ${b.trigger}`,
      branches: [{ trigger: b.trigger, thenSteps: b.thenSteps }],
    });
  }

  // Always emit at least one field so a worksheet is never empty.
  if (fields.length === 0) {
    fields.push({
      id: 'notes',
      type: 'text_long',
      label: 'Notes',
      helpText: 'Capture your thinking as you work through this.',
    });
  }

  return fields;
}

interface RawSetup {
  setupQuestion: string;
  outputRubric: string;
  estimatedMinutes: number;
}

function safeJsonParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as T;
    } catch {
      return null;
    }
  }
}

async function authorWorksheetSetup(
  canon: CanonRef,
  voiceMode: ComposeInput['voiceMode'],
  codex: CodexClient,
): Promise<RawSetup> {
  const voiceLabel =
    voiceMode === 'first_person'
      ? 'first-person ("write down...")'
      : voiceMode === 'third_person_editorial'
        ? 'editorial third-person'
        : 'mixed register';

  const prompt = [
    'You are designing a fillable worksheet from this operator-coach canon. Author the setup + the output rubric.',
    '',
    `Canon title: ${canon.payload.title ?? canon.id}`,
    `Canon body excerpt:`,
    (canon.payload.body ?? '').slice(0, 1500),
    '',
    'Output rules:',
    `- "setupQuestion": 1-2 sentences, ${voiceLabel}, anchors the reader's thinking before they fill the worksheet`,
    '- "outputRubric": 1 sentence, "you\'ll know your worksheet works when..."',
    '- "estimatedMinutes": integer, realistic time to complete (5-90)',
    '',
    'Format: ONE JSON object: {"setupQuestion":"...","outputRubric":"...","estimatedMinutes":15}.',
    'First char {, last char }. No code fences. No prose outside the JSON.',
  ].join('\n');

  const raw = await codex.run(prompt, {
    stage: 'worksheet_setup',
    timeoutMs: 60_000,
    label: `worksheet-setup:${canon.id}`,
  });
  const parsed = safeJsonParse<RawSetup>(raw);
  if (!parsed) throw new Error(`worksheet: failed to parse setup for canon ${canon.id}`);
  return parsed;
}

export async function composeWorksheets(
  input: ComposeInput,
  opts: { codex: CodexClient },
): Promise<WorksheetComponent[]> {
  const eligible = input.canons.filter((c) => ELIGIBLE_TYPES.has(c.payload.type ?? ''));

  const worksheets = await Promise.all(
    eligible.map(async (canon) => {
      const fields = decomposeBodyToFields(canon.payload.body ?? '');
      const setup = await authorWorksheetSetup(canon, input.voiceMode, opts.codex);
      const worksheet: WorksheetComponent = {
        id: `ws_${canon.id}`,
        canonId: canon.id,
        title: canon.payload.title ?? canon.id,
        setupQuestion: setup.setupQuestion,
        fields,
        outputRubric: setup.outputRubric,
        estimatedMinutes: Math.max(
          1,
          Math.min(180, Math.round(setup.estimatedMinutes ?? 15)),
        ),
      };
      return worksheet;
    }),
  );

  return worksheets;
}
