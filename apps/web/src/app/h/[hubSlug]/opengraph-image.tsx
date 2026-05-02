import { ImageResponse } from 'next/og';

import { loadCreatorManualManifest } from './manifest';
import { normalizeHubTemplateId } from '@/components/hub/templates';

// Node runtime: loadHubManifest imports @creatorcanon/adapters whose barrel
// exports googleapis / google-auth-library — these require node:net/http/https
// which are unavailable in Vercel's edge runtime. Tradeoff: modestly slower
// cold-start on OG image fetches, which is acceptable for social-preview
// traffic.
export const runtime = 'nodejs';
export const alt = 'CreatorCanon hub';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// Theme palette for OG cards — raw values only, no Tailwind classes.
const THEME_STYLES = {
  paper: {
    bg: '#f7f3ed',
    border: '#d6cfc4',
    headline: '#1a1612',
    muted: '#6b5f50',
    accent: '#b8892a',
    wordmark: '#1a1612',
  },
  midnight: {
    bg: '#070b10',
    border: '#263240',
    headline: '#eef5ef',
    muted: '#7e9188',
    accent: '#c8ef60',
    wordmark: '#c8ef60',
  },
  field: {
    bg: '#f2e8cf',
    border: '#c9b990',
    headline: '#2f271b',
    muted: '#6e5f45',
    accent: '#7a4e22',
    wordmark: '#2f271b',
  },
} as const;

type ThemeKey = keyof typeof THEME_STYLES;

export default async function Image({
  params,
}: {
  params: { hubSlug: string };
}) {
  let title = 'CreatorCanon';
  let description = 'Knowledge hubs for creators';
  let theme: ThemeKey = 'paper';

  try {
    const { hub, manifest } = await loadCreatorManualManifest(params.hubSlug);
    title = manifest.title;
    description = manifest.home.summary || manifest.tagline;
    theme = normalizeHubTemplateId(hub.theme) as ThemeKey;
  } catch {
    // Fall back to generic card — never throw from an OG image route.
  }

  const colors = THEME_STYLES[theme];
  const isLight = theme !== 'midnight';

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
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}
        >
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div
            style={{
              fontSize: '64px',
              fontWeight: 700,
              lineHeight: 1.1,
              color: colors.headline,
              maxWidth: '900px',
              overflow: 'hidden',
            }}
          >
            {title.length > 50 ? title.slice(0, 50) + '…' : title}
          </div>
          <div
            style={{
              fontSize: '24px',
              lineHeight: 1.4,
              color: colors.muted,
              maxWidth: '820px',
            }}
          >
            {description.length > 120
              ? description.slice(0, 120) + '…'
              : description}
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
            creatorcanon.com/h/{params.hubSlug}
          </span>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 20px',
              border: `1px solid ${colors.border}`,
              borderRadius: '6px',
            }}
          >
            <span
              style={{
                fontSize: '14px',
                fontWeight: 600,
                color: isLight ? colors.headline : colors.accent,
              }}
            >
              Knowledge Hub
            </span>
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
