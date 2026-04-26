// apps/web/src/app/h/[hubSlug]/methodology/page.tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { HubShell } from '@/components/hub/EditorialAtlas/shell';
import { LineIllustration } from '@/components/hub/EditorialAtlas/illustrations';
import { mockManifest } from '@/lib/hub/manifest/mockManifest';
import { getMethodologyRoute } from '@/lib/hub/routes';

export const revalidate = 60;

export async function generateMetadata({ params }: { params: { hubSlug: string } }): Promise<Metadata> {
  if (params.hubSlug !== mockManifest.hubSlug) return { title: 'Hub not found' };
  return { title: `Methodology — ${mockManifest.title}`, alternates: { canonical: getMethodologyRoute(params.hubSlug) } };
}

export default function MethodologyPage({ params }: { params: { hubSlug: string } }) {
  if (params.hubSlug !== mockManifest.hubSlug) notFound();
  const m = mockManifest;
  return (
    <HubShell manifest={m} activePathname={getMethodologyRoute(params.hubSlug)}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9A8E7C]">Methodology</p>
      <div className="mt-3 flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-[640px]">
          <h1 className="text-[36px] font-semibold tracking-[-0.02em]">Methodology &amp; trust</h1>
          <p className="mt-3 text-[14px] leading-[1.6] text-[#3D352A]">{m.trust.methodologySummary}</p>
        </div>
        <div className="text-[#3D352A]"><LineIllustration illustrationKey="books" className="h-[140px] w-[200px]" /></div>
      </div>

      <section className="mt-12">
        <h2 className="text-[14px] font-semibold uppercase tracking-[0.12em] text-[#9A8E7C]">Quality principles</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          {m.trust.qualityPrinciples.map((p) => (
            <div key={p.title} className="rounded-[12px] border border-[#E5DECF] bg-white p-4">
              <h3 className="text-[14px] font-semibold tracking-[-0.01em] text-[#1A1612]">{p.title}</h3>
              <p className="mt-2 text-[12px] leading-[1.55] text-[#6B5F50]">{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-12">
        <h2 className="text-[14px] font-semibold uppercase tracking-[0.12em] text-[#9A8E7C]">Our knowledge creation process</h2>
        <ol className="mt-4 grid gap-3 md:grid-cols-5">
          {m.trust.creationProcess.map((step) => (
            <li key={step.stepNumber} className="rounded-[12px] border border-[#E5DECF] bg-white p-4">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9A8E7C]">Step {step.stepNumber}</span>
              <h3 className="mt-2 text-[13px] font-semibold tracking-[-0.01em] text-[#1A1612]">{step.title}</h3>
              <p className="mt-1 text-[12px] leading-[1.55] text-[#6B5F50]">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-12">
        <h2 className="text-[14px] font-semibold uppercase tracking-[0.12em] text-[#9A8E7C]">Frequently asked questions</h2>
        <ul className="mt-4 divide-y divide-[#E5DECF] rounded-[12px] border border-[#E5DECF] bg-white">
          {m.trust.faq.map((q) => (
            <li key={q.question} className="px-5 py-4">
              <h3 className="text-[14px] font-semibold tracking-[-0.01em] text-[#1A1612]">{q.question}</h3>
              <p className="mt-2 text-[13px] leading-[1.55] text-[#3D352A]">{q.answer}</p>
            </li>
          ))}
        </ul>
      </section>
    </HubShell>
  );
}
