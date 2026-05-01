import type { CSSProperties, ReactNode } from 'react';
import Link from 'next/link';

import type { CreatorManualManifest, CreatorManualNavItem } from '@/lib/hub/creator-manual/schema';
import {
  getCreatorManualClaimsRoute,
  getCreatorManualGlossaryRoute,
  getCreatorManualHomeRoute,
  getCreatorManualLibraryRoute,
  getCreatorManualPillarsRoute,
  getCreatorManualSearchRoute,
  getCreatorManualSegmentsRoute,
  getCreatorManualSourcesRoute,
  getCreatorManualThemesRoute,
  getCreatorManualWorkshopRoute,
} from '@/lib/hub/creator-manual/routes';

import styles from './CreatorManual.module.css';

type RouteKey = CreatorManualNavItem['routeKey'];

type CreatorManualShellProps = {
  manifest: CreatorManualManifest;
  activeRouteKey?: RouteKey;
  children: ReactNode;
};

type ManualStyle = CSSProperties & Record<`--cm-${string}`, string>;

const routeFor = (hubSlug: string, key: RouteKey) => {
  switch (key) {
    case 'home':
      return getCreatorManualHomeRoute(hubSlug);
    case 'library':
      return getCreatorManualLibraryRoute(hubSlug);
    case 'pillars':
      return getCreatorManualPillarsRoute(hubSlug);
    case 'sources':
      return getCreatorManualSourcesRoute(hubSlug);
    case 'segments':
      return getCreatorManualSegmentsRoute(hubSlug);
    case 'claims':
      return getCreatorManualClaimsRoute(hubSlug);
    case 'glossary':
      return getCreatorManualGlossaryRoute(hubSlug);
    case 'themes':
      return getCreatorManualThemesRoute(hubSlug);
    case 'workshop':
      return getCreatorManualWorkshopRoute(hubSlug);
    case 'search':
      return getCreatorManualSearchRoute(hubSlug);
  }
};

const themeStyle = (manifest: CreatorManualManifest): ManualStyle => {
  const { colors, typography } = manifest.brand.tokens;

  return {
    '--cm-bg': colors.background,
    '--cm-fg': colors.foreground,
    '--cm-surface': colors.surface,
    '--cm-elevated': colors.elevated,
    '--cm-border': colors.border,
    '--cm-muted': colors.muted,
    '--cm-accent': colors.accent,
    '--cm-accent-fg': colors.accentForeground,
    '--cm-warning': colors.warning,
    '--cm-success': colors.success,
    '--cm-radius': manifest.brand.tokens.radius,
    '--cm-shadow': manifest.brand.tokens.shadow,
    '--cm-heading': typography.headingFamily,
    '--cm-body': typography.bodyFamily,
    '--cm-pattern-image': manifest.brand.assets?.patternImageUrl
      ? `url("${manifest.brand.assets.patternImageUrl}")`
      : 'none',
  };
};

function NavLinks({
  items,
  manifest,
  activeRouteKey,
  mobile = false,
}: {
  items: CreatorManualNavItem[];
  manifest: CreatorManualManifest;
  activeRouteKey?: RouteKey;
  mobile?: boolean;
}) {
  return (
    <>
      {items.map((item) => (
        <Link
          key={`${item.routeKey}-${item.label}`}
          href={routeFor(manifest.hubSlug, item.routeKey)}
          className={[
            mobile ? styles.navMenuLink : styles.navLink,
            item.routeKey === activeRouteKey ? styles.navLinkActive : '',
          ].join(' ')}
          aria-current={item.routeKey === activeRouteKey ? 'page' : undefined}
        >
          {item.label}
        </Link>
      ))}
    </>
  );
}

export function CreatorManualShell({
  manifest,
  activeRouteKey,
  children,
}: CreatorManualShellProps) {
  const navItems = [...manifest.navigation.primary, ...manifest.navigation.secondary];
  const avatarUrl = manifest.brand.assets?.logoUrl || manifest.creator.avatarUrl;
  const mark = manifest.creator.name.trim().slice(0, 1).toUpperCase() || 'C';

  return (
    <div
      className={styles.manual}
      style={themeStyle(manifest)}
      data-mode={manifest.brand.style.mode}
    >
      <div className={styles.shell}>
        <header className={styles.topbar}>
          <div className={styles.topbarInner}>
            <Link href={getCreatorManualHomeRoute(manifest.hubSlug)} className={styles.brandLockup}>
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt="" className={styles.avatar} />
              ) : (
                <span className={styles.logoMark} aria-hidden="true">
                  {mark}
                </span>
              )}
              <span className={styles.brandText}>
                <span className={styles.kicker}>{manifest.creator.handle}</span>
                <span className={styles.brandName}>{manifest.creator.name}</span>
              </span>
            </Link>
            <nav className={styles.desktopNav} aria-label="Creator manual navigation">
              <NavLinks items={navItems} manifest={manifest} activeRouteKey={activeRouteKey} />
            </nav>
            <details className={styles.mobileMenu}>
              <summary className={styles.mobileSummary}>Menu</summary>
              <nav className={styles.mobilePanel} aria-label="Creator manual mobile navigation">
                <NavLinks
                  items={navItems}
                  manifest={manifest}
                  activeRouteKey={activeRouteKey}
                  mobile
                />
              </nav>
            </details>
          </div>
        </header>
        <main className={styles.page}>{children}</main>
      </div>
    </div>
  );
}
