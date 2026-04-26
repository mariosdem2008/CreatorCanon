// apps/web/src/components/hub/EditorialAtlas/blocks/sections/QuoteSection.tsx
import type { PageSection, Citation, SourceVideo } from '@/lib/hub/manifest/schema';
import { citationUrl, formatTimestampLabel } from '@/lib/hub/manifest/empty-state';
import { SectionCitationFooter } from './_SectionCitationFooter';

type Props = {
  section: Extract<PageSection, { kind: 'quote' }>;
  citationsById?: Record<string, Citation>;
  sourcesById?: Record<string, SourceVideo>;
};

export function QuoteSection({ section, citationsById, sourcesById }: Props) {
  const source =
    section.sourceVideoId && sourcesById ? sourcesById[section.sourceVideoId] : undefined;
  const showWatchLink = source && typeof section.timestampStart === 'number';
  const watchUrl = showWatchLink
    ? citationUrl({ url: undefined, timestampStart: section.timestampStart! }, source!)
    : null;

  return (
    <section className="space-y-3">
      <blockquote className="border-l-2 border-[#1A1612] pl-5">
        <p className="text-[20px] leading-[1.4] tracking-[-0.005em] text-[#1A1612] [text-wrap:balance]">
          {`“${section.body}”`}
        </p>
        {(section.attribution || showWatchLink) && (
          <footer className="mt-3 flex flex-wrap items-center gap-3 text-[11px] uppercase tracking-[0.12em] text-[#9A8E7C]">
            {section.attribution && <span>— {section.attribution}</span>}
            {watchUrl && (
              <a
                href={watchUrl}
                target="_blank"
                rel="noreferrer"
                className="underline-offset-2 hover:text-[#3D352A] hover:underline"
              >
                Watch at {formatTimestampLabel(section.timestampStart!)}
              </a>
            )}
          </footer>
        )}
      </blockquote>
      <SectionCitationFooter citationIds={section.citationIds} citationsById={citationsById} />
    </section>
  );
}
