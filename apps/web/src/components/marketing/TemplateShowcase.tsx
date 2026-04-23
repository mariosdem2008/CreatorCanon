import { HUB_TEMPLATE_OPTIONS } from '@/components/hub/templates';

export function TemplateShowcase() {
  return (
    <section
      id="templates"
      aria-labelledby="templates-heading"
      className="border-b border-rule bg-paper"
    >
      <div className="mx-auto max-w-[1140px] px-6 py-20">
        <div className="text-eyebrow uppercase text-ink-4">Hub templates</div>
        <h2
          id="templates-heading"
          className="mt-3 max-w-[640px] font-serif text-display-md text-ink tracking-[-0.025em]"
        >
          Three visual identities. One structure underneath.
        </h2>
        <p className="mt-4 max-w-[60ch] text-body-lg text-ink-2 leading-[1.7]">
          Every hub has the same citation-backed architecture. The template sets the visual
          tone — pick the one that matches your audience and content style.
        </p>

        <div className="mt-12 grid gap-5 sm:grid-cols-3">
          {HUB_TEMPLATE_OPTIONS.map((template) => {
            // Derive palette tokens from the template's own classnames
            const isPaper = template.id === 'paper';
            const isMidnight = template.id === 'midnight';

            const bg = isPaper
              ? '#fdf8f0'
              : isMidnight
                ? '#070b10'
                : '#fdf7e8';
            const text = isPaper
              ? '#1a1612'
              : isMidnight
                ? '#eef5ef'
                : '#2f271b';
            const accent = isPaper
              ? '#b08a3e'
              : isMidnight
                ? '#c8ef60'
                : '#7a4e22';
            const border = isPaper
              ? '#ddd0b4'
              : isMidnight
                ? '#263240'
                : '#c9b990';

            return (
              <article
                key={template.id}
                className="overflow-hidden rounded-lg border"
                style={{ borderColor: border, backgroundColor: bg }}
              >
                {/* Swatch strip */}
                <div
                  className="h-1.5 w-full"
                  style={{ backgroundColor: accent }}
                  aria-hidden
                />

                <div className="p-6">
                  <div
                    className="font-mono text-[10px] uppercase tracking-widest"
                    style={{ color: accent }}
                    aria-hidden
                  >
                    {template.previewLabel}
                  </div>
                  <h3
                    className="mt-2 font-serif text-xl tracking-[-0.02em]"
                    style={{ color: text }}
                  >
                    {template.name}
                  </h3>
                  <p
                    className="mt-2 text-[0.875rem] leading-relaxed opacity-65"
                    style={{ color: text }}
                  >
                    {template.description}
                  </p>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
