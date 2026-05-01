/**
 * Per-video weaving (Phase 5 / Task 5.8).
 *
 * For each canon node shell, decides which per-video intelligence items
 * (examples, stories, mistakes, contrarian takes) should be woven into
 * its body. This step runs AFTER canon shells exist and BEFORE the body
 * writer is invoked.
 *
 * Strategy: per-canon Codex calls (parallelized). Each call gets a single
 * canon shell + the full per-video intel and asks "which items belong to
 * THIS canon?". Smaller-and-parallel beats one-big-prompt because:
 *   - Codex CLI handles small prompts faster
 *   - Cross-canon dedup happens at the body-writing stage anyway
 *   - 12 canon × 30s parallel-3 = 2 minutes vs 1 huge call at ~10 minutes
 *
 * Output: a map keyed by canon ID to selected per-video item IDs.
 */

import { extractJsonFromCodexOutput } from '../../agents/providers/codex-extract-json';
import { runCodex } from './codex-runner';

export interface PerVideoIntelItem {
  /** Stable id, e.g. `ex_<uuid>`, `st_<uuid>`, `mst_<uuid>`, `take_<uuid>`. */
  id: string;
  /** Human-readable text for matching against canon shell. */
  text: string;
  /** Source video. */
  videoId: string;
}

export interface PerVideoIntelBundle {
  examples: PerVideoIntelItem[];
  stories: PerVideoIntelItem[];
  mistakes: Array<PerVideoIntelItem & { mistake?: string; correction?: string; why?: string }>;
  contrarianTakes: PerVideoIntelItem[];
}

export interface CanonShell {
  /** Canon node ID (cn_xxx). */
  id: string;
  title: string;
  type: string;
  /** Operator-facing summary used by the weaver to decide relevance. */
  internal_summary: string;
  /** Source video IDs this canon node is derived from. Used to constrain
   *  weaving to items from those videos only. */
  sourceVideoIds: string[];
}

export interface WovenSelection {
  example_ids: string[];
  story_ids: string[];
  mistake_ids: string[];
  contrarian_take_ids: string[];
}

/** The prompt asks Codex to pick 2-4 examples, 0-2 stories, 1-2 mistakes,
 *  0-2 contrarian takes per canon. The body writer needs CONCRETE source
 *  material to weave; without selection, bodies stay summary-shaped. */
function buildWeavingPrompt(canon: CanonShell, intel: PerVideoIntelBundle): string {
  // Filter intel to items from videos this canon is derived from. Keeps
  // the prompt small and avoids cross-video noise.
  const allowedVideos = new Set(canon.sourceVideoIds);
  const filterByVideo = <T extends { videoId: string }>(items: T[]): T[] =>
    allowedVideos.size === 0 ? items : items.filter((i) => allowedVideos.has(i.videoId));

  const examples = filterByVideo(intel.examples);
  const stories = filterByVideo(intel.stories);
  const mistakes = filterByVideo(intel.mistakes);
  const takes = filterByVideo(intel.contrarianTakes);

  const formatItem = (i: PerVideoIntelItem): string => `- (id=${i.id}) "${i.text.replace(/"/g, '\\"')}"`;

  return [
    `# Per-video weaving for canon node "${canon.title}"`,
    '',
    'You are selecting which per-video intelligence items will be WOVEN into the',
    'body of this canon node when it gets written. The body writer will pull the',
    'full text of each item you select and use it as concrete source material.',
    '',
    `## The canon node`,
    `- id: ${canon.id}`,
    `- title: ${canon.title}`,
    `- type: ${canon.type}`,
    `- summary (internal): ${canon.internal_summary}`,
    '',
    `## Per-video intelligence available (from this canon's source videos)`,
    '',
    `### Examples (${examples.length}):`,
    examples.length > 0 ? examples.map(formatItem).join('\n') : '(none)',
    '',
    `### Stories (${stories.length}):`,
    stories.length > 0 ? stories.map(formatItem).join('\n') : '(none)',
    '',
    `### Mistakes / corrections (${mistakes.length}):`,
    mistakes.length > 0 ? mistakes.map(formatItem).join('\n') : '(none)',
    '',
    `### Contrarian takes (${takes.length}):`,
    takes.length > 0 ? takes.map(formatItem).join('\n') : '(none)',
    '',
    '## Task',
    'Pick the items that BELONG in this canon node\'s body. Selection rules:',
    '- 2-4 examples (or all available if <2)',
    '- 0-2 stories (only if a story genuinely illustrates this canon)',
    '- 1-2 mistakes (the canon\'s "common mistake" section uses these)',
    '- 0-2 contrarian takes (only if they sharpen this canon\'s argument)',
    '',
    'Pick LESS rather than more. Better to leave a slot empty than to weave in',
    'an item that doesn\'t actually fit. The body writer will only use what you',
    'select, so quality > quantity.',
    '',
    '## Output',
    'ONE JSON object. No code fences. No preamble. First char `{`, last char `}`.',
    '',
    `{
  "example_ids": ["<id>", "<id>"],
  "story_ids": [],
  "mistake_ids": ["<id>"],
  "contrarian_take_ids": []
}`,
  ].join('\n');
}

/** Map canon shells to selected per-video items by calling Codex per canon
 *  with bounded concurrency. */
export async function weavePerVideoIntel(
  canonShells: CanonShell[],
  intel: PerVideoIntelBundle,
  options: { concurrency?: number; timeoutMs?: number } = {},
): Promise<Map<string, WovenSelection>> {
  const concurrency = Math.max(1, options.concurrency ?? 3);
  const timeoutMs = options.timeoutMs ?? 5 * 60 * 1000;

  const out = new Map<string, WovenSelection>();
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < canonShells.length) {
      const i = cursor;
      cursor += 1;
      const canon = canonShells[i]!;
      const prompt = buildWeavingPrompt(canon, intel);
      try {
        const raw = await runCodex(prompt, { timeoutMs, label: `weave_${canon.id}` });
        const json = extractJsonFromCodexOutput(raw);
        const parsed = JSON.parse(json) as Partial<WovenSelection>;
        out.set(canon.id, {
          example_ids: Array.isArray(parsed.example_ids) ? parsed.example_ids.slice(0, 4) : [],
          story_ids: Array.isArray(parsed.story_ids) ? parsed.story_ids.slice(0, 2) : [],
          mistake_ids: Array.isArray(parsed.mistake_ids) ? parsed.mistake_ids.slice(0, 2) : [],
          contrarian_take_ids: Array.isArray(parsed.contrarian_take_ids) ? parsed.contrarian_take_ids.slice(0, 2) : [],
        });
        const counts = out.get(canon.id)!;
        console.info(
          `[weave] ${canon.id} (${canon.title.slice(0, 40)}): ` +
          `${counts.example_ids.length}ex, ${counts.story_ids.length}st, ` +
          `${counts.mistake_ids.length}mst, ${counts.contrarian_take_ids.length}take`,
        );
      } catch (err) {
        console.warn(`[weave] ${canon.id} failed: ${(err as Error).message.slice(0, 200)}; using empty selection`);
        out.set(canon.id, {
          example_ids: [],
          story_ids: [],
          mistake_ids: [],
          contrarian_take_ids: [],
        });
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, canonShells.length) }, () => worker());
  await Promise.all(workers);
  return out;
}

/** Validate that every selected ID actually exists in the per-video intel.
 *  Drops orphan IDs and warns the operator. */
export function validateSelections(
  selections: Map<string, WovenSelection>,
  intel: PerVideoIntelBundle,
): Map<string, WovenSelection> {
  const exampleIds = new Set(intel.examples.map((i) => i.id));
  const storyIds = new Set(intel.stories.map((i) => i.id));
  const mistakeIds = new Set(intel.mistakes.map((i) => i.id));
  const takeIds = new Set(intel.contrarianTakes.map((i) => i.id));

  const cleaned = new Map<string, WovenSelection>();
  for (const [canonId, sel] of selections) {
    const validExamples = sel.example_ids.filter((id) => exampleIds.has(id));
    const validStories = sel.story_ids.filter((id) => storyIds.has(id));
    const validMistakes = sel.mistake_ids.filter((id) => mistakeIds.has(id));
    const validTakes = sel.contrarian_take_ids.filter((id) => takeIds.has(id));
    const dropped =
      (sel.example_ids.length - validExamples.length) +
      (sel.story_ids.length - validStories.length) +
      (sel.mistake_ids.length - validMistakes.length) +
      (sel.contrarian_take_ids.length - validTakes.length);
    if (dropped > 0) {
      console.warn(`[weave] ${canonId}: dropped ${dropped} orphan IDs (Codex hallucinated)`);
    }
    cleaned.set(canonId, {
      example_ids: validExamples,
      story_ids: validStories,
      mistake_ids: validMistakes,
      contrarian_take_ids: validTakes,
    });
  }
  return cleaned;
}
