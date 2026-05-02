import { LinkButton, StatusPill } from '@/components/cc';

interface ShareCardProps {
  quote: string;
  creatorName: string;
  hubTitle: string;
  attribution?: string;
  downloadHref?: string;
}

export function ShareCard({
  quote,
  creatorName,
  hubTitle,
  attribution = 'CreatorCanon',
  downloadHref = '#share-card-download',
}: ShareCardProps) {
  return (
    <div className="grid gap-3">
      <div className="aspect-square w-full max-w-[420px] overflow-hidden rounded-[8px] border border-[var(--cc-rule)] bg-[var(--cc-ink)] p-6 text-white shadow-[var(--cc-shadow-1)]">
        <div className="flex h-full flex-col justify-between">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/65">
              {hubTitle}
            </span>
            <span className="rounded-full border border-white/20 px-2 py-1 text-[10px] font-semibold text-white/70">
              Share card
            </span>
          </div>
          <blockquote className="text-[28px] font-semibold leading-[1.08]">
            <span aria-hidden>&ldquo;</span>
            {quote}
            <span aria-hidden>&rdquo;</span>
          </blockquote>
          <div>
            <p className="text-[14px] font-semibold">{creatorName}</p>
            <p className="mt-1 text-[11px] text-white/60">{attribution}</p>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill tone="neutral">1080 x 1080</StatusPill>
        <LinkButton href={downloadHref} variant="secondary" size="sm">
          Download
        </LinkButton>
      </div>
    </div>
  );
}
