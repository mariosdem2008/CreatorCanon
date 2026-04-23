import { ImageResponse } from 'next/og';

import { loadHubManifest } from '../manifest';
import { normalizeHubTemplateId } from '@/components/hub/templates';

export const runtime = 'edge';
export const alt = 'CreatorCanon hub page';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const THEME_STYLES = {
  paper: {
    bg: '#f7f3ed',
    border: '#d6cfc4',
    headline: '#1a1612',
    subtitle: '#4a3f31',
    muted: '#6b5f50',
    accent: '#b8892a',
    wordmark: '#1a1612',
    pill: '#e8e0d4',
  },
  midnight: {
    bg: '#070b10',
    border: '#263240',
    headline: '#eef5ef',
    subtitle: '#b8d4bc',
    muted: '#7e9188',
    accent: '#c8ef60',
    wordmark: '#c8ef60',
    pill: '#0f151c',
  },
  field: {
    bg: '#f2e8cf',
    border: '#c9b990',
    headline: '#2f271b',
    subtitle: '#4a3824',
    muted: '#6e5f45',
    accent: '#7a4e22',
    wordmark: '#2f271b',
    pill: '#e8d6a8',
  },
} as const;

type ThemeKey = keyof typeof THEME_STYLES;

export default async function Image({
  params,
}: {
  params: { subdomain: string; slug: string };
}) {
  let pageTitle = 'Page not found';
  let hubTitle = 'CreatorCanon';
  let theme: ThemeKey = 'paper';
  let subdomain = params.subdomain;

  try {
    const { hub, manifest } = await loadHubManifest(params.subdomain);
    hubTitle = manifest.title;
    subdomain = manifest.subdomain;
    theme = normalizeHubTemplateId(hub.theme) as ThemeKey;

    const page = manifest.pages.find((p) => p.slug === params.slug);
    if (page) {
      pageTitle = page.title;
    }
  } catch {
    // Fall back to generic card — never throw from an OG image route.
  }

  const colors = THEME_STYLES[theme];

  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          backgroundColor: colors.bg,
          border: `2px solid ${colors.border}`,
          fontFamily: 'system-ui, -apple-system, sans-serif',
          padding: '64px',
          boxSizing: 'border-box',
        }}
      >
        {/* Top wordmark */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              backgroundColor: colors.accent,
            }}
          />
          <span
            style={{
              fontSize: '18px',
              fontWeight: 600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: colors.wordmark,
            }}
          >
            CreatorCanon
          </span>
        </div>

        {/* Main content */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Hub name pill */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '6px 14px',
              backgroundColor: colors.pill,
              border: `1px solid ${colors.border}`,
              borderRadius: '4px',
              width: 'fit-content',
            }}
          >
            <span
              style={{
                fontSize: '14px',
                fontWeight: 500,
                color: colors.subtitle,
                letterSpacing: '0.02em',
              }}
            >
              {hubTitle.length > 40 ? hubTitle.slice(0, 40) + '…' : hubTitle}
            </span>
          </div>

          {/* Page title */}
          <div
            style={{
              fontSize: '60px',
              fontWeight: 700,
              lineHeight: 1.1,
              color: colors.headline,
              maxWidth: '960px',
            }}
          >
            {pageTitle.length > 55 ? pageTitle.slice(0, 55) + '…' : pageTitle}
          </div>
        </div>

        {/* Bottom bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span style={{ fontSize: '16px', color: colors.muted }}>
            creatorcanon.com/h/{subdomain}/{params.slug}
          </span>
          <span
            style={{
              fontSize: '14px',
              fontWeight: 500,
              color: colors.muted,
            }}
          >
            Knowledge Hub
          </span>
        </div>
      </div>
    ),
    { ...size },
  );
}
