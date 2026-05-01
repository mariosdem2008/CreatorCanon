// apps/web/src/components/hub/EditorialAtlas/shell/HubShell.tsx
import type { ReactNode } from 'react';

import type { EditorialAtlasManifest } from '@/lib/hub/manifest/schema';

import { HubSidebar } from './HubSidebar';
import { HubFooterTrustBar } from './HubFooterTrustBar';

type Props = {
  manifest: EditorialAtlasManifest;
  /** The current pathname, supplied by the route component. */
  activePathname: string;
  /** Optional right rail (renders to the right of `children` on lg+). */
  rightRail?: ReactNode;
  children: ReactNode;
};

/**
 * The Editorial Atlas chrome. Always renders:
 * - HubSidebar (fixed-width, persistent across navigation)
 * - Main content + optional right rail
 * - HubFooterTrustBar (dark strip)
 */
export function HubShell({ manifest, activePathname, rightRail, children }: Props) {
  return (
    <div className="min-h-screen bg-[#F8F4EC] text-[#1A1612]">
      <div className="flex min-h-screen">
        <HubSidebar
          hubSlug={manifest.hubSlug}
          title={manifest.title}
          creator={manifest.creator}
          navigation={manifest.navigation}
          activePathname={activePathname}
          highlights={manifest.highlights}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <main
            className={
              rightRail
                ? 'mx-auto flex w-full max-w-[1240px] flex-1 flex-col gap-8 px-6 py-6 sm:px-8 xl:flex-row xl:items-start'
                : 'mx-auto w-full max-w-[1120px] flex-1 px-6 py-6 sm:px-8'
            }
          >
            <div className="min-w-0 flex-1">{children}</div>
            {rightRail ? (
              <aside aria-label="Evidence and related" className="w-full shrink-0 xl:w-[320px]">
                {rightRail}
              </aside>
            ) : null}
          </main>

          <HubFooterTrustBar qualityPrinciples={manifest.trust.qualityPrinciples} />
        </div>
      </div>
    </div>
  );
}
