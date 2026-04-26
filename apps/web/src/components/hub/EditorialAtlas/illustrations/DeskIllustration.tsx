// apps/web/src/components/hub/EditorialAtlas/illustrations/DeskIllustration.tsx
type Props = { className?: string; ariaHidden?: boolean };

export function DeskIllustration({ className, ariaHidden = true }: Props) {
  return (
    <svg
      viewBox="0 0 240 160" className={className} aria-hidden={ariaHidden} role={ariaHidden ? undefined : 'img'}
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    >
      {/* desk surface */}
      <line x1="20" y1="120" x2="220" y2="120" />
      {/* notebook */}
      <rect x="38"  y="84"  width="80" height="36" rx="3" />
      <line x1="78" y1="84" x2="78" y2="120" />
      {/* pen */}
      <line x1="124" y1="118" x2="160" y2="92" />
      <path d="M158 90 l6 -2 -2 6 z" />
      {/* lamp */}
      <path d="M186 120 V92 q0 -10 10 -10 h12" />
      <path d="M204 78 l16 -8 v18 z" />
      {/* mug */}
      <path d="M134 96 v18 a6 6 0 0 0 6 6 h10 a6 6 0 0 0 6 -6 v-18 z" />
    </svg>
  );
}
