'use client';

import { type ReactNode, useState } from 'react';
import { useRouter } from 'next/navigation';

interface RewriteResponse {
  rewrittenParagraph?: string;
  error?: string;
}

export function ManualReviewParagraph({
  runId,
  canonId,
  paragraph,
  children,
}: {
  runId: string;
  canonId: string;
  paragraph: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [instruction, setInstruction] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rewritten, setRewritten] = useState<string | null>(null);

  async function submitRewrite() {
    if (!instruction.trim()) return;
    setPending(true);
    setError(null);
    setRewritten(null);
    try {
      const res = await fetch(`/api/runs/${encodeURIComponent(runId)}/canon/${encodeURIComponent(canonId)}/rewrite-paragraph`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paragraph, instruction }),
      });
      const json = (await res.json()) as RewriteResponse;
      if (!res.ok) {
        throw new Error(json.error ?? 'Rewrite failed');
      }
      setRewritten(json.rewrittenParagraph ?? '');
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="group/review relative rounded-[8px] border border-transparent px-2 py-1 transition-colors hover:border-[var(--cc-rule)] hover:bg-[var(--cc-surface-2)]/70">
      <div>{children}</div>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="absolute right-2 top-2 rounded-[6px] border border-[var(--cc-rule)] bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--cc-ink-3)] opacity-0 shadow-sm transition-all hover:border-[var(--cc-ink-4)] hover:text-[var(--cc-ink)] group-hover/review:opacity-100 focus:opacity-100"
      >
        Rewrite
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 py-6">
          <div className="w-full max-w-xl rounded-[10px] border border-[var(--cc-rule)] bg-white p-4 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--cc-ink-4)]">
                  Manual review
                </p>
                <h2 className="mt-1 text-[16px] font-semibold text-[var(--cc-ink)]">
                  Rewrite paragraph
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-[6px] border border-[var(--cc-rule)] px-2 py-1 text-[11px] text-[var(--cc-ink-3)] hover:text-[var(--cc-ink)]"
              >
                Close
              </button>
            </div>

            <div className="mt-4 rounded-[8px] border border-[var(--cc-rule)] bg-[var(--cc-surface-2)] p-3 text-[12px] leading-[1.55] text-[var(--cc-ink-2)]">
              {paragraph}
            </div>

            <label className="mt-4 block">
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--cc-ink-4)]">
                Instruction
              </span>
              <textarea
                value={instruction}
                onChange={(event) => setInstruction(event.target.value)}
                rows={4}
                className="mt-1 w-full resize-none rounded-[8px] border border-[var(--cc-rule)] bg-white p-3 text-[13px] leading-[1.5] text-[var(--cc-ink)] outline-none transition-colors focus:border-[var(--cc-accent-strong)]"
                placeholder="Tighten this, make it more direct, preserve the citations."
              />
            </label>

            {error ? (
              <p className="mt-3 rounded-[8px] border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">
                {error}
              </p>
            ) : null}

            {rewritten ? (
              <div className="mt-3 rounded-[8px] border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] leading-[1.55] text-emerald-900">
                {rewritten}
              </div>
            ) : null}

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-[7px] border border-[var(--cc-rule)] px-3 py-2 text-[12px] font-semibold text-[var(--cc-ink-3)] hover:text-[var(--cc-ink)]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={pending || !instruction.trim()}
                onClick={submitRewrite}
                className="rounded-[7px] bg-[var(--cc-ink)] px-3 py-2 text-[12px] font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-45"
              >
                {pending ? 'Rewriting...' : 'Apply rewrite'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
