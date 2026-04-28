import * as React from 'react';

interface LogoProps {
  size?: number;
  withText?: boolean;
  mono?: boolean;
  className?: string;
  textColor?: string;
  markColor?: string;
  markDepthColor?: string;
  markHighlightColor?: string;
}

export const Logo = ({
  size = 20,
  withText = true,
  mono = false,
  className,
  textColor,
  markColor,
  markDepthColor,
  markHighlightColor,
}: LogoProps) => {
  const color = mono ? 'currentColor' : textColor ?? 'var(--ink)';
  const accent = mono ? 'currentColor' : markColor ?? 'var(--amber)';
  const accentDeep = mono ? 'currentColor' : markDepthColor ?? 'var(--amber-ink)';
  const accentLight = mono ? 'currentColor' : markHighlightColor ?? 'var(--amber-wash)';
  const markSize = withText ? size * 1.35 : size;
  return (
    <div className={className} style={{ display: 'inline-flex', alignItems: 'center', gap: size * 0.42 }}>
      <svg
        width={markSize}
        height={markSize}
        viewBox="0 0 40 40"
        fill="none"
        aria-hidden="true"
        style={{ display: 'block', flexShrink: 0, overflow: 'visible' }}
      >
        <path d="M8 9.5L14.5 4H35L28.5 9.5H8Z" fill={accentLight} opacity={mono ? 1 : 0.9} />
        <path d="M8 9.5H28.5V16.5H15.5V23.5H28.5V30.5H8V9.5Z" fill={accent} />
        <path d="M28.5 9.5L35 4V11L28.5 16.5V9.5Z" fill={accentDeep} />
        <path d="M28.5 23.5L35 18V25L28.5 30.5V23.5Z" fill={accentDeep} />
        <path d="M15.5 16.5L22 11H35L28.5 16.5H15.5Z" fill={accentDeep} opacity={mono ? 0.4 : 0.72} />
        <path d="M15.5 23.5H28.5L35 18H22L15.5 23.5Z" fill={accentLight} opacity={mono ? 0.4 : 0.64} />
        <path d="M8 30.5L14.5 36H35L28.5 30.5H8Z" fill={accentDeep} />
      </svg>
      {withText && (
        <span
          style={{
            fontFamily: 'var(--font-geist-sans, Inter, system-ui, sans-serif)',
            fontSize: size * 1.08,
            fontWeight: 650,
            letterSpacing: 0,
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
