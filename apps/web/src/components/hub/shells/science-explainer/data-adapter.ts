/**
 * Data adapter — converts a ProductBundle (from packages/synthesis) into
 * the prop shapes consumed by the science-explainer shell pages.
 *
 * Mirrors the operator-coach adapter pattern. Keeping this transform here
 * means each page stays a thin presentational component, easy to unit-test
 * with hand-built fixtures.
 */

import type {
  DebunkingComponent,
  DebunkingItem,
  DiagnosticComponent,
  EvidenceCard,
  FunnelComponent,
  GlossaryComponent,
  GlossaryEntry,
  ProductBundle,
  ReferenceComponent,
} from '@creatorcanon/synthesis';

export interface ScienceExplainerShellProps {
  archetype: 'science-explainer';
  voiceMode: ProductBundle['voiceMode'];
  productGoal: ProductBundle['productGoal'];
  brand: { primaryColor: string; logoUrl?: string; logoAlt?: string };
  primaryCta: { label: string; href: string } | null;
  pages: {
    home: HomePageProps;
    claim: ClaimPageProps;
    study: StudyPageProps;
    debunking: DebunkingPageProps;
    glossary: GlossaryPageProps;
    topic: TopicPageProps;
  };
}

export interface HomePageProps {
  heroHeadline: string;
  heroSubcopy: string;
  cards: EvidenceCard[];
  topicIndex: Record<string, string[]>;
  primaryCta: { label: string; href: string } | null;
  funnel: FunnelComponent;
  diagnostic: DiagnosticComponent | null;
}

export interface ClaimPageProps {
  cards: EvidenceCard[];
  cardById: Record<string, EvidenceCard>;
}

export interface StudyPageProps {
  /** Per-card list of canon ids (for now used as study slugs). */
  cards: EvidenceCard[];
}

export interface DebunkingPageProps {
  items: DebunkingItem[];
  itemById: Record<string, DebunkingItem>;
}

export interface GlossaryPageProps {
  entries: GlossaryEntry[];
  entryById: Record<string, GlossaryEntry>;
}

export interface TopicPageProps {
  topicIndex: Record<string, string[]>;
  cardById: Record<string, EvidenceCard>;
}

function buildHeroHeadline(reference: ReferenceComponent | undefined): string {
  if (!reference || reference.cards.length === 0) return 'Search the science';
  return 'Ask a question. Get the evidence.';
}

function buildHeroSubcopy(reference: ReferenceComponent | undefined): string {
  if (!reference) {
    return 'Verified, evidence-backed answers — no anecdote, no hype.';
  }
  const n = reference.cards.length;
  return `Search ${n} evidence card${n === 1 ? '' : 's'} grounded in published studies.`;
}

function indexBy<T extends { id: string }>(items: T[]): Record<string, T> {
  const out: Record<string, T> = {};
  for (const item of items) out[item.id] = item;
  return out;
}

export function adaptBundleForScienceExplainer(
  bundle: ProductBundle,
): ScienceExplainerShellProps {
  if (bundle.archetype !== 'science-explainer') {
    throw new Error(
      `data-adapter: expected science-explainer archetype, got ${bundle.archetype}`,
    );
  }

  const reference: ReferenceComponent | undefined = bundle.components.reference;
  const debunking: DebunkingComponent | undefined = bundle.components.debunking;
  const glossary: GlossaryComponent | undefined = bundle.components.glossary;

  const cards = reference?.cards ?? [];
  const topicIndex = reference?.topicIndex ?? {};
  const debunkingItems = debunking?.items ?? [];
  const glossaryEntries = glossary?.entries ?? [];

  const primaryCta = bundle.creatorConfig.ctas?.primary
    ? {
        label: bundle.creatorConfig.ctas.primary.label,
        href: bundle.creatorConfig.ctas.primary.href,
      }
    : null;

  return {
    archetype: 'science-explainer',
    voiceMode: bundle.voiceMode,
    productGoal: bundle.productGoal,
    brand: bundle.creatorConfig.brand,
    primaryCta,
    pages: {
      home: {
        heroHeadline: buildHeroHeadline(reference),
        heroSubcopy: buildHeroSubcopy(reference),
        cards,
        topicIndex,
        primaryCta,
        funnel: bundle.components.funnel,
        diagnostic: bundle.components.diagnostic ?? null,
      },
      claim: {
        cards,
        cardById: indexBy(cards),
      },
      study: { cards },
      debunking: {
        items: debunkingItems,
        itemById: indexBy(debunkingItems),
      },
      glossary: {
        entries: glossaryEntries,
        entryById: indexBy(glossaryEntries),
      },
      topic: {
        topicIndex,
        cardById: indexBy(cards),
      },
    },
  };
}
