import { and, eq, getDb } from '@creatorcanon/db';
import {
  archiveFinding,
  archiveRelation,
  page,
  pageVersion,
  segment,
} from '@creatorcanon/db/schema';
import { composePage, type ComposedPage } from '../mergers/page-composer';
import { aggregateEvidence } from '../mergers/evidence-aggregator';
import { dedupeLessonFramework } from '../mergers/dedup';
import { collectHighlights } from '../mergers/highlights-collector';
import type { AgentProvider } from '../agents/providers';
import { selectModel } from '../agents/providers/selectModel';
import {
  createOpenAICompatibleProvider,
  resolveOpenAIProviderMode,
} from '../agents/providers/factory';
import { parseServerEnv } from '@creatorcanon/core';

function nano(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 10);
}

function evidenceQualityToSupportLabel(
  q: 'strong' | 'moderate' | 'limited' | 'unverified',
): 'strong' | 'review_recommended' | 'limited' {
  if (q === 'strong') return 'strong';
  if (q === 'limited') return 'limited';
  return 'review_recommended';
}

export interface MergeStageInput {
  runId: string;
  workspaceId: string;
  /** Optional: explicit polish provider for tests (pass null to disable polish). */
  polishProvider?: AgentProvider | null;
}

export interface MergeStageOutput {
  pageCount: number;
  highlightCount: number;
  droppedFindingIds: string[];
  relationsAdded: number;
}

export async function runMergeStage(input: MergeStageInput): Promise<MergeStageOutput> {
  const db = getDb();

  // Clear prior pages for idempotency. pageVersion cascades from page.
  await db.delete(pageVersion).where(eq(pageVersion.runId, input.runId));
  await db.delete(page).where(eq(page.runId, input.runId));

  // Load findings + relations for this run.
  const allFindings = await db
    .select()
    .from(archiveFinding)
    .where(eq(archiveFinding.runId, input.runId));
  const allRelations = await db
    .select()
    .from(archiveRelation)
    .where(eq(archiveRelation.runId, input.runId));

  // Clear prior dedup relations for idempotency before re-running.
  await db
    .delete(archiveRelation)
    .where(
      and(eq(archiveRelation.runId, input.runId), eq(archiveRelation.agent, 'page_composer_dedup')),
    );

  // Dedup lesson↔framework.
  const dedup = dedupeLessonFramework(allFindings);
  if (dedup.relationsToInsert.length > 0) {
    await db.insert(archiveRelation).values(
      dedup.relationsToInsert.map((r) => ({
        id: `rel_${nano()}`,
        runId: input.runId,
        agent: 'page_composer_dedup',
        model: 'n/a',
        fromFindingId: r.fromFindingId,
        toFindingId: r.toFindingId,
        type: r.type,
        evidenceSegmentIds: r.evidenceSegmentIds,
        notes: r.notes,
      })),
    );
  }

  const dropSet = new Set(dedup.dropFindingIds);
  const livingFindings = allFindings.filter((f) => !dropSet.has(f.id));
  const newRelationsForAggregation = dedup.relationsToInsert.map((r) => ({
    ...r,
    runId: input.runId,
    id: `pending_${nano()}`,
    agent: 'page_composer_dedup',
    model: 'n/a',
    notes: r.notes ?? null,
    createdAt: new Date(),
  })) as (typeof allRelations)[number][];
  const livingRelations = [...allRelations, ...newRelationsForAggregation];

  // Determine polish provider.
  let polishProvider: AgentProvider | null;
  if (input.polishProvider === null) {
    // Explicitly disabled (e.g., tests).
    polishProvider = null;
  } else if (input.polishProvider !== undefined) {
    // Explicit provider passed in.
    polishProvider = input.polishProvider;
  } else {
    // Build from env.
    try {
      const env = parseServerEnv(process.env);
      polishProvider =
        env.OPENAI_API_KEY || resolveOpenAIProviderMode(process.env) === 'codex_cli'
          ? createOpenAICompatibleProvider(process.env)
          : null;
    } catch {
      polishProvider = null;
    }
  }
  const polishModel = selectModel('page_composer', process.env);

  // Compose pages from primary findings (lesson, framework, playbook).
  const primaryTypes = new Set(['lesson', 'framework', 'playbook']);
  const composed: ComposedPage[] = [];
  for (const f of livingFindings) {
    if (!primaryTypes.has(f.type)) continue;
    const related = livingRelations
      .filter((r) => r.fromFindingId === f.id || r.toFindingId === f.id)
      .map((r) =>
        livingFindings.find(
          (g) => g.id === (r.fromFindingId === f.id ? r.toFindingId : r.fromFindingId),
        ),
      )
      .filter((g): g is (typeof livingFindings)[0] => !!g);

    composed.push(
      await composePage({
        primary: f,
        related,
        relations: livingRelations.filter(
          (r) => r.fromFindingId === f.id || r.toFindingId === f.id,
        ),
        polishProvider,
        polishModel: polishModel.modelId,
      }),
    );
  }

  // Aggregate evidence stats across pages.
  const stats = aggregateEvidence({
    pages: composed.map((c) => ({
      id: c.id,
      sections: c.sections.map((s) => ({ citations: s.citations })),
      primaryFindingId: c.primaryFindingId,
      supportingFindingIds: c.supportingFindingIds,
    })),
    findings: livingFindings,
    relations: livingRelations,
  });

  // Persist page + pageVersion rows, sorted by title for determinism.
  composed.sort((a, b) => a.title.localeCompare(b.title));
  let position = 0;
  for (const c of composed) {
    const pageId = c.id;
    const versionId = `pv_${nano()}`;
    const pageStats = stats.byPageId[c.id]!;

    await db.insert(page).values({
      id: pageId,
      workspaceId: input.workspaceId,
      runId: input.runId,
      slug: c.slug,
      pageType: c.type,
      position: position++,
      supportLabel: evidenceQualityToSupportLabel(pageStats.evidenceQuality),
      currentVersionId: versionId,
    });

    const blockTree = {
      blocks: c.sections.map((sec, i) => ({
        type: sec.kind as string,
        id: `blk_${i}`,
        content: (({ kind: _kind, citations: _citations, ...rest }) => rest)(sec as any),
        citations: sec.citations,
      })),
      atlasMeta: {
        evidenceQuality: pageStats.evidenceQuality,
        citationCount: pageStats.citationCount,
        sourceCoveragePercent: pageStats.sourceCoveragePercent,
        relatedPageIds: pageStats.relatedPageIds,
        hero: c.hero,
        evidenceSegmentIds: c.evidenceSegmentIds,
        primaryFindingId: c.primaryFindingId,
        supportingFindingIds: c.supportingFindingIds,
      },
    } as any;

    await db.insert(pageVersion).values({
      id: versionId,
      workspaceId: input.workspaceId,
      pageId,
      runId: input.runId,
      version: 1,
      title: c.title,
      summary: c.summary,
      blockTreeJson: blockTree,
      isCurrent: true,
    });
  }

  // Collect highlights for orphan quotes/aha_moments.
  const segments = await db
    .select({ id: segment.id, videoId: segment.videoId, startMs: segment.startMs })
    .from(segment)
    .where(eq(segment.runId, input.runId));
  const segmentLookup: Record<string, { videoId: string; startMs: number }> = {};
  for (const s of segments) segmentLookup[s.id] = { videoId: s.videoId, startMs: s.startMs };

  const highlights = collectHighlights({
    findings: livingFindings,
    relations: livingRelations,
    publishedPageFindingIds: new Set(composed.map((c) => c.primaryFindingId)),
    segmentLookup,
  });

  return {
    pageCount: composed.length,
    highlightCount: highlights.length,
    droppedFindingIds: dedup.dropFindingIds,
    relationsAdded: dedup.relationsToInsert.length,
  };
}
