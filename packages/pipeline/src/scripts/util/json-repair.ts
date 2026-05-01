/**
 * Truncated-JSON repair. Codex CLI sometimes returns JSON cut off mid-string
 * (token boundary truncation). This helper attempts a 4-step recovery:
 *
 *   1. Direct JSON.parse — works for well-formed input.
 *   2. Trim trailing whitespace + dangling commas, retry parse.
 *   3. Walk from start counting brackets/braces; when depth returns to 0
 *      (last balanced top-level close), parse only that prefix.
 *   4. If 3 fails, drop the last incomplete entry of the outermost array
 *      or object and parse the rest.
 *
 * Returns null when no strategy recovers a parseable result. Caller then
 * falls back to its own degraded path (e.g., evidence-tagger's degraded
 * registry).
 */

export function repairTruncatedJson(raw: string): unknown | null {
  if (!raw || typeof raw !== 'string') return null;

  // Strategy 1: direct parse
  try {
    return JSON.parse(raw);
  } catch {
    /* fall through */
  }

  // Strategy 2: trim trailing whitespace + dangling commas
  const trimmed = raw.trimEnd().replace(/,\s*$/, '');
  try {
    return JSON.parse(trimmed);
  } catch {
    /* fall through */
  }

  // Strategy 3: find the last balanced close at depth-0
  const balanced = findLastBalancedPrefix(trimmed);
  if (balanced) {
    try {
      return JSON.parse(balanced);
    } catch {
      /* fall through */
    }
  }

  // Strategy 4: drop the last incomplete top-level entry, retry
  const dropped = dropLastTopLevelEntry(trimmed);
  if (dropped) {
    try {
      return JSON.parse(dropped);
    } catch {
      /* fall through */
    }
  }

  return null;
}

/** Walk from the first '{' or '[' tracking depth + string state.
 *  When depth returns to 0 at a closing bracket/brace, that's the last
 *  balanced top-level close. Return the prefix up to and including it. */
function findLastBalancedPrefix(raw: string): string | null {
  const startIdx = raw.search(/[{[]/);
  if (startIdx < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  let lastBalancedEnd = -1;

  for (let i = startIdx; i < raw.length; i += 1) {
    const ch = raw[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (inString) {
      if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{' || ch === '[') {
      depth += 1;
    } else if (ch === '}' || ch === ']') {
      depth -= 1;
      if (depth === 0) {
        lastBalancedEnd = i;
      }
    }
  }

  if (lastBalancedEnd < 0) return null;
  return raw.slice(startIdx, lastBalancedEnd + 1);
}

/** Drop the last incomplete top-level array/object entry. Returns a string
 *  that — if it parses — represents everything before the truncation. */
function dropLastTopLevelEntry(raw: string): string | null {
  const startIdx = raw.search(/[{[]/);
  if (startIdx < 0) return null;
  const opener = raw[startIdx];
  const closer = opener === '{' ? '}' : ']';

  // Walk forward, tracking depth + string state. Find the LAST comma at
  // depth 1 that's NOT inside a string. Truncate after that comma, append
  // the closer.
  let depth = 0;
  let inString = false;
  let escaped = false;
  let lastTopLevelComma = -1;

  for (let i = startIdx; i < raw.length; i += 1) {
    const ch = raw[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (inString) {
      if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{' || ch === '[') {
      depth += 1;
    } else if (ch === '}' || ch === ']') {
      depth -= 1;
    } else if (ch === ',' && depth === 1) {
      lastTopLevelComma = i;
    }
  }

  if (lastTopLevelComma < 0) return null;
  return raw.slice(startIdx, lastTopLevelComma) + closer;
}
