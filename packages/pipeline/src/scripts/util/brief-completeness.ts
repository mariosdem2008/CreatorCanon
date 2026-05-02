import { extractJsonFromCodexOutput } from '../../agents/providers/codex-extract-json';
import { runCodex } from './codex-runner';
import type { PageBriefShell } from './brief-body-writer';

export type BriefCompletenessGap = 'tier' | 'primaryKeyword' | 'cta.primary';

export interface CanonShellForCompleteness {
  id: string;
  title: string;
  type: string;
  internal_summary: string;
}

export interface BriefCompletenessPatch {
  tier?: 'pillar' | 'spoke';
  parentTopic?: string | null;
  primaryKeyword?: string;
  ctaPrimary?: string;
}

export type BriefCompletenessPopulator = (input: {
  brief: PageBriefShell;
  gaps: BriefCompletenessGap[];
  canonShells: CanonShellForCompleteness[];
  timeoutMs?: number;
}) => Promise<BriefCompletenessPatch>;

function isTier(value: unknown): value is 'pillar' | 'spoke' {
  return value === 'pillar' || value === 'spoke';
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function findBriefCompletenessGaps(brief: PageBriefShell): BriefCompletenessGap[] {
  const gaps: BriefCompletenessGap[] = [];
  if (!isTier(brief._index_cluster_role?.tier)) gaps.push('tier');
  if (!nonEmpty(brief._internal_seo?.primaryKeyword)) gaps.push('primaryKeyword');
  if (!nonEmpty(brief.cta?.primary)) gaps.push('cta.primary');
  return gaps;
}

export function applyBriefCompletenessPatch(
  brief: PageBriefShell,
  patch: BriefCompletenessPatch,
): PageBriefShell {
  const currentTier = brief._index_cluster_role?.tier;
  const tier = isTier(currentTier) ? currentTier : (patch.tier ?? 'spoke');
  const currentKeyword = brief._internal_seo?.primaryKeyword;
  const primaryKeyword = nonEmpty(currentKeyword)
    ? currentKeyword.trim()
    : (patch.primaryKeyword?.trim() || brief.pageTitle.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim());
  const currentCta = brief.cta?.primary;
  const ctaPrimary = nonEmpty(currentCta)
    ? currentCta.trim()
    : (patch.ctaPrimary?.trim() || `Read my ${brief.pageTitle} next`);

  return {
    ...brief,
    cta: {
      ...brief.cta,
      primary: ctaPrimary,
    },
    _internal_seo: {
      ...brief._internal_seo,
      primaryKeyword,
    },
    _index_cluster_role: {
      ...brief._index_cluster_role,
      tier,
      parent_topic: brief._index_cluster_role?.parent_topic ?? patch.parentTopic ?? null,
      sibling_slugs: brief._index_cluster_role?.sibling_slugs ?? [],
    },
  };
}

export function buildBriefCompletenessPrompt(input: {
  brief: PageBriefShell;
  gaps: BriefCompletenessGap[];
  canonShells: CanonShellForCompleteness[];
}): string {
  const canonContext = input.canonShells
    .map((canon) => `- ${canon.id} (${canon.type}) "${canon.title}": ${canon.internal_summary.slice(0, 180)}`)
    .join('\n');

  return [
    `You are completing missing SEO and cluster-role metadata for one CreatorCanon PageBrief.`,
    '',
    `# Missing fields`,
    input.gaps.map((gap) => `- ${gap}`).join('\n'),
    '',
    `# Page brief`,
    `- pageTitle: ${input.brief.pageTitle}`,
    `- hook: ${input.brief.hook}`,
    `- lede: ${input.brief.lede}`,
    `- slug: ${input.brief._index_slug}`,
    `- pageType: ${input.brief._index_page_type}`,
    `- primaryCanonIds: ${input.brief._index_primary_canon_node_ids.join(', ')}`,
    '',
    `# Canon shells`,
    canonContext || '- (none)',
    '',
    `# Output`,
    `Return one JSON object. Only include the fields below.`,
    `{`,
    `  "tier": "pillar|spoke",`,
    `  "parentTopic": "<slug or null>",`,
    `  "primaryKeyword": "<specific searchable phrase>",`,
    `  "ctaPrimary": "<first-person CTA pointing to the next useful action>"`,
    `}`,
    '',
    `Rules: tier must be "pillar" or "spoke"; primaryKeyword must be buyer/search useful; ctaPrimary must be first-person or direct-address.`,
    `JSON only.`,
  ].join('\n');
}

async function populateWithCodex(input: {
  brief: PageBriefShell;
  gaps: BriefCompletenessGap[];
  canonShells: CanonShellForCompleteness[];
  timeoutMs?: number;
}): Promise<BriefCompletenessPatch> {
  const raw = await runCodex(buildBriefCompletenessPrompt(input), {
    timeoutMs: input.timeoutMs ?? 5 * 60 * 1000,
    label: `brief_completeness_${input.brief.pageId}`,
  });
  const parsed = JSON.parse(extractJsonFromCodexOutput(raw)) as BriefCompletenessPatch;
  return {
    tier: isTier(parsed.tier) ? parsed.tier : undefined,
    parentTopic: typeof parsed.parentTopic === 'string' ? parsed.parentTopic : null,
    primaryKeyword: typeof parsed.primaryKeyword === 'string' ? parsed.primaryKeyword : undefined,
    ctaPrimary: typeof parsed.ctaPrimary === 'string' ? parsed.ctaPrimary : undefined,
  };
}

export async function ensureBriefCompleteness(
  brief: PageBriefShell,
  options: {
    canonShells: CanonShellForCompleteness[];
    populator?: BriefCompletenessPopulator;
    timeoutMs?: number;
  },
): Promise<PageBriefShell> {
  const gaps = findBriefCompletenessGaps(brief);
  if (gaps.length === 0) return brief;

  let patch: BriefCompletenessPatch = {};
  try {
    patch = options.populator
      ? await options.populator({ brief, gaps, canonShells: options.canonShells, timeoutMs: options.timeoutMs })
      : await populateWithCodex({ brief, gaps, canonShells: options.canonShells, timeoutMs: options.timeoutMs });
  } catch (err) {
    console.warn(`[brief-completeness] ${brief.pageId} populator failed: ${(err as Error).message.slice(0, 160)}; using deterministic fallback`);
  }

  return applyBriefCompletenessPatch(brief, patch);
}
