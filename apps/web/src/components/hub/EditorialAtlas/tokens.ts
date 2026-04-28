// apps/web/src/components/hub/EditorialAtlas/tokens.ts
//
// Visual tokens for the Editorial Atlas template. Inter type throughout;
// the editorial feel comes from layout / canvas / spacing / borders.

export const palette = {
  // Canvas
  paper: '#F8F4EC',          // hero / page background
  paperWarm: '#F2EBDA',      // sidebar fill
  surface: '#FFFFFF',         // card / panel fill
  surfaceMuted: '#FAF6EE',    // table-row hover, soft panel

  // Ink
  ink: '#1A1612',
  ink2: '#3D352A',
  ink3: '#6B5F50',
  ink4: '#9A8E7C',

  // Rule
  rule: '#E5DECF',
  ruleStrong: '#D6CFC0',

  // Accent washes — used as 8–12% backgrounds for category icons.
  // Keys mirror Topic.accentColor in the manifest.
  accent: {
    mint:  { fg: '#2F7A5C', wash: '#E2F1E9' },
    peach: { fg: '#9C5A2E', wash: '#F4E5D8' },
    lilac: { fg: '#6F4FA0', wash: '#ECE4F4' },
    rose:  { fg: '#A34A60', wash: '#F4E1E6' },
    blue:  { fg: '#3A6E92', wash: '#E2EDF4' },
    amber: { fg: '#A07424', wash: '#F4EAD2' },
    sage:  { fg: '#5C7C56', wash: '#E6EEDF' },
    slate: { fg: '#4F5B6B', wash: '#E5E9EE' },
  },

  // Trust strip background
  trustBar: '#1A1612',
  trustBarInk: '#F2EBDA',
} as const;

export const fonts = {
  // Inter throughout — no serif. Editorial feel comes from layout, not type.
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
