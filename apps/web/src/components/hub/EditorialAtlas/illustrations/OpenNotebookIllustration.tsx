// apps/web/src/components/hub/EditorialAtlas/illustrations/OpenNotebookIllustration.tsx
type Props = { className?: string; ariaHidden?: boolean };

export function OpenNotebookIllustration({ className, ariaHidden = true }: Props) {
  return (
    <svg
      viewBox="0 0 240 160" className={className} aria-hidden={ariaHidden} role={ariaHidden ? undefined : 'img'}
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    >
      {/* open book */}
      <path d="M30 50 l90 -10 v90 l-90 10 z" />
      <path d="M210 50 l-90 -10 v90 l90 10 z" />
      <line x1="120" y1="40"  x2="120" y2="130" />
      {/* lines on left page */}
      <line x1="44" y1="64" x2="100" y2="60" />
      <line x1="44" y1="78" x2="104" y2="74" />
      <line x1="44" y1="92" x2="92"  y2="88" />
      {/* lines on right page */}
      <line x1="140" y1="60"  x2="196" y2="64" />
      <line x1="140" y1="74"  x2="200" y2="78" />
      <line x1="140" y1="88"  x2="184" y2="92" />
    </svg>
  );
}
