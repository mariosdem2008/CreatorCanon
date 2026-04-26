import type { ArchiveFinding, ArchiveRelation } from '@creatorcanon/db/schema';
import type { AgentProvider } from '../agents/providers';
import { tokenCostCents } from '../agents/cost-tracking';
import { COMPOSITION_RULES, findingTypeToPageType } from './page-composer.composition-rules';

function nano(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 10);
}

export interface ComposePageInput {
  primary: ArchiveFinding;
  related: ArchiveFinding[];
  relations: ArchiveRelation[];
  /** When non-null, the composer may issue one polish call. Pass null in tests for determinism. */
  polishProvider: AgentProvider | null;
  polishModel?: string;
}

export interface ComposedPage {
  id: string;
  type: 'lesson' | 'framework' | 'playbook';
  slug: string;
  title: string;
  summary: string;
  sections: Array<Record<string, unknown> & { kind: string; citations: string[] }>;
  primaryFindingId: string;
  supportingFindingIds: string[];
  evidenceSegmentIds: string[];
  hero: { illustrationKey: string };
}

const ILLUSTRATIONS = ['open-notebook', 'desk', 'books', 'window'] as const;

function pickIllustration(type: 'lesson'|'framework'|'playbook', findingId: string, hasWorkflow: boolean): typeof ILLUSTRATIONS[number] {
  if (type === 'lesson') return 'open-notebook';
  if (type === 'framework') return 'desk';
  if (type === 'playbook' && hasWorkflow) return 'desk';
  const h = findingId.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return ILLUSTRATIONS[h % ILLUSTRATIONS.length]!;
}

function summaryQualityScore(summary: string): number {
  const words = summary.trim().split(/\s+/).length;
  const hasFullSentence = /[.!?]$/.test(summary.trim());
  return words / 25 + 0.5 * (hasFullSentence ? 1 : 0);
}

function slugify(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

export async function composePage(input: ComposePageInput): Promise<ComposedPage> {
  const pageType = findingTypeToPageType(input.primary.type);
  if (!pageType) throw new Error(`Cannot compose page from finding type '${input.primary.type}'`);

  const rule = COMPOSITION_RULES[pageType];
  const ctx = { primary: input.primary, related: input.related, relations: input.relations };
  const rawSections = rule.sections.map((fn) => fn(ctx)).filter((s): s is Record<string, unknown> => s !== null);

  // Populate `citations` per section so the evidence_aggregator can compute coverage.
  // Rule: every section gets the primary finding's evidenceSegmentIds. Quote sections
  // additionally get the linked quote/aha finding's evidence (the embedded quote).
  const sections = rawSections.map((sec) => {
    const baseCitations = [...input.primary.evidenceSegmentIds];
    if ((sec as any).kind === 'quote') {
      const linkedQuote = input.related.find((r) => r.type === 'quote' || r.type === 'aha_moment');
      if (linkedQuote) for (const id of linkedQuote.evidenceSegmentIds) baseCitations.push(id);
    }
    return { ...sec, citations: [...new Set(baseCitations)] } as ComposedPage['sections'][number];
  });

  let summary = (input.primary.payload as any).summary as string;
  const score = summaryQualityScore(summary);
  if (input.polishProvider && (score < 0.8 || summary.length < 100 || summary.length > 600)) {
    try {
      const polished = await polishSummary(input.polishProvider, input.polishModel ?? 'gpt-5.5', summary, input.primary);
      if (polished) summary = polished;
    } catch { /* polish best-effort */ }
  }

  const evidenceIds = new Set<string>(input.primary.evidenceSegmentIds);
  for (const r of input.related) for (const id of r.evidenceSegmentIds) evidenceIds.add(id);
  const hasWorkflow = pageType === 'playbook' && Array.isArray((input.primary.payload as any).workflow) && (input.primary.payload as any).workflow.length > 0;

  return {
    id: `pg_${nano()}`,
    type: pageType,
    slug: slugify((input.primary.payload as any).title),
    title: (input.primary.payload as any).title,
    summary,
    sections,
    primaryFindingId: input.primary.id,
    supportingFindingIds: input.related.map((r) => r.id),
    evidenceSegmentIds: [...evidenceIds],
    hero: { illustrationKey: pickIllustration(pageType, input.primary.id, hasWorkflow) },
  };
}

async function polishSummary(provider: AgentProvider, modelId: string, draft: string, finding: ArchiveFinding): Promise<string | null> {
  const response = await provider.chat({
    modelId,
    messages: [
      { role: 'system', content: 'You polish a draft summary into a clean 2-3 sentence summary. Preserve facts. Output the polished summary only — no preamble.' },
      { role: 'user', content: `Title: ${(finding.payload as any).title}\n\nDraft summary:\n${draft}\n\nFull body:\n${JSON.stringify(finding.payload).slice(0, 2000)}` },
    ],
    tools: [],
  });
  const cost = tokenCostCents(modelId, response.usage.inputTokens, response.usage.outputTokens);
  if (cost > 30) return null; // hard cap from spec § 10.1: $0.30 per page polish
  return response.message.content.trim() || null;
}
