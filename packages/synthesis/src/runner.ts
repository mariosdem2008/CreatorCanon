/**
 * Synthesis runner — orchestrates composer agents to produce a ProductBundle.
 *
 * Inputs (provided by caller):
 *   - runId, productGoal, creatorConfig (caller's choice for this synthesis)
 *   - channelProfile + canons (loaded from audit substrate by the caller —
 *     see packages/pipeline/src/scripts/run-synthesis.ts in Task A.10)
 *   - codex (CodexClient — runner is provider-agnostic; CLI runner injects
 *     the real Codex CLI client, tests inject a deterministic stub)
 *
 * The runner:
 *   1. Resolves voiceMode (channelProfile.voiceMode or archetype default).
 *   2. Routes which composers run via routeComposers(archetype).
 *   3. Runs all selected composers in parallel.
 *   4. Assembles the ProductBundle envelope.
 *
 * NOTE: The runner does NOT load DB substrate or write back; that lives in
 * the CLI script and the API route handlers (Task A.10 + A.9). Keeping the
 * runner pure-async-function makes it testable in isolation.
 */

import type {
  ArchetypeSlug,
  ChannelProfileRef,
  CanonRef,
  CodexClient,
  CreatorConfig,
  ProductBundle,
  ProductGoal,
  VoiceMode,
} from './types';
import { routeComposers } from './composers/router';
import { composeActionPlan } from './composers/action-plan-composer';
import { composeWorksheets } from './composers/worksheet-forge';
import { composeCalculators } from './composers/calculator-forge';
import { composeDiagnostic } from './composers/diagnostic-composer';
import { composeFunnel } from './composers/funnel-composer';
import { composeReference } from './composers/reference-composer';
import { composeDebunking } from './composers/debunking-forge';
import { composeGlossary } from './composers/glossary-builder';

export interface RunSynthesisInput {
  runId: string;
  productGoal: ProductGoal;
  creatorConfig: CreatorConfig;
  channelProfile: ChannelProfileRef;
  canons: CanonRef[];
  codex: CodexClient;
}

const ARCHETYPE_VOICE_DEFAULT: Record<ArchetypeSlug, VoiceMode> = {
  'operator-coach': 'first_person',
  'instructional-craft': 'first_person',
  'science-explainer': 'third_person_editorial',
  'contemplative-thinker': 'hybrid',
  _DEFAULT: 'first_person',
};

function isArchetypeSlug(s: string | undefined): s is ArchetypeSlug {
  return (
    s === 'operator-coach' ||
    s === 'science-explainer' ||
    s === 'instructional-craft' ||
    s === 'contemplative-thinker' ||
    s === '_DEFAULT'
  );
}

function isVoiceMode(s: string | undefined): s is VoiceMode {
  return s === 'first_person' || s === 'third_person_editorial' || s === 'hybrid';
}

function resolveArchetype(profile: ChannelProfileRef): ArchetypeSlug {
  const a = typeof profile.archetype === 'string' ? profile.archetype : undefined;
  return isArchetypeSlug(a) ? a : '_DEFAULT';
}

function resolveVoiceMode(profile: ChannelProfileRef, archetype: ArchetypeSlug): VoiceMode {
  const v = typeof profile.voiceMode === 'string' ? profile.voiceMode : undefined;
  if (isVoiceMode(v)) return v;
  return ARCHETYPE_VOICE_DEFAULT[archetype];
}

export async function runSynthesis(input: RunSynthesisInput): Promise<ProductBundle> {
  const archetype = resolveArchetype(input.channelProfile);
  const voiceMode = resolveVoiceMode(input.channelProfile, archetype);
  const creatorName =
    (typeof input.channelProfile.creatorName === 'string' && input.channelProfile.creatorName) ||
    'this creator';

  const baseInput = {
    runId: input.runId,
    canons: input.canons,
    channelProfile: input.channelProfile,
    voiceMode,
    creatorName,
  };

  const selected = routeComposers(archetype);

  const [
    actionPlan,
    worksheets,
    calculators,
    diagnostic,
    reference,
    debunking,
    glossary,
    funnel,
  ] = await Promise.all([
    selected.has('actionPlan')
      ? composeActionPlan(baseInput, { codex: input.codex })
      : undefined,
    selected.has('worksheets')
      ? composeWorksheets(baseInput, { codex: input.codex })
      : undefined,
    selected.has('calculators')
      ? composeCalculators(baseInput, { codex: input.codex })
      : undefined,
    selected.has('diagnostic')
      ? composeDiagnostic(baseInput, { codex: input.codex })
      : undefined,
    selected.has('reference')
      ? composeReference(baseInput, { codex: input.codex })
      : undefined,
    selected.has('debunking')
      ? composeDebunking(baseInput, { codex: input.codex })
      : undefined,
    selected.has('glossary')
      ? composeGlossary(baseInput, { codex: input.codex })
      : undefined,
    composeFunnel(
      {
        ...baseInput,
        productGoal: input.productGoal,
        creatorConfig: input.creatorConfig,
      },
      { codex: input.codex },
    ),
  ]);

  const bundle: ProductBundle = {
    archetype,
    voiceMode,
    productGoal: input.productGoal,
    creatorConfig: input.creatorConfig,
    components: {
      ...(actionPlan ? { actionPlan } : {}),
      ...(worksheets ? { worksheets } : {}),
      ...(calculators ? { calculators } : {}),
      ...(diagnostic ? { diagnostic } : {}),
      ...(reference ? { reference } : {}),
      ...(debunking ? { debunking } : {}),
      ...(glossary ? { glossary } : {}),
      funnel,
    },
    generatedAt: new Date().toISOString(),
    schemaVersion: 'product_bundle_v1',
  };

  return bundle;
}
