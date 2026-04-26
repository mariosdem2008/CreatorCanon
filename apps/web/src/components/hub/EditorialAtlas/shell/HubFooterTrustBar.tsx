// apps/web/src/components/hub/EditorialAtlas/shell/HubFooterTrustBar.tsx
import type { EditorialAtlasManifest } from '@/lib/hub/manifest/schema';

type Props = {
  qualityPrinciples: EditorialAtlasManifest['trust']['qualityPrinciples'];
};

/**
 * The dark trust strip that sits at the bottom of every hub surface.
 * Three columns of principle title + body, rendered against a warm-dark fill.
 */
export function HubFooterTrustBar({ qualityPrinciples }: Props) {
  // Show the first 3 principles in this strip; the Methodology page renders all of them.
  const principles = qualityPrinciples.slice(0, 3);

  return (
    <footer className="mt-16 bg-[#1A1612] text-[#F2EBDA]">
      <div className="mx-auto max-w-[1080px] px-8 py-10">
        <div className="grid gap-8 md:grid-cols-3">
          {principles.map((p) => (
            <div key={p.title}>
              <h3 className="text-[14px] font-semibold tracking-[-0.01em]">{p.title}</h3>
              <p className="mt-2 text-[13px] leading-[1.55] text-[#D6CFC0]">{p.body}</p>
            </div>
          ))}
        </div>
        <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-6 text-[12px] text-[#9A8E7C]">
          <span>About CreatorCanon — source-grounded knowledge hubs from creator archives.</span>
          <a href="https://creatorcanon.com" className="underline-offset-2 hover:underline" target="_blank" rel="noreferrer">creatorcanon.com</a>
        </div>
      </div>
    </footer>
  );
}
