// apps/web/src/components/hub/EditorialAtlas/tokens.ts
//
// Visual tokens for the Editorial Atlas template. Inter type throughout;
// the editorial feel comes from layout / canvas / spacing / borders.

export const palette = {
  // Canvas
  paper: '#030507',          // hero / page background
  paperWarm: '#0B0F14',      // sidebar fill
  surface: '#0B0F14',        // card / panel fill
  surfaceMuted: '#111821',   // table-row hover, soft panel

  // Ink
  ink: '#F6F7F8',
  ink2: '#D9DEE5',
  ink3: '#A7ADB5',
  ink4: '#737B86',

  // Rule
  rule: '#2A3038',
  ruleStrong: '#343C47',

  // Accent washes used as 8-12% backgrounds for category icons.
  // Keys mirror Topic.accentColor in the manifest.
  accent: {
    mint:  { fg: '#00E88A', wash: 'rgba(0, 232, 138, 0.12)' },
    peach: { fg: '#FF9A3D', wash: 'rgba(255, 154, 61, 0.14)' },
    lilac: { fg: '#7C6DFF', wash: 'rgba(124, 109, 255, 0.14)' },
    rose:  { fg: '#FF3434', wash: 'rgba(255, 52, 52, 0.12)' },
    blue:  { fg: '#1E6BFF', wash: 'rgba(30, 107, 255, 0.14)' },
    amber: { fg: '#FF9A3D', wash: 'rgba(255, 154, 61, 0.14)' },
    sage:  { fg: '#00E88A', wash: 'rgba(0, 232, 138, 0.12)' },
    slate: { fg: '#A7ADB5', wash: 'rgba(167, 173, 181, 0.12)' },
  },

  // Trust strip background
  trustBar: '#030507',
  trustBarInk: '#F6F7F8',
} as const;

export const fonts = {
  // Inter throughout; no serif. Editorial feel comes from layout, not type.
  display: 'var(--font-inter, Inter, system-ui, sans-serif)',
  body:    'var(--font-inter, Inter, system-ui, sans-serif)',
  numeric: 'var(--font-inter, Inter, system-ui, sans-serif)',  // tabular-nums via CSS feature
} as const;

export const layout = {
  sidebarWidth: 232,           // px
  contentMaxWidth: 1080,       // px
  rightRailWidth: 304,         // px
  pagePaddingX: 32,            // px
  pagePaddingY: 28,            // px
} as const;

export const radii = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
} as const;

export type AccentKey = keyof typeof palette.accent;
