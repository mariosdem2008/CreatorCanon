import { getDb } from '@creatorcanon/db';
import { costLedgerEntry } from '@creatorcanon/db/schema';

/**
 * Thin recordCost helper that writes one row per external-service call to
 * `cost_ledger_entry`. Never throws — cost-log failures must not block a
 * successful pipeline stage. Schema field names match
 * `packages/db/src/schema/billing.ts` (`inputTokens`, `outputTokens`,
 * `costCents`, etc.).
 *
 * Values must match the `cost_provider` PG enum
 * (see packages/db/src/schema/enums.ts). Keep in sync if that enum changes.
 */
export type CostProvider =
  | 'openai'
  | 'gemini'
  | 'youtube'
  | 'resend'
  | 'stripe'
  | 'r2';

export interface CostRowInput {
  runId: string;
  workspaceId: string;
  stageName: string;
  provider: CostProvider;
  model?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  inputSecondsVideo?: number | null;
  /** USD cents (numeric(12,4)). 0.0006 is one-tenth of one cent. */
  costCents: number;
  durationMs?: number | null;
  metadata?: Record<string, unknown> | null;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/**
 * Build the insert row (pure, testable without a DB).
 */
export function buildCostRow(input: CostRowInput) {
  return {
    id: crypto.randomUUID(),
    workspaceId: input.workspaceId,
    runId: input.runId,
    stageName: input.stageName,
    userInteraction: 'pipeline' as const,
    provider: input.provider,
    model: input.model ?? null,
    inputTokens: input.inputTokens ?? null,
    outputTokens: input.outputTokens ?? null,
    inputSecondsVideo: input.inputSecondsVideo ?? null,
    inputFrames: null,
    durationMs: input.durationMs ?? null,
    costCents: round4(input.costCents).toString(),
    metadata: (input.metadata ?? null) as unknown,
    createdAt: new Date(),
  };
}

/**
 * Best-effort write to `cost_ledger_entry`. Never throws — a failed cost
 * log must not block a successful pipeline stage.
 */
export async function recordCost(input: CostRowInput): Promise<void> {
  try {
    const row = buildCostRow(input);
    const db = getDb();
    await db.insert(costLedgerEntry).values(row);
  } catch (err) {
    console.warn(
      '[cost-ledger] write failed:',
      err instanceof Error ? err.message : err,
    );
  }
}
