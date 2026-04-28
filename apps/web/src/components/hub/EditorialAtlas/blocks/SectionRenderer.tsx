// apps/web/src/components/hub/EditorialAtlas/blocks/SectionRenderer.tsx
import type { PageSection, Citation, SourceVideo } from '@/lib/hub/manifest/schema';

import { OverviewSection } from './sections/OverviewSection';
import { WhyItWorksSection } from './sections/WhyItWorksSection';
import { StepsSection } from './sections/StepsSection';
import { CommonMistakesSection } from './sections/CommonMistakesSection';
import { AhaMomentsSection } from './sections/AhaMomentsSection';
import { PrinciplesSection } from './sections/PrinciplesSection';
import { ScenesSection } from './sections/ScenesSection';
import { WorkflowSection } from './sections/WorkflowSection';
import { FailurePointsSection } from './sections/FailurePointsSection';
import { CalloutSection } from './sections/CalloutSection';
import { ParagraphSection } from './sections/ParagraphSection';
import { ListSection } from './sections/ListSection';
import { QuoteSection } from './sections/QuoteSection';
import { RoadmapBlock } from '@/components/hub/sections/RoadmapBlock';
import { DiagramBlock } from '@/components/hub/sections/DiagramBlock';
import { HypotheticalExampleBlock } from '@/components/hub/sections/HypotheticalExampleBlock';

type Props = {
  section: PageSection;
  citationsById?: Record<string, Citation>;
  /** Required for QuoteSection's "Watch at hh:mm" link. Optional elsewhere. */
  sourcesById?: Record<string, SourceVideo>;
};

export function SectionRenderer({ section, citationsById, sourcesById }: Props) {
  switch (section.kind) {
    case 'overview':        return <OverviewSection        section={section} citationsById={citationsById} />;
    case 'why_it_works':    return <WhyItWorksSection      section={section} citationsById={citationsById} />;
    case 'steps':           return <StepsSection           section={section} citationsById={citationsById} />;
    case 'common_mistakes': return <CommonMistakesSection  section={section} citationsById={citationsById} />;
    case 'aha_moments':     return <AhaMomentsSection      section={section} citationsById={citationsById} />;
    case 'principles':      return <PrinciplesSection      section={section} citationsById={citationsById} />;
    case 'scenes':          return <ScenesSection          section={section} citationsById={citationsById} />;
    case 'workflow':        return <WorkflowSection        section={section} citationsById={citationsById} />;
    case 'failure_points':  return <FailurePointsSection   section={section} citationsById={citationsById} />;
    case 'callout':         return <CalloutSection         section={section} citationsById={citationsById} />;
    case 'paragraph':       return <ParagraphSection       section={section} citationsById={citationsById} />;
    case 'list':            return <ListSection            section={section} citationsById={citationsById} />;
    case 'quote':           return <QuoteSection           section={section} citationsById={citationsById} sourcesById={sourcesById} />;
    case 'roadmap':         return <RoadmapBlock           title={section.title} steps={section.steps} />;
    case 'diagram':         return <DiagramBlock           diagramType={section.diagramType} mermaidSrc={section.mermaidSrc} caption={section.caption} />;
    case 'hypothetical_example': return <HypotheticalExampleBlock setup={section.setup} stepsTaken={section.stepsTaken} outcome={section.outcome} />;
    default: {
      const _exhaustive: never = section;
      void _exhaustive;
      return null;
    }
  }
}
