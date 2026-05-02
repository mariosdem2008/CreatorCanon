'use client';

import { useEffect, useRef, useState } from 'react';

export interface DiagramBlockProps {
  diagramType: 'flowchart' | 'sequence' | 'state' | 'mindmap';
  mermaidSrc: string;
  caption: string;
}

/**
 * Mermaid renderer for hub diagrams. Loads mermaid.js dynamically on the
 * client (it's heavy — 2MB+ bundled) so non-diagram pages don't pay the
 * cost. Renders to inline SVG. Falls back to a fenced code block if
 * Mermaid fails at render time.
 */
export function DiagramBlock({ mermaidSrc, caption }: DiagramBlockProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function render() {
      try {
        const mermaid = (await import('mermaid')).default;
        mermaid.initialize({ startOnLoad: false, theme: 'neutral', securityLevel: 'strict' });
        const id = 'diagram-' + Math.random().toString(36).slice(2, 10);
        const { svg } = await mermaid.render(id, mermaidSrc);
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg;
        }
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      }
    }
    void render();
    return () => { cancelled = true; };
  }, [mermaidSrc]);

  return (
    <figure className="my-6 rounded-lg border border-slate-200 bg-white p-4">
      {error ? (
        <pre className="overflow-x-auto text-xs text-slate-700 bg-slate-50 p-3 rounded">{mermaidSrc}</pre>
      ) : (
        <div ref={containerRef} className="flex justify-center" />
      )}
      <figcaption className="mt-3 text-sm text-slate-600 text-center italic">{caption}</figcaption>
    </figure>
  );
}
