import { before, after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadDefaultEnvFiles } from '../../../env-files';
import {
  proposeTopicTool,
  proposeFrameworkTool,
  proposeLessonTool,
  proposePlaybookTool,
  proposeQuoteTool,
  proposeAhaMomentTool,
  proposeSourceRankingTool,
  proposeRelationTool,
} from '../propose';
import { seedTestRun, teardownTestRun, makeCtx, type SeedResult } from '../../../../test-helpers/fixtures';
import { eq, getDb } from '@creatorcanon/db';
import { archiveFinding, archiveRelation } from '@creatorcanon/db/schema';

describe('propose* tools', () => {
  let seed: SeedResult;

  before(async () => {
    loadDefaultEnvFiles();
    seed = await seedTestRun({
      videos: [{ id: 'vid_pt_v1', title: 'Test', durationSec: 600 }],
      segments: [
        { id: 'seg_pt_a', videoId: 'vid_pt_v1', startMs: 0, endMs: 30_000, text: 'Some text' },
        { id: 'seg_pt_b', videoId: 'vid_pt_v1', startMs: 30_000, endMs: 60_000, text: 'More text' },
      ],
    });
  });

  after(async () => { await teardownTestRun(seed); });

  it('proposeTopic inserts when evidence is valid', async () => {
    const out = await proposeTopicTool.handler({
      title: 'Focus',
      description: 'How to focus deeply',
      iconKey: 'productivity',
      accentColor: 'mint',
      evidence: [{ segmentId: 'seg_pt_a' }],
    }, makeCtx(seed, 'topic_spotter', 'gpt-5.5'));

    assert.equal(out.ok, true);
    if (out.ok) {
      assert.match(out.findingId, /^fnd_/);
      const rows = await getDb().select().from(archiveFinding).where(eq(archiveFinding.id, out.findingId));
      assert.equal(rows[0]?.type, 'topic');
      assert.equal(rows[0]?.agent, 'topic_spotter');
      assert.equal(rows[0]?.model, 'gpt-5.5');
      assert.equal(rows[0]?.evidenceQuality, 'unverified');
    }
  });

  it('proposeTopic rejects unknown segmentId without inserting', async () => {
    const before = await getDb().select().from(archiveFinding).where(eq(archiveFinding.runId, seed.runId));
    const beforeCount = before.length;
    const out = await proposeTopicTool.handler({
      title: 'X',
      description: 'X',
      iconKey: 'productivity',
      accentColor: 'mint',
      evidence: [{ segmentId: 'BOGUS' }],
    }, makeCtx(seed, 'topic_spotter', 'gpt-5.5'));
    assert.equal(out.ok, false);
    if (!out.ok) assert.match(out.error, /Unknown segment ID\(s\): BOGUS/);
    const after = await getDb().select().from(archiveFinding).where(eq(archiveFinding.runId, seed.runId));
    assert.equal(after.length, beforeCount, 'no new row should be inserted on validation failure');
  });

  it('proposeFramework input schema requires min 2 evidence segments', () => {
    const result = proposeFrameworkTool.input.safeParse({
      title: 'Pomodoro',
      summary: 'X',
      principles: [{ title: 'p', body: 'b' }],
      evidence: [{ segmentId: 'seg_pt_a' }],
    });
    assert.equal(result.success, false);
  });

  it('proposeQuote accepts a single segment', async () => {
    const out = await proposeQuoteTool.handler({
      text: 'A quote you can use here.',
      evidence: { segmentId: 'seg_pt_a' },
    }, makeCtx(seed, 'quote_finder', 'gpt-5.5'));
    assert.equal(out.ok, true);
  });

  it('proposePlaybook with buildsOnFindingIds creates implicit builds_on relations', async () => {
    // First seed a framework finding so the playbook can build_on it.
    const fw = await proposeFrameworkTool.handler({
      title: 'Eisenhower Matrix',
      summary: 'Quadrants for prioritization',
      principles: [{ title: 'Urgency', body: 'Distinguish from importance' }],
      evidence: [{ segmentId: 'seg_pt_a' }, { segmentId: 'seg_pt_b' }],
    }, makeCtx(seed, 'framework_extractor', 'gpt-5.5'));
    if (!fw.ok) throw new Error('seed framework failed');

    const pb = await proposePlaybookTool.handler({
      title: 'Weekly review',
      summary: 'A weekly system rooted in Eisenhower thinking.',
      principles: [{ title: 'Reflect', body: 'Look back before forward' }],
      evidence: [{ segmentId: 'seg_pt_a' }, { segmentId: 'seg_pt_b' }, { segmentId: 'seg_pt_a' }],
      buildsOnFindingIds: [fw.findingId],
    }, makeCtx(seed, 'playbook_extractor', 'gpt-5.5'));
    assert.equal(pb.ok, true);
    if (pb.ok) {
      const rels = await getDb().select().from(archiveRelation)
        .where(eq(archiveRelation.fromFindingId, pb.findingId));
      assert.ok(rels.length >= 1);
      assert.equal(rels[0]?.type, 'builds_on');
      assert.equal(rels[0]?.toFindingId, fw.findingId);
    }
  });

  it('proposeRelation succeeds when both findings exist in run', async () => {
    const t1 = await proposeTopicTool.handler({
      title: 'A', description: 'a', iconKey: 'productivity', accentColor: 'mint',
      evidence: [{ segmentId: 'seg_pt_a' }],
    }, makeCtx(seed, 'topic_spotter', 'gpt-5.5'));
    const t2 = await proposeTopicTool.handler({
      title: 'B', description: 'b', iconKey: 'productivity', accentColor: 'sage',
      evidence: [{ segmentId: 'seg_pt_b' }],
    }, makeCtx(seed, 'topic_spotter', 'gpt-5.5'));
    if (!t1.ok || !t2.ok) throw new Error('seed topics failed');

    const rel = await proposeRelationTool.handler({
      fromFindingId: t1.findingId,
      toFindingId: t2.findingId,
      type: 'related_to',
      evidence: [{ segmentId: 'seg_pt_a' }],
      notes: 'Both about focus.',
    }, makeCtx(seed, 'topic_spotter', 'gpt-5.5'));
    assert.equal(rel.ok, true);
    if (rel.ok) assert.match(rel.relationId, /^rel_/);
  });

  it('proposeRelation rejects unknown findingId', async () => {
    const rel = await proposeRelationTool.handler({
      fromFindingId: 'fnd_BOGUS',
      toFindingId: 'fnd_ALSOBOGUS',
      type: 'related_to',
      evidence: [{ segmentId: 'seg_pt_a' }],
    }, makeCtx(seed, 'topic_spotter', 'gpt-5.5'));
    assert.equal(rel.ok, false);
  });

  it('proposeSourceRanking accepts no segment evidence', async () => {
    const out = await proposeSourceRankingTool.handler({
      topicId: 'fnd_xxx',
      videoIds: ['vid_pt_v1'],
    }, makeCtx(seed, 'source_ranker', 'gpt-5.4'));
    assert.equal(out.ok, true);
  });

  it('proposeTopic rejects self-referencing relation via proposeRelation', async () => {
    const t = await proposeTopicTool.handler({
      title: 'Self', description: 'self ref test', iconKey: 'general', accentColor: 'slate',
      evidence: [{ segmentId: 'seg_pt_a' }],
    }, makeCtx(seed, 'topic_spotter', 'gpt-5.5'));
    if (!t.ok) throw new Error('seed topic failed');

    const rel = await proposeRelationTool.handler({
      fromFindingId: t.findingId,
      toFindingId: t.findingId,
      type: 'related_to',
      evidence: [{ segmentId: 'seg_pt_a' }],
    }, makeCtx(seed, 'topic_spotter', 'gpt-5.5'));
    assert.equal(rel.ok, false);
    if (!rel.ok) assert.match(rel.error, /self-reference/i);
  });

  it('proposeAhaMoment accepts single segment evidence', async () => {
    const out = await proposeAhaMomentTool.handler({
      quote: 'When you write you discover what you think.',
      context: 'This crystallizes the lesson that writing IS thinking, not just transcription.',
      evidence: { segmentId: 'seg_pt_a' },
    }, makeCtx(seed, 'aha_moment_detector', 'gpt-5.5'));
    assert.equal(out.ok, true);
  });

  it('proposeTopic input schema rejects >20 evidence segments', () => {
    const result = proposeTopicTool.input.safeParse({
      title: 'X', description: 'X',
      iconKey: 'productivity', accentColor: 'mint',
      evidence: Array.from({ length: 21 }, () => ({ segmentId: 'x' })),
    });
    assert.equal(result.success, false);
  });

  it('proposePlaybook input schema requires min 3 evidence segments', () => {
    const result = proposePlaybookTool.input.safeParse({
      title: 'X', summary: 'X',
      principles: [{ title: 'p', body: 'b' }],
      evidence: [{ segmentId: 'x' }, { segmentId: 'y' }],
    });
    assert.equal(result.success, false);
  });

  it('proposePlaybook rejects unknown buildsOnFindingIds without inserting anything', async () => {
    const before = await getDb().select().from(archiveFinding).where(eq(archiveFinding.runId, seed.runId));
    const beforeCount = before.length;

    const out = await proposePlaybookTool.handler({
      title: 'Bogus playbook',
      summary: 'Should not be inserted because the build_on target does not exist.',
      principles: [{ title: 'p', body: 'b' }],
      evidence: [{ segmentId: 'seg_pt_a' }, { segmentId: 'seg_pt_b' }, { segmentId: 'seg_pt_a' }],
      buildsOnFindingIds: ['fnd_doesnotexist'],
    }, makeCtx(seed, 'playbook_extractor', 'gpt-5.5'));

    assert.equal(out.ok, false);
    if (!out.ok) assert.match(out.error, /Unknown buildsOnFindingId/);

    const after = await getDb().select().from(archiveFinding).where(eq(archiveFinding.runId, seed.runId));
    assert.equal(after.length, beforeCount, 'no playbook should be inserted on validation failure');
  });

  it('insertFinding stores deduplicated evidenceSegmentIds', async () => {
    const out = await proposeLessonTool.handler({
      title: 'Dedupe test',
      summary: 'X',
      idea: 'A long enough idea passage to satisfy the schema minimum length requirement.',
      evidence: [{ segmentId: 'seg_pt_a' }, { segmentId: 'seg_pt_a' }, { segmentId: 'seg_pt_b' }],
    }, makeCtx(seed, 'lesson_extractor', 'gpt-5.5'));

    assert.equal(out.ok, true);
    if (out.ok) {
      const rows = await getDb().select().from(archiveFinding).where(eq(archiveFinding.id, out.findingId));
      const stored = rows[0]?.evidenceSegmentIds ?? [];
      assert.deepEqual(stored.sort(), ['seg_pt_a', 'seg_pt_b']);
    }
  });
});
