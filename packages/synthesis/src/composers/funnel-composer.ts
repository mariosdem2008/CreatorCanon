/**
 * Funnel composer — distribution-mode-aware funnel copy.
 *
 * Pipeline:
 *   1. Conditional on productGoal:
 *      - lead_magnet -> authorEmailCapture
 *      - paid_product -> authorPaywall
 *      - member_library -> authorLogin
 *      - sales_asset / public_reference -> none of the above
 *   2. authorInlineCtas: 1 Codex call for shallow/mid/deep CTAs.
 *   3. pickShareCardCanons + authorShareCard (per-canon Codex call) for top
 *      3 aphoristic canons (or fall back to top short-titled canons).
 *
 * Total Codex calls: 2 + (1 capture/paywall/login if applicable) + 3 share
 * cards = ~5-6 per creator.
 */

import type {
  CanonRef,
  CodexClient,
  ComposeInput,
  CreatorConfig,
  FunnelComponent,
  FunnelEmailCapture,
  FunnelInlineCta,
  FunnelLogin,
  FunnelPaywall,
  FunnelShareCard,
  ProductGoal,
} from '../types';

export interface FunnelComposeInput extends ComposeInput {
  productGoal: ProductGoal;
  creatorConfig: CreatorConfig;
}

/**
 * Map a channel-profile archetype to the noun phrase used in funnel prompts.
 * Funnel copy is reused across all archetypes; without parameterization,
 * Codex was being told "operator-coach hub" for science-explainer runs.
 */
function archetypeDescriptor(input: FunnelComposeInput): string {
  const a = String(input.channelProfile?.archetype ?? '').toLowerCase();
  if (a.includes('operator')) return 'operator-coach';
  if (a.includes('science') || a.includes('explainer')) return 'science-explainer';
  if (a.includes('contemplative') || a.includes('thinker')) return 'contemplative-thinker';
  if (a.includes('instructional') || a.includes('craft')) return 'instructional-craft';
  return 'knowledge';
}

function safeJsonParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as T;
    } catch {
      return null;
    }
  }
}

export function pickShareCardCanons(canons: CanonRef[], n: number): CanonRef[] {
  const aphorisms = canons.filter((c) => c.payload.type === 'aphorism');
  const shortTitled = canons.filter(
    (c) => c.payload.type !== 'aphorism' && (c.payload.title ?? '').length <= 60,
  );
  return [...aphorisms, ...shortTitled].slice(0, n);
}

async function authorEmailCapture(
  input: FunnelComposeInput,
  codex: CodexClient,
): Promise<FunnelEmailCapture> {
  const archetype = archetypeDescriptor(input);
  const prompt = [
    `Author lead capture copy for a ${archetype} hub. Goal: lead_magnet.`,
    `Creator: ${input.creatorName}. Niche: ${input.channelProfile.niche ?? '(unknown)'}.`,
    '',
    'Output rules:',
    '- "label": 4-10 words, the value prop ("Get the free playbook")',
    '- "submitText": 1-3 words ("Send it")',
    '- "thankyouText": 1 sentence after submit',
    '',
    'Format: ONE JSON object: {"label":"...","submitText":"...","thankyouText":"..."}.',
  ].join('\n');
  const raw = await codex.run(prompt, {
    stage: 'funnel_lead_capture',
    timeoutMs: 60_000,
    label: 'funnel-lead-capture',
  });
  const parsed = safeJsonParse<FunnelEmailCapture>(raw);
  if (!parsed) {
    return {
      label: 'Get the free playbook',
      submitText: 'Send it',
      thankyouText: "We've sent it to your inbox.",
    };
  }
  return parsed;
}

async function authorPaywall(
  input: FunnelComposeInput,
  codex: CodexClient,
): Promise<FunnelPaywall> {
  const archetype = archetypeDescriptor(input);
  const prompt = [
    `Author paywall copy for a ${archetype} hub. Goal: paid_product.`,
    `Creator: ${input.creatorName}.`,
    '',
    'Output rules:',
    '- "tagline": 4-12 words ("Ready for the full plan?")',
    '- "bullets": 3-5 short bullets, what is unlocked behind the paywall',
    '- "ctaText": 2-4 words ("Unlock now")',
    '',
    'Format: ONE JSON object: {"tagline":"...","bullets":[...],"ctaText":"..."}.',
  ].join('\n');
  const raw = await codex.run(prompt, {
    stage: 'funnel_paywall',
    timeoutMs: 60_000,
    label: 'funnel-paywall',
  });
  const parsed = safeJsonParse<FunnelPaywall>(raw);
  if (!parsed) {
    return {
      tagline: 'Ready for the full plan?',
      bullets: ['Full action plan', 'All worksheets', 'All calculators'],
      ctaText: 'Unlock now',
    };
  }
  return parsed;
}

async function authorLogin(
  input: FunnelComposeInput,
  codex: CodexClient,
): Promise<FunnelLogin> {
  const archetype = archetypeDescriptor(input);
  const prompt = [
    `Author login wall copy for a ${archetype} hub. Goal: member_library.`,
    `Creator: ${input.creatorName}.`,
    '',
    'Output rules:',
    '- "headline": 2-6 words',
    '- "ctaText": 2-4 words',
    '',
    'Format: ONE JSON object: {"headline":"...","ctaText":"..."}.',
  ].join('\n');
  const raw = await codex.run(prompt, {
    stage: 'funnel_login',
    timeoutMs: 60_000,
    label: 'funnel-login',
  });
  const parsed = safeJsonParse<FunnelLogin>(raw);
  if (!parsed) {
    return { headline: 'Members only', ctaText: 'Sign in' };
  }
  return parsed;
}

interface RawInlineCtas {
  ctas: FunnelInlineCta[];
}

async function authorInlineCtas(
  input: FunnelComposeInput,
  codex: CodexClient,
): Promise<FunnelInlineCta[]> {
  const fallbackHref =
    input.creatorConfig.ctas.primary?.href ??
    input.creatorConfig.funnelDestination ??
    '#';
  const archetype = archetypeDescriptor(input);
  const prompt = [
    `Author 3 inline CTAs for a ${archetype} hub. One per page-depth: shallow, mid, deep.`,
    `Goal: ${input.productGoal}.`,
    `Creator: ${input.creatorName}.`,
    `Default destination href if you cannot determine one: "${fallbackHref}".`,
    '',
    'Output rules:',
    '- "ctas": array of exactly 3 entries: {pageDepth, text, href}',
    '- pageDepth: one of "shallow", "mid", "deep"',
    '- text: 3-7 words, action-oriented',
    '- href: a relative path; use the default if unsure',
    '',
    'Format: ONE JSON object: {"ctas":[...]}.',
  ].join('\n');
  const raw = await codex.run(prompt, {
    stage: 'funnel_inline_ctas',
    timeoutMs: 60_000,
    label: 'funnel-inline-ctas',
  });
  const parsed = safeJsonParse<RawInlineCtas>(raw);
  if (!parsed?.ctas || parsed.ctas.length === 0) {
    return [
      { pageDepth: 'shallow', text: 'Start the action plan', href: fallbackHref },
      { pageDepth: 'mid', text: 'Try a worksheet', href: fallbackHref },
      { pageDepth: 'deep', text: 'See the full library', href: fallbackHref },
    ];
  }
  return parsed.ctas.slice(0, 3);
}

interface RawShareCard {
  title: string;
  quote: string;
}

async function authorShareCard(
  canon: CanonRef,
  codex: CodexClient,
): Promise<FunnelShareCard | null> {
  const prompt = [
    `Author one share-card template (for social media) from this canon.`,
    `Title: ${canon.payload.title ?? canon.id}`,
    `Body: ${(canon.payload.body ?? '').slice(0, 600)}`,
    '',
    'Output rules:',
    '- "title": 4-10 words, gripping',
    '- "quote": 1-2 short sentences, pull-quote style',
    '',
    'Format: ONE JSON object: {"title":"...","quote":"..."}.',
  ].join('\n');
  const raw = await codex.run(prompt, {
    stage: 'funnel_share_card',
    timeoutMs: 60_000,
    label: `funnel-share-card:${canon.id}`,
  });
  const parsed = safeJsonParse<RawShareCard>(raw);
  if (!parsed?.title || !parsed?.quote) return null;
  return {
    id: `card_${canon.id}`,
    title: parsed.title,
    quote: parsed.quote,
    sourceCanonId: canon.id,
  };
}

export async function composeFunnel(
  input: FunnelComposeInput,
  opts: { codex: CodexClient },
): Promise<FunnelComponent> {
  const goal = input.productGoal;

  const sharePicks = pickShareCardCanons(input.canons, 3);

  // Run goal-specific copy in parallel with inline CTAs + share cards.
  const goalCopyPromise: Promise<{
    emailCapture?: FunnelEmailCapture;
    paywall?: FunnelPaywall;
    login?: FunnelLogin;
  }> = (async () => {
    if (goal === 'lead_magnet') {
      const emailCapture = await authorEmailCapture(input, opts.codex);
      return { emailCapture };
    }
    if (goal === 'paid_product') {
      const paywall = await authorPaywall(input, opts.codex);
      return { paywall };
    }
    if (goal === 'member_library') {
      const login = await authorLogin(input, opts.codex);
      return { login };
    }
    // sales_asset, public_reference -> no goal-specific surface.
    return {};
  })();

  const [goalCopy, inlineCtas, shareCardResults] = await Promise.all([
    goalCopyPromise,
    authorInlineCtas(input, opts.codex),
    Promise.all(sharePicks.map((c) => authorShareCard(c, opts.codex))),
  ]);

  const shareCardTemplates = shareCardResults.filter(
    (c): c is FunnelShareCard => c !== null,
  );

  return {
    goal,
    ...goalCopy,
    shareCardTemplates,
    inlineCtas,
  };
}
