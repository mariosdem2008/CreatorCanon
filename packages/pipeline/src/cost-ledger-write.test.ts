import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { buildCostRow } from './cost-ledger-write';

test('buildCostRow populates required fields', () => {
  const row = buildCostRow({
    runId: 'run-1',
    workspaceId: 'ws-1',
    stageName: 'synthesize_v0_review',
    provider: 'openai',
    model: 'gpt-4o-mini',
    inputTokens: 1200,
    outputTokens: 300,
    costCents: 0.08,
  });
  assert.equal(row.runId, 'run-1');
  assert.equal(row.workspaceId, 'ws-1');
  assert.equal(row.stageName, 'synthesize_v0_review');
  assert.equal(row.provider, 'openai');
  assert.equal(row.model, 'gpt-4o-mini');
  assert.equal(row.inputTokens, 1200);
  assert.equal(row.outputTokens, 300);
  assert.equal(row.userInteraction, 'pipeline');
  assert.ok(row.id);
});

test('buildCostRow rounds costCents to 4 decimal places and stringifies for numeric()', () => {
  const row = buildCostRow({
    runId: 'run-1',
    workspaceId: 'ws-1',
    stageName: 'ensure_transcripts',
    provider: 'openai',
    model: 'whisper-1',
    costCents: 0.12345678,
  });
  assert.equal(typeof row.costCents, 'string');
  assert.equal(Number(row.costCents), 0.1235);
});

test('buildCostRow null defaults for optional fields', () => {
  const row = buildCostRow({
    runId: 'run-1',
    workspaceId: 'ws-1',
    stageName: 'draft_pages_v0',
    provider: 'openai',
    costCents: 0,
  });
  assert.equal(row.model, null);
  assert.equal(row.inputTokens, null);
  assert.equal(row.outputTokens, null);
  assert.equal(row.inputSecondsVideo, null);
  assert.equal(row.durationMs, null);
});
