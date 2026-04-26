// apps/web/src/components/hub/EditorialAtlas/illustrations/BooksIllustration.tsx
type Props = { className?: string; ariaHidden?: boolean };

export function BooksIllustration({ className, ariaHidden = true }: Props) {
  return (
    <svg
      viewBox="0 0 240 160" className={className} aria-hidden={ariaHidden} role={ariaHidden ? undefined : 'img'}
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    >
      {/* stack of three books */}
      <rect x="40"  y="48"  width="68" height="14" rx="2" />
      <rect x="48"  y="62"  width="60" height="14" rx="2" />
      <rect x="36"  y="76"  width="76" height="14" rx="2" />
      {/* upright book */}
      <path d="M132 90 V40 a4 4 0 0 1 4 -4 h28 a4 4 0 0 1 4 4 v50" />
      <path d="M132 90 H168" />
      {/* mug */}
      <path d="M180 96 v22 a8 8 0 0 0 8 8 h12 a8 8 0 0 0 8 -8 v-22 z" />
      <path d="M208 102 h6 a6 6 0 0 1 6 6 v6 a6 6 0 0 1 -6 6 h-6" />
      {/* steam */}
      <path d="M188 90 q2 -8 -2 -12" />
      <path d="M198 88 q2 -10 -2 -14" />
    </svg>
  );
}
