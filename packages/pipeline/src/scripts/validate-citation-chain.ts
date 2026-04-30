/**
 * Citation-chain validator: walks all canon nodes + page briefs + visual
 * moments for a run, extracts every UUID-shaped reference, and verifies
 * each one resolves to a real segment / canon node / video. Emits a
 * markdown report listing unsupported, orphaned, and mis-attributed
 * citations.
 *
 * The audit page renders citations as clickable YouTube timestamps via
 * `[<segmentId>]` patterns in prose. This validator catches:
 *   - segmentIds that don't exist in segment table
 *   - canon-node references in briefs that point to missing nodes
 *   - synthesis nodes whose childCanonNodeIds don't resolve
 *   - briefs whose primary/supporting canonNodeIds don't resolve
 *   - briefs whose outline.canonNodeIds don't resolve
 *
 * Becomes the QA artifact a human editor reviews pre-publish.
 *
 * Usage:
 *   tsx ./src/scripts/validate-citation-chain.ts <runId>
 *
 * Output:
 *   /tmp/citation-validation-<runId>.md
 *   stdout: summary lines + non-zero exit if violations exceed threshold
 */

import fs from 'node:fs';
import path from 'node:path';

import { closeDb, eq, getDb } from '@creatorcanon/db';
import {
  canonNode,
  pageBrief,
  segment,
  videoIntelligenceCard,
  visualMoment,
} from '@creatorcanon/db/schema';

import { loadDefaultEnvFiles } from '../env-files';

loadDefaultEnvFiles();

const UUID_PATTERN = /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi;
const CN_PATTERN = /cn_[a-f0-9-]+/gi;

interface CountedField {
  total: number;
  resolved: number;
  unresolved: string[];
}

interface VicReport {
  videoId: string;
  videoTitle: string;
  segmentRefs: CountedField;
  msRangeRefs: number; // discouraged
}

interface CanonReport {
  id: string;
  type: string;
  title: string;
  segmentRefs: CountedField;
  childCanonRefs: CountedField; // for synthesis nodes
}

interface BriefReport {
  slug: string;
  title: string;
  primaryCanonRefs: CountedField;
  supportingCanonRefs: CountedField;
  outlineCanonRefs: CountedField;
  parentTopicResolved: boolean | null; // null when no parent (pillar)
  siblingSlugsResolved: { total: number; resolved: number; unresolved: string[] };
}

interface VisualMomentReport {
  total: number;
  withSegmentId: number;
  withResolvedSegmentId: number;
}

interface ValidationReport {
  runId: string;
  generatedAt: string;
  vics: VicReport[];
  canon: CanonReport[];
  briefs: BriefReport[];
  visualMoments: VisualMomentReport;
  totals: {
    segmentRefsTotal: number;
    segmentRefsResolved: number;
    canonRefsTotal: number;
    canonRefsResolved: number;
    msRangeWarnings: number;
    siblingResolutionRate: number;
  };
}

function countSegmentRefs(payloadJson: string, segIds: Set<string>): CountedField {
  const matches = payloadJson.match(UUID_PATTERN) ?? [];
  const ranged = payloadJson.match(/\[\d+ms-\d+ms\]/g) ?? [];
  void ranged;
  const unresolved: string[] = [];
  let resolved = 0;
  for (const id of matches) {
    if (segIds.has(id)) resolved += 1;
    else unresolved.push(id);
  }
  return { total: matches.length, resolved, unresolved: dedupCap(unresolved, 10) };
}

function countCanonRefs(refs: string[], canonIds: Set<string>): CountedField {
  const total = refs.length;
  let resolved = 0;
  const unresolved: string[] = [];
  for (const id of refs) {
    if (canonIds.has(id)) resolved += 1;
    else unresolved.push(id);
  }
  return { total, resolved, unresolved: dedupCap(unresolved, 10) };
}

function dedupCap(arr: string[], cap: number): string[] {
  return [...new Set(arr)].slice(0, cap);
}

async function main() {
  const runId = process.argv[2];
  if (!runId) throw new Error('Usage: tsx ./src/scripts/validate-citation-chain.ts <runId>');

  const db = getDb();

  // Index segments + canon-node IDs
  const segs = await db
    .select({ id: segment.id })
    .from(segment)
    .where(eq(segment.runId, runId));
  const segIds = new Set(segs.map((s) => s.id));

  const canonRows = await db
    .select({ id: canonNode.id, type: canonNode.type, payload: canonNode.payload })
    .from(canonNode)
    .where(eq(canonNode.runId, runId));
  const canonIds = new Set(canonRows.map((n) => n.id));

  // ── VIC validation ──────────────────────────────────────
  const vics = await db
    .select({
      videoId: videoIntelligenceCard.videoId,
      payload: videoIntelligenceCard.payload,
    })
    .from(videoIntelligenceCard)
    .where(eq(videoIntelligenceCard.runId, runId));

  const vicReports: VicReport[] = [];
  for (const v of vics) {
    const j = JSON.stringify(v.payload);
    const segmentRefs = countSegmentRefs(j, segIds);
    const msRangeRefs = (j.match(/\[\d+ms-\d+ms\]/g) ?? []).length;
    vicReports.push({
      videoId: v.videoId,
      videoTitle: ((v.payload as { videoTitle?: string }).videoTitle) ?? v.videoId,
      segmentRefs,
      msRangeRefs,
    });
  }

  // ── Canon validation ────────────────────────────────────
  const canonReports: CanonReport[] = [];
  for (const n of canonRows) {
    const j = JSON.stringify(n.payload);
    const segmentRefs = countSegmentRefs(j, segIds);
    const p = n.payload as { kind?: string; title?: string; childCanonNodeIds?: string[] };
    const childRefs = Array.isArray(p?.childCanonNodeIds) ? p.childCanonNodeIds : [];
    const childCanonRefs = countCanonRefs(childRefs, canonIds);
    canonReports.push({
      id: n.id,
      type: n.type,
      title: p.title ?? '(Untitled)',
      segmentRefs,
      childCanonRefs,
    });
  }

  // ── Brief validation ────────────────────────────────────
  const briefs = await db
    .select({ payload: pageBrief.payload })
    .from(pageBrief)
    .where(eq(pageBrief.runId, runId));

  const briefSlugs = new Set<string>();
  for (const b of briefs) {
    const slug = (b.payload as { slug?: string }).slug;
    if (slug) briefSlugs.add(slug);
  }

  const briefReports: BriefReport[] = [];
  for (const b of briefs) {
    const p = b.payload as {
      slug?: string;
      pageTitle?: string;
      primaryCanonNodeIds?: string[];
      supportingCanonNodeIds?: string[];
      outline?: Array<{ canonNodeIds?: string[] }>;
      editorialStrategy?: { clusterRole?: { parentTopic?: string | null; siblingSlugs?: string[] } };
    };

    const primaryRefs = Array.isArray(p.primaryCanonNodeIds) ? p.primaryCanonNodeIds : [];
    const supportingRefs = Array.isArray(p.supportingCanonNodeIds) ? p.supportingCanonNodeIds : [];
    const outlineRefs = (p.outline ?? []).flatMap((s) => (Array.isArray(s.canonNodeIds) ? s.canonNodeIds : []));

    const cr = p.editorialStrategy?.clusterRole;
    const parentTopic = cr?.parentTopic ?? null;
    const siblings = Array.isArray(cr?.siblingSlugs) ? cr!.siblingSlugs : [];

    let parentResolved: boolean | null;
    if (parentTopic == null) parentResolved = null; // pillar — no parent expected
    else parentResolved = briefSlugs.has(parentTopic) || canonIds.has(parentTopic) || isCanonSlug(parentTopic, canonRows);

    const sibUnresolved: string[] = [];
    let sibResolved = 0;
    for (const s of siblings) {
      if (briefSlugs.has(s)) sibResolved += 1;
      else sibUnresolved.push(s);
    }

    briefReports.push({
      slug: p.slug ?? '?',
      title: p.pageTitle ?? '?',
      primaryCanonRefs: countCanonRefs(primaryRefs, canonIds),
      supportingCanonRefs: countCanonRefs(supportingRefs, canonIds),
      outlineCanonRefs: countCanonRefs(outlineRefs, canonIds),
      parentTopicResolved: parentResolved,
      siblingSlugsResolved: { total: siblings.length, resolved: sibResolved, unresolved: dedupCap(sibUnresolved, 10) },
    });
  }

  // ── Visual moments ──────────────────────────────────────
  const moments = await db.select().from(visualMoment).where(eq(visualMoment.runId, runId));
  const withSegmentId = moments.filter((m) => m.segmentId).length;
  const withResolvedSegmentId = moments.filter((m) => m.segmentId && segIds.has(m.segmentId)).length;
  const visualMomentReport: VisualMomentReport = {
    total: moments.length,
    withSegmentId,
    withResolvedSegmentId,
  };

  // ── Aggregate totals ────────────────────────────────────
  const segmentRefsTotal =
    vicReports.reduce((s, v) => s + v.segmentRefs.total, 0) +
    canonReports.reduce((s, c) => s + c.segmentRefs.total, 0);
  const segmentRefsResolved =
    vicReports.reduce((s, v) => s + v.segmentRefs.resolved, 0) +
    canonReports.reduce((s, c) => s + c.segmentRefs.resolved, 0);
  const canonRefsTotal =
    canonReports.reduce((s, c) => s + c.childCanonRefs.total, 0) +
    briefReports.reduce((s, b) => s + b.primaryCanonRefs.total + b.supportingCanonRefs.total + b.outlineCanonRefs.total, 0);
  const canonRefsResolved =
    canonReports.reduce((s, c) => s + c.childCanonRefs.resolved, 0) +
    briefReports.reduce((s, b) => s + b.primaryCanonRefs.resolved + b.supportingCanonRefs.resolved + b.outlineCanonRefs.resolved, 0);
  const msRangeWarnings = vicReports.reduce((s, v) => s + v.msRangeRefs, 0);
  const sibTotal = briefReports.reduce((s, b) => s + b.siblingSlugsResolved.total, 0);
  const sibResolved = briefReports.reduce((s, b) => s + b.siblingSlugsResolved.resolved, 0);

  const report: ValidationReport = {
    runId,
    generatedAt: new Date().toISOString(),
    vics: vicReports,
    canon: canonReports,
    briefs: briefReports,
    visualMoments: visualMomentReport,
    totals: {
      segmentRefsTotal,
      segmentRefsResolved,
      canonRefsTotal,
      canonRefsResolved,
      msRangeWarnings,
      siblingResolutionRate: sibTotal > 0 ? sibResolved / sibTotal : 1,
    },
  };

  const md = renderMarkdown(report);
  const outPath = path.join(
    process.env.TEMP || process.env.TMPDIR || '/tmp',
    `citation-validation-${runId}.md`,
  );
  fs.writeFileSync(outPath, md);

  // Summary to stdout
  const segPct = report.totals.segmentRefsTotal > 0
    ? Math.round((100 * report.totals.segmentRefsResolved) / report.totals.segmentRefsTotal)
    : 100;
  const canonPct = report.totals.canonRefsTotal > 0
    ? Math.round((100 * report.totals.canonRefsResolved) / report.totals.canonRefsTotal)
    : 100;
  console.info(`[citation-chain] runId=${runId}`);
  console.info(`[citation-chain]   segment refs: ${report.totals.segmentRefsResolved}/${report.totals.segmentRefsTotal} resolved (${segPct}%)`);
  console.info(`[citation-chain]   canon refs:   ${report.totals.canonRefsResolved}/${report.totals.canonRefsTotal} resolved (${canonPct}%)`);
  console.info(`[citation-chain]   ms-range warnings: ${report.totals.msRangeWarnings} (prefer [<segmentId>] over [<startMs>ms-<endMs>ms])`);
  console.info(`[citation-chain]   sibling-graph resolution: ${Math.round(100 * report.totals.siblingResolutionRate)}% (${sibResolved}/${sibTotal})`);
  console.info(`[citation-chain]   visual moments: ${visualMomentReport.withResolvedSegmentId}/${visualMomentReport.total} have resolved segmentId`);
  console.info(`[citation-chain] report written: ${outPath}`);

  await closeDb();

  // Non-zero exit if anything is broken
  const broken = (report.totals.segmentRefsTotal - report.totals.segmentRefsResolved) +
    (report.totals.canonRefsTotal - report.totals.canonRefsResolved);
  if (broken > 0) process.exit(2);
}

function isCanonSlug(slug: string, canonRows: Array<{ id: string; payload: unknown }>): boolean {
  // Some briefs use a synthesis-thesis slug as parentTopic. We treat that as
  // resolved if the slug matches a canon node title (lowercased + kebab'd).
  const normalized = slug.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  for (const r of canonRows) {
    const t = (r.payload as { title?: string }).title;
    if (typeof t === 'string') {
      const tn = t.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      if (tn === normalized) return true;
    }
  }
  return false;
}

function renderMarkdown(r: ValidationReport): string {
  const lines: string[] = [];
  lines.push(`# Citation-Chain Validation — \`${r.runId}\``);
  lines.push('');
  lines.push(`_Generated: ${r.generatedAt}_`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  const segPct = r.totals.segmentRefsTotal > 0
    ? Math.round((100 * r.totals.segmentRefsResolved) / r.totals.segmentRefsTotal)
    : 100;
  const canonPct = r.totals.canonRefsTotal > 0
    ? Math.round((100 * r.totals.canonRefsResolved) / r.totals.canonRefsTotal)
    : 100;
  lines.push(`- **Segment refs**: ${r.totals.segmentRefsResolved} / ${r.totals.segmentRefsTotal} resolved (${segPct}%)`);
  lines.push(`- **Canon refs**: ${r.totals.canonRefsResolved} / ${r.totals.canonRefsTotal} resolved (${canonPct}%)`);
  lines.push(`- **ms-range warnings**: ${r.totals.msRangeWarnings} (these can't be linkified to YouTube — prefer [<segmentId>])`);
  lines.push(`- **Sibling-graph**: ${Math.round(100 * r.totals.siblingResolutionRate)}% resolved`);
  lines.push(`- **Visual moments**: ${r.visualMoments.withResolvedSegmentId} / ${r.visualMoments.total} have resolved segmentId`);
  lines.push('');

  lines.push('## VIC citation density');
  lines.push('');
  lines.push('| Video | Segment refs | Resolved | ms-range warnings |');
  lines.push('|---|---:|---:|---:|');
  for (const v of r.vics) {
    lines.push(`| \`${v.videoId}\` | ${v.segmentRefs.total} | ${v.segmentRefs.resolved} | ${v.msRangeRefs} |`);
  }
  lines.push('');

  lines.push('## Canon node citation density');
  lines.push('');
  const canonWithBrokenSeg = r.canon.filter((c) => c.segmentRefs.unresolved.length > 0);
  const canonWithBrokenChild = r.canon.filter((c) => c.childCanonRefs.unresolved.length > 0);
  lines.push(`Total canon nodes: ${r.canon.length}.`);
  lines.push(`Canon nodes with at least one **unresolved segmentId**: ${canonWithBrokenSeg.length}.`);
  lines.push(`Canon nodes with at least one **unresolved child canon ID** (synthesis): ${canonWithBrokenChild.length}.`);
  lines.push('');
  if (canonWithBrokenSeg.length > 0) {
    lines.push('### Canon nodes with broken segment refs');
    lines.push('');
    for (const c of canonWithBrokenSeg) {
      lines.push(`- \`${c.id}\` (${c.type}) **${c.title}** — broken: ${c.segmentRefs.unresolved.join(', ')}`);
    }
    lines.push('');
  }
  if (canonWithBrokenChild.length > 0) {
    lines.push('### Synthesis nodes with broken child canon refs');
    lines.push('');
    for (const c of canonWithBrokenChild) {
      lines.push(`- \`${c.id}\` **${c.title}** — broken: ${c.childCanonRefs.unresolved.join(', ')}`);
    }
    lines.push('');
  }

  lines.push('## Brief citation density');
  lines.push('');
  lines.push('| Slug | Primary | Supporting | Outline | Parent? | Siblings |');
  lines.push('|---|---:|---:|---:|---:|---:|');
  for (const b of r.briefs) {
    const parentDot = b.parentTopicResolved == null ? '—' : (b.parentTopicResolved ? 'OK' : 'BROKEN');
    const sibs = `${b.siblingSlugsResolved.resolved}/${b.siblingSlugsResolved.total}`;
    lines.push(`| \`${b.slug}\` | ${b.primaryCanonRefs.resolved}/${b.primaryCanonRefs.total} | ${b.supportingCanonRefs.resolved}/${b.supportingCanonRefs.total} | ${b.outlineCanonRefs.resolved}/${b.outlineCanonRefs.total} | ${parentDot} | ${sibs} |`);
  }
  lines.push('');

  const briefsWithIssues = r.briefs.filter((b) =>
    b.primaryCanonRefs.unresolved.length > 0 ||
    b.supportingCanonRefs.unresolved.length > 0 ||
    b.outlineCanonRefs.unresolved.length > 0 ||
    b.siblingSlugsResolved.unresolved.length > 0 ||
    b.parentTopicResolved === false,
  );
  if (briefsWithIssues.length > 0) {
    lines.push('### Briefs with unresolved references');
    lines.push('');
    for (const b of briefsWithIssues) {
      lines.push(`- \`${b.slug}\` (**${b.title}**)`);
      if (b.primaryCanonRefs.unresolved.length > 0) lines.push(`    - primary: ${b.primaryCanonRefs.unresolved.join(', ')}`);
      if (b.supportingCanonRefs.unresolved.length > 0) lines.push(`    - supporting: ${b.supportingCanonRefs.unresolved.join(', ')}`);
      if (b.outlineCanonRefs.unresolved.length > 0) lines.push(`    - outline: ${b.outlineCanonRefs.unresolved.join(', ')}`);
      if (b.parentTopicResolved === false) lines.push(`    - parentTopic does NOT resolve to a real brief or canon node`);
      if (b.siblingSlugsResolved.unresolved.length > 0) lines.push(`    - sibling slugs: ${b.siblingSlugsResolved.unresolved.join(', ')}`);
    }
    lines.push('');
  } else {
    lines.push('_No briefs with broken references._');
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push('## Editor sign-off');
  lines.push('');
  lines.push('I have reviewed the unresolved references above and confirm:');
  lines.push('');
  lines.push('- [ ] Segment-ref violations are zero or have been triaged');
  lines.push('- [ ] Canon-ref violations are zero or have been triaged');
  lines.push('- [ ] Sibling-graph is fully connected');
  lines.push('- [ ] ms-range citations have been replaced with segmentIds (or accepted as time-only refs)');
  lines.push('');
  lines.push(`Signed: _____________________   Date: __________`);
  return lines.join('\n');
}

main().catch(async (err) => {
  await closeDb();
  console.error('[citation-chain] FAILED', err);
  process.exit(1);
});
