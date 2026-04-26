import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { StopController, DEFAULT_STOP_CAPS } from '../stop-conditions';

describe('StopController', () => {
  it('stops when max calls hit', () => {
    const c = new StopController({ maxCalls: 3, maxCostCents: 10_000, maxWallMs: 60_000 });
    c.recordCall(0);
    c.recordCall(0);
    c.recordCall(0);
    assert.deepEqual(c.shouldStop(), { stop: true, reason: 'max_calls' });
  });

  it('stops when cost cap hit', () => {
    const c = new StopController({ maxCalls: 100, maxCostCents: 50, maxWallMs: 60_000 });
    c.recordCall(60);
    assert.deepEqual(c.shouldStop(), { stop: true, reason: 'max_cost' });
  });

  it('emits warning at 90% threshold', () => {
    const c = new StopController({ maxCalls: 10, maxCostCents: 10_000, maxWallMs: 60_000 });
    for (let i = 0; i < 9; i++) c.recordCall(0);
    assert.equal(c.shouldWarn(), true);
  });

  it('does not stop within budget', () => {
    const c = new StopController({ maxCalls: 100, maxCostCents: 100, maxWallMs: 60_000 });
    c.recordCall(50);
    assert.deepEqual(c.shouldStop(), { stop: false });
  });

  it('snapshot reports current state', () => {
    const c = new StopController({ maxCalls: 10, maxCostCents: 100, maxWallMs: 60_000 });
    c.recordCall(25);
    c.recordCall(15);
    const s = c.snapshot();
    assert.equal(s.calls, 2);
    assert.equal(s.costCents, 40);
    assert.ok(s.elapsedMs >= 0);
  });

  it('exports DEFAULT_STOP_CAPS with spec values', () => {
    assert.equal(DEFAULT_STOP_CAPS.maxCalls, 30);
    assert.equal(DEFAULT_STOP_CAPS.maxCostCents, 500);
    assert.equal(DEFAULT_STOP_CAPS.maxWallMs, 10 * 60 * 1000);
  });
});
