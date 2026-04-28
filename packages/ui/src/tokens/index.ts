export const COLOR_TOKENS = {
  paper: '#030507',
  paper2: '#0B0F14',
  paper3: '#111821',
  paperWarm: '#0B0F14',
  paperStudio: '#030507',
  ink: '#F6F7F8',
  ink2: '#D9DEE5',
  ink3: '#A7ADB5',
  ink4: '#737B86',
  ink5: '#46505C',
  rule: '#2A3038',
  ruleStrong: '#343C47',
  ruleDark: '#1A2028',
  amber: '#00E88A',
  amberInk: '#00E88A',
  amberWash: 'rgba(0, 232, 138, 0.12)',
  sage: '#00E88A',
  sageWash: 'rgba(0, 232, 138, 0.12)',
  rose: '#FF3434',
  roseWash: 'rgba(255, 52, 52, 0.12)',
  blue: '#1E6BFF',
  blueWash: 'rgba(30, 107, 255, 0.14)',
  orange: '#FF9A3D',
  orangeWash: 'rgba(255, 154, 61, 0.14)',
  violet: '#7C6DFF',
  violetWash: 'rgba(124, 109, 255, 0.14)',
} as const;

export const FONT_TOKENS = {
  sans: 'var(--font-geist-sans)',
  serif: 'var(--font-geist-sans)',
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
