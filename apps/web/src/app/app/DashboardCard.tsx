import type { ReactNode } from 'react';

type DashboardCardProps = {
  title?: string;
  eyebrow?: string;
  children: ReactNode;
  className?: string;
};

export function DashboardCard({
  title,
  eyebrow,
  children,
  className = '',
}: DashboardCardProps) {
  return (
    <section
      className={`overflow-hidden rounded-[28px] border border-rule bg-paper shadow-1 ${className}`.trim()}
    >
      {(eyebrow || title) && (
        <header className="border-b border-rule bg-paper-2 px-5 py-4 sm:px-6">
          {eyebrow ? (
            <p className="text-eyebrow uppercase tracking-widest text-ink-4">{eyebrow}</p>
          ) : null}
          {title ? <h2 className="mt-1 font-serif text-heading-sm text-ink">{title}</h2> : null}
        </header>
      )}
      <div className="px-5 py-5 sm:px-6 sm:py-6">{children}</div>
    </section>
  );
}
