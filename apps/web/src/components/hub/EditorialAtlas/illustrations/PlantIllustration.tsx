// apps/web/src/components/hub/EditorialAtlas/illustrations/PlantIllustration.tsx
type Props = { className?: string; ariaHidden?: boolean };

export function PlantIllustration({ className, ariaHidden = true }: Props) {
  return (
    <svg
      viewBox="0 0 240 160" className={className} aria-hidden={ariaHidden} role={ariaHidden ? undefined : 'img'}
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    >
      {/* pot */}
      <path d="M88 130 l4 -28 h56 l4 28 z" />
      {/* leaves */}
      <path d="M120 102 q-30 -16 -28 -52 q24 6 28 52 z" />
      <path d="M120 102 q30 -16 28 -52 q-24 6 -28 52 z" />
      <path d="M120 102 v-44" />
    </svg>
  );
}
