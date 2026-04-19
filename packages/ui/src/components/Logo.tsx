import * as React from 'react';

interface LogoProps {
  size?: number;
  withText?: boolean;
  mono?: boolean;
  className?: string;
}

export const Logo = ({ size = 20, withText = true, mono = false, className }: LogoProps) => {
  const color = mono ? 'currentColor' : 'var(--ink)';
  return (
    <div className={className} style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}>
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="10" stroke={color} strokeWidth="1.5" />
        <path d="M4 12 Q 12 4, 20 12 Q 12 20, 4 12 Z" stroke={color} strokeWidth="1.5" fill="none" />
        <circle cx="12" cy="12" r="2" fill="var(--amber)" />
      </svg>
      {withText && (
        <span
          style={{
            fontFamily: 'var(--font-newsreader, Georgia, serif)',
            fontSize: size * 0.9,
            fontWeight: 400,
            letterSpacing: '-0.01em',
            color,
          }}
        >
          Channel <em>Atlas</em>
        </span>
      )}
    </div>
  );
};
