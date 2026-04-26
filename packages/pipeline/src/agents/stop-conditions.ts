export interface StopCaps {
  maxCalls: number;
  maxCostCents: number;
  maxWallMs: number;
}

/** Default per spec § 6.3: 30 tool calls, $5 cost, 10 minutes wall time. */
export const DEFAULT_STOP_CAPS: StopCaps = {
  maxCalls: 30,
  maxCostCents: 500,
  maxWallMs: 10 * 60 * 1000,
};

export type StopReason = 'max_calls' | 'max_cost' | 'max_wall_clock';

export class StopController {
  private calls = 0;
  private costCents = 0;
  private start = Date.now();

  constructor(private caps: StopCaps) {}

  /** Record one provider call with its accumulated cost (in cents). */
  recordCall(callCostCents: number): void {
    this.calls += 1;
    this.costCents += callCostCents;
  }

  elapsedMs(): number {
    return Date.now() - this.start;
  }

  /** Check whether any cap has been hit. */
  shouldStop(): { stop: true; reason: StopReason } | { stop: false } {
    if (this.calls >= this.caps.maxCalls) return { stop: true, reason: 'max_calls' };
    if (this.costCents >= this.caps.maxCostCents) return { stop: true, reason: 'max_cost' };
    if (this.elapsedMs() >= this.caps.maxWallMs) return { stop: true, reason: 'max_wall_clock' };
    return { stop: false };
  }

  /** Whether any cap has reached 90% (soft warning trigger per spec § 6.3). */
  shouldWarn(): boolean {
    return (
      this.calls >= 0.9 * this.caps.maxCalls ||
      this.costCents >= 0.9 * this.caps.maxCostCents ||
      this.elapsedMs() >= 0.9 * this.caps.maxWallMs
    );
  }

  snapshot(): { calls: number; costCents: number; elapsedMs: number } {
    return { calls: this.calls, costCents: this.costCents, elapsedMs: this.elapsedMs() };
  }
}
