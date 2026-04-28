/**
 * Server-side Mermaid validator. Uses mermaid.parse() to confirm syntactic
 * validity before persisting a diagram block. Returns a discriminated result
 * so callers can branch cleanly on success vs. error.
 */
export type MermaidValidation = { ok: true } | { ok: false; error: string };

export async function validateMermaid(src: string): Promise<MermaidValidation> {
  if (!src || src.trim().length === 0) {
    return { ok: false, error: 'mermaid source is empty' };
  }
  try {
    const mermaid = (await import('mermaid')).default;
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });
    await mermaid.parse(src);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message ?? String(err) };
  }
}
