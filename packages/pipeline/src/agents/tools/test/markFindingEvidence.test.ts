import { before, after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadDefaultEnvFiles } from '../../../env-files';
import { markFindingEvidenceTool } from '../markFindingEvidence';
import { proposeTopicTool } from '../propose';
import { seedTestRun, teardownTestRun, makeCtx, type SeedResult } from '../../../../test-helpers/fixtures';
import { eq, getDb } from '@creatorcanon/db';
import { archiveFinding } from '@creatorcanon/db/schema';

describe('markFindingEvidence', () => {
  let seed: SeedResult;
  let findingId: string;

  before(async () => {
    loadDefaultEnvFiles();
    seed = await seedTestRun({
      videos: [{ id: 'vid_mfe_v1', title: 'X', durationSec: 600 }],
      segments: [{ id: 'seg_mfe_a', videoId: 'vid_mfe_v1', startMs: 0, endMs: 30_000, text: 'foo' }],
    });
    const out = await proposeTopicTool.handler({
      title: 'T', description: 'd', iconKey: 'productivity', accentColor: 'mint',
      evidence: [{ segmentId: 'seg_mfe_a' }],
    }, makeCtx(seed, 'topic_spotter', 'gpt-5.5'));
    if (!out.ok) throw new Error('seed proposeTopic failed');
    findingId = out.findingId;
  });

  after(async () => { await teardownTestRun(seed); });

  it('updates evidenceQuality and returns ok', async () => {
    const out = await markFindingEvidenceTool.handler(
      { findingId, verdict: 'strong' },
      makeCtx(seed, 'citation_grounder', 'gpt-5.4'),
    );
    assert.equal(out.ok, true);
    const rows = await getDb().select().from(archiveFinding).where(eq(archiveFinding.id, findingId));
    assert.equal(rows[0]?.evidenceQuality, 'strong');
  });

  it('accepts notes optionally (no DB column for notes; should still succeed)', async () => {
    const out = await markFindingEvidenceTool.handler(
      { findingId, verdict: 'moderate', notes: 'one of two videos cite this idea' },
      makeCtx(seed, 'citation_grounder', 'gpt-5.4'),
    );
    assert.equal(out.ok, true);
  });

  it('rejects an unknown findingId without throwing', async () => {
    const out = await markFindingEvidenceTool.handler(
      { findingId: 'fnd_BOGUS', verdict: 'strong' },
      makeCtx(seed, 'citation_grounder', 'gpt-5.4'),
    );
    assert.equal(out.ok, false);
    if (!out.ok) assert.match(out.error, /not found/);
  });

  it('does not update findings from a different run', async () => {
    // Create a parallel run with its own finding.
    const otherSeed = await seedTestRun({
      videos: [{ id: 'vid_mfe_v2', title: 'Other', durationSec: 300 }],
      segments: [{ id: 'seg_mfe_b', videoId: 'vid_mfe_v2', startMs: 0, endMs: 30_000, text: 'X' }],
    });
    try {
      const otherTopic = await proposeTopicTool.handler({
        title: 'Other', description: 'd', iconKey: 'productivity', accentColor: 'mint',
        evidence: [{ segmentId: 'seg_mfe_b' }],
      }, makeCtx(otherSeed, 'topic_spotter', 'gpt-5.5'));
      if (!otherTopic.ok) throw new Error('seed otherTopic failed');

      // Try to mark the OTHER run's finding from our run's context — must fail.
      const out = await markFindingEvidenceTool.handler(
        { findingId: otherTopic.findingId, verdict: 'strong' },
        makeCtx(seed, 'citation_grounder', 'gpt-5.4'),
      );
      assert.equal(out.ok, false);

      // The other run's finding's evidenceQuality should still be 'unverified'.
      const rows = await getDb().select().from(archiveFinding).where(eq(archiveFinding.id, otherTopic.findingId));
      assert.equal(rows[0]?.evidenceQuality, 'unverified');
    } finally {
      await teardownTestRun(otherSeed);
    }
  });

  it('input schema rejects invalid verdict', () => {
    const result = markFindingEvidenceTool.input.safeParse({
      findingId: 'fnd_x', verdict: 'unverified', // 'unverified' is not a valid VERDICT input (it's the default state)
    });
    assert.equal(result.success, false);
  });
});
