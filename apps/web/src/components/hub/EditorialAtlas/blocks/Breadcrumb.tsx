// apps/web/src/components/hub/EditorialAtlas/blocks/Breadcrumb.tsx
import Link from 'next/link';

type Crumb = { label: string; href?: string };
type Props = { crumbs: Crumb[] };

export function Breadcrumb({ crumbs }: Props) {
  return (
    <nav aria-label="Breadcrumb" className="text-[11px] text-[#9A8E7C]">
      <ol className="flex items-center gap-1.5">
        {crumbs.map((c, i) => (
          <li key={i} className="flex items-center gap-1.5">
            {c.href ? (
              <Link href={c.href} className="hover:text-[#3D352A] hover:underline underline-offset-2">{c.label}</Link>
            ) : (
              <span className="text-[#3D352A]">{c.label}</span>
            )}
            {i < crumbs.length - 1 && <span aria-hidden>›</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}
