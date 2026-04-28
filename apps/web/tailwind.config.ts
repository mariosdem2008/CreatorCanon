import type { Config } from 'tailwindcss';
import { fontFamily } from 'tailwindcss/defaultTheme';

const config: Config = {
  darkMode: ['class'],
  content: [
    './src/**/*.{ts,tsx,mdx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-geist-sans)', ...fontFamily.sans],
        serif: ['var(--font-newsreader)', ...fontFamily.serif],
        mono: ['var(--font-geist-mono)', ...fontFamily.mono],
        numeric: ['var(--font-jetbrains-mono)', ...fontFamily.mono],
      },
      fontSize: {
        'display-xl': ['72px', { lineHeight: '1.02', letterSpacing: '-0.025em' }],
        'display-lg': ['52px', { lineHeight: '1.05', letterSpacing: '-0.02em' }],
        'display-md': ['36px', { lineHeight: '1.12', letterSpacing: '-0.015em' }],
        'display-sm': ['26px', { lineHeight: '1.2', letterSpacing: '-0.01em' }],
        'heading-lg': ['22px', { lineHeight: '1.25', letterSpacing: '-0.01em' }],
        'heading-md': ['17px', { lineHeight: '1.3', letterSpacing: '-0.005em' }],
        'heading-sm': ['14px', { lineHeight: '1.35' }],
        'body-lg': ['16px', { lineHeight: '1.55' }],
        'body-md': ['14px', { lineHeight: '1.5' }],
        'body-sm': ['13px', { lineHeight: '1.45' }],
        caption: ['12px', { lineHeight: '1.4', letterSpacing: '0.005em' }],
        eyebrow: ['11px', { lineHeight: '1', letterSpacing: '0.14em' }],
        mono: ['12px', { lineHeight: '1', letterSpacing: '-0.01em' }],
      },
      colors: {
        paper: {
          DEFAULT: 'var(--paper)',
          2: 'var(--paper-2)',
          3: 'var(--paper-3)',
          warm: 'var(--paper-warm)',
          studio: 'var(--paper-studio)',
          'studio-2': 'var(--paper-studio-2)',
        },
        ink: {
          DEFAULT: 'var(--ink)',
          2: 'var(--ink-2)',
          3: 'var(--ink-3)',
          4: 'var(--ink-4)',
          5: 'var(--ink-5)',
          studio: 'var(--studio-ink)',
          'studio-2': 'var(--studio-ink-2)',
        },
        rule: {
          DEFAULT: 'var(--rule)',
          strong: 'var(--rule-strong)',
          dark: 'var(--rule-dark)',
        },
        amber: {
          DEFAULT: 'var(--amber)',
          ink: 'var(--amber-ink)',
          wash: 'var(--amber-wash)',
        },
        sage: {
          DEFAULT: 'var(--sage)',
          wash: 'var(--sage-wash)',
        },
        rose: {
          DEFAULT: 'var(--rose)',
          wash: 'var(--rose-wash)',
        },
        // shadcn/ui compatibility aliases — map to atlas tokens
        background: 'var(--paper)',
        foreground: 'var(--ink)',
        muted: {
          DEFAULT: 'var(--paper-2)',
          foreground: 'var(--ink-3)',
        },
        accent: {
          DEFAULT: 'var(--amber-wash)',
          foreground: 'var(--amber-ink)',
        },
        border: 'var(--rule)',
        input: 'var(--rule-strong)',
        ring: 'var(--amber)',
        primary: {
          DEFAULT: 'var(--ink)',
          foreground: 'var(--paper)',
        },
        secondary: {
          DEFAULT: 'var(--paper-2)',
          foreground: 'var(--ink)',
        },
        destructive: {
          DEFAULT: 'var(--rose)',
          foreground: 'white',
        },
      },
      borderRadius: {
        xs: 'var(--r-xs)',
        sm: 'var(--r-sm)',
        DEFAULT: 'var(--r-md)',
        md: 'var(--r-md)',
        lg: 'var(--r-lg)',
        xl: 'var(--r-xl)',
        '2xl': '24px',
        full: '9999px',
      },
      boxShadow: {
        1: 'var(--shadow-1)',
        2: 'var(--shadow-2)',
        pop: 'var(--shadow-pop)',
      },
      keyframes: {
        fadeUp: {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'fade-up': 'fadeUp 260ms ease both',
        shimmer: 'shimmer 1.8s ease-in-out infinite',
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [],
};

export default config;
