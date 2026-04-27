#!/usr/bin/env node
/**
 * Operator inspection script for a canon_v1 run. Reports the cardinality of
 * every canon-layer table for the given runId, plus the top visual moments
 * by usefulness score.
 *
 * Usage:
 *   node scripts/inspect-canon-run.mjs <runId>
 *
 * Reads DATABASE_URL from .env / .env.local in the repo root.
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
  console.error('Usage: node scripts/inspect-canon-run.mjs <runId>');
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL);

try {
  console.log(`\n=== canon_v1 run ${runId} ===\n`);

  console.log('--- RUN ---');
  const runRows = await sql`SELECT id, status, started_at, completed_at FROM generation_run WHERE id = ${runId}`;
  if (!runRows[0]) {
    console.error(`No generation_run with id=${runId}`);
    process.exit(2);
  }
  console.log(`  status: ${runRows[0].status}`);
  console.log(`  startedAt: ${runRows[0].started_at}`);
  console.log(`  completedAt: ${runRows[0].completed_at ?? '(in flight)'}`);

  console.log('\n--- STAGE RUNS ---');
  const stages = await sql`
    SELECT stage_name, status, attempt, duration_ms
    FROM generation_stage_run
    WHERE run_id = ${runId}
    ORDER BY started_at
  `;
  for (const s of stages) {
    console.log(`  ${s.stage_name.padEnd(22)} ${s.status.padEnd(20)} attempt=${s.attempt} ${s.duration_ms ?? '?'}ms`);
  }

  console.log('\n--- CHANNEL PROFILE ---');
  const cp = await sql`SELECT id, cost_cents FROM channel_profile WHERE run_id = ${runId}`;
  console.log(`  rows: ${cp.length}${cp[0] ? ` (id=${cp[0].id}, cost=${cp[0].cost_cents}¢)` : ''}`);

  console.log('\n--- VIDEO INTELLIGENCE CARDS ---');
  const vic = await sql`SELECT video_id, id, cost_cents FROM video_intelligence_card WHERE run_id = ${runId}`;
  console.log(`  rows: ${vic.length}`);
  for (const r of vic) console.log(`    ${r.video_id} -> ${r.id} (${r.cost_cents}¢)`);

  console.log('\n--- CANON NODES ---');
  const cnByType = await sql`
    SELECT type, origin, COUNT(*) AS n
    FROM canon_node
    WHERE run_id = ${runId}
    GROUP BY type, origin
    ORDER BY type, origin
  `;
  for (const r of cnByType) console.log(`  ${r.type.padEnd(14)} ${r.origin.padEnd(18)} ${r.n}`);
  const cnTotal = await sql`SELECT COUNT(*)::int AS n FROM canon_node WHERE run_id = ${runId}`;
  console.log(`  total: ${cnTotal[0].n}`);

  console.log('\n--- CANON NODES (top 10 by pageWorthiness) ---');
  const topCanon = await sql`
    SELECT id, type, page_worthiness_score, source_coverage, evidence_quality
    FROM canon_node
    WHERE run_id = ${runId}
    ORDER BY page_worthiness_score DESC
    LIMIT 10
  `;
  for (const r of topCanon) {
    console.log(`  [${String(r.page_worthiness_score).padStart(3)}] ${r.type.padEnd(12)} src=${r.source_coverage} ev=${r.evidence_quality.padEnd(8)} ${r.id}`);
  }

  console.log('\n--- PAGE BRIEFS ---');
  const briefs = await sql`SELECT id, position, page_worthiness_score FROM page_brief WHERE run_id = ${runId} ORDER BY position`;
  console.log(`  rows: ${briefs.length}`);
  for (const r of briefs) console.log(`  pos=${String(r.position).padStart(2)} score=${r.page_worthiness_score} ${r.id}`);

  console.log('\n--- PAGES ---');
  const pages = await sql`SELECT id, slug, page_type FROM page WHERE run_id = ${runId} ORDER BY position`;
  console.log(`  rows: ${pages.length}`);
  for (const r of pages) console.log(`  ${r.page_type.padEnd(16)} ${r.slug} -> ${r.id}`);

  console.log('\n--- PAGE QUALITY ---');
  const pq = await sql`
    SELECT recommendation, COUNT(*) AS n
    FROM page_quality_report
    WHERE run_id = ${runId}
    GROUP BY recommendation
    ORDER BY recommendation
  `;
  for (const r of pq) console.log(`  ${r.recommendation.padEnd(10)} ${r.n}`);

  console.log('\n=== VISUAL MOMENTS ===');
  const vmCounts = await sql`
    SELECT type, COUNT(*) AS n
    FROM visual_moment
    WHERE run_id = ${runId}
    GROUP BY type
    ORDER BY type
  `;
  for (const r of vmCounts) console.log(`  ${r.type.padEnd(14)} ${r.n}`);
  const vmTotal = await sql`SELECT COUNT(*)::int AS n FROM visual_moment WHERE run_id = ${runId}`;
  console.log(`  total: ${vmTotal[0].n}`);

  console.log('\n--- top 8 visual moments by usefulness ---');
  const topVisuals = await sql`
    SELECT id, video_id, timestamp_ms, type, usefulness_score, description
    FROM visual_moment
    WHERE run_id = ${runId}
    ORDER BY usefulness_score DESC
    LIMIT 8
  `;
  for (const v of topVisuals) {
    const ts = Math.floor(v.timestamp_ms / 1000);
    const desc = (v.description ?? '').slice(0, 80);
    console.log(`  [${String(v.usefulness_score).padStart(3)}] ${v.type.padEnd(14)} ${v.video_id} @ ${ts}s: ${desc}`);
  }

  console.log('');
} finally {
  await sql.end();
}
