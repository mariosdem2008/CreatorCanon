/**
 * Server-side Mermaid validator. Mermaid's full parser depends on a browser
 * DOM (DOMPurify, etc.), so we deliberately do NOT import mermaid here.
 * Instead this validator is a lightweight syntactic sanity check that catches
 * the obvious-garbage cases we care about: missing/wrong directive header,
 * empty source, unbalanced brackets, way-too-many nodes.
 *
 * Full validation happens client-side in `DiagramBlock`, which renders via
 * mermaid.js and falls back to a readable code-block on parse failure. This
 * server-side check exists only to reject diagram artifacts that are
 * structurally hopeless before we persist them in the manifest.
 */
export type MermaidValidation = { ok: true } | { ok: false; error: string };

const DIRECTIVE_RE =
  /^(flowchart|graph)\s+(TD|TB|BT|RL|LR|TR|TL|BR|BL)\b|^sequenceDiagram\b|^stateDiagram(?:-v2)?\b|^mindmap\b|^classDiagram\b|^erDiagram\b|^gantt\b|^pie\b|^journey\b/;

const MAX_NODES = 50; // a generous cap; spec calls for <=20 in prompt

export async function validateMermaid(src: string): Promise<MermaidValidation> {
  if (!src || src.trim().length === 0) {
    return { ok: false, error: 'mermaid source is empty' };
  }
  // Mermaid sources start with a directive on the first non-empty line.
  const firstLine = src.split(/\r?\n/).find((l) => l.trim().length > 0) ?? '';
  if (!DIRECTIVE_RE.test(firstLine.trim())) {
    return { ok: false, error: `unrecognized mermaid directive on first line: "${firstLine.trim().slice(0, 80)}"` };
  }
  // Bracket / brace / paren balance — catches "A[Start" missing close.
  const pairs: Array<[string, string]> = [
    ['[', ']'],
    ['(', ')'],
    ['{', '}'],
  ];
  for (const [open, close] of pairs) {
    const openCount = (src.match(new RegExp(`\\${open}`, 'g')) ?? []).length;
    const closeCount = (src.match(new RegExp(`\\${close}`, 'g')) ?? []).length;
    if (openCount !== closeCount) {
      return { ok: false, error: `unbalanced ${open}${close}: ${openCount} open, ${closeCount} close` };
    }
  }
  // Rough node-count cap to catch runaway output.
  const nodeMatches = src.match(/\b[A-Za-z][A-Za-z0-9_]*\s*[\[(\{]/g) ?? [];
  if (nodeMatches.length > MAX_NODES) {
    return { ok: false, error: `too many nodes: ${nodeMatches.length} > ${MAX_NODES}` };
  }
  return { ok: true };
}
