import { Icon } from '@creatorcanon/ui';
import type { AuditReport } from '@creatorcanon/pipeline/audit';

interface AuditBlueprintPreviewProps {
  blueprint: AuditReport['blueprint'];
}

export function AuditBlueprintPreview({ blueprint }: AuditBlueprintPreviewProps) {
  return (
    <section className="border-t border-rule bg-paper">
      <div className="mx-auto max-w-[1180px] px-6 py-14">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="text-eyebrow uppercase text-amber-ink">Hub Blueprint Preview</p>
            <h2 className="mt-2 font-serif text-display-sm text-ink">{blueprint.hubTitle}</h2>
          </div>
          <div className="max-w-[420px] border border-rule bg-paper-warm p-4">
            <div className="flex items-center gap-2 text-caption uppercase text-ink-4">
              <Icon name="book" size={14} />
              Sample lesson
            </div>
            <h3 className="mt-2 text-heading-md text-ink">{blueprint.sampleLesson.title}</h3>
            <p className="mt-2 text-body-sm text-ink-3">{blueprint.sampleLesson.promise}</p>
          </div>
        </div>

        <div className="mt-8 grid gap-px overflow-hidden rounded-lg border border-rule bg-rule md:grid-cols-2 lg:grid-cols-3">
          {blueprint.tracks.map((track) => (
            <div key={track.title} className="bg-paper p-5">
              <div className="flex items-center gap-2 text-heading-sm text-ink">
                <Icon name="layers" size={15} className="text-amber-ink" />
                {track.title}
              </div>
              <p className="mt-2 text-body-sm leading-relaxed text-ink-3">{track.description}</p>
              <ul className="mt-4 space-y-2">
                {track.candidatePages.map((page) => (
                  <li key={page} className="flex items-start gap-2 text-body-sm text-ink-2">
                    <Icon name="check2" size={13} className="mt-0.5 shrink-0 text-sage" />
                    {page}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
