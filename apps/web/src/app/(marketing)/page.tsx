import type { Metadata } from 'next';

import { CTA } from '@/components/marketing/CTA';
import { DemoProof } from '@/components/marketing/DemoProof';
import { Hero } from '@/components/marketing/Hero';
import { HowItWorks } from '@/components/marketing/HowItWorks';
import { LandingFAQPreview } from '@/components/marketing/LandingFAQPreview';
import { PricingTeaser } from '@/components/marketing/PricingTeaser';
import { ProblemSection } from '@/components/marketing/ProblemSection';
import { TemplateShowcase } from '@/components/marketing/TemplateShowcase';
import { WhoItsFor } from '@/components/marketing/WhoItsFor';

export const metadata: Metadata = {
  title: 'CreatorCanon — turn your videos into a premium business knowledge system',
  description:
    'CreatorCanon helps business creators turn repeat lessons, frameworks, and operating advice into a source-linked hub their audience can pay to use.',
  openGraph: {
    title: 'CreatorCanon — turn your videos into a premium business knowledge system',
    description:
      'Turn your YouTube archive into a structured, source-linked knowledge hub with playbooks, grounded answers, and member paywall.',
    url: 'https://www.creatorcanon.com',
  },
  twitter: {
    title: 'CreatorCanon — turn your videos into a premium business knowledge system',
    description:
      'Turn your YouTube archive into a structured, source-linked knowledge hub with playbooks, grounded answers, and member paywall.',
  },
};

export default function MarketingHomePage() {
  return (
    <>
      {/* 1. Hero — editorial headline + CTA */}
      <Hero />

      {/* 2. Problem / tension */}
      <ProblemSection />

      {/* 3. How it works — 4-step process */}
      <HowItWorks />

      {/* 4. Live demo hubs */}
      <DemoProof />

      {/* 5. Hub template showcase */}
      <TemplateShowcase />

      {/* 6. Who it's for */}
      <WhoItsFor />

      {/* 7. Pricing teaser */}
      <PricingTeaser />

      {/* 8. FAQ preview */}
      <LandingFAQPreview />

      {/* 9. Footer CTA */}
      <CTA />
    </>
  );
}
