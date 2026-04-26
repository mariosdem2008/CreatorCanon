import { before, after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadDefaultEnvFiles } from '../../env-files';
import { runMergeStage } from '../merge';
import { _resetRegistryForTests, registerAllTools } from '../../agents/tools/registry';
import {
  proposeTopicTool,
  proposeFrameworkTool,
  proposeLessonTool,
  proposeQuoteTool,
  proposeRelationTool,
} from '../../agents/tools/propose';
import {
  seedTestRun,
  teardownTestRun,
  makeCtx,
  type SeedResult,
} from '../../../test-helpers/fixtures';
import { eq, getDb } from '@creatorcanon/db';
import { page, pageVersion } from '@creatorcanon/db/schema';

describe('runMergeStage', () => {
  let seed: SeedResult;
  let lessonId: string;
  let frameworkId: string;
  let orphanQuoteId: string;
  let attachedQuoteId: string;

  before(async () => {
    loadDefaultEnvFiles();
    _resetRegistryForTests();
    registerAllTools();
    seed = await seedTestRun({
      videos: [
        { id: 'vid_m_v1', title: 'X', durationSec: 600 },
        { id: 'vid_m_v2', title: 'Y', durationSec: 600 },
      ],
      segments: [
        { id: 'seg_m_a', videoId: 'vid_m_v1', startMs: 0, endMs: 30_000, text: 'A' },
        { id: 'seg_m_b', videoId: 'vid_m_v1', startMs: 30_000, endMs: 60_000, text: 'B' },
        { id: 'seg_m_c', videoId: 'vid_m_v2', startMs: 0, endMs: 30_000, text: 'C' },
      ],
    });

    // Seed: 1 lesson + 1 framework (different concepts so dedup doesn't fire) + 2 quotes
    // (one orphan, one attached).
    const lesson = await proposeLessonTool.handler(
      {
        title: 'Treat writing as thinking',
        summary: 'A short summary describing the idea.',
        idea: 'When you write you discover what you think; the page is a partner in reasoning.',
        evidence: [{ segmentId: 'seg_m_a' }, { segmentId: 'seg_m_c' }],
      },
      makeCtx(seed, 'lesson_extractor', 'gpt-5.5'),
    );
    if (!lesson.ok) throw new Error('seed lesson');
    lessonId = lesson.findingId;

    const fw = await proposeFrameworkTool.handler(
      {
        title: 'Eisenhower Matrix',
        summary: 'Quadrants for prioritization by urgency and importance.',
        principles: [{ title: 'Urgency', body: 'Distinguish from importance.' }],
        evidence: [{ segmentId: 'seg_m_b' }, { segmentId: 'seg_m_c' }],
      },
      makeCtx(seed, 'framework_extractor', 'gpt-5.5'),
    );
    if (!fw.ok) throw new Error('seed framework');
    frameworkId = fw.findingId;

    const attached = await proposeQuoteTool.handler(
      {
        text: 'Writing is the act of thinking on paper.',
        evidence: { segmentId: 'seg_m_a' },
      },
      makeCtx(seed, 'quote_finder', 'gpt-5.5'),
    );
    if (!attached.ok) throw new Error('seed attached quote');
    attachedQuoteId = attached.findingId;

    // Link the attached quote to the lesson.
    await proposeRelationTool.handler(
      {
        fromFindingId: attachedQuoteId,
        toFindingId: lessonId,
        type: 'supports',
        evidence: [{ segmentId: 'seg_m_a' }],
      },
      makeCtx(seed, 'quote_finder', 'gpt-5.5'),
    );

    const orphan = await proposeQuoteTool.handler(
      {
        text: 'A pithy quote nobody attached to anything.',
        evidence: { segmentId: 'seg_m_b' },
      },
      makeCtx(seed, 'quote_finder', 'gpt-5.5'),
    );
    if (!orphan.ok) throw new Error('seed orphan');
    orphanQuoteId = orphan.findingId;
  });

  after(async () => {
    await teardownTestRun(seed);
  });

  it('persists exactly 2 pages (lesson + framework, not the quotes)', async () => {
    const result = await runMergeStage({
      runId: seed.runId,
      workspaceId: seed.workspaceId,
      polishProvider: null,
    });
    assert.equal(result.pageCount, 2);
    const pages = await getDb().select().from(page).where(eq(page.runId, seed.runId));
    assert.equal(pages.length, 2);
    const types = pages.map((p) => p.pageType).sort();
    assert.deepEqual(types, ['framework', 'lesson']);
  });

  it('persists pageVersion with sections + atlasMeta', async () => {
    // Re-uses the same seeded data; the previous test's pages are still in the DB.
    const versions = await getDb()
      .select()
      .from(pageVersion)
      .where(eq(pageVersion.runId, seed.runId));
    assert.ok(versions.length >= 2);
    const v = versions[0]!;
    assert.ok((v.blockTreeJson as any).blocks.length > 0);
    assert.ok((v.blockTreeJson as any).atlasMeta);
    assert.ok(typeof (v.blockTreeJson as any).atlasMeta.evidenceQuality === 'string');
  });

  it('returns highlightCount counting orphan quotes', async () => {
    // After the merge, the lesson page exists but the orphan quote is unattached.
    // collectHighlights should pick up the orphan.
    const result = await runMergeStage({
      runId: seed.runId,
      workspaceId: seed.workspaceId,
      polishProvider: null,
    });
    assert.ok(result.highlightCount >= 1);
  });
});
