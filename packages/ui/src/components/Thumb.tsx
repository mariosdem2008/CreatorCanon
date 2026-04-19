import * as React from 'react';

const PALETTES: [string, string][] = [
  ['oklch(0.35 0.08 260)', 'oklch(0.55 0.1 25)'],
  ['oklch(0.3 0.06 180)', 'oklch(0.5 0.09 140)'],
  ['oklch(0.28 0.05 280)', 'oklch(0.48 0.1 320)'],
  ['oklch(0.32 0.08 230)', 'oklch(0.42 0.12 245)'],
  ['oklch(0.25 0.02 60)', 'oklch(0.4 0.08 40)'],
  ['oklch(0.3 0.04 160)', 'oklch(0.5 0.06 100)'],
  ['oklch(0.22 0.02 280)', 'oklch(0.38 0.06 300)'],
  ['oklch(0.3 0.1 350)', 'oklch(0.45 0.14 20)'],
];

interface ThumbProps {
  title?: string;
  palette?: number;
  aspect?: string;
  badge?: string;
  className?: string;
  style?: React.CSSProperties;
}

export const Thumb = ({ title, palette = 0, aspect = '16/9', badge, className, style }: ThumbProps) => {
  const [a, b] = PALETTES[palette % PALETTES.length]!;
  const idx = palette % PALETTES.length;

  return (
    <div
      className={className}
      style={{
        aspectRatio: aspect,
        background: `linear-gradient(135deg, ${a} 0%, ${b} 100%)`,
        borderRadius: 'var(--r-sm)',
        position: 'relative',
        overflow: 'hidden',
        color: 'white',
        ...style,
      }}
    >
      {/* dot overlay */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: 'radial-gradient(oklch(1 0 0 / 0.08) 1px, transparent 1px)',
          backgroundSize: '12px 12px',
        }}
      />
      {/* angular mark */}
      <svg
        viewBox="0 0 100 56"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path
          d={`M0 ${40 + idx % 3 * 4} Q 30 ${20 - idx % 4 * 3}, 60 ${30 + idx % 2 * 5} T 100 ${35 + idx * 2}`}
          stroke="oklch(1 0 0 / 0.15)"
          strokeWidth="0.5"
          fill="none"
        />
        <circle cx={20 + idx * 6} cy={15 + idx % 3 * 4} r="2" fill="oklch(1 0 0 / 0.3)" />
      </svg>
      {title && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            padding: '10px 12px',
            display: 'flex',
            alignItems: 'flex-end',
            fontFamily: 'var(--font-geist-sans, sans-serif)',
            fontWeight: 600,
            fontSize: 13,
            lineHeight: 1.2,
            textShadow: '0 1px 2px oklch(0 0 0 / 0.3)',
          }}
        >
          <span
            style={{
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {title}
          </span>
        </div>
      )}
      {badge && (
        <div
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            padding: '2px 6px',
            background: 'oklch(0 0 0 / 0.6)',
            color: 'white',
            fontSize: 10,
            fontFamily: 'var(--font-geist-mono, monospace)',
            borderRadius: 3,
          }}
        >
          {badge}
        </div>
      )}
    </div>
  );
};
