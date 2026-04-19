import * as React from 'react';

interface SparklineProps {
  points: number[];
  color?: string;
  height?: number;
  width?: number;
  fill?: boolean;
  className?: string;
}

export const Sparkline = ({
  points,
  color = 'var(--ink)',
  height = 32,
  width = 120,
  fill = false,
  className,
}: SparklineProps) => {
  if (points.length < 2) return null;

  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = max - min || 1;
  const step = width / (points.length - 1);

  const d = points
    .map((p, i) => {
      const x = i * step;
      const y = height - ((p - min) / range) * (height - 4) - 2;
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
    })
    .join(' ');

  const fillD = `${d} L ${width} ${height} L 0 ${height} Z`;

  return (
    <svg
      width={width}
      height={height}
      className={className}
      style={{ display: 'block' }}
      aria-hidden="true"
    >
      {fill && <path d={fillD} fill={color} opacity="0.08" />}
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
};
