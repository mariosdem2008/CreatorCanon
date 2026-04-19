export const COLOR_TOKENS = {
  paper: 'oklch(0.985 0.005 85)',
  paper2: 'oklch(0.965 0.006 85)',
  paper3: 'oklch(0.945 0.007 85)',
  paperWarm: 'oklch(0.975 0.01 75)',
  paperStudio: 'oklch(0.93 0.009 85)',
  ink: 'oklch(0.18 0.012 260)',
  ink2: 'oklch(0.32 0.01 260)',
  ink3: 'oklch(0.48 0.008 260)',
  ink4: 'oklch(0.64 0.006 260)',
  ink5: 'oklch(0.78 0.005 260)',
  rule: 'oklch(0.91 0.006 85)',
  ruleStrong: 'oklch(0.85 0.008 85)',
  ruleDark: 'oklch(0.8 0.01 85)',
  amber: 'oklch(0.62 0.12 55)',
  amberInk: 'oklch(0.35 0.09 55)',
  amberWash: 'oklch(0.96 0.025 75)',
  sage: 'oklch(0.52 0.05 160)',
  sageWash: 'oklch(0.96 0.015 160)',
  rose: 'oklch(0.58 0.12 25)',
  roseWash: 'oklch(0.965 0.02 25)',
} as const;

export const FONT_TOKENS = {
  sans: 'var(--font-geist-sans)',
  serif: 'var(--font-newsreader)',
  mono: 'var(--font-geist-mono)',
  numeric: 'var(--font-jetbrains-mono)',
} as const;

export const RADIUS_TOKENS = {
  xs: '4px',
  sm: '6px',
  md: '8px',
  lg: '12px',
  xl: '16px',
} as const;
