import { before, after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadDefaultEnvFiles } from '../../../env-files';
import { listFindingsTool } from '../listFindings';
import { proposeTopicTool, proposeLessonTool } from '../propose';
import { seedTestRun, teardownTestRun, makeCtx, type SeedResult } from '../../../../test-helpers/fixtures';

describe('listFindings', () => {
  let seed: SeedResult;

  before(async () => {
    loadDefaultEnvFiles();
    seed = await seedTestRun({
      videos: [{ id: 'vid_lf_v1', title: 'Test', durationSec: 600 }],
      segments: [
        { id: 'seg_lf_a', videoId: 'vid_lf_v1', startMs: 0, endMs: 30_000, text: 'Some text' },
      ],
    });
    await proposeTopicTool.handler({
      title: 'Topic A', description: 'd', iconKey: 'productivity', accentColor: 'mint',
      evidence: [{ segmentId: 'seg_lf_a' }],
    }, makeCtx(seed, 'topic_spotter', 'gpt-5.5'));
    await proposeTopicTool.handler({
      title: 'Topic B', description: 'd', iconKey: 'systems', accentColor: 'sage',
      evidence: [{ segmentId: 'seg_lf_a' }],
    }, makeCtx(seed, 'topic_spotter', 'gpt-5.5'));
    await proposeLessonTool.handler({
      title: 'Lesson A', summary: 's', idea: 'A long enough idea passage to satisfy the schema minimum length.',
      evidence: [{ segmentId: 'seg_lf_a' }],
    }, makeCtx(seed, 'lesson_extractor', 'gpt-5.5'));
  });

  after(async () => { await teardownTestRun(seed); });

  it('filters by type', async () => {
    const topics = await listFindingsTool.handler({ type: 'topic' }, makeCtx(seed));
    assert.equal(topics.length, 2);
    assert.ok(topics.every((t) => t.type === 'topic'));
  });

  it('filters by agent', async () => {
    const out = await listFindingsTool.handler({ type: 'lesson', agent: 'lesson_extractor' }, makeCtx(seed));
    assert.equal(out.length, 1);
    assert.equal(out[0]?.agent, 'lesson_extractor');
  });

  it('returns payload as a record', async () => {
    const topics = await listFindingsTool.handler({ type: 'topic' }, makeCtx(seed));
    const first = topics[0]!;
    assert.equal(typeof first.payload, 'object');
    assert.ok(first.payload && 'title' in first.payload);
  });

  it('does not return findings from other runs', async () => {
    // Seed a separate run with a topic finding that should NOT show up.
    const otherSeed = await seedTestRun({
      videos: [{ id: 'vid_lf_v2', title: 'Other', durationSec: 300 }],
      segments: [{ id: 'seg_lf_other', videoId: 'vid_lf_v2', startMs: 0, endMs: 30_000, text: 'X' }],
    });
    try {
      await proposeTopicTool.handler({
        title: 'Other-run topic', description: 'd', iconKey: 'productivity', accentColor: 'mint',
        evidence: [{ segmentId: 'seg_lf_other' }],
      }, makeCtx(otherSeed, 'topic_spotter', 'gpt-5.5'));

      // Query against the original seed; must NOT see other-run topic.
      const topics = await listFindingsTool.handler({ type: 'topic' }, makeCtx(seed));
      assert.ok(topics.every((t) => (t.payload as any).title !== 'Other-run topic'));
    } finally {
      await teardownTestRun(otherSeed);
    }
  });

  it('input schema rejects unknown type', () => {
    const result = listFindingsTool.input.safeParse({ type: 'not_a_type' });
    assert.equal(result.success, false);
  });
});
