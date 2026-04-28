import * as React from 'react';

const PALETTES = ['#00E88A', '#1E6BFF', '#007A50', '#7C6DFF', '#FF9A3D'];

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
  const ink = bg === '#00E88A' || bg === '#FF9A3D' ? '#030507' : '#F6F7F8';

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
        color: ink,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.38,
        fontWeight: 600,
        letterSpacing: 0,
        flexShrink: 0,
        userSelect: 'none',
      }}
      aria-label={name}
    >
      {initials}
    </div>
  );
};
