import type { ArtifactBundle, VoiceMode } from './types';

/**
 * Walk the artifact bundle and collect every citationId referenced anywhere.
 * Used by the assembler to validate that every citation resolves to a real
 * segment in this run.
 */
export function collectAllCitationIds(bundle: ArtifactBundle): string[] {
  const out = new Set<string>();
  for (const p of bundle.prose.paragraphs) for (const id of p.citationIds) out.add(id);
  if (bundle.roadmap) for (const s of bundle.roadmap.steps) for (const id of s.citationIds) out.add(id);
  if (bundle.example) for (const id of bundle.example.citationIds) out.add(id);
  if (bundle.diagram) for (const id of bundle.diagram.citationIds) out.add(id);
  if (bundle.mistakes) for (const m of bundle.mistakes.items) for (const id of m.citationIds) out.add(id);
  return [...out];
}

/**
 * Lightweight voice-mode classifier. Counts pronouns and returns a
 * 0..1 consistency score: how much the text leans into the expected voice.
 * 1.0 = pure expected voice, 0.0 = pure opposite voice.
 *
 * Crude but effective for catching gross drift; the critic catches subtler
 * issues. Used by the assembler as a final guardrail.
 */
export function voiceConsistencyScore(mode: VoiceMode, text: string): number {
  const lower = ` ${text.toLowerCase()} `;
  const youCount = (lower.match(/[\s,.!?]you[r']?[\s,.!?]/g) ?? []).length;
  const iCount = (lower.match(/[\s,.!?]i[\s,.!?']/g) ?? []).length
    + (lower.match(/[\s,.!?]we[\s,.!?']/g) ?? []).length
    + (lower.match(/[\s,.!?]my[\s,.!?]/g) ?? []).length;
  const total = youCount + iCount;
  if (total === 0) return 0.5; // ambiguous text — neither voice dominates
  if (mode === 'reader_second_person') return youCount / total;
  return iCount / total;
}
