import * as React from 'react';

const PALETTES: [string, string][] = [
  ['#00E88A', '#007A50'],
  ['#1E6BFF', '#0B3E9F'],
  ['#7C6DFF', '#34308A'],
  ['#FF9A3D', '#7A3D11'],
];

interface ChannelMarkProps {
  name?: string;
  size?: number;
  palette?: number;
  src?: string;
  className?: string;
}

export const ChannelMark = ({ name, size = 32, palette = 0, src, className }: ChannelMarkProps) => {
  const [a, b] = PALETTES[palette % PALETTES.length]!;
  const borderRadius = size * 0.22;
  const letter = name?.[0]?.toUpperCase() ?? 'A';

  if (src) {
    return (
      <img
        src={src}
        alt={name ?? 'Channel'}
        width={size}
        height={size}
        className={className}
        style={{
          borderRadius,
          objectFit: 'cover',
          flexShrink: 0,
          display: 'block',
        }}
      />
    );
  }

  return (
    <div
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius,
        background: `linear-gradient(135deg, ${a}, ${b})`,
        color: '#F6F7F8',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'var(--font-geist-sans, Inter, system-ui, sans-serif)',
        fontSize: size * 0.42,
        fontWeight: 650,
        letterSpacing: 0,
        flexShrink: 0,
        userSelect: 'none',
      }}
      aria-label={name}
    >
      {letter}
    </div>
  );
};
