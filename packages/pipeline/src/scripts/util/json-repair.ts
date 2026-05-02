/**
 * Truncated-JSON repair. Codex CLI sometimes returns JSON cut off mid-string
 * (token boundary truncation). This helper attempts a 4-step recovery:
 *
 *   1. Direct JSON.parse — works for well-formed input.
 *   2. Trim trailing whitespace + dangling commas, retry parse.
 *   3. Walk from start counting brackets/braces; when depth returns to 0
 *      (last balanced top-level close), parse only that prefix.
 *   4. Walk forward recording every comma's position + the opener-stack
 *      snapshot at that point. From the most recent comma backward, try
 *      `slice(startIdx, commaIdx) + reversedClosers(stackSnapshot)` and
 *      accept the first that JSON.parse succeeds on. This handles Codex's
 *      `{"registry": {"u1": {...}, "u2": {...}}}` shape where entry
 *      separators live at depth 2.
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

  // Strategy 4: walk forward, snapshot stack at every comma; from most recent
  // backward, try truncating at that comma + appending the matching closers.
  const dropped = dropLastIncompleteEntry(trimmed);
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

/** Walk the input forward, snapshotting the opener stack at every comma.
 *  At end-of-input (potentially mid-string or mid-escape), find the most
 *  recent comma whose snapshot produces a parseable prefix when truncated
 *  there and balanced with the matching closers. Falls back to earlier
 *  commas if the most recent fails to parse.
 *
 *  This handles deep-nested truncation patterns that the simpler
 *  "drop last top-level entry" approach misses — specifically the
 *  `{"registry": {...}}` shape where entry separators live at depth 2. */
function dropLastIncompleteEntry(raw: string): string | null {
  const startIdx = raw.search(/[{[]/);
  if (startIdx < 0) return null;

  const stack: Array<'{' | '['> = [];
  let inString = false;
  let escaped = false;
  const commaHistory: Array<{ idx: number; closers: string }> = [];

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
      stack.push(ch);
    } else if (ch === '}' || ch === ']') {
      stack.pop();
    } else if (ch === ',') {
      // Closers needed to balance from this comma's depth back to 0.
      const closers = stack
        .slice()
        .reverse()
        .map((o) => (o === '{' ? '}' : ']'))
        .join('');
      commaHistory.push({ idx: i, closers });
    }
  }

  // Try the most recent comma first (deepest recovery), fall back to earlier ones.
  for (let h = commaHistory.length - 1; h >= 0; h -= 1) {
    const entry = commaHistory[h]!;
    const candidate = raw.slice(startIdx, entry.idx) + entry.closers;
    try {
      JSON.parse(candidate);
      return candidate;
    } catch {
      // try the next earlier comma
    }
  }

  return null;
}
