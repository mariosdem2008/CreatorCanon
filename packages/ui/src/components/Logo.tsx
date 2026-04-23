import * as React from 'react';

interface LogoProps {
  size?: number;
  withText?: boolean;
  mono?: boolean;
  className?: string;
}

export const Logo = ({ size = 20, withText = true, mono = false, className }: LogoProps) => {
  const color = mono ? 'currentColor' : 'var(--ink)';
  const accent = mono ? 'currentColor' : 'var(--amber)';
  const markSize = withText ? size * 1.35 : size;
  return (
    <div className={className} style={{ display: 'inline-flex', alignItems: 'center', gap: size * 0.42 }}>
      <svg
        width={markSize}
        height={markSize}
        viewBox="0 0 32 32"
        fill="none"
        aria-hidden="true"
        style={{ display: 'block', flexShrink: 0, overflow: 'visible' }}
      >
        <text
          x="0.5"
          y="25.75"
          fill={color}
          fontFamily="var(--font-newsreader, Georgia, serif)"
          fontSize="31"
          fontWeight="500"
          letterSpacing="-0.08em"
        >
          C
        </text>
        <path
          d="M2.7 13.2H14.4M2.7 16H25.4M2.7 18.8H25.4"
          stroke="var(--paper)"
          strokeWidth="1.35"
          strokeLinecap="square"
        />
        <path
          d="M13.4 13.2H25.4M13.4 16H25.4M13.4 18.8H25.4"
          stroke={color}
          strokeWidth="1.15"
          strokeLinecap="square"
        />
        <rect x="24.2" y="22.4" width="5.3" height="5.3" fill={accent} />
      </svg>
      {withText && (
        <span
          style={{
            fontFamily: 'var(--font-newsreader, Georgia, serif)',
            fontSize: size * 1.18,
            fontWeight: 500,
            letterSpacing: '-0.035em',
            lineHeight: 1,
            color,
          }}
        >
          CreatorCanon
        </span>
      )}
    </div>
  );
};
