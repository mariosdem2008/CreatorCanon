/**
 * Synthesis CLI runner.
 *
 * Usage:
 *   PIPELINE_OPENAI_PROVIDER=codex_cli \
 *     tsx ./src/scripts/run-synthesis.ts <runId> [--goal lead_magnet]
 *
 * Loads the audit substrate (channel_profile + canon_node) for the run,
 * invokes @creatorcanon/synthesis runSynthesis with a real Codex CLI client,
 * persists the resulting ProductBundle to product_bundle. Idempotent:
 * existing synthesis_run rows for the same (runId, productGoal) are
 * superseded — we always create a fresh row + fresh bundle.
 *
 * Phase A.10 — CLI surface for operator-driven cohort runs (smoke).
 */

import { randomUUID } from 'node:crypto';

import { closeDb, ensureDbHealthy, eq, getDb } from '@creatorcanon/db';
import {
  canonNode,
  channelProfile,
  generationRun,
  productBundle,
  synthesisRun,
} from '@creatorcanon/db/schema';
import { runSynthesis } from '@creatorcanon/synthesis';
import type {
  CanonRef,
  ChannelProfileRef,
  CodexClient,
  CreatorConfig,
  ProductGoal,
} from '@creatorcanon/synthesis';

import { loadDefaultEnvFiles } from '../env-files';
import { runCodex } from './util/codex-runner';

loadDefaultEnvFiles();

const VALID_GOALS: ProductGoal[] = [
  'lead_magnet',
  'paid_product',
  'member_library',
  'sales_asset',
  'public_reference',
];

function parseArgs(argv: string[]): {
  runId: string;
  productGoal: ProductGoal;
  primaryColor: string;
  primaryCtaLabel: string;
  primaryCtaHref: string;
} {
  const positional: string[] = [];
  const opts: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        opts[key] = next;
        i += 1;
      } else {
        opts[key] = 'true';
      }
    } else {
      positional.push(arg);
    }
  }
  const runId = positional[0];
  if (!runId) {
    throw new Error(
      'Usage: tsx run-synthesis.ts <runId> [--goal lead_magnet] [--primary-color #000] [--cta-label Start] [--cta-href /]',
    );
  }
  const goal = (opts.goal ?? 'lead_magnet') as ProductGoal;
  if (!VALID_GOALS.includes(goal)) {
    throw new Error(`--goal must be one of ${VALID_GOALS.join(', ')}`);
  }
  return {
    runId,
    productGoal: goal,
    primaryColor: opts['primary-color'] ?? '#111111',
    primaryCtaLabel: opts['cta-label'] ?? 'Start',
    primaryCtaHref: opts['cta-href'] ?? '#',
  };
}

function codexTimeoutMs(): number {
  const raw = Number(process.env.CODEX_CLI_TIMEOUT_MS ?? 600_000);
  return Number.isFinite(raw) && raw > 0 ? raw : 600_000;
}

function makeCodexClient(): CodexClient {
  return {
    run: async (prompt, options) =>
      runCodex(prompt, {
        timeoutMs: options?.timeoutMs ?? codexTimeoutMs(),
        label: options?.label ?? options?.stage ?? 'synthesis',
      }),
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  console.info('[run-synthesis] starting', {
    runId: args.runId,
    productGoal: args.productGoal,
  });

  await ensureDbHealthy();
  const db = getDb();

  const runRows = await db
    .select({ workspaceId: generationRun.workspaceId })
    .from(generationRun)
    .where(eq(generationRun.id, args.runId))
    .limit(1);
  const run = runRows[0];
  if (!run) {
    throw new Error(`generation_run ${args.runId} not found`);
  }

  const synthesisRunId = randomUUID();
  await db.insert(synthesisRun).values({
    id: synthesisRunId,
    workspaceId: run.workspaceId,
    runId: args.runId,
    productGoal: args.productGoal,
    status: 'running',
    startedAt: new Date(),
  });

  try {
    const profileRows = await db
      .select({ payload: channelProfile.payload })
      .from(channelProfile)
      .where(eq(channelProfile.runId, args.runId))
      .limit(1);
    const profile = profileRows[0];
    if (!profile?.payload) {
      throw new Error('No channel_profile row found for run');
    }

    const canonRows = await db
      .select({ id: canonNode.id, payload: canonNode.payload })
      .from(canonNode)
      .where(eq(canonNode.runId, args.runId));

    const canons: CanonRef[] = canonRows.map((row) => ({
      id: row.id,
      payload: (row.payload ?? {}) as CanonRef['payload'],
    }));

    const creatorConfig: CreatorConfig = {
      brand: { primaryColor: args.primaryColor },
      ctas: {
        primary: {
          label: args.primaryCtaLabel,
          href: args.primaryCtaHref,
        },
      },
    };

    const startedAt = Date.now();
    const bundle = await runSynthesis({
      runId: args.runId,
      productGoal: args.productGoal,
      creatorConfig,
      channelProfile: profile.payload as ChannelProfileRef,
      canons,
      codex: makeCodexClient(),
    });
    const elapsedMs = Date.now() - startedAt;

    const bundleId = randomUUID();
    await db.insert(productBundle).values({
      id: bundleId,
      synthesisRunId,
      workspaceId: run.workspaceId,
      runId: args.runId,
      payload: bundle,
      schemaVersion: bundle.schemaVersion,
    });

    await db
      .update(synthesisRun)
      .set({ status: 'succeeded', completedAt: new Date() })
      .where(eq(synthesisRun.id, synthesisRunId));

    console.info('[run-synthesis] succeeded', {
      synthesisRunId,
      productBundleId: bundleId,
      archetype: bundle.archetype,
      voiceMode: bundle.voiceMode,
      productGoal: bundle.productGoal,
      components: Object.keys(bundle.components),
      actionPlanPhases: bundle.components.actionPlan?.phases.length ?? 0,
      worksheets: bundle.components.worksheets?.length ?? 0,
      calculators: bundle.components.calculators?.length ?? 0,
      diagnosticQuestions: bundle.components.diagnostic?.questions.length ?? 0,
      shareCards: bundle.components.funnel.shareCardTemplates.length,
      inlineCtas: bundle.components.funnel.inlineCtas.length,
      elapsedMs,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    console.error('[run-synthesis] failed:', err);
    await db
      .update(synthesisRun)
      .set({ status: 'failed', completedAt: new Date(), errorMessage: message })
      .where(eq(synthesisRun.id, synthesisRunId));
    throw err;
  } finally {
    await closeDb();
  }
}

main().catch((err) => {
  console.error('[run-synthesis] unhandled:', err);
  process.exit(1);
});
