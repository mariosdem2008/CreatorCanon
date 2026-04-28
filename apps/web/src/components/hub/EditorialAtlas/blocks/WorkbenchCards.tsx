import Link from 'next/link';

import type { WorkbenchArtifact, WorkbenchPageCard, WorkbenchPath, WorkbenchSourceMoment } from '@/lib/hub/workbench';
import { getPageRoute } from '@/lib/hub/routes';

export function PathCard({ path, hubSlug }: { path: WorkbenchPath; hubSlug: string }) {
  const first = path.pages[0];

  return (
    <section className="h-full rounded-[12px] border border-[#D8D0C0] bg-white p-5 shadow-[0_1px_0_rgba(26,22,18,0.03)]">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-[18px] font-semibold leading-tight tracking-[-0.01em] text-[#1A1612]">{path.title}</h2>
          <p className="mt-2 text-[13px] leading-[1.5] text-[#6B5F50]">{path.body}</p>
        </div>
        <span className="shrink-0 rounded-full bg-[#E7F2E8] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#2F684B]">
          Path
        </span>
      </div>
      <ol className="mt-5 space-y-2">
        {path.pages.slice(0, 3).map((page, index) => (
          <li key={page.id}>
            <Link href={getPageRoute(hubSlug, page.slug)} className="flex min-h-10 items-center gap-3 rounded-[9px] px-2 py-2 hover:bg-[#FAF6EE]">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#1A1612] text-[11px] font-semibold text-[#F8F4EC]">
                {index + 1}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-semibold text-[#1A1612]">{page.title}</span>
                <span className="block text-[11px] text-[#9A8E7C]">
                  {page.timeLabel} &middot; {page.citationLabel}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
      {first ? (
        <Link
          href={getPageRoute(hubSlug, first.slug)}
          className="mt-5 inline-flex h-9 items-center rounded-[9px] bg-[#1A1612] px-3 text-[12px] font-semibold text-[#F8F4EC] hover:opacity-90"
        >
          {path.actionLabel}
        </Link>
      ) : null}
    </section>
  );
}

export function QuickWinCard({ page, hubSlug }: { page: WorkbenchPageCard; hubSlug: string }) {
  return (
    <Link
      href={getPageRoute(hubSlug, page.slug)}
      className="block min-h-[150px] rounded-[12px] border border-[#E5DECF] bg-white p-4 hover:border-[#CFC5B2] hover:bg-[#FFFCF6]"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="rounded-full bg-[#F2EBDA] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#6B5F50]">
          {page.intent}
        </span>
        <span className="shrink-0 text-[11px] text-[#9A8E7C]">{page.timeLabel}</span>
      </div>
      <h3 className="mt-3 line-clamp-2 text-[15px] font-semibold leading-[1.3] text-[#1A1612]">{page.title}</h3>
      <p className="mt-2 line-clamp-2 text-[12px] leading-[1.5] text-[#6B5F50]">{page.summary}</p>
    </Link>
  );
}

export function ArtifactCard({ artifact, hubSlug }: { artifact: WorkbenchArtifact; hubSlug: string }) {
  return (
    <Link
      href={getPageRoute(hubSlug, artifact.pageSlug)}
      className="block min-h-[180px] rounded-[12px] border border-[#E5DECF] bg-[#FFFCF6] p-4 hover:border-[#CFC5B2]"
    >
      <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#A56B2A]">{artifact.typeLabel}</span>
      <h3 className="mt-2 line-clamp-2 text-[14px] font-semibold leading-[1.3] text-[#1A1612]">{artifact.title}</h3>
      <p className="mt-2 line-clamp-3 whitespace-pre-line text-[12px] leading-[1.5] text-[#6B5F50]">{artifact.body}</p>
      <p className="mt-3 text-[11px] font-medium text-[#1A1612]">From {artifact.pageTitle}</p>
    </Link>
  );
}

export function SourceMomentCard({ moment }: { moment: WorkbenchSourceMoment }) {
  const inner = (
    <>
      <div className="flex items-center justify-between gap-3">
        <span className="line-clamp-1 min-w-0 text-[12px] font-semibold text-[#1A1612]">{moment.sourceTitle}</span>
        <span className="shrink-0 text-[11px] text-[#9A8E7C]">{moment.timestampLabel}</span>
      </div>
      <p className="mt-2 line-clamp-3 text-[12px] italic leading-[1.5] text-[#6B5F50]">{`"${moment.excerpt}"`}</p>
    </>
  );
  const className = 'block min-h-[132px] rounded-[12px] border border-[#E5DECF] bg-white p-4';

  return moment.href ? (
    <a href={moment.href} target="_blank" rel="noreferrer" className={`${className} hover:border-[#CFC5B2] hover:bg-[#FFFCF6]`}>
      {inner}
    </a>
  ) : (
    <div className={className}>{inner}</div>
  );
}
