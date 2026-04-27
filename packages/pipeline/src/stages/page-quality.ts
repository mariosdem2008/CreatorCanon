import { eq, inArray } from '@creatorcanon/db';
import { page, pageVersion, pageQualityReport, segment, visualMoment } from '@creatorcanon/db/schema';
import { getDb } from '@creatorcanon/db';
import type { StageContext } from '../harness';

export interface PageQualityStageInput {
  runId: string;
  workspaceId: string;
}

export interface PageQualityStageOutput {
  pagesEvaluated: number;
  pagesPublishable: number;
  pagesRevise: number;
  pagesFail: number;
}

const THRESHOLDS = {
  minimumCitationsPerPage: 3,
  minimumCitedSections: 2,
  minimumBodyChars: 1200,
  maximumEmptySections: 0,
  /** Visual blocks (callout w/ _visualMomentId) do NOT count toward this. */
  minimumTranscriptCitedSections: 3,
} as const;

const GENERIC_PHRASES = [
  'in conclusion', 'as we have seen', "as we've seen", 'in summary', 'all things considered',
  'at the end of the day', 'when all is said and done', 'needless to say',
  'it is worth noting', 'it goes without saying', 'simply put',
];

const GENERIC_TITLES = ['untitled', 'page', 'lesson', 'framework', 'playbook'];

interface BlockShape {
  type: string;
  content: Record<string, unknown>;
  citations?: string[];
}

export async function runPageQualityStage(input: PageQualityStageInput): Promise<PageQualityStageOutput> {
  const db = getDb();

  // Idempotency.
  await db.delete(pageQualityReport).where(eq(pageQualityReport.runId, input.runId));

  const pages = await db.select().from(page).where(eq(page.runId, input.runId));
  const versions = await db.select().from(pageVersion).where(eq(pageVersion.runId, input.runId));
  const versionByPageId = new Map(versions.map((v) => [v.pageId, v]));

  // Resolve all cited segments in one query so per-page checks are O(1).
  const allCitedSegIds = new Set<string>();
  for (const v of versions) {
    const tree = v.blockTreeJson as { blocks?: Array<{ citations?: string[] }> };
    for (const b of tree.blocks ?? []) for (const id of b.citations ?? []) allCitedSegIds.add(id);
  }
  const validSegRows = allCitedSegIds.size
    ? await db
        .select({ id: segment.id, videoId: segment.videoId })
        .from(segment)
        .where(inArray(segment.id, [...allCitedSegIds]))
    : [];
  const validSegSet = new Set(validSegRows.map((s) => s.id));
  const segVideoMap = new Map(validSegRows.map((s) => [s.id, s.videoId]));

  // Collect all referenced visual moment IDs from block.content._visualMomentId.
  const allVmIds = new Set<string>();
  for (const v of versions) {
    const tree = v.blockTreeJson as { blocks?: Array<{ content?: Record<string, unknown> }> };
    for (const b of tree.blocks ?? []) {
      const vmId = (b.content as { _visualMomentId?: string } | undefined)?._visualMomentId;
      if (vmId) allVmIds.add(vmId);
    }
  }
  const vmRows = allVmIds.size
    ? await db
        .select({ id: visualMoment.id, score: visualMoment.usefulnessScore })
        .from(visualMoment)
        .where(inArray(visualMoment.id, [...allVmIds]))
    : [];
  const vmById = new Map(vmRows.map((v) => [v.id, v]));

  // Duplicate-detection counts.
  const slugCount = new Map<string, number>();
  const titleCount = new Map<string, number>();
  for (const p of pages) slugCount.set(p.slug, (slugCount.get(p.slug) ?? 0) + 1);
  for (const v of versions) titleCount.set(v.title, (titleCount.get(v.title) ?? 0) + 1);

  const out: PageQualityStageOutput = {
    pagesEvaluated: 0,
    pagesPublishable: 0,
    pagesRevise: 0,
    pagesFail: 0,
  };

  for (const p of pages) {
    const v = versionByPageId.get(p.id);
    if (!v) continue;
    out.pagesEvaluated += 1;

    const tree = v.blockTreeJson as { blocks?: BlockShape[]; atlasMeta?: Record<string, unknown> };
    const blocks: BlockShape[] = tree.blocks ?? [];

    const visualBlocks = blocks.filter(
      (b) => Boolean((b.content as { _visualMomentId?: string })._visualMomentId),
    );
    const transcriptBlocks = blocks.filter(
      (b) => !((b.content as { _visualMomentId?: string })._visualMomentId),
    );

    const checks: Record<string, { pass: boolean; detail?: string }> = {};

    const allCites = blocks.flatMap((b) => b.citations ?? []);
    const validCites = allCites.filter((id) => validSegSet.has(id));
    checks.citationCount = { pass: validCites.length >= THRESHOLDS.minimumCitationsPerPage };

    const transcriptCitedSections = transcriptBlocks.filter(
      (b) => (b.citations ?? []).some((id) => validSegSet.has(id)),
    ).length;
    checks.transcriptCitedSections = {
      pass: transcriptCitedSections >= THRESHOLDS.minimumTranscriptCitedSections,
      detail: `${transcriptCitedSections} transcript-cited sections`,
    };

    const emptySections = blocks.filter(isSectionEmpty).length;
    checks.emptySections = { pass: emptySections <= THRESHOLDS.maximumEmptySections };

    const totalBodyChars = sumBodyChars(blocks);
    checks.bodyLength = { pass: totalBodyChars >= THRESHOLDS.minimumBodyChars };

    const invalidCites = allCites.length - validCites.length;
    checks.citationOwnership = { pass: invalidCites === 0 };

    const meta = (tree.atlasMeta ?? {}) as {
      readerProblem?: string;
      promisedOutcome?: string;
      whyThisMatters?: string;
    };
    checks.readerProblemPresent = {
      pass: typeof meta.readerProblem === 'string' && meta.readerProblem.length > 10,
    };
    checks.promisedOutcomePresent = {
      pass: typeof meta.promisedOutcome === 'string' && meta.promisedOutcome.length > 10,
    };

    checks.titleNotGeneric = { pass: !GENERIC_TITLES.includes(v.title.toLowerCase().trim()) };
    checks.duplicateSlug = { pass: (slugCount.get(p.slug) ?? 0) === 1 };
    checks.duplicateTitle = { pass: (titleCount.get(v.title) ?? 0) === 1 };

    const allText = blocks.map((b) => JSON.stringify(b.content)).join(' ').toLowerCase();
    const genericHits = GENERIC_PHRASES.filter((ph) => allText.includes(ph)).length;
    const genericLanguageScore = Math.min(100, genericHits * 5);

    // Visual block validation: every referenced visual moment must exist + score >=60.
    let visualMomentExists = true;
    for (const vb of visualBlocks) {
      const vmId = (vb.content as { _visualMomentId?: string })._visualMomentId;
      if (!vmId) continue;
      const vm = vmById.get(vmId);
      if (!vm || vm.score < 60) {
        visualMomentExists = false;
        break;
      }
    }
    if (visualBlocks.length > 0) {
      checks.visualMomentExists = { pass: visualMomentExists };
    }

    const distinctSourceVideos = new Set<string>();
    for (const id of validCites) {
      const vid = segVideoMap.get(id);
      if (vid) distinctSourceVideos.add(vid);
    }

    const pass = Object.values(checks).every((c) => c.pass);
    const recommendation: 'publish' | 'revise' | 'fail' = pass
      ? 'publish'
      : checks.bodyLength.pass && checks.citationCount.pass && checks.citationOwnership.pass
      ? 'revise'
      : 'fail';
    if (recommendation === 'publish') out.pagesPublishable += 1;
    else if (recommendation === 'revise') out.pagesRevise += 1;
    else out.pagesFail += 1;

    const evidenceScore = Math.max(
      0,
      (validCites.length >= 8 ? 100 : validCites.length >= 5 ? 80 : validCites.length >= 3 ? 60 : 30) -
        (invalidCites > 0 ? 20 : 0),
    );

    await db.insert(pageQualityReport).values({
      id: `pqr_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`,
      workspaceId: input.workspaceId,
      runId: input.runId,
      pageId: p.id,
      evidenceScore,
      citationCount: validCites.length,
      distinctSourceVideos: distinctSourceVideos.size,
      emptySectionCount: emptySections,
      unsupportedClaimCount: invalidCites,
      genericLanguageScore,
      recommendation,
      payload: {
        checks,
        totalBodyChars,
        transcriptCitedSections,
        visualBlockCount: visualBlocks.length,
      },
    });
  }

  return out;
}

export async function validatePageQualityMaterialization(
  _output: PageQualityStageOutput,
  ctx: StageContext,
): Promise<boolean> {
  const db = getDb();
  const reports = await db
    .select({ id: pageQualityReport.id })
    .from(pageQualityReport)
    .where(eq(pageQualityReport.runId, ctx.runId));
  const pages = await db.select({ id: page.id }).from(page).where(eq(page.runId, ctx.runId));
  return reports.length === pages.length;
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function isSectionEmpty(b: BlockShape): boolean {
  const c = b.content as { body?: string; items?: unknown[]; schedule?: unknown[] };
  if (typeof c.body === 'string' && c.body.trim().length > 0) return false;
  if (Array.isArray(c.items) && c.items.length > 0) return false;
  if (Array.isArray(c.schedule) && c.schedule.length > 0) return false;
  return true;
}

function sumBodyChars(blocks: BlockShape[]): number {
  let n = 0;
  for (const b of blocks) {
    const c = b.content as {
      body?: string;
      items?: Array<{ body?: string } | string>;
      schedule?: Array<{ items?: string[] }>;
    };
    if (typeof c.body === 'string') n += c.body.length;
    if (Array.isArray(c.items)) {
      for (const it of c.items) {
        if (typeof it === 'string') n += it.length;
        else if (typeof it === 'object' && it && typeof it.body === 'string') n += it.body.length;
      }
    }
    if (Array.isArray(c.schedule)) {
      for (const s of c.schedule) for (const i of s.items ?? []) n += String(i).length;
    }
  }
  return n;
}
