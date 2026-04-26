import { before, after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadDefaultEnvFiles } from '../../env-files';
import { assertWithinRunBudget } from '../run-budget';
import { _resetRegistryForTests, registerAllTools } from '../tools/registry';
import { proposeTopicTool } from '../tools/propose';
import { seedTestRun, teardownTestRun, makeCtx, type SeedResult } from '../../../test-helpers/fixtures';
import { eq, getDb } from '@creatorcanon/db';
import { archiveFinding } from '@creatorcanon/db/schema';

describe('assertWithinRunBudget', () => {
  let seed: SeedResult;

  before(async () => {
    loadDefaultEnvFiles();
    _resetRegistryForTests();
    registerAllTools();
    seed = await seedTestRun({
      videos: [{ id: 'vid_b_v1', title: 'X', durationSec: 600 }],
      segments: [{ id: 'seg_b_a', videoId: 'vid_b_v1', startMs: 0, endMs: 30_000, text: 'x' }],
    });
  });

  after(async () => { await teardownTestRun(seed); });

  it('returns ok when total cost under cap', async () => {
    const out = await proposeTopicTool.handler({
      title: 'T', description: 'd', iconKey: 'productivity', accentColor: 'mint',
      evidence: [{ segmentId: 'seg_b_a' }],
    }, makeCtx(seed, 'topic_spotter', 'gpt-5.5'));
    if (!out.ok) throw new Error('seed proposeTopic failed');
    await getDb().update(archiveFinding).set({ costCents: '100' }).where(eq(archiveFinding.id, out.findingId));
    const r = await assertWithinRunBudget(seed.runId, 2500);
    assert.equal(r.ok, true);
    assert.equal(r.spentCents, 100);
  });

  it('throws RUN_BUDGET_EXCEEDED when total cost over cap', async () => {
    // The earlier 100c finding remains; add another to push total over.
    const out = await proposeTopicTool.handler({
      title: 'T2', description: 'd', iconKey: 'productivity', accentColor: 'mint',
      evidence: [{ segmentId: 'seg_b_a' }],
    }, makeCtx(seed, 'topic_spotter', 'gpt-5.5'));
    if (!out.ok) throw new Error('seed proposeTopic 2 failed');
    await getDb().update(archiveFinding).set({ costCents: '3000' }).where(eq(archiveFinding.id, out.findingId));
    await assert.rejects(() => assertWithinRunBudget(seed.runId, 2500), /exceeded/);
  });
});
