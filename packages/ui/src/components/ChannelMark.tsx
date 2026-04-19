import * as React from 'react';

const PALETTES: [string, string][] = [
  ['oklch(0.55 0.14 25)', 'oklch(0.4 0.1 15)'],
  ['oklch(0.5 0.12 160)', 'oklch(0.35 0.08 150)'],
  ['oklch(0.58 0.12 260)', 'oklch(0.4 0.09 270)'],
  ['oklch(0.55 0.1 80)', 'oklch(0.4 0.08 70)'],
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
      // eslint-disable-next-line @next/next/no-img-element
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
        color: 'white',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'var(--font-newsreader, Georgia, serif)',
        fontSize: size * 0.42,
        fontWeight: 500,
        letterSpacing: '-0.02em',
        flexShrink: 0,
        userSelect: 'none',
      }}
      aria-label={name}
    >
      {letter}
    </div>
  );
};
