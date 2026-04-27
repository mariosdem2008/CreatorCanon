#!/usr/bin/env node
/**
 * Run Phase 12 hard-pass criteria + visual-context metrics against a
 * finished canon_v1 run. Reports PASS/FAIL per criterion and exits 0 only
 * when every criterion passes.
 *
 * Usage:
 *   node scripts/verify-canon-run.mjs <runId>
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const __dirname = dirname(fileURLToPath(import.meta.url));
function findRepoRoot(start) {
  let cur = start;
  for (let i = 0; i < 6; i += 1) {
    if (existsSync(resolve(cur, '.env')) || existsSync(resolve(cur, '.env.local'))) return cur;
    const parent = dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return start;
}
const repoRoot = findRepoRoot(__dirname);
function loadEnv(p, override = false) {
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    const k = t.slice(0, i).trim();
    if (!override && process.env[k] !== undefined) continue;
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[k] = v;
  }
}
loadEnv(resolve(repoRoot, '.env'));
loadEnv(resolve(repoRoot, '.env.local'), true);

const runId = process.argv[2];
if (!runId) {
  console.error('Usage: node scripts/verify-canon-run.mjs <runId>');
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL);

const failures = [];
const warnings = [];
function check(name, pass, detail) {
  const tag = pass ? 'PASS' : 'FAIL';
  console.log(`  [${tag}] ${name}${detail ? ': ' + detail : ''}`);
  if (!pass) failures.push(name);
}
function info(name, detail) {
  console.log(`  [INFO] ${name}: ${detail}`);
}

try {
  console.log(`\n=== verify canon_v1 run ${runId} ===\n`);

  const runRows = await sql`SELECT id, status FROM generation_run WHERE id = ${runId}`;
  if (!runRows[0]) {
    console.error(`No generation_run with id=${runId}`);
    process.exit(2);
  }
  info('run.status', runRows[0].status);

  console.log('\n--- HARD PASS CRITERIA ---');

  // Page count in [4, 12]
  const pageCountRow = await sql`SELECT COUNT(*)::int AS n FROM page WHERE run_id = ${runId}`;
  const pageCount = pageCountRow[0].n;
  check('pageCount in [4, 12]', pageCount >= 4 && pageCount <= 12, `${pageCount}`);

  // 100% pages have non-empty readerProblem + promisedOutcome (both in atlasMeta)
  const versions = await sql`SELECT page_id, block_tree_json FROM page_version WHERE run_id = ${runId} AND is_current = true`;
  let withReader = 0;
  let withOutcome = 0;
  for (const v of versions) {
    const meta = (v.block_tree_json && v.block_tree_json.atlasMeta) || {};
    if (typeof meta.readerProblem === 'string' && meta.readerProblem.length > 10) withReader += 1;
    if (typeof meta.promisedOutcome === 'string' && meta.promisedOutcome.length > 10) withOutcome += 1;
  }
  check(
    'pages with readerProblem == 100%',
    versions.length > 0 && withReader === versions.length,
    `${withReader}/${versions.length}`,
  );
  check(
    'pages with promisedOutcome == 100%',
    versions.length > 0 && withOutcome === versions.length,
    `${withOutcome}/${versions.length}`,
  );

  // Duplicate slugs == 0
  const dupSlugRows = await sql`
    SELECT slug, COUNT(*) AS n FROM page WHERE run_id = ${runId} GROUP BY slug HAVING COUNT(*) > 1
  `;
  check('duplicate slugs == 0', dupSlugRows.length === 0, `${dupSlugRows.length} dupes`);

  // Generic page titles <= 1
  const generic = ['untitled', 'page', 'lesson', 'framework', 'playbook'];
  let genericCount = 0;
  for (const v of versions) {
    const tree = v.block_tree_json || {};
    // page_version has a title column too; fetch separately
  }
  const titleRows = await sql`
    SELECT pv.title FROM page_version pv WHERE pv.run_id = ${runId} AND pv.is_current = true
  `;
  for (const r of titleRows) {
    if (generic.includes((r.title ?? '').toLowerCase().trim())) genericCount += 1;
  }
  check('generic titles <= 1', genericCount <= 1, `${genericCount} generic`);

  // Citation distribution. The plan asks for "avg citations per page >= 5".
  // We additionally guard against the average masking a single uncited page:
  // every page must have at least 3 citations (the plan's per-page floor).
  const perPageCites = versions.map((v) => {
    const blocks = (v.block_tree_json && v.block_tree_json.blocks) || [];
    return blocks.reduce((acc, b) => acc + ((b.citations ?? []).length), 0);
  });
  const totalCitations = perPageCites.reduce((a, b) => a + b, 0);
  const avgCites = versions.length > 0 ? totalCitations / versions.length : 0;
  const minCites = perPageCites.length > 0 ? Math.min(...perPageCites) : 0;
  const pagesWithoutCitations = perPageCites.filter((n) => n === 0).length;
  check('avg citations per page >= 5', avgCites >= 5, avgCites.toFixed(2));
  check('every page has >= 3 citations', minCites >= 3, `min=${minCites}`);
  check('pages with 0 citations == 0', pagesWithoutCitations === 0, `${pagesWithoutCitations}`);

  // >= 1 canon node with origin in {merged, multi_video, derived} AND >= 2 source videos
  const mergedRow = await sql`
    SELECT COUNT(*)::int AS n FROM canon_node
    WHERE run_id = ${runId}
      AND origin IN ('multi_video', 'derived')
      AND COALESCE(array_length(source_video_ids, 1), 0) >= 2
  `;
  check(
    '>=1 canon_node with multi_video|derived origin AND >=2 source videos',
    mergedRow[0].n >= 1,
    `${mergedRow[0].n}`,
  );

  // pagesWhereVisualIsSoleEvidence == 0 (always)
  let visualSole = 0;
  for (const v of versions) {
    const blocks = (v.block_tree_json && v.block_tree_json.blocks) || [];
    const transcriptBlocks = blocks.filter(
      (b) => !(b.content && b.content._visualMomentId),
    );
    const transcriptCited = transcriptBlocks.filter((b) => (b.citations ?? []).length > 0);
    const visualBlocks = blocks.filter((b) => b.content && b.content._visualMomentId);
    if (visualBlocks.length > 0 && transcriptCited.length < 3) visualSole += 1;
  }
  check('pagesWhereVisualIsSoleEvidence == 0', visualSole === 0, `${visualSole} pages`);

  console.log('\n--- VISUAL METRICS (canon_v1) ---');
  const vmCountRow = await sql`SELECT COUNT(*)::int AS n FROM visual_moment WHERE run_id = ${runId}`;
  info('visualMomentsCreated', vmCountRow[0].n);

  const vidsInRunRow = await sql`SELECT COUNT(DISTINCT video_id)::int AS n FROM segment WHERE run_id = ${runId}`;
  info('selectedVideos', vidsInRunRow[0].n);

  const mp4Row = await sql`
    SELECT COUNT(DISTINCT s.video_id)::int AS n
    FROM segment s
    INNER JOIN media_asset ma ON ma.video_id = s.video_id AND ma.type = 'video_mp4'
    WHERE s.run_id = ${runId}
  `;
  info('videosWithMp4Source', mp4Row[0].n);
  info('videosSkippedNoMp4', vidsInRunRow[0].n - mp4Row[0].n);

  let pagesWithVisualCallouts = 0;
  for (const v of versions) {
    const blocks = (v.block_tree_json && v.block_tree_json.blocks) || [];
    if (blocks.some((b) => b.content && b.content._visualMomentId)) pagesWithVisualCallouts += 1;
  }
  info('pagesWithVisualCallouts', pagesWithVisualCallouts);

  console.log('\n--- PAGE QUALITY ROLLUP ---');
  const pq = await sql`
    SELECT recommendation, COUNT(*)::int AS n
    FROM page_quality_report
    WHERE run_id = ${runId}
    GROUP BY recommendation
    ORDER BY recommendation
  `;
  for (const r of pq) info(`  ${r.recommendation}`, r.n);

  console.log('');
  if (failures.length === 0) {
    console.log('=== VERIFY: PASS ===');
    process.exit(0);
  } else {
    console.log(`=== VERIFY: FAIL (${failures.length} criteria) ===`);
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(3);
  }
} finally {
  await sql.end();
}
