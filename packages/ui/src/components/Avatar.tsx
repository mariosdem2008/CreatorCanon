import * as React from 'react';

const PALETTES = [
  'oklch(0.6 0.1 260)',
  'oklch(0.55 0.09 25)',
  'oklch(0.5 0.08 160)',
  'oklch(0.58 0.1 320)',
  'oklch(0.52 0.07 80)',
];

interface AvatarProps {
  name?: string;
  size?: number;
  palette?: number;
  src?: string;
  className?: string;
}

export const Avatar = ({ name = 'A', size = 28, palette = 0, src, className }: AvatarProps) => {
  const initials = name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const bg = PALETTES[palette % PALETTES.length]!;

  if (src) {
    return (
      <img
        src={src}
        alt={name}
        width={size}
        height={size}
        className={className}
        style={{
          borderRadius: '50%',
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
        borderRadius: '50%',
        background: bg,
        color: 'white',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.38,
        fontWeight: 600,
        letterSpacing: '-0.01em',
        flexShrink: 0,
        userSelect: 'none',
      }}
      aria-label={name}
    >
      {initials}
    </div>
  );
};
