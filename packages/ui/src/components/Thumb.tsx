import * as React from 'react';

const PALETTES: [string, string][] = [
  ['#0B0F14', '#007A50'],
  ['#0B0F14', '#1E6BFF'],
  ['#111821', '#7C6DFF'],
  ['#0B0F14', '#FF9A3D'],
  ['#111821', '#2A3038'],
  ['#030507', '#00E88A'],
  ['#0B0F14', '#34308A'],
  ['#111821', '#FF3434'],
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
