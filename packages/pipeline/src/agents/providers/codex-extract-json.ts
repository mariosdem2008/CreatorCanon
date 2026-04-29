/**
 * Extract a single JSON object from Codex CLI output.
 *
 * Codex's `-o <tmpfile>` flag writes ONLY the agent's final message to a
 * file, so most of the time the input here is bare JSON. But Codex can
 * still wrap output in narrative ("Here's the JSON you asked for: ...")
 * or markdown fences when prompted ambiguously. This helper handles all
 * three cases plus malformed inputs.
 *
 * Priority order:
 *  1. ```json … ``` fenced block (when content parses)
 *  2. Plain ``` … ``` fenced block (when content parses)
 *  3. First balanced {…} substring that parses
 *  4. Throw CodexJsonExtractError
 *
 * Returns the JSON as a string (not a parsed object) so the caller's
 * existing JSON.parse + Zod chain works unchanged.
 */
export class CodexJsonExtractError extends Error {
  constructor(message: string, public readonly rawOutput: string) {
    super(message);
    this.name = 'CodexJsonExtractError';
  }
}

const FENCE_JSON_RE = /```json\s*([\s\S]*?)\s*```/;
const FENCE_PLAIN_RE = /```\s*([\s\S]*?)\s*```/;

export function extractJsonFromCodexOutput(raw: string): string {
  if (!raw || raw.trim().length === 0) {
    throw new CodexJsonExtractError('Codex output is empty', raw);
  }

  // 1. ```json fenced block
  const fenceJson = raw.match(FENCE_JSON_RE);
  if (fenceJson?.[1]) {
    const candidate = fenceJson[1].trim();
    if (tryParse(candidate)) return candidate;
  }

  // 2. Plain ``` fenced block (only count if it parses as JSON)
  const fencePlain = raw.match(FENCE_PLAIN_RE);
  if (fencePlain?.[1]) {
    const candidate = fencePlain[1].trim();
    if (tryParse(candidate)) return candidate;
  }

  // 3. First balanced {…} substring that parses
  const balanced = findBalancedJson(raw);
  if (balanced && tryParse(balanced)) return balanced;

  throw new CodexJsonExtractError(
    `Could not extract a JSON object from Codex output (length=${raw.length})`,
    raw,
  );
}

function tryParse(s: string): boolean {
  try {
    JSON.parse(s);
    return true;
  } catch {
    return false;
  }
}

/**
 * Walk the string from the first '{' and find the matching '}' that closes
 * the same depth. Tolerates strings (which may contain unbalanced braces)
 * and escaped quotes inside strings.
 */
function findBalancedJson(raw: string): string | null {
  const start = raw.indexOf('{');
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < raw.length; i += 1) {
    const ch = raw[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\' && inString) {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return raw.slice(start, i + 1);
    }
  }
  return null;
}
