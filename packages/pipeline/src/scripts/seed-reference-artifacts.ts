/**
 * Operator one-off: consolidate VIC content into 5 reference canon nodes
 * (glossary, quote anthology, credibility numbers, mistakes catalog, tools
 * index). Pure data work — no LLM calls. Idempotent: re-running deletes
 * any prior reference nodes for the run before re-creating.
 *
 * The reference nodes are stored as canon_node rows with type='topic' and
 * payload.kind='reference_*' so downstream display layers can recognise
 * them and render them differently from regular topic nodes.
 *
 * Usage (from packages/pipeline):
 *   tsx ./src/scripts/seed-reference-artifacts.ts <runId>
 */

import crypto from 'node:crypto';
import { and, closeDb, eq, getDb, inArray } from '@creatorcanon/db';
import { canonNode, generationRun, videoIntelligenceCard } from '@creatorcanon/db/schema';
import { loadDefaultEnvFiles } from '../env-files';

loadDefaultEnvFiles();

interface VicPayload {
  termsDefined?: Array<{ term?: string; definition?: string }>;
  quotes?: string[];
  examples?: string[];
  stories?: string[];
  strongClaims?: string[];
  mistakesToAvoid?: Array<{ mistake?: string; why?: string; correction?: string }>;
  toolsMentioned?: string[];
  [k: string]: unknown;
}

const NUMBER_PATTERN = /(\$[\d,]+(?:\.\d+)?[KMB]?|\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?\s*(?:percent|%|hours|years|locations|videos|ads|months|days|seconds|minutes|tickets|agreements|million|billion|thousand))/gi;

async function main() {
  const runId = process.argv[2];
  if (!runId) throw new Error('Usage: tsx ./src/scripts/seed-reference-artifacts.ts <runId>');

  const db = getDb();
  const run = (await db.select().from(generationRun).where(eq(generationRun.id, runId)).limit(1))[0];
  if (!run) throw new Error(`Run ${runId} not found`);

  // Idempotency: clear prior reference nodes for this run.
  const priorRefs = await db
    .select({ id: canonNode.id })
    .from(canonNode)
    .where(and(eq(canonNode.runId, runId), eq(canonNode.type, 'topic')));
  if (priorRefs.length > 0) {
    const refIds = priorRefs.map((r) => r.id);
    // Conservative — only delete rows whose payload.kind starts with 'reference_'
    const refRows = await db.select({ id: canonNode.id, payload: canonNode.payload }).from(canonNode).where(inArray(canonNode.id, refIds));
    const toDelete = refRows.filter((r) => typeof (r.payload as { kind?: string })?.kind === 'string' && (r.payload as { kind: string }).kind.startsWith('reference_')).map((r) => r.id);
    if (toDelete.length > 0) {
      await db.delete(canonNode).where(inArray(canonNode.id, toDelete));
      console.info(`[ref-artifacts] cleared ${toDelete.length} prior reference nodes`);
    }
  }

  const vicRows = await db
    .select({ videoId: videoIntelligenceCard.videoId, payload: videoIntelligenceCard.payload, evidenceSegmentIds: videoIntelligenceCard.evidenceSegmentIds })
    .from(videoIntelligenceCard)
    .where(eq(videoIntelligenceCard.runId, runId));
  if (vicRows.length === 0) throw new Error('No VICs in run; can\'t consolidate references');

  const allEvidence = vicRows.flatMap((r) => r.evidenceSegmentIds ?? []);
  const allSourceVideoIds = vicRows.map((r) => r.videoId);

  // ── Glossary ────────────────────────────────────────────────────────
  const glossaryByTerm = new Map<string, string>();
  for (const row of vicRows) {
    const p = row.payload as VicPayload;
    for (const t of p.termsDefined ?? []) {
      const term = (t.term ?? '').trim();
      const def = (t.definition ?? '').trim();
      if (!term || !def) continue;
      // Keep the first non-trivial definition for each unique term.
      if (!glossaryByTerm.has(term.toLowerCase())) glossaryByTerm.set(term.toLowerCase(), `${term} — ${def}`);
    }
  }
  const glossaryEntries = [...glossaryByTerm.values()].sort();

  // ── Quote anthology ─────────────────────────────────────────────────
  const quoteSet = new Set<string>();
  for (const row of vicRows) {
    const p = row.payload as VicPayload;
    for (const q of p.quotes ?? []) {
      const cleaned = q.replace(/^[\s"'""]+|[\s"'""]+$/g, '').trim();
      if (cleaned.length >= 10 && cleaned.length <= 280) quoteSet.add(cleaned);
    }
  }
  const allQuotes = [...quoteSet];

  // ── Credibility numbers (regex-extract numeric proof from examples + stories + claims) ─────
  const numberSet = new Set<string>();
  for (const row of vicRows) {
    const p = row.payload as VicPayload;
    const haystack = [...(p.examples ?? []), ...(p.stories ?? []), ...(p.strongClaims ?? [])].join('\n');
    const matches = haystack.match(NUMBER_PATTERN) ?? [];
    for (const m of matches) numberSet.add(m.trim());
  }
  // Also pull verbatim "by-the-numbers" sentences from strongClaims (claims with a number in them)
  const claimsWithNumbers = new Set<string>();
  for (const row of vicRows) {
    const p = row.payload as VicPayload;
    for (const c of p.strongClaims ?? []) {
      if (NUMBER_PATTERN.test(c) && c.length >= 20 && c.length <= 280) claimsWithNumbers.add(c.trim());
      NUMBER_PATTERN.lastIndex = 0;
    }
  }

  // ── Mistakes catalog ────────────────────────────────────────────────
  const mistakes: Array<{ mistake: string; why: string; correction: string }> = [];
  for (const row of vicRows) {
    const p = row.payload as VicPayload;
    for (const m of p.mistakesToAvoid ?? []) {
      const mistake = (m.mistake ?? '').trim();
      const why = (m.why ?? '').trim();
      const correction = (m.correction ?? '').trim();
      if (mistake && why && correction) mistakes.push({ mistake, why, correction });
    }
  }

  // ── Tools index ─────────────────────────────────────────────────────
  const toolSet = new Set<string>();
  for (const row of vicRows) {
    const p = row.payload as VicPayload;
    for (const t of p.toolsMentioned ?? []) {
      const cleaned = t.trim();
      if (cleaned.length > 0) toolSet.add(cleaned);
    }
  }
  const allTools = [...toolSet].sort();

  // ── Write 5 reference canon nodes ───────────────────────────────────
  type RefSpec = {
    kind: string;
    title: string;
    summary: string;
    payload: Record<string, unknown>;
    pageWorthinessScore: number;
  };
  const refs: RefSpec[] = [
    {
      kind: 'reference_glossary',
      title: 'Hormozi Glossary',
      summary: `${glossaryEntries.length} defined terms drawn from across the run, deduped and alphabetised.`,
      payload: { kind: 'reference_glossary', entries: glossaryEntries },
      pageWorthinessScore: 70,
    },
    {
      kind: 'reference_quotes',
      title: 'Hormozi Quote Anthology',
      summary: `${allQuotes.length} verbatim quotes pulled from the 6 videos in this run.`,
      payload: { kind: 'reference_quotes', quotes: allQuotes },
      pageWorthinessScore: 75,
    },
    {
      kind: 'reference_numbers',
      title: 'Hormozi by the Numbers',
      summary: `Credibility data block: ${numberSet.size} numeric proof points and ${claimsWithNumbers.size} numbered claims aggregated from the run for use as page anchors.`,
      payload: { kind: 'reference_numbers', numbers: [...numberSet], claims: [...claimsWithNumbers] },
      pageWorthinessScore: 80,
    },
    {
      kind: 'reference_mistakes',
      title: 'Hormozi Mistakes Catalog',
      summary: `${mistakes.length} mistake/why/correction triplets aggregated from across the videos.`,
      payload: { kind: 'reference_mistakes', mistakes },
      pageWorthinessScore: 78,
    },
    {
      kind: 'reference_tools',
      title: 'Hormozi Tools Index',
      summary: `${allTools.length} tools and products mentioned across the run.`,
      payload: { kind: 'reference_tools', tools: allTools },
      pageWorthinessScore: 60,
    },
  ];

  for (const ref of refs) {
    const id = `cn_${crypto.randomUUID().slice(0, 12)}`;
    await db.insert(canonNode).values({
      id,
      workspaceId: run.workspaceId,
      runId,
      type: 'topic',
      payload: { ...ref.payload, title: ref.title, summary: ref.summary } as Record<string, unknown>,
      evidenceSegmentIds: allEvidence.slice(0, 50),
      sourceVideoIds: allSourceVideoIds,
      evidenceQuality: 'high',
      origin: 'derived',
      confidenceScore: 95,
      pageWorthinessScore: ref.pageWorthinessScore,
      specificityScore: 70,
      creatorUniquenessScore: 70,
      citationCount: Math.min(allEvidence.length, 50),
      sourceCoverage: allSourceVideoIds.length,
    });
    console.info(`[ref-artifacts] wrote ${ref.kind}: ${ref.title}`);
  }

  await closeDb();
}

main().catch(async (err) => { await closeDb(); console.error('[ref-artifacts] FAILED', err); process.exit(1); });
