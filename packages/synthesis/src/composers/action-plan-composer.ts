/**
 * ActionPlan composer — the headline operator-coach product moment.
 *
 * Pipeline:
 *   1. Filter canon nodes to type ∈ {playbook, framework}.
 *   2. classifyCanonByPhase: regex-match phase keywords in canon body to
 *      bucket into pre_revenue / sub_10k_month / sub_100k_month / scale.
 *   3. topoSortCanons: order each phase's canons by prerequisite dependency
 *      (Kahn's algorithm; edges from _index_dependencies + body-mentions
 *      of other canon titles).
 *   4. authorActionPlanStep: 1 Codex call per canon → step name, description,
 *      durationLabel, successCriterion (voice-mode-aware).
 *   5. authorIntroOutro: 2 more Codex calls for intro + outro CTA.
 *
 * Total Codex calls per creator: ~25-50 (vs ~200-500 for full audit).
 */

import type {
  ActionPlanComponent,
  ActionPlanPhase,
  ActionPlanPhaseId,
  ActionPlanStep,
  CanonRef,
  CodexClient,
  ComposeInput,
  VoiceMode,
} from '../types';

// Re-export legacy alias for index.ts and callers from earlier drafts.
export type ActionPlanPhaseKey = ActionPlanPhaseId;

const PHASE_KEYWORDS: Record<ActionPlanPhaseId, RegExp[]> = {
  pre_revenue: [
    /niche.*down/i,
    /scattergun/i,
    /first.*\$0/i,
    /pre[- ]revenue/i,
    /\$0[- ]\$1k/i,
    /no customers/i,
    /first deal/i,
    /pick a niche/i,
  ],
  sub_10k_month: [
    /\$10[Kk] month/i,
    /first \$10/i,
    /survival/i,
    /first paid/i,
    /\bMVP\b/,
    /first system/i,
    /land your first/i,
  ],
  sub_100k_month: [
    /\$100[Kk]/i,
    /scale.*team/i,
    /processes/i,
    /repeatable/i,
    /first hire/i,
    /\$50[Kk]/i,
  ],
  scale: [
    /delegate by design/i,
    /60\+ locations/i,
    /scale operator/i,
    /\$1M/i,
    /multiply/i,
    /enterprise/i,
  ],
};

const PHASE_ORDER: ActionPlanPhaseId[] = [
  'pre_revenue',
  'sub_10k_month',
  'sub_100k_month',
  'scale',
];

const PHASE_DISPLAY_NAME: Record<ActionPlanPhaseId, string> = {
  pre_revenue: 'Pre-revenue',
  sub_10k_month: 'Sub-$10K month',
  sub_100k_month: 'Sub-$100K month',
  scale: 'Scale',
};

export function classifyCanonByPhase(canon: CanonRef): ActionPlanPhaseId {
  const body = canon.payload.body ?? '';
  let bestPhase: ActionPlanPhaseId = 'sub_100k_month';
  let bestScore = 0;
  for (const phase of PHASE_ORDER) {
    const patterns = PHASE_KEYWORDS[phase];
    const score = patterns.filter((re) => re.test(body)).length;
    if (score > bestScore) {
      bestScore = score;
      bestPhase = phase;
    }
  }
  return bestScore === 0 ? 'sub_100k_month' : bestPhase;
}

/**
 * Kahn's algorithm topological sort. Edges:
 *   - _index_dependencies (explicit canon-id refs)
 *   - body mentions of another canon's title (heuristic prerequisite)
 *
 * On cycle, falls back to lowest-id remaining for determinism.
 */
export function topoSortCanons(canons: CanonRef[]): CanonRef[] {
  if (canons.length <= 1) return [...canons];

  const idIndex = new Map(canons.map((c) => [c.id, c]));
  const titleIndex = new Map<string, string>();
  for (const c of canons) {
    const title = (c.payload.title ?? '').trim().toLowerCase();
    if (title.length >= 4) {
      // Avoid noise from very short titles.
      titleIndex.set(title, c.id);
    }
  }

  const dependencies = new Map<string, Set<string>>();
  for (const c of canons) {
    const deps = new Set<string>();
    const bodyLower = (c.payload.body ?? '').toLowerCase();
    for (const [title, otherId] of titleIndex) {
      if (otherId === c.id) continue;
      if (bodyLower.includes(title)) deps.add(otherId);
    }
    if (Array.isArray(c.payload._index_dependencies)) {
      for (const d of c.payload._index_dependencies) {
        if (typeof d === 'string' && idIndex.has(d) && d !== c.id) deps.add(d);
      }
    }
    dependencies.set(c.id, deps);
  }

  const result: CanonRef[] = [];
  const remaining = new Map(canons.map((c) => [c.id, c]));
  while (remaining.size > 0) {
    const ready = [...remaining.values()]
      .sort((a, b) => a.id.localeCompare(b.id))
      .find((c) => {
        const deps = dependencies.get(c.id) ?? new Set();
        return [...deps].every((d) => !remaining.has(d));
      });
    if (!ready) {
      // Cycle: take lowest-id remaining and continue.
      const fallback = [...remaining.values()].sort((a, b) => a.id.localeCompare(b.id))[0];
      if (!fallback) break;
      result.push(fallback);
      remaining.delete(fallback.id);
      continue;
    }
    result.push(ready);
    remaining.delete(ready.id);
  }
  return result;
}

interface RawStep {
  title: string;
  description: string;
  durationLabel: string;
  successCriterion: string;
  estimatedMinutes?: number;
}

function safeJsonParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    // Strip code fences + leading prose, find first `{`...`}` slice, retry.
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as T;
    } catch {
      return null;
    }
  }
}

async function authorActionPlanStep(
  canon: CanonRef,
  codex: CodexClient,
  voiceMode: VoiceMode,
): Promise<ActionPlanStep> {
  const voiceLabel =
    voiceMode === 'first_person'
      ? 'first-person ("you do this")'
      : voiceMode === 'third_person_editorial'
        ? 'editorial third-person'
        : 'mixed register';

  const prompt = [
    'You are writing one step of an operator-coach action plan. Read this canon and emit a JSON step.',
    '',
    `Canon title: ${canon.payload.title ?? canon.id}`,
    `Canon body excerpt:`,
    (canon.payload.body ?? '').slice(0, 1500),
    '',
    'Output rules:',
    '- "title": 4-8 words, imperative ("Map the Value Ladder")',
    `- "description": 1 sentence, ${voiceLabel}, what the reader does`,
    '- "durationLabel": one of "this week", "this month", "next 90 days"',
    '- "successCriterion": 1 sentence, "you\'ll know it worked when..."',
    '- "estimatedMinutes": optional integer',
    '',
    'Format: ONE JSON object. First char {, last char }. No code fences. No prose.',
  ].join('\n');

  const raw = await codex.run(prompt, {
    stage: 'action_plan_step',
    timeoutMs: 60_000,
    label: `action-plan-step:${canon.id}`,
  });
  const parsed = safeJsonParse<RawStep>(raw);
  if (!parsed) {
    throw new Error(`action-plan: failed to parse step for canon ${canon.id}`);
  }
  return {
    id: `step_${canon.id}`,
    title: parsed.title,
    description: parsed.description,
    durationLabel: parsed.durationLabel,
    successCriterion: parsed.successCriterion,
    sourceCanonId: canon.id,
    ...(typeof parsed.estimatedMinutes === 'number'
      ? { estimatedMinutes: parsed.estimatedMinutes }
      : {}),
  };
}

interface RawProse {
  text: string;
}

async function authorIntroOutro(
  input: ComposeInput,
  codex: CodexClient,
  kind: 'intro' | 'outro',
): Promise<string> {
  const isIntro = kind === 'intro';
  const voiceLabel =
    input.voiceMode === 'first_person'
      ? 'first-person'
      : input.voiceMode === 'third_person_editorial'
        ? 'editorial third-person'
        : 'mixed register';

  const prompt = [
    isIntro
      ? `Write a 2-3 sentence ${voiceLabel} intro for an operator-coach action plan. Speak directly to the reader. Set the stakes: this plan is built from ${input.creatorName}'s playbooks. End on the action.`
      : `Write a 1-2 sentence ${voiceLabel} outro CTA for an operator-coach action plan. Drive the reader to begin the first phase. Be direct, not hype.`,
    '',
    `Creator: ${input.creatorName}`,
    `Niche: ${input.channelProfile.niche ?? '(unknown)'}`,
    '',
    'Format: ONE JSON object: {"text": "..."}. First char {, last char }. No code fences. No prose outside the JSON.',
  ].join('\n');

  const raw = await codex.run(prompt, {
    stage: `action_plan_${kind}`,
    timeoutMs: 60_000,
    label: `action-plan-${kind}`,
  });
  const parsed = safeJsonParse<RawProse>(raw);
  if (!parsed?.text) throw new Error(`action-plan: failed to parse ${kind}`);
  return parsed.text.trim();
}

export async function composeActionPlan(
  input: ComposeInput,
  opts: { codex: CodexClient },
): Promise<ActionPlanComponent> {
  const eligible = input.canons.filter((c) =>
    ['playbook', 'framework'].includes(c.payload.type ?? ''),
  );

  // Bucket into phases.
  const buckets: Record<ActionPlanPhaseId, CanonRef[]> = {
    pre_revenue: [],
    sub_10k_month: [],
    sub_100k_month: [],
    scale: [],
  };
  for (const c of eligible) buckets[classifyCanonByPhase(c)].push(c);

  const phases: ActionPlanPhase[] = [];
  let position = 0;
  for (const phaseId of PHASE_ORDER) {
    const canons = buckets[phaseId];
    if (canons.length === 0) continue;
    const ordered = topoSortCanons(canons);
    const steps = await Promise.all(
      ordered.map((c) => authorActionPlanStep(c, opts.codex, input.voiceMode)),
    );
    phases.push({
      id: phaseId,
      name: PHASE_DISPLAY_NAME[phaseId],
      position,
      steps,
    });
    position += 1;
  }

  const [intro, outroCta] = await Promise.all([
    authorIntroOutro(input, opts.codex, 'intro'),
    authorIntroOutro(input, opts.codex, 'outro'),
  ]);

  return { phases, intro, outroCta };
}
