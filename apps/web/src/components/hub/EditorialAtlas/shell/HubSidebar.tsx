// apps/web/src/components/hub/EditorialAtlas/shell/HubSidebar.tsx
import Link from 'next/link';
import Image from 'next/image';
import type { EditorialAtlasManifest } from '@/lib/hub/manifest/schema';
import { getSearchRoute } from '@/lib/hub/routes';

type Props = {
  hubSlug: string;
  title: EditorialAtlasManifest['title'];
  creator: EditorialAtlasManifest['creator'];
  navigation: EditorialAtlasManifest['navigation'];
  /**
   * Pathname from the route component. Used to highlight the active nav item.
   * The hub layout passes `usePathname()` through; the sidebar itself is a
   * server component because it doesn't need any state.
   */
  activePathname: string;
};

/**
 * The persistent left sidebar on every hub surface.
 * - Creator pill at top
 * - Primary nav (~9 items)
 * - Secondary "Resources" nav
 * - Source-backed footer card
 * - "Built on CreatorCanon" link
 * - Sticky search input at the very bottom
 */
export function HubSidebar({ hubSlug, title, creator, navigation, activePathname }: Props) {
  return (
    <aside
      aria-label="Hub navigation"
      className="hidden w-[232px] shrink-0 flex-col bg-[#F2EBDA] text-[#3D352A] md:flex"
    >
      <div className="flex flex-1 flex-col px-4 py-5">
        {/* Creator pill */}
        <Link href={`/h/${hubSlug}`} className="flex items-center gap-2.5 rounded-[10px] px-1 py-1 hover:bg-black/5">
          <span className="grid size-7 place-items-center overflow-hidden rounded-full bg-[#D6CFC0]">
            {creator.avatarUrl ? (
              <Image src={creator.avatarUrl} alt="" width={28} height={28} />
            ) : (
              <span aria-hidden className="text-[11px] font-semibold text-[#3D352A]">
                {creator.name.slice(0, 2).toUpperCase()}
              </span>
            )}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[12px] font-semibold leading-tight text-[#1A1612]">{creator.name}</span>
            <span className="block truncate text-[11px] text-[#6B5F50]">{title}</span>
          </span>
        </Link>

        {/* Primary nav */}
        <nav aria-label="Primary" className="mt-5">
          <ul className="space-y-0.5">
            {navigation.primary.map((item) => {
              const active = item.href === activePathname || (item.href !== `/h/${hubSlug}` && activePathname.startsWith(item.href));
              return (
                <li key={item.label}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={
                      'flex h-8 items-center gap-2.5 rounded-[8px] px-2 text-[13px] transition-colors ' +
                      (active
                        ? 'bg-white text-[#1A1612] font-medium shadow-[0_1px_0_rgba(0,0,0,0.04)]'
                        : 'text-[#6B5F50] hover:bg-white/60 hover:text-[#1A1612]')
                    }
                  >
                    <span aria-hidden className="size-1.5 rounded-full bg-current opacity-40" />
                    <span className="truncate">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Secondary nav */}
        {navigation.secondary.length > 0 && (
          <nav aria-label="Resources" className="mt-6">
            <p className="px-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9A8E7C]">Resources</p>
            <ul className="mt-2 space-y-0.5">
              {navigation.secondary.map((item) => (
                <li key={item.label}>
                  <Link
                    href={item.href}
                    className="flex h-8 items-center gap-2.5 rounded-[8px] px-2 text-[13px] text-[#6B5F50] transition-colors hover:bg-white/60 hover:text-[#1A1612]"
                  >
                    <span className="truncate">{item.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}

        {/* Source-backed footer card */}
        <div className="mt-auto rounded-[10px] border border-[#D6CFC0] bg-white/60 p-3">
          <p className="text-[12px] font-semibold text-[#1A1612]">Source-backed knowledge</p>
          <p className="mt-1 text-[11px] leading-[1.55] text-[#6B5F50]">
            Every page is built from {creator.name.split(' ')[0]}'s videos, transcripts, and grounded citations.
          </p>
          <Link
            href={`/h/${hubSlug}/methodology`}
            className="mt-2 inline-flex text-[11px] font-semibold text-[#1A1612] hover:underline"
          >
            Learn more →
          </Link>
        </div>

        {/* Search */}
        <form action={getSearchRoute(hubSlug)} method="get" className="mt-3">
          <label htmlFor="hub-search" className="sr-only">Search this hub</label>
          <input
            id="hub-search" name="q" type="search" placeholder="Search this hub…"
            className="h-9 w-full rounded-[8px] border border-[#D6CFC0] bg-white px-3 text-[12px] text-[#1A1612] placeholder:text-[#9A8E7C] focus:border-[#1A1612] focus:outline-none"
          />
        </form>

        {/* Built on CreatorCanon */}
        <a
          href="https://creatorcanon.com"
          className="mt-3 text-[10px] text-[#9A8E7C] hover:text-[#1A1612]"
          target="_blank" rel="noreferrer"
        >
          Built on CreatorCanon
        </a>
      </div>
    </aside>
  );
}
