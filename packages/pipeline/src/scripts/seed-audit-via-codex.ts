/**
 * One-off operator script: generate the audit-phase artifacts (channel
 * profile, per-video intelligence cards, canon nodes, page briefs) using
 * the local Codex CLI binary instead of the metered tool-using agents
 * (channel_profiler, video_analyst, canon_architect, page_brief_planner).
 *
 * WHY: those four agents normally use OpenAI / Gemini function-calling.
 * When their tier quotas are exhausted (429 across the entire fallback
 * chain), the audit phase can't run. This script bypasses the tool-call
 * protocol by asking Codex CLI for the exact JSON each agent would have
 * produced via its tool, then writes the rows directly to DB.
 *
 * The output is editorially equivalent (Codex is just another LLM with the
 * same instructions) but does NOT pay the metered API toll. Once this
 * script lands `audit_ready`, the user can click "Generate Hub" to run
 * page_composition (which is already routed through Codex via codex_dev).
 *
 * Usage (from packages/pipeline):
 *   tsx ./src/scripts/seed-audit-via-codex.ts <runId>
 */

import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { and, asc, closeDb, eq, getDb, inArray, sql as drizzleSql } from '@creatorcanon/db';
import {
  canonNode,
  channelProfile,
  generationRun,
  pageBrief,
  segment,
  video,
  videoIntelligenceCard,
  videoSetItem,
  visualMoment,
} from '@creatorcanon/db/schema';

import { extractJsonFromCodexOutput } from '../agents/providers/codex-extract-json';
import { loadDefaultEnvFiles } from '../env-files';

loadDefaultEnvFiles();

// ── Codex CLI driver ───────────────────────────────────────────────────────

interface CodexOpts {
  binary: string;
  argsTemplate: string[];
  timeoutMs: number;
}

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const CANON_TIMEOUT_MS = 30 * 60 * 1000; // canon synthesis sees all 6 VICs — needs more time

const CODEX_OPTS: CodexOpts = {
  binary: process.platform === 'win32' ? 'codex.cmd' : 'codex',
  argsTemplate: ['exec', '--skip-git-repo-check', '-o', '<tmpfile>'],
  timeoutMs: DEFAULT_TIMEOUT_MS,
};

/**
 * Spawn `codex exec` with the prompt piped to stdin, capture the agent's
 * final message from -o <tmpfile>. Same semantics as the existing
 * codex-cli provider, just inlined here so this script is self-contained.
 */
async function runCodex(prompt: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<string> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-audit-'));
  const tmpFile = path.join(tmpDir, 'out.txt');
  const args = CODEX_OPTS.argsTemplate.map((a) => (a === '<tmpfile>' ? tmpFile : a));

  return new Promise<string>((resolve, reject) => {
    let settled = false;
    const settle = (cb: () => void) => {
      if (settled) return;
      settled = true;
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
      cb();
    };

    const proc = spawn(CODEX_OPTS.binary, args, {
      stdio: ['pipe', 'ignore', 'pipe'],
      env: process.env,
      shell: process.platform === 'win32',
    });
    let stderr = '';
    proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });

    if (proc.stdin) {
      proc.stdin.on('error', () => { /* EPIPE on short responses — non-fatal */ });
      proc.stdin.write(prompt);
      proc.stdin.end();
    }

    const timer = setTimeout(() => {
      try { proc.kill('SIGKILL'); } catch { /* ignore */ }
      settle(() => reject(new Error(`codex-cli: timed out after ${timeoutMs}ms`)));
    }, timeoutMs);

    proc.on('error', (err) => {
      clearTimeout(timer);
      settle(() => reject(new Error(`codex-cli: failed to spawn '${CODEX_OPTS.binary}': ${err.message}`)));
    });

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        settle(() => reject(new Error(`codex-cli: exit ${code}. stderr: ${stderr.slice(-500)}`)));
        return;
      }
      try {
        const content = fs.readFileSync(tmpFile, 'utf8');
        settle(() => resolve(content));
      } catch (err) {
        settle(() => reject(new Error(`codex-cli: output file not readable (${(err as Error).message})`)));
      }
    });
  });
}

/**
 * Call Codex with retries; parse the JSON result via the lenient extractor.
 * Validates that the parsed value matches the expected `kind` (object | array)
 * — Codex sometimes returns the wrong shape on a borderline prompt and that
 * should be treated as a transient failure, not a successful output.
 *
 * Lenient mode: when `expect='array'` but Codex returns a single object, we
 * wrap it as `[obj]` and emit a warning. Codex CLI sometimes gives us "the
 * best one" instead of "all of them" when the input prompt is large; for
 * our generator that's a degraded output but still useful (a partial audit
 * beats no audit), and the caller can iterate to accumulate more entries.
 */
async function codexJson<T>(
  prompt: string,
  label: string,
  expect: 'object' | 'array' = 'object',
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  const maxAttempts = 3;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const raw = await runCodex(prompt, timeoutMs);
      const json = extractJsonFromCodexOutput(raw);
      const parsed = JSON.parse(json);
      const actualKind: 'array' | 'object' | 'other' = Array.isArray(parsed)
        ? 'array'
        : parsed != null && typeof parsed === 'object'
          ? 'object'
          : 'other';
      if (actualKind === expect) return parsed as T;
      // Lenient promotion: array-expected but got an object → wrap.
      if (expect === 'array' && actualKind === 'object') {
        console.warn(`[codex-audit] ${label} returned a single object; wrapping as [obj] (Codex gave "the best one" instead of an array)`);
        return ([parsed] as unknown) as T;
      }
      throw new Error(`expected JSON ${expect}, got ${actualKind} (preview: ${JSON.stringify(parsed).slice(0, 200)})`);
    } catch (err) {
      lastErr = err;
      console.warn(`[codex-audit] ${label} attempt ${attempt}/${maxAttempts} failed: ${(err as Error).message}`);
      if (attempt === maxAttempts) break;
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
  throw lastErr;
}

// ── Loaders ────────────────────────────────────────────────────────────────

interface LoadedSegment {
  segmentId: string;
  videoId: string;
  startMs: number;
  endMs: number;
  text: string;
}

interface LoadedVisualMoment {
  visualMomentId: string;
  videoId: string;
  timestampMs: number;
  type: string;
  description: string;
  hubUse: string;
  usefulnessScore: number;
}

async function loadRun(runId: string) {
  const db = getDb();
  const r = await db.select().from(generationRun).where(eq(generationRun.id, runId)).limit(1);
  if (!r[0]) throw new Error(`Run ${runId} not found`);
  return r[0];
}

async function loadVideos(runId: string, videoSetId: string) {
  const db = getDb();
  const items = await db
    .select({ videoId: videoSetItem.videoId, position: videoSetItem.position })
    .from(videoSetItem)
    .where(eq(videoSetItem.videoSetId, videoSetId))
    .orderBy(asc(videoSetItem.position));
  const ids = items.map((i) => i.videoId);
  if (ids.length === 0) return [];
  const meta = await db
    .select({ id: video.id, title: video.title, durationSec: video.durationSeconds })
    .from(video)
    .where(inArray(video.id, ids));
  const byId = new Map(meta.map((m) => [m.id, m]));
  return items.map((it) => {
    const m = byId.get(it.videoId);
    return {
      videoId: it.videoId,
      title: m?.title ?? '(Untitled)',
      durationSec: m?.durationSec ?? 0,
      position: it.position,
    };
  });
}

async function loadSegments(runId: string, videoId: string): Promise<LoadedSegment[]> {
  const db = getDb();
  const rows = await db
    .select({
      segmentId: segment.id,
      videoId: segment.videoId,
      startMs: segment.startMs,
      endMs: segment.endMs,
      text: segment.text,
    })
    .from(segment)
    .where(and(eq(segment.runId, runId), eq(segment.videoId, videoId)))
    .orderBy(asc(segment.startMs));
  return rows;
}

async function loadVisualMoments(runId: string, videoId: string): Promise<LoadedVisualMoment[]> {
  const db = getDb();
  const rows = await db
    .select({
      visualMomentId: visualMoment.id,
      videoId: visualMoment.videoId,
      timestampMs: visualMoment.timestampMs,
      type: visualMoment.type,
      description: visualMoment.description,
      hubUse: visualMoment.hubUse,
      usefulnessScore: visualMoment.usefulnessScore,
    })
    .from(visualMoment)
    .where(and(eq(visualMoment.runId, runId), eq(visualMoment.videoId, videoId)));
  return rows;
}

// ── Stage 1: channel_profile ───────────────────────────────────────────────

interface ChannelProfilePayload {
  creatorName: string;
  niche: string;
  audience: string;
  recurringPromise: string;
  contentFormats: string[];
  monetizationAngle: string;
  dominantTone: string;
  expertiseCategory: string;
  recurringThemes: string[];
  whyPeopleFollow: string;
  positioningSummary: string;
  creatorTerminology: string[];
}

async function generateChannelProfile(
  runId: string,
  videos: Array<{ videoId: string; title: string; durationSec: number }>,
): Promise<ChannelProfilePayload> {
  // Sample first 12 segments per video to give Codex enough voice to work with.
  const samples: string[] = [];
  for (const v of videos) {
    const segs = await loadSegments(runId, v.videoId);
    const head = segs.slice(0, 12).map((s) => `[${s.segmentId}] ${s.text}`).join('\n');
    samples.push(`### ${v.title} (${Math.round(v.durationSec / 60)} min)\n${head}`);
  }

  const prompt = [
    'You are channel_profiler. Build a one-shot creator profile that every other agent in the pipeline will use as context.',
    '',
    'Below are the videos in this run plus a sample of segments from each. Synthesize a single channel profile.',
    '',
    `# Videos (${videos.length})`,
    videos.map((v) => `- ${v.videoId}: ${v.title} (${Math.round(v.durationSec / 60)} min)`).join('\n'),
    '',
    '# Segment samples',
    samples.join('\n\n'),
    '',
    '# OUTPUT FORMAT',
    'Respond with EXACTLY ONE JSON object — no preamble, no markdown fences, no commentary — matching this schema:',
    '{',
    '  "creatorName": string,',
    '  "niche": string,',
    '  "audience": string,',
    '  "recurringPromise": string,',
    '  "contentFormats": string[],',
    '  "monetizationAngle": string,',
    '  "dominantTone": string,',
    '  "expertiseCategory": string,',
    '  "recurringThemes": string[] (3-8),',
    '  "whyPeopleFollow": string,',
    '  "positioningSummary": string,',
    '  "creatorTerminology": string[] (the creator\'s named concepts, drawn from the segments)',
    '}',
    '',
    'Rules: be specific. "unknown" beats a guess. JSON only.',
  ].join('\n');

  console.info('[codex-audit] Generating channel_profile…');
  return codexJson<ChannelProfilePayload>(prompt, 'channel_profile');
}

// ── Stage 2: video_intelligence_card per video ─────────────────────────────

interface VicPayload {
  mainIdeas: string[];
  frameworks: Array<{ name: string; steps: string[]; whenToUse: string }>;
  lessons: string[];
  examples: string[];
  stories: string[];
  mistakesToAvoid: Array<{ mistake: string; why: string; correction: string }>;
  failureModes: string[];
  counterCases: string[];
  toolsMentioned: string[];
  termsDefined: Array<{ term: string; definition: string }>;
  strongClaims: string[];
  contrarianTakes: string[];
  quotes: string[];
  recommendedHubUses: string[];
  creatorVoiceNotes: string[];
}

async function generateVic(
  runId: string,
  v: { videoId: string; title: string; durationSec: number },
  profile: ChannelProfilePayload,
): Promise<{ payload: VicPayload; evidenceSegmentIds: string[] }> {
  const segs = await loadSegments(runId, v.videoId);
  const vis = await loadVisualMoments(runId, v.videoId);

  const segmentBlock = segs.map((s) => `[${s.segmentId}] ${s.startMs}ms-${s.endMs}ms: ${s.text}`).join('\n');
  const visualBlock = vis.length > 0
    ? vis.map((m) => `[${m.visualMomentId}] ${m.timestampMs}ms ${m.type}: ${m.description} (hubUse: ${m.hubUse})`).join('\n')
    : '(no visual moments)';

  const prompt = [
    'You are video_analyst. Produce a citation-grade intelligence card for ONE video.',
    '',
    '# Channel profile',
    JSON.stringify(profile, null, 2),
    '',
    `# Video: ${v.title} (${Math.round(v.durationSec / 60)} min)`,
    '',
    `# Transcript (${segs.length} segments)`,
    segmentBlock,
    '',
    `# Visual moments (${vis.length})`,
    visualBlock,
    '',
    '# OUTPUT FORMAT',
    'Respond with EXACTLY ONE JSON object — no preamble, no markdown fences, no commentary. Schema:',
    '{',
    '  "mainIdeas": string[] (3-8),',
    '  "frameworks": [{"name":string,"steps":string[],"whenToUse":string}] (0-5),',
    '  "lessons": string[] (2-8),',
    '  "examples": string[] (0-6),',
    '  "stories": string[] (0-4),',
    '  "mistakesToAvoid": [{"mistake":string,"why":string,"correction":string}] (2-6),',
    '  "failureModes": string[] (0-4),',
    '  "counterCases": string[] (0-4),',
    '  "toolsMentioned": string[] (0-12),',
    '  "termsDefined": [{"term":string,"definition":string}] (0-8),',
    '  "strongClaims": string[] (0-8),',
    '  "contrarianTakes": string[] (0-5),',
    '  "quotes": string[] (3-8, 10-280 chars each, stand-alone, verbatim from transcript),',
    '  "recommendedHubUses": string[] (2-6),',
    '  "creatorVoiceNotes": string[] (up to 6, the way this creator talks)',
    '}',
    '',
    'Drop weak items. Use the creator\'s words from the transcript. JSON only.',
  ].join('\n');

  console.info(`[codex-audit] Generating VIC for ${v.title}…`);
  const payload = await codexJson<VicPayload>(prompt, `vic:${v.videoId}`);
  return { payload, evidenceSegmentIds: segs.map((s) => s.segmentId) };
}

// ── Stage 3: canon_node[] (cross-video synthesis) ──────────────────────────

interface CanonNodeOut {
  type: 'topic' | 'framework' | 'lesson' | 'playbook' | 'example' | 'principle' | 'pattern' | 'tactic' | 'definition' | 'aha_moment' | 'quote';
  payload: {
    title: string;
    summary: string;
    whenToUse: string;
    whenNotToUse: string | null;
    commonMistake: string | null;
    successSignal: string;
    sequencingRationale?: string | null;
    preconditions?: string[];
    steps?: string[];
    failureModes?: string[];
    examples?: string[];
    definition?: string;
    [key: string]: unknown;
  };
  sourceVideoIds: string[];
  origin: 'multi_video' | 'single_video' | 'channel_profile' | 'derived';
  confidenceScore: number;
  pageWorthinessScore: number;
  specificityScore: number;
  creatorUniquenessScore: number;
  evidenceQuality: 'high' | 'medium' | 'low';
}

/**
 * Pull every named framework, lesson, and definition out of the 6 VICs to
 * use as a "must-cover" list when prompting Codex for canon nodes. The
 * list is the spine of the knowledge graph: anything Hormozi *named* in
 * the videos should become its own canon node.
 */
function extractMustCoverFromVics(
  vics: Array<{ videoId: string; title: string; payload: VicPayload }>,
): { frameworks: string[]; definitions: string[]; lessons: string[] } {
  const frameworks = new Set<string>();
  const definitions = new Set<string>();
  const lessons = new Set<string>();
  for (const v of vics) {
    for (const f of v.payload.frameworks ?? []) {
      const name = (f as { name?: unknown }).name;
      if (typeof name === 'string' && name.trim().length > 0) frameworks.add(name.trim());
    }
    for (const t of v.payload.termsDefined ?? []) {
      const term = (t as { term?: unknown }).term;
      if (typeof term === 'string' && term.trim().length > 0) definitions.add(term.trim());
    }
    for (const l of v.payload.lessons ?? []) {
      if (typeof l === 'string' && l.trim().length > 20) lessons.add(l.trim().slice(0, 140));
    }
  }
  return {
    frameworks: [...frameworks],
    definitions: [...definitions],
    lessons: [...lessons].slice(0, 24), // cap so the prompt doesn't blow context
  };
}

function buildCanonPrompt(
  profile: ChannelProfilePayload,
  vics: Array<{ videoId: string; title: string; payload: VicPayload }>,
  alreadyHave: string[],
  remaining: number,
  mustCover: { frameworks: string[]; definitions: string[]; lessons: string[] },
): string {
  const vicBlock = vics.map((v) => `## ${v.title} (${v.videoId})\n${JSON.stringify(v.payload, null, 2)}`).join('\n\n');
  const alreadyBlock = alreadyHave.length > 0
    ? `\n\n# Already-generated nodes (DO NOT repeat — produce DIFFERENT nodes than these)\n${alreadyHave.map((t) => `- ${t}`).join('\n')}`
    : '';
  const remainingFrameworks = mustCover.frameworks.filter((f) => !alreadyHave.some((t) => t.toLowerCase().includes(f.toLowerCase())));
  const remainingDefinitions = mustCover.definitions.filter((d) => !alreadyHave.some((t) => t.toLowerCase().includes(d.toLowerCase())));
  const mustCoverBlock = (remainingFrameworks.length > 0 || remainingDefinitions.length > 0)
    ? [
        '',
        '# MUST-COVER LIST (priority order — these are named in the VICs and DESERVE their own canon node)',
        '## Named frameworks not yet canonized:',
        remainingFrameworks.map((f) => `- ${f}`).join('\n') || '(all covered)',
        '## Defined terms not yet canonized:',
        remainingDefinitions.slice(0, 12).map((d) => `- ${d}`).join('\n') || '(all covered)',
        '',
        'Pick from this list FIRST. Only generate "new discovery" nodes after the must-cover items are exhausted.',
      ].join('\n')
    : '';
  return [
    'You are canon_architect. Extract DISTINCT canon nodes from the run\'s intelligence cards.',
    '',
    '# Channel profile',
    JSON.stringify(profile, null, 2),
    '',
    `# Video Intelligence Cards (${vics.length} videos)`,
    vicBlock,
    alreadyBlock,
    mustCoverBlock,
    '',
    '# Instructions',
    `Produce up to ${remaining} more DISTINCT canon nodes. Each node must teach something specific — a framework, a lesson, a playbook, a principle, a definition, a pattern, a tactic. Prefer items from the MUST-COVER LIST. Cross-reference: if multiple videos teach the same idea, that's ONE multi_video node.`,
    '',
    'For EACH node, the payload MUST include these editorial fields (use null where the source genuinely doesn\'t address it):',
    '- title (string) — use the EXACT name from the must-cover list when it applies',
    '- summary (1-2 sentences)',
    '- whenToUse (1-2 sentences)',
    '- whenNotToUse (1-2 sentences OR null)',
    '- commonMistake (1 sentence OR null)',
    '- successSignal (1 sentence)',
    '- preconditions (string[]): for frameworks/playbooks/lessons',
    '- steps (string[]): for frameworks/playbooks',
    '- sequencingRationale (string OR null): for frameworks/playbooks',
    '- failureModes (string[])',
    '- examples (string[]) drawn from the VICs',
    '- definition (string): for definition-type nodes',
    '',
    '# OUTPUT FORMAT — CRITICAL',
    `Respond with a single JSON ARRAY containing AT LEAST ${Math.min(remaining, 8)} distinct canon node objects. First char must be \`[\`, last char must be \`]\`. NEVER return a single object — wrap as \`[{...}]\`. No preamble, no markdown fences.`,
    '',
    'Skeleton:',
    '[',
    '  { "type": "framework"|"lesson"|"playbook"|"principle"|"pattern"|"tactic"|"definition"|"aha_moment"|"quote"|"topic"|"example",',
    '    "payload": { "title": "...", "summary": "...", "whenToUse": "...", "whenNotToUse": null, "commonMistake": null, "successSignal": "...", "preconditions": [], "steps": [], "sequencingRationale": null, "failureModes": [], "examples": [] },',
    '    "sourceVideoIds": ["mu_..."],',
    '    "origin": "multi_video"|"single_video"|"channel_profile"|"derived",',
    '    "confidenceScore": 0-100, "pageWorthinessScore": 0-100, "specificityScore": 0-100, "creatorUniquenessScore": 0-100,',
    '    "evidenceQuality": "high"|"medium"|"low" },',
    '  { ... another distinct node ... }',
    ']',
    '',
    `Begin with \`[\` and produce ${Math.min(remaining, 8)}-${remaining} distinct entries (NOT duplicates of the already-generated list).`,
  ].join('\n');
}

/**
 * Codex CLI consistently returns "the best one" instead of an array of many
 * when the input is large (6 VICs ≈ 50 KB). Iterate: each call returns at
 * least one new node; we accumulate until we hit the target or stop making
 * progress. Worst case we get 8 nodes after 8 iterations.
 */
async function generateCanonNodes(
  profile: ChannelProfilePayload,
  vics: Array<{ videoId: string; title: string; payload: VicPayload }>,
): Promise<CanonNodeOut[]> {
  const TARGET = 25;
  const MIN_ACCEPTABLE = 8;
  const MAX_ITERATIONS = 15;
  const accumulated: CanonNodeOut[] = [];
  const seenTitles = new Set<string>();
  const mustCover = extractMustCoverFromVics(vics);
  console.info(`[codex-audit] canon must-cover: ${mustCover.frameworks.length} frameworks, ${mustCover.definitions.length} definitions, ${mustCover.lessons.length} lessons in scope`);

  for (let i = 0; i < MAX_ITERATIONS; i += 1) {
    const remaining = TARGET - accumulated.length;
    if (remaining <= 0) break;
    const prompt = buildCanonPrompt(profile, vics, [...seenTitles], remaining, mustCover);
    console.info(`[codex-audit] canon iteration ${i + 1}/${MAX_ITERATIONS} (have ${accumulated.length}, asking for up to ${remaining} more)…`);
    let batch: CanonNodeOut[];
    try {
      batch = await codexJson<CanonNodeOut[]>(prompt, `canon_nodes_iter_${i + 1}`, 'array', CANON_TIMEOUT_MS);
    } catch (err) {
      console.warn(`[codex-audit] canon iteration ${i + 1} failed entirely: ${(err as Error).message}`);
      if (accumulated.length >= MIN_ACCEPTABLE) break;
      continue;
    }
    let added = 0;
    for (const node of batch) {
      const title = node.payload?.title?.toString().trim();
      if (!title) continue;
      if (seenTitles.has(title.toLowerCase())) continue;
      seenTitles.add(title.toLowerCase());
      accumulated.push(node);
      added += 1;
    }
    console.info(`[codex-audit] canon iteration ${i + 1}: +${added} new (total ${accumulated.length})`);
    if (added === 0) {
      console.warn(`[codex-audit] canon iteration ${i + 1} added 0 new nodes; stopping iteration`);
      break;
    }
  }

  if (accumulated.length < MIN_ACCEPTABLE) {
    throw new Error(`canon_nodes: only got ${accumulated.length} nodes after ${MAX_ITERATIONS} iterations (min acceptable: ${MIN_ACCEPTABLE})`);
  }
  console.info(`[codex-audit] canon synthesis complete: ${accumulated.length} distinct nodes`);
  return accumulated;
}

// ── Stage 4: page_briefs ───────────────────────────────────────────────────

interface PageBriefOut {
  pageTitle: string;
  pageType: 'topic' | 'framework' | 'lesson' | 'playbook' | 'example_collection' | 'definition' | 'principle';
  audienceQuestion: string;
  openingHook: string;
  slug: string;
  outline: Array<{ sectionTitle: string; canonNodeIds: string[]; intent: string }>;
  primaryCanonNodeIds: string[];
  supportingCanonNodeIds: string[];
  pageWorthinessScore: number;
  position: number;
}

interface SynthesisNodeOut {
  title: string;
  summary: string;
  unifyingThread: string;
  childCanonNodeIds: string[];
  whyItMatters: string;
  pageWorthinessScore: number;
}

async function generateSynthesisNodes(
  profile: ChannelProfilePayload,
  canonNodesWithIds: Array<{ id: string; type: string; payload: Record<string, unknown> }>,
  vics: Array<{ videoId: string; title: string; payload: VicPayload }>,
): Promise<SynthesisNodeOut[]> {
  const canonBlock = canonNodesWithIds
    .map((n) => `### [${n.id}] ${n.type} · ${(n.payload as { title?: string }).title ?? '(Untitled)'}\n${(n.payload as { summary?: string }).summary ?? ''}`)
    .join('\n\n');
  const vicTitles = vics.map((v) => `- ${v.videoId}: ${v.title}`).join('\n');

  const prompt = [
    'You are cross_video_synthesizer. Identify the 3-5 unifying theories or meta-narratives that thread through this creator\'s entire run.',
    '',
    '# Channel profile',
    JSON.stringify(profile, null, 2),
    '',
    `# Source videos (${vics.length})`,
    vicTitles,
    '',
    `# Canon nodes already extracted (${canonNodesWithIds.length})`,
    canonBlock,
    '',
    '# Instructions',
    'A "synthesis node" is a META-claim that connects 3+ existing canon nodes under a single unifying argument. Examples of the SHAPE we want (pretend this is for a different creator):',
    '- "Hormozi\'s Unified Theory of Leverage" — connects 1-1-1 Rule, AI Workflow Thinking, Premium 1-on-1, Barbell Strategy under "every game has an asymmetric input."',
    '- "The Founder\'s Survival-to-Scale Sequence" — connects First $100K Roadmap, Premium 1-on-1 Bootstrap, Workflow Thinking, AI as Leverage under a phased journey.',
    '',
    'Find 3-5 such cross-cutting theories. For each, identify which canon nodes it connects (by ID) and why it matters strategically.',
    '',
    '# OUTPUT FORMAT — CRITICAL',
    'Respond with a single JSON ARRAY of 3-5 synthesis objects. First char `[`, last char `]`. NEVER return a single object — wrap as `[{...}]`. No preamble, no markdown fences.',
    '',
    'Skeleton:',
    '[',
    '  { "title": "...",',
    '    "summary": "1-2 sentences naming the unifying argument",',
    '    "unifyingThread": "1 sentence — the single thread connecting the children",',
    '    "childCanonNodeIds": ["cn_..."],  // 3+ IDs from the canon list above',
    '    "whyItMatters": "1-2 sentences — why a hub reader benefits from seeing these together",',
    '    "pageWorthinessScore": 0-100 },',
    '  { ... another distinct synthesis ... }',
    ']',
  ].join('\n');

  console.info('[codex-audit] Generating cross-video synthesis nodes…');
  return codexJson<SynthesisNodeOut[]>(prompt, 'synthesis_nodes', 'array', DEFAULT_TIMEOUT_MS);
}

interface ReaderJourneyOut {
  title: string;
  summary: string;
  phases: Array<{
    phaseNumber: number;
    name: string;
    readerState: string;
    primaryCanonNodeIds: string[];
    nextStepWhen: string;
  }>;
}

async function generateReaderJourney(
  profile: ChannelProfilePayload,
  canonNodesWithIds: Array<{ id: string; type: string; payload: Record<string, unknown> }>,
): Promise<ReaderJourneyOut> {
  const canonBlock = canonNodesWithIds
    .map((n) => `### [${n.id}] ${n.type} · ${(n.payload as { title?: string }).title ?? '(Untitled)'}\n${(n.payload as { summary?: string }).summary ?? ''}`)
    .join('\n\n');

  const prompt = [
    'You are reader_journey_designer. Order this creator\'s canon content into a multi-phase journey a reader walks through over time.',
    '',
    '# Channel profile',
    JSON.stringify(profile, null, 2),
    '',
    `# Canon nodes (${canonNodesWithIds.length})`,
    canonBlock,
    '',
    '# Instructions',
    'Identify 4-6 sequential phases a reader of this creator\'s hub passes through. Each phase has a reader state (where the reader IS), the canon nodes that serve that phase, and a "next-step when" that signals readiness to graduate to the next phase.',
    '',
    'For Hormozi-style operator content, phases typically look like:',
    '1. Survival → first $100K roadmap',
    '2. Cashflow → premium 1-on-1, focus, pricing',
    '3. Scale → workflow thinking, hiring, offers',
    '4. Leverage → AI as leverage, BYOA',
    '5. Investing → barbell strategy, durable bets',
    '',
    'Adapt these to the actual canon nodes available. Skip phases that have no nodes.',
    '',
    '# OUTPUT FORMAT',
    'Respond with EXACTLY ONE JSON object — first char `{`, last char `}`. No preamble, no markdown fences.',
    '',
    'Skeleton:',
    '{',
    '  "title": "The Hormozi Reader Journey",',
    '  "summary": "1-2 sentences describing what the reader gets out of following this sequence",',
    '  "phases": [',
    '    { "phaseNumber": 1, "name": "...", "readerState": "1 sentence — what\'s true about the reader RIGHT NOW", "primaryCanonNodeIds": ["cn_..."], "nextStepWhen": "1 sentence — what signals readiness for phase 2" },',
    '    { "phaseNumber": 2, ... }',
    '  ]',
    '}',
  ].join('\n');

  console.info('[codex-audit] Generating Reader Journey Card…');
  return codexJson<ReaderJourneyOut>(prompt, 'reader_journey', 'object', DEFAULT_TIMEOUT_MS);
}

async function generatePageBriefs(
  profile: ChannelProfilePayload,
  canonNodesWithIds: Array<{ id: string; type: string; payload: Record<string, unknown>; pageWorthinessScore: number }>,
): Promise<PageBriefOut[]> {
  const pageworthy = canonNodesWithIds.filter((n) => n.pageWorthinessScore >= 60);
  const block = pageworthy
    .map((n) => `### [${n.id}] ${n.type} · pageWorthiness=${n.pageWorthinessScore}\n${JSON.stringify(n.payload, null, 2)}`)
    .join('\n\n');

  const prompt = [
    'You are page_brief_planner. Design the hub\'s page outline by selecting and grouping canon nodes into briefs.',
    '',
    '# Channel profile',
    JSON.stringify(profile, null, 2),
    '',
    `# Page-worthy canon nodes (pageWorthinessScore >= 60, ${pageworthy.length} total)`,
    block,
    '',
    '# Instructions',
    'You MUST produce a LIST of 8-15 page briefs (not just one). Pages must be earned. Every primary node must come from the canon list above.',
    '',
    '# OUTPUT FORMAT — CRITICAL',
    'Respond with a single JSON ARRAY containing MANY page brief objects. The first character of your response MUST be `[` and the last character MUST be `]`. NEVER return a single object — even one brief must still be wrapped: `[ { ... } ]`. Do NOT include any preamble, markdown fences, or commentary.',
    '',
    'Skeleton (replace the ellipses with 8-15 real briefs):',
    '[',
    '  {',
    '    "pageTitle": "...",',
    '    "pageType": "topic"|"framework"|"lesson"|"playbook"|"example_collection"|"definition"|"principle",',
    '    "audienceQuestion": "...",',
    '    "openingHook": "...",',
    '    "slug": "kebab-case-slug",',
    '    "outline": [{ "sectionTitle": "...", "canonNodeIds": ["cn_..."], "intent": "..." }],',
    '    "primaryCanonNodeIds": ["cn_..."],   // 1-20, must come from the canon list above',
    '    "supportingCanonNodeIds": ["cn_..."],// 0-50, must come from the canon list above',
    '    "pageWorthinessScore": 0-100,',
    '    "position": 0',
    '  },',
    '  { ... another distinct brief ... },',
    '  ...',
    ']',
    '',
    'Begin your response with the character `[` and produce 8-15 entries.',
  ].join('\n');

  console.info('[codex-audit] Generating page briefs…');
  return codexJson<PageBriefOut[]>(prompt, 'page_briefs', 'array');
}

// ── Main orchestration ─────────────────────────────────────────────────────

async function main() {
  const runId = process.argv[2];
  if (!runId) throw new Error('Usage: tsx ./src/scripts/seed-audit-via-codex.ts <runId>');

  const run = await loadRun(runId);
  if (!run.videoSetId) throw new Error('Run has no video_set_id');
  console.info(`[codex-audit] Run ${runId} status=${run.status}`);

  const regenCanon = process.argv.includes('--regen-canon');
  const regenBriefs = process.argv.includes('--regen-briefs');

  const videos = await loadVideos(runId, run.videoSetId);
  if (videos.length === 0) throw new Error('Run has no videos');
  console.info(`[codex-audit] ${videos.length} videos:`);
  for (const v of videos) console.info(`   ${v.videoId} ${v.title}`);

  // Mark run running so the audit page reflects activity.
  const db = getDb();
  await db.update(generationRun).set({ status: 'running' }).where(eq(generationRun.id, runId));

  // ── 1. Channel profile ──────────────────────────────────────────────
  // Idempotent resume: if the row already exists from a prior partial run,
  // load it instead of regenerating.
  const existingCp = await db
    .select({ payload: channelProfile.payload })
    .from(channelProfile)
    .where(eq(channelProfile.runId, runId))
    .limit(1);
  let profilePayload: ChannelProfilePayload;
  if (existingCp[0]) {
    profilePayload = existingCp[0].payload as unknown as ChannelProfilePayload;
    console.info(`[codex-audit] channel_profile resumed from DB: ${profilePayload.creatorName} / ${profilePayload.niche}`);
  } else {
    profilePayload = await generateChannelProfile(runId, videos);
    await db.insert(channelProfile).values({
      id: crypto.randomUUID(),
      workspaceId: run.workspaceId,
      runId,
      payload: profilePayload as unknown as Record<string, unknown>,
    }).onConflictDoNothing();
    console.info(`[codex-audit] channel_profile written: ${profilePayload.creatorName} / ${profilePayload.niche}`);
  }

  // ── 2. VICs (one per video) ─────────────────────────────────────────
  // Skip videos that already have a VIC. The script can be re-run safely.
  const existingVics = await db
    .select({
      videoId: videoIntelligenceCard.videoId,
      payload: videoIntelligenceCard.payload,
      evidenceSegmentIds: videoIntelligenceCard.evidenceSegmentIds,
    })
    .from(videoIntelligenceCard)
    .where(eq(videoIntelligenceCard.runId, runId));
  const vicByVideoId = new Map(existingVics.map((r) => [r.videoId, r]));
  console.info(`[codex-audit] ${vicByVideoId.size}/${videos.length} VICs already in DB; resuming the rest`);

  const vicResults: Array<{ videoId: string; title: string; payload: VicPayload; evidenceSegmentIds: string[] }> = [];
  for (let i = 0; i < videos.length; i += 1) {
    const v = videos[i]!;
    const existing = vicByVideoId.get(v.videoId);
    if (existing) {
      vicResults.push({
        videoId: v.videoId,
        title: v.title,
        payload: existing.payload as unknown as VicPayload,
        evidenceSegmentIds: existing.evidenceSegmentIds ?? [],
      });
      continue;
    }
    console.info(`[codex-audit] (${i + 1}/${videos.length}) VIC for ${v.title}`);
    const { payload, evidenceSegmentIds } = await generateVic(runId, v, profilePayload);
    await db.insert(videoIntelligenceCard).values({
      id: crypto.randomUUID(),
      workspaceId: run.workspaceId,
      runId,
      videoId: v.videoId,
      payload: payload as unknown as Record<string, unknown>,
      evidenceSegmentIds,
    }).onConflictDoNothing();
    vicResults.push({ videoId: v.videoId, title: v.title, payload, evidenceSegmentIds });
  }
  console.info(`[codex-audit] ${vicResults.length} VICs total`);

  // ── 3. Canon nodes ──────────────────────────────────────────────────
  // Skip generation if any canon node already exists for this run.
  const existingCanon = await db
    .select({
      id: canonNode.id,
      type: canonNode.type,
      payload: canonNode.payload,
      pageWorthinessScore: canonNode.pageWorthinessScore,
    })
    .from(canonNode)
    .where(eq(canonNode.runId, runId));

  let persistedCanonNodes: Array<{ id: string; type: string; payload: Record<string, unknown>; pageWorthinessScore: number }>;
  if (existingCanon.length > 0 && !regenCanon) {
    persistedCanonNodes = existingCanon.map((n) => ({
      id: n.id,
      type: n.type,
      payload: (n.payload as Record<string, unknown>) ?? {},
      pageWorthinessScore: n.pageWorthinessScore ?? 0,
    }));
    console.info(`[codex-audit] ${persistedCanonNodes.length} canon nodes resumed from DB`);
  } else {
    if (regenCanon && existingCanon.length > 0) {
      console.info(`[codex-audit] --regen-canon: deleting ${existingCanon.length} existing canon nodes for run ${runId}`);
      await db.delete(canonNode).where(eq(canonNode.runId, runId));
      // also clear page_brief because briefs reference deleted canon ids
      await db.delete(pageBrief).where(eq(pageBrief.runId, runId));
    }
    const canonNodesOut = await generateCanonNodes(profilePayload, vicResults);
    console.info(`[codex-audit] Codex returned ${canonNodesOut.length} canon nodes`);
    persistedCanonNodes = [];
    for (const node of canonNodesOut) {
      const id = `cn_${crypto.randomUUID().slice(0, 12)}`;
      // Aggregate evidence segments from sourceVideoIds across the matching VICs.
      const evidenceSegmentIds = vicResults
        .filter((v) => node.sourceVideoIds.includes(v.videoId))
        .flatMap((v) => v.evidenceSegmentIds)
        .slice(0, 50);
      await db.insert(canonNode).values({
        id,
        workspaceId: run.workspaceId,
        runId,
        type: node.type,
        payload: node.payload as unknown as Record<string, unknown>,
        evidenceSegmentIds,
        sourceVideoIds: node.sourceVideoIds,
        evidenceQuality: node.evidenceQuality,
        origin: node.origin,
        confidenceScore: clampScore(node.confidenceScore),
        pageWorthinessScore: clampScore(node.pageWorthinessScore),
        specificityScore: clampScore(node.specificityScore),
        creatorUniquenessScore: clampScore(node.creatorUniquenessScore),
        citationCount: evidenceSegmentIds.length,
        sourceCoverage: node.sourceVideoIds.length,
      }).onConflictDoNothing();
      persistedCanonNodes.push({ id, type: node.type, payload: node.payload as Record<string, unknown>, pageWorthinessScore: clampScore(node.pageWorthinessScore) });
    }
    console.info(`[codex-audit] ${persistedCanonNodes.length} canon nodes written`);
  }

  // ── 3.5 Cross-video synthesis nodes ────────────────────────────────
  const existingSynthesis = await db
    .select({ id: canonNode.id })
    .from(canonNode)
    .where(and(eq(canonNode.runId, runId), eq(canonNode.type, 'topic')));
  const synthesisAlreadyExists = (await Promise.all(existingSynthesis.map(async (r) => {
    const row = await db.select({ payload: canonNode.payload }).from(canonNode).where(eq(canonNode.id, r.id)).limit(1);
    return (row[0]?.payload as { kind?: string })?.kind === 'synthesis';
  }))).some(Boolean);

  if (!synthesisAlreadyExists) {
    try {
      const synthOut = await generateSynthesisNodes(profilePayload, persistedCanonNodes, vicResults);
      const validIds = new Set(persistedCanonNodes.map((n) => n.id));
      for (const s of synthOut) {
        const children = (s.childCanonNodeIds ?? []).filter((id) => validIds.has(id));
        if (children.length < 2) {
          console.warn(`[codex-audit] synthesis "${s.title}" dropped: only ${children.length} valid child IDs`);
          continue;
        }
        const id = `cn_${crypto.randomUUID().slice(0, 12)}`;
        await db.insert(canonNode).values({
          id,
          workspaceId: run.workspaceId,
          runId,
          type: 'topic',
          payload: { kind: 'synthesis', title: s.title, summary: s.summary, unifyingThread: s.unifyingThread, childCanonNodeIds: children, whyItMatters: s.whyItMatters } as Record<string, unknown>,
          evidenceSegmentIds: [],
          sourceVideoIds: vicResults.map((v) => v.videoId),
          evidenceQuality: 'high',
          origin: 'derived',
          confidenceScore: 90,
          pageWorthinessScore: clampScore(s.pageWorthinessScore),
          specificityScore: 80,
          creatorUniquenessScore: 90,
          citationCount: 0,
          sourceCoverage: vicResults.length,
        }).onConflictDoNothing();
        persistedCanonNodes.push({ id, type: 'topic', payload: { kind: 'synthesis', title: s.title, summary: s.summary } as Record<string, unknown>, pageWorthinessScore: clampScore(s.pageWorthinessScore) });
      }
      console.info(`[codex-audit] wrote ${synthOut.length} cross-video synthesis nodes`);
    } catch (err) {
      console.warn(`[codex-audit] synthesis stage failed (continuing): ${(err as Error).message}`);
    }
  } else {
    console.info(`[codex-audit] synthesis nodes already present; skipping`);
  }

  // ── 3.6 Reader Journey Card ────────────────────────────────────────
  const existingJourney = await db
    .select({ payload: canonNode.payload })
    .from(canonNode)
    .where(and(eq(canonNode.runId, runId), eq(canonNode.type, 'playbook')))
    .limit(50);
  const journeyAlreadyExists = existingJourney.some((r) => (r.payload as { kind?: string })?.kind === 'reader_journey');

  if (!journeyAlreadyExists) {
    try {
      const journey = await generateReaderJourney(profilePayload, persistedCanonNodes);
      const validIds = new Set(persistedCanonNodes.map((n) => n.id));
      const cleanedPhases = (journey.phases ?? []).map((p) => ({
        ...p,
        primaryCanonNodeIds: (p.primaryCanonNodeIds ?? []).filter((id) => validIds.has(id)),
      })).filter((p) => p.primaryCanonNodeIds.length > 0);
      if (cleanedPhases.length === 0) {
        console.warn(`[codex-audit] reader journey dropped: no phases reference valid canon node IDs`);
      } else {
        const id = `cn_${crypto.randomUUID().slice(0, 12)}`;
        await db.insert(canonNode).values({
          id,
          workspaceId: run.workspaceId,
          runId,
          type: 'playbook',
          payload: { kind: 'reader_journey', title: journey.title, summary: journey.summary, phases: cleanedPhases } as Record<string, unknown>,
          evidenceSegmentIds: [],
          sourceVideoIds: vicResults.map((v) => v.videoId),
          evidenceQuality: 'high',
          origin: 'derived',
          confidenceScore: 95,
          pageWorthinessScore: 95,
          specificityScore: 85,
          creatorUniquenessScore: 90,
          citationCount: 0,
          sourceCoverage: vicResults.length,
        });
        console.info(`[codex-audit] wrote Reader Journey Card with ${cleanedPhases.length} phases`);
      }
    } catch (err) {
      console.warn(`[codex-audit] reader journey stage failed (continuing): ${(err as Error).message}`);
    }
  } else {
    console.info(`[codex-audit] reader journey already present; skipping`);
  }

  // ── 4. Page briefs ──────────────────────────────────────────────────
  // Skip generation if briefs already exist for this run.
  const existingBriefs = await db
    .select({ id: pageBrief.id })
    .from(pageBrief)
    .where(eq(pageBrief.runId, runId))
    .limit(1);
  if (existingBriefs.length > 0) {
    console.info(`[codex-audit] page_brief rows already exist; skipping generation`);
  } else {
    const briefsOut = await generatePageBriefs(profilePayload, persistedCanonNodes);
    console.info(`[codex-audit] Codex returned ${briefsOut.length} page briefs`);
    const validIds = new Set(persistedCanonNodes.map((n) => n.id));
    for (let i = 0; i < briefsOut.length; i += 1) {
      const b = briefsOut[i]!;
      const primary = b.primaryCanonNodeIds.filter((id) => validIds.has(id));
      const supporting = b.supportingCanonNodeIds.filter((id) => validIds.has(id));
      if (primary.length === 0) {
        console.warn(`[codex-audit] brief ${i} dropped: no valid primary canon node IDs`);
        continue;
      }
      const payload = {
        ...b,
        primaryCanonNodeIds: primary,
        supportingCanonNodeIds: supporting,
      };
      await db.insert(pageBrief).values({
        id: `pb_${crypto.randomUUID().slice(0, 12)}`,
        workspaceId: run.workspaceId,
        runId,
        payload: payload as unknown as Record<string, unknown>,
        pageWorthinessScore: clampScore(b.pageWorthinessScore),
        position: typeof b.position === 'number' ? b.position : i,
      }).onConflictDoNothing();
    }
    console.info(`[codex-audit] page_brief rows written`);
  }

  // ── 5. Flip status to audit_ready ──────────────────────────────────
  await db.update(generationRun).set({ status: 'audit_ready' }).where(eq(generationRun.id, runId));
  console.info(`[codex-audit] Run ${runId} → audit_ready`);

  // Summarize.
  const finalCounts = await db
    .select({
      cp: drizzleSql<number>`(SELECT count(*) FROM channel_profile WHERE run_id = ${runId})::int`,
      vic: drizzleSql<number>`(SELECT count(*) FROM video_intelligence_card WHERE run_id = ${runId})::int`,
      cn: drizzleSql<number>`(SELECT count(*) FROM canon_node WHERE run_id = ${runId})::int`,
      pb: drizzleSql<number>`(SELECT count(*) FROM page_brief WHERE run_id = ${runId})::int`,
    })
    .from(generationRun)
    .where(eq(generationRun.id, runId))
    .limit(1);
  console.info('[codex-audit] DONE', finalCounts[0]);
  console.info(`[codex-audit] Audit URL: http://localhost:3000/app/projects/${run.projectId}/runs/${runId}/audit`);
  await closeDb();
}

function clampScore(n: unknown): number {
  if (typeof n !== 'number' || !Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

main().catch(async (err) => {
  await closeDb();
  console.error('[codex-audit] FAILED', err);
  process.exit(1);
});
