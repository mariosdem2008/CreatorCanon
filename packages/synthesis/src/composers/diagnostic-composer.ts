/**
 * Diagnostic composer — front-door routing for the active hub.
 *
 * Originally written for operator-coach but reused by science-explainer
 * (and future archetypes) — the prompts now parameterize the archetype
 * descriptor from `input.channelProfile.archetype` so Codex drafts
 * archetype-appropriate question + intro copy.
 *
 * Pipeline:
 *   1. extractAudienceJobs: read _index_audience_jobs from channel profile.
 *   2. Codex authors 8-12 multi-choice questions whose answers reveal the
 *      reader's job (1 call). Voice-mode-aware + archetype-aware.
 *   3. buildScoringRubric (pure code): for each job, find canons whose
 *      _index_audience_job_tags overlap with the job's tags, surface them
 *      as routeToCanonIds. Recommend an actionPlan phase if signals match.
 *   4. Codex authors a 1-sentence intro (1 call).
 *
 * Total Codex calls: 2 per creator. Cheap.
 */

import type {
  ActionPlanPhaseId,
  CanonRef,
  CodexClient,
  ComposeInput,
  DiagnosticComponent,
  DiagnosticOutcome,
  DiagnosticQuestion,
} from '../types';

export interface AudienceJob {
  id: string;
  label: string;
  tags: string[];
}

/**
 * Map a channel-profile archetype to the noun phrase used in Codex prompts.
 * Anything we don't explicitly know becomes the generic "knowledge hub" so
 * Codex doesn't get a misleading hint.
 */
function archetypeDescriptor(input: ComposeInput): string {
  const a = String(input.channelProfile?.archetype ?? '').toLowerCase();
  if (a.includes('operator')) return 'operator-coach';
  if (a.includes('science') || a.includes('explainer')) return 'science-explainer';
  if (a.includes('contemplative') || a.includes('thinker')) return 'contemplative-thinker';
  if (a.includes('instructional') || a.includes('craft')) return 'instructional-craft';
  return 'knowledge';
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

export function extractAudienceJobs(profile: {
  _index_audience_jobs?: Array<{ id?: string; label?: string; tags?: string[] }> | unknown;
}): AudienceJob[] {
  const raw = profile._index_audience_jobs;
  if (!Array.isArray(raw)) return [];
  const jobs: AudienceJob[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as { id?: unknown; label?: unknown; tags?: unknown };
    if (typeof e.id !== 'string' || typeof e.label !== 'string') continue;
    const tags = Array.isArray(e.tags)
      ? e.tags.filter((t): t is string => typeof t === 'string')
      : [];
    jobs.push({ id: e.id, label: e.label, tags });
  }
  return jobs;
}

const JOB_TO_PHASE: Record<string, ActionPlanPhaseId> = {
  acquire: 'pre_revenue',
  acquisition: 'pre_revenue',
  retain: 'sub_100k_month',
  retention: 'sub_100k_month',
  hire: 'sub_100k_month',
  scale: 'scale',
  delegate: 'scale',
};

export function buildScoringRubric(
  jobs: AudienceJob[],
  canons: CanonRef[],
): Record<string, DiagnosticOutcome> {
  const rubric: Record<string, DiagnosticOutcome> = {};
  for (const job of jobs) {
    const jobTagSet = new Set(job.tags.map((t) => t.toLowerCase()));
    const matchedCanonIds = canons
      .filter((c) => {
        const tags = c.payload._index_audience_job_tags ?? [];
        if (!Array.isArray(tags)) return false;
        return tags.some((t) => typeof t === 'string' && jobTagSet.has(t.toLowerCase()));
      })
      .map((c) => c.id);

    let phase: ActionPlanPhaseId | undefined;
    for (const tag of jobTagSet) {
      const phaseHit = JOB_TO_PHASE[tag] ?? JOB_TO_PHASE[job.id.toLowerCase()];
      if (phaseHit) {
        phase = phaseHit;
        break;
      }
    }

    const outcome: DiagnosticOutcome = {
      matchScore: 1,
      recommendedNextStep: `Start with: ${job.label}`,
      routeToCanonIds: matchedCanonIds,
      ...(phase ? { routeToActionPlanPhaseId: phase } : {}),
    };
    rubric[job.id] = outcome;
  }
  return rubric;
}

interface RawQuestionsBlob {
  questions: DiagnosticQuestion[];
}

interface RawProse {
  text: string;
}

async function authorQuestions(
  input: ComposeInput,
  jobs: AudienceJob[],
  codex: CodexClient,
): Promise<DiagnosticQuestion[]> {
  const voiceLabel =
    input.voiceMode === 'first_person'
      ? 'first-person ("where are you stuck?")'
      : input.voiceMode === 'third_person_editorial'
        ? 'editorial third-person'
        : 'mixed register';

  const jobList = jobs.length > 0
    ? jobs.map((j) => `- ${j.id}: ${j.label} (tags: ${j.tags.join(', ')})`).join('\n')
    : '- general: figure out where the reader is stuck (no tags)';

  const archetype = archetypeDescriptor(input);
  const prompt = [
    `Author 8-12 multi-choice diagnostic questions for a ${archetype} hub. The hub serves audiences with these jobs-to-be-done:`,
    jobList,
    '',
    `Voice: ${voiceLabel}.`,
    '',
    'Each question should help reveal which job the reader has. Each option must carry a "value" matching one of the job ids above (or "general") and a numeric "weight" 0.5-1.5 for how strongly that option signals that job.',
    '',
    'Output rules:',
    '- 8-12 questions total',
    '- Each question: {"id":"q1","text":"...","options":[{"label":"...","value":"<job-id>","weight":1.0}, ...]}',
    '- 2-4 options per question',
    '- option.value MUST be one of the job ids listed above',
    '',
    'Format: ONE JSON object: {"questions":[...]}.',
    'First char {, last char }. No code fences. No prose outside the JSON.',
  ].join('\n');

  const raw = await codex.run(prompt, {
    stage: 'diagnostic_questions',
    timeoutMs: 120_000,
    label: 'diagnostic-questions',
  });
  const parsed = safeJsonParse<RawQuestionsBlob>(raw);
  if (!parsed?.questions) throw new Error('diagnostic: failed to parse questions');
  return parsed.questions;
}

async function authorIntro(input: ComposeInput, codex: CodexClient): Promise<string> {
  const voiceLabel =
    input.voiceMode === 'first_person'
      ? 'first-person'
      : input.voiceMode === 'third_person_editorial'
        ? 'editorial third-person'
        : 'mixed register';

  const archetype = archetypeDescriptor(input);
  // Archetype-aware framing: operator-coach gets "your next move",
  // science-explainer gets "the right evidence", etc. Codex picks up on the
  // hub kind even when the rest of the prompt is shared.
  const prompt = [
    `Write a 1-2 sentence ${voiceLabel} intro for a ${archetype} hub diagnostic. Tell the reader: "answer ~10 questions, get the most relevant ${archetype === 'science-explainer' ? 'evidence' : archetype === 'contemplative-thinker' ? 'card' : archetype === 'instructional-craft' ? 'lesson' : 'next move'}." Direct, no hype.`,
    '',
    `Creator: ${input.creatorName}`,
    '',
    'Format: ONE JSON object: {"text": "..."}.',
  ].join('\n');

  const raw = await codex.run(prompt, {
    stage: 'diagnostic_intro',
    timeoutMs: 60_000,
    label: 'diagnostic-intro',
  });
  const parsed = safeJsonParse<RawProse>(raw);
  return parsed?.text?.trim() ?? 'Answer a few quick questions to find your next move.';
}

export async function composeDiagnostic(
  input: ComposeInput,
  opts: { codex: CodexClient },
): Promise<DiagnosticComponent> {
  const jobs = extractAudienceJobs(input.channelProfile);
  const [questions, intro] = await Promise.all([
    authorQuestions(input, jobs, opts.codex),
    authorIntro(input, opts.codex),
  ]);
  const scoring = buildScoringRubric(
    jobs.length > 0 ? jobs : [{ id: 'general', label: 'Find your next move', tags: [] }],
    input.canons,
  );
  return { questions, intro, scoring };
}
