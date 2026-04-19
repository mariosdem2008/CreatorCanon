export type CostProvider =
  | 'openai'
  | 'gemini'
  | 'stripe'
  | 'cloudflare_r2'
  | 'neon'
  | 'upstash'
  | 'resend'
  | 'trigger';

export interface CostEntry {
  runId: string;
  stageName: string;
  provider: CostProvider;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  inputSecondsVideo?: number;
  inputFrames?: number;
  usdCents: number;
  recordedAt: Date;
  meta?: Record<string, unknown>;
}

// Actual cost-ledger DB writes land in ticket 5.15.
export const ledgerPlaceholder = true;
