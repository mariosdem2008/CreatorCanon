/**
 * Splits a whisper segment into sub-segments capped at `maxDurationMs`.
 * Prefers sentence-end boundaries (`.`, `!`, `?`) when they land inside a
 * slice; falls back to even time-slicing when no sentence boundary is close.
 *
 * Rationale: whisper's native `segment` granularity can return 3-6 minute
 * chunks on long audio; that makes every source moment link to the start
 * of a segment and reduces grounding value. Capping at ~12s produces
 * moment-cards that actually point at the claim they're citing.
 */
export interface WhisperSegment {
  startMs: number;
  endMs: number;
  text: string;
}

export interface SplitOptions {
  /** Maximum duration of a single output segment (default 12000). */
  maxDurationMs?: number;
}

const DEFAULT_MAX_DURATION_MS = 12_000;

// Matches sentence-end punctuation followed by whitespace or end-of-text.
// Exec loop below uses global flag to walk all positions.
function findSentenceBoundaries(text: string): number[] {
  const re = /[.!?](?=\s|$)/g;
  const positions: number[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    positions.push(match.index + 1); // include the punctuation char
  }
  return positions;
}

function evenSplit(seg: WhisperSegment, maxDurationMs: number): WhisperSegment[] {
  const duration = seg.endMs - seg.startMs;
  const parts = Math.max(1, Math.ceil(duration / maxDurationMs));
  const out: WhisperSegment[] = [];
  const charLen = seg.text.length;
  for (let i = 0; i < parts; i += 1) {
    const startMs = seg.startMs + Math.floor((i * duration) / parts);
    const endMs = i === parts - 1 ? seg.endMs : seg.startMs + Math.floor(((i + 1) * duration) / parts);
    const textStart = Math.floor((i * charLen) / parts);
    const textEnd = i === parts - 1 ? charLen : Math.floor(((i + 1) * charLen) / parts);
    const text = seg.text.slice(textStart, textEnd).trim();
    if (text.length > 0) out.push({ startMs, endMs, text });
  }
  return out;
}

export function splitSegment(
  seg: WhisperSegment,
  options: SplitOptions = {},
): WhisperSegment[] {
  if (seg.text.trim().length === 0) return [];

  const maxDurationMs = options.maxDurationMs ?? DEFAULT_MAX_DURATION_MS;
  const duration = seg.endMs - seg.startMs;
  if (duration <= maxDurationMs) return [seg];

  const boundaries = findSentenceBoundaries(seg.text);
  if (boundaries.length === 0) {
    return evenSplit(seg, maxDurationMs);
  }

  const msPerChar = duration / Math.max(1, seg.text.length);
  const out: WhisperSegment[] = [];
  let sliceStartChar = 0;
  let sliceStartMs = seg.startMs;

  for (let i = 0; i < boundaries.length; i += 1) {
    const endChar = boundaries[i]!;
    const endMsAbs = Math.round(seg.startMs + endChar * msPerChar);
    const nextEndChar = i + 1 < boundaries.length ? boundaries[i + 1]! : seg.text.length;
    const nextEndMsAbs = Math.round(seg.startMs + nextEndChar * msPerChar);
    const potentialSliceDuration = nextEndMsAbs - sliceStartMs;
    const isLastBoundary = i === boundaries.length - 1;

    if (potentialSliceDuration > maxDurationMs || isLastBoundary) {
      const finalEndChar = isLastBoundary ? seg.text.length : endChar;
      const finalEndMs = isLastBoundary ? seg.endMs : endMsAbs;
      const text = seg.text.slice(sliceStartChar, finalEndChar).trim();
      if (text.length > 0) out.push({ startMs: sliceStartMs, endMs: finalEndMs, text });
      sliceStartChar = finalEndChar;
      sliceStartMs = finalEndMs;
    }
  }

  // Trailing text after last committed slice.
  if (sliceStartChar < seg.text.length) {
    const text = seg.text.slice(sliceStartChar).trim();
    if (text.length > 0) out.push({ startMs: sliceStartMs, endMs: seg.endMs, text });
  }

  return out;
}
