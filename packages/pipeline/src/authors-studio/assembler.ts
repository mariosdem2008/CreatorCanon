import type { ArtifactBundle, PagePlan } from './types';

interface AssemblerInput {
  plan: PagePlan;
  bundle: ArtifactBundle;
  validSegmentIds: Set<string>;
  evidenceSegmentIds?: string[];
  distinctSourceVideos?: number;
  totalSelectedVideos?: number;
  evidenceQuality?: 'strong' | 'moderate' | 'limited' | 'unverified';
}

export interface AssemblerOutput {
  blocks: Array<{
    type: string;
    id: string;
    content: Record<string, unknown>;
    citations?: string[];
  }>;
  atlasMeta: Record<string, unknown>;
}

/**
 * Stitch the artifact bundle into the canonical blockTreeJson shape.
 *
 * Mapping (composer vocabulary → manifest renderer vocabulary):
 *   - prose paragraph #1 → 'overview' block
 *   - prose paragraph #N (N>1) → 'paragraph' block
 *   - roadmap → 'roadmap' block (new in manifest v2)
 *   - hypothetical_example → 'hypothetical_example' block (new)
 *   - diagram → 'diagram' block (new)
 *   - common_mistakes → 'common_mistakes' block (existing in manifest)
 *
 * Citation IDs that don't resolve to validSegmentIds are dropped per-block.
 * The entire block is dropped if its citationIds resolve to zero valid IDs
 * (preventing unsupported claims from rendering).
 */
export function assembleBlockTree(input: AssemblerInput): AssemblerOutput {
  const blocks: AssemblerOutput['blocks'] = [];
  let blockIndex = 0;
  const filterCites = (ids: readonly string[]) => ids.filter((id) => input.validSegmentIds.has(id));

  // Prose paragraphs
  input.bundle.prose.paragraphs.forEach((p, i) => {
    const cites = filterCites(p.citationIds);
    if (cites.length === 0) return; // drop unsupported paragraph
    blocks.push({
      type: i === 0 ? 'overview' : 'paragraph',
      id: `blk_${blockIndex++}`,
      content: { body: p.body, ...(p.heading ? { heading: p.heading } : {}) },
      citations: cites,
    });
  });

  // Hypothetical example (if present)
  if (input.bundle.example) {
    const cites = filterCites(input.bundle.example.citationIds);
    if (cites.length > 0) {
      blocks.push({
        type: 'hypothetical_example',
        id: `blk_${blockIndex++}`,
        content: {
          setup: input.bundle.example.setup,
          stepsTaken: input.bundle.example.stepsTaken,
          outcome: input.bundle.example.outcome,
        },
        citations: cites,
      });
    }
  }

  // Roadmap (if present)
  if (input.bundle.roadmap) {
    const allCites = new Set<string>();
    const filteredSteps = input.bundle.roadmap.steps.map((s) => {
      const stepCites = filterCites(s.citationIds);
      stepCites.forEach((c) => allCites.add(c));
      return { ...s, citationIds: stepCites };
    });
    if (allCites.size > 0) {
      blocks.push({
        type: 'roadmap',
        id: `blk_${blockIndex++}`,
        content: {
          title: input.bundle.roadmap.title,
          steps: filteredSteps,
        },
        citations: [...allCites],
      });
    }
  }

  // Diagram (if present and parsed)
  if (input.bundle.diagram) {
    const cites = filterCites(input.bundle.diagram.citationIds);
    blocks.push({
      type: 'diagram',
      id: `blk_${blockIndex++}`,
      content: {
        diagramType: input.bundle.diagram.diagramType,
        mermaidSrc: input.bundle.diagram.mermaidSrc,
        caption: input.bundle.diagram.caption,
      },
      citations: cites,
    });
  }

  // Common mistakes (if present)
  if (input.bundle.mistakes) {
    const allCites = new Set<string>();
    const filteredItems = input.bundle.mistakes.items
      .map((m) => {
        const cites = filterCites(m.citationIds);
        cites.forEach((c) => allCites.add(c));
        return { ...m, citationIds: cites };
      })
      .filter((m) => m.citationIds.length > 0);
    if (filteredItems.length > 0) {
      blocks.push({
        type: 'common_mistakes',
        id: `blk_${blockIndex++}`,
        content: { items: filteredItems.map((m) => ({ title: m.mistake, body: `${m.why} ${m.correction}` })) },
        citations: [...allCites],
      });
    }
  }

  const atlasMeta = {
    evidenceQuality: input.evidenceQuality ?? 'limited',
    citationCount: input.evidenceSegmentIds?.length ?? 0,
    sourceCoveragePercent:
      input.totalSelectedVideos && input.totalSelectedVideos > 0
        ? Math.min(1, (input.distinctSourceVideos ?? 0) / input.totalSelectedVideos)
        : 0,
    relatedPageIds: [] as string[],
    hero: {
      illustrationKey:
        input.plan.pageType === 'framework' || input.plan.pageType === 'playbook' ? 'desk' : 'open-notebook',
    },
    evidenceSegmentIds: input.evidenceSegmentIds ?? [],
    primaryFindingId: input.plan.arc[0]?.canonNodeIds[0] ?? '',
    supportingFindingIds: input.plan.arc.flatMap((b) => b.canonNodeIds),
    pageTitle: input.plan.pageTitle,
    audienceQuestion: '',
    openingHook: input.plan.thesis,
    distinctSourceVideos: input.distinctSourceVideos ?? 0,
    totalSelectedVideos: input.totalSelectedVideos ?? 0,
    voiceMode: input.plan.voiceMode,
  };

  return { blocks, atlasMeta };
}
