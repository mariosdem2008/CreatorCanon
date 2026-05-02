/**
 * v2 completeness report — quick stdout summary of where a run sits against
 * the 4 quality bars (Phase 5 / Task 6.9 helper).
 *
 * Quality bars (from the user's spec):
 *   1. Read 3 random canon bodies aloud — sounds like the creator wrote a chapter
 *   2. All 5 hero_candidates billboard-worthy
 *   3. Thinnest body paywall-worthy
 *   4. Completeness — all 4 hub layers populated (canon bodies, synthesis,
 *      reader journey, page briefs)
 *
 * This script can't read aloud or judge "billboard-worthy" — those require
 * human review. What it CAN do:
 *   - Summarize layer-by-layer completeness (bar 4)
 *   - Surface canon body word counts + citation density (bar 3 proxy)
 *   - Print 3 sampled canon body excerpts for read-aloud (bar 1 proxy)
 *   - Print all 5 hero candidates for billboard review (bar 2)
 *   - Run third-person leak detection inline
 *
 * Usage:
 *   tsx ./src/scripts/v2-completeness-report.ts <runId>
 */

import { closeDb, eq, getDb } from '@creatorcanon/db';
import {
  canonNode,
  channelProfile,
  pageBrief,
  videoIntelligenceCard,
  workshopStage,
} from '@creatorcanon/db/schema';

import { loadDefaultEnvFiles } from '../env-files';

loadDefaultEnvFiles();

const UUID_RE = /\[([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\]/g;
const THIRD_PERSON_PATTERNS: Array<[string, RegExp]> = [
  ['the creator', /\bthe creator\b/i],
  ['the speaker', /\bthe speaker\b/i],
  ['the host', /\bthe host\b/i],
  ['<pronoun> says', /\b(she|he|they) (says|argues|explains|notes|claims|believes)\b/i],
  ['in this episode', /\bin this (episode|video|talk)\b/i],
];

function wordCount(s: string | undefined): number {
  if (!s) return 0;
  return s.split(/\s+/).filter(Boolean).length;
}

function citationCount(s: string | undefined): number {
  if (!s) return 0;
  return (s.match(UUID_RE) ?? []).length;
}

function pickRandom<T>(arr: T[], n: number, seed: number): T[] {
  const out: T[] = [];
  const indices = new Set<number>();
  let s = seed;
  while (out.length < Math.min(n, arr.length)) {
    s = (s * 9301 + 49297) % 233280;
    const idx = Math.floor((s / 233280) * arr.length);
    if (indices.has(idx)) continue;
    indices.add(idx);
    out.push(arr[idx]!);
  }
  return out;
}

async function main() {
  const runId = process.argv[2];
  if (!runId) throw new Error('Usage: tsx ./src/scripts/v2-completeness-report.ts <runId>');

  const db = getDb();

  // Channel profile.
  const cpRows = await db.select({ payload: channelProfile.payload })
    .from(channelProfile).where(eq(channelProfile.runId, runId));
  const cp = cpRows[0]?.payload as {
    schemaVersion?: string;
    creatorName?: string;
    hub_title?: string;
    hub_tagline?: string;
    hero_candidates?: string[];
    _index_archetype?: string;
  } | undefined;
  const isV2 = cp?.schemaVersion === 'v2';

  // Canon nodes.
  const canonRows = await db.select({ id: canonNode.id, payload: canonNode.payload })
    .from(canonNode).where(eq(canonNode.runId, runId));
  const v2Canon = canonRows.filter((c) => (c.payload as { schemaVersion?: string }).schemaVersion === 'v2');
  const synthesis = v2Canon.filter((c) => (c.payload as { kind?: string }).kind === 'synthesis');
  const journey = v2Canon.find((c) => (c.payload as { kind?: string }).kind === 'reader_journey');
  const standardCanon = v2Canon.filter((c) => {
    const k = (c.payload as { kind?: string }).kind;
    return !k;
  });

  // Page briefs.
  const briefRows = await db.select({ payload: pageBrief.payload })
    .from(pageBrief).where(eq(pageBrief.runId, runId));
  const v2Briefs = briefRows.filter((b) => (b.payload as { schemaVersion?: string }).schemaVersion === 'v2');

  // VICs.
  const vicRows = await db.select({ payload: videoIntelligenceCard.payload })
    .from(videoIntelligenceCard).where(eq(videoIntelligenceCard.runId, runId));
  const v2Vics = vicRows.filter((v) => (v.payload as { schemaVersion?: string }).schemaVersion === 'v2');

  // Workshop stages.
  const workshopRows = await db.select({ payload: workshopStage.payload })
    .from(workshopStage).where(eq(workshopStage.runId, runId));

  // ── Print report ──────────────────────────────────────────
  console.log('');
  console.log(`════════════════════════════════════════════════════════════`);
  console.log(`  v2 completeness report — runId=${runId}`);
  console.log(`════════════════════════════════════════════════════════════`);
  console.log(`  Creator:    ${cp?.creatorName ?? '(unknown)'}`);
  console.log(`  Archetype:  ${cp?._index_archetype ?? '?'}`);
  console.log(`  Schema:     ${isV2 ? 'v2 ✓' : '⚠️ NOT v2 — falling back to v1 fields'}`);
  console.log('');
  if (!isV2) {
    console.log('This run is not v2. Re-run via tsx ./src/scripts/seed-audit-v2.ts <runId> --regen-channel');
    await closeDb();
    return;
  }

  // ── Compute evidence layer status ──────────────────────────
  let totalCitations = 0;
  let totalEntries = 0;
  let verifiedCount = 0;
  let needsReviewCount = 0;
  let unsupportedCount = 0;

  function processEntity(body: string, registry: Record<string, any> | undefined): void {
    if (typeof body !== 'string') return;
    const cited = new Set<string>();
    for (const m of body.matchAll(UUID_RE)) cited.add(m[1]!);
    totalCitations += cited.size;
    if (registry && typeof registry === 'object') {
      totalEntries += Object.keys(registry).length;
      for (const entry of Object.values(registry)) {
        const e = entry as { verificationStatus?: string };
        if (e.verificationStatus === 'verified') verifiedCount++;
        else if (e.verificationStatus === 'needs_review') needsReviewCount++;
        else if (e.verificationStatus === 'unsupported') unsupportedCount++;
      }
    }
  }

  // Iterate v2 canon bodies (excluding journey)
  for (const c of v2Canon) {
    const p = c.payload as { kind?: string; body?: string; _index_evidence_registry?: Record<string, any> };
    if (p.kind === 'reader_journey') continue;
    processEntity(p.body ?? '', p._index_evidence_registry);
  }

  // Iterate journey phases
  const journeyPayload = journey?.payload as { _index_phases?: any[] } | undefined;
  for (const phase of (journeyPayload?._index_phases ?? [])) {
    processEntity(phase.body ?? '', phase._index_evidence_registry);
  }

  // Iterate briefs
  for (const b of v2Briefs) {
    const p = b.payload as { body?: string; _index_evidence_registry?: Record<string, any> };
    processEntity(p.body ?? '', p._index_evidence_registry);
  }

  const verificationRate = totalCitations > 0 ? verifiedCount / totalCitations : 0;
  const evidenceLayerOk = totalCitations > 0 && totalEntries === totalCitations && verificationRate >= 0.9;

  // ── Compute workshop layer status ───────────────────────────
  const workshopClipCounts = workshopRows.map((w) => {
    const p = w.payload as { clips?: any[] };
    return (p.clips ?? []).length;
  });
  const totalWorkshopClips = workshopClipCounts.reduce((a, b) => a + b, 0);
  const avgClipsPerStage = workshopRows.length > 0 ? totalWorkshopClips / workshopRows.length : 0;
  const workshopOk = workshopRows.length >= 3 && workshopClipCounts.every((c) => c >= 2);

  // Avg clip relevance
  let totalRelevance = 0;
  let totalClipsForAvg = 0;
  let totalDuration = 0;
  let durationOutsideWindow = 0;  // count of clips outside [30, 180]s

  for (const w of workshopRows) {
    const p = w.payload as { clips?: any[] };
    for (const clip of (p.clips ?? [])) {
      const score = Number(clip._index_relevance_score ?? 0);
      if (Number.isFinite(score)) {
        totalRelevance += score;
        totalClipsForAvg++;
      }
      const start = Number(clip.startSeconds ?? 0);
      const end = Number(clip.endSeconds ?? 0);
      const duration = end - start;
      if (Number.isFinite(duration) && duration > 0) {
        totalDuration += duration;
        if (duration < 30 || duration > 180) durationOutsideWindow++;
      }
    }
  }
  const avgRelevance = totalClipsForAvg > 0 ? totalRelevance / totalClipsForAvg : 0;
  const avgDuration = totalClipsForAvg > 0 ? totalDuration / totalClipsForAvg : 0;

  // ── Bar 4: Completeness layers ───────────────────────────
  console.log(`▸ Quality bar 4: completeness (7 layers)`);
  const standardWithBody = standardCanon.filter((c) => wordCount((c.payload as { body?: string }).body) >= 100).length;
  const synthesisWithBody = synthesis.filter((c) => wordCount((c.payload as { body?: string }).body) >= 200).length;
  const journeyPhases = journey ? ((journey.payload as { _index_phases?: unknown[] })._index_phases ?? []) as Array<{ body?: string }> : [];
  const journeyPhasesWithBody = journeyPhases.filter((p) => wordCount(p.body) >= 100).length;
  const briefsWithBody = v2Briefs.filter((b) => wordCount((b.payload as { body?: string }).body) >= 100).length;
  const heroOk = (cp.hero_candidates ?? []).filter((h) => h && h !== 'placeholder').length === 5;

  function layerLine(name: string, ok: boolean, detail: string): string {
    return `   ${ok ? '✓' : '✗'} ${name.padEnd(18)} ${detail}`;
  }
  console.log(layerLine('Hero', heroOk, `${(cp.hero_candidates ?? []).filter((h) => h && h !== 'placeholder').length}/5 candidates`));
  console.log(layerLine('Canon bodies', standardWithBody === standardCanon.length && standardCanon.length > 0,
    `${standardWithBody}/${standardCanon.length} with body ≥ 100w`));
  console.log(layerLine('Synthesis pillars', synthesis.length >= 2 && synthesisWithBody === synthesis.length,
    `${synthesisWithBody}/${synthesis.length} with body ≥ 200w`));
  console.log(layerLine('Reader journey', !!journey && journeyPhasesWithBody === journeyPhases.length && journeyPhases.length >= 3,
    journey ? `${journeyPhasesWithBody}/${journeyPhases.length} phases with body` : 'missing'));
  console.log(layerLine('Page briefs', v2Briefs.length > 0 && briefsWithBody === v2Briefs.length,
    `${briefsWithBody}/${v2Briefs.length} with body ≥ 100w`));
  console.log(layerLine('Evidence registry', evidenceLayerOk,
    totalCitations === 0
      ? 'no citations'
      : `${verifiedCount}/${totalCitations} verified (${Math.round(verificationRate*100)}%)`));
  console.log(layerLine('Workshops', workshopOk,
    workshopRows.length === 0
      ? 'Run --regen-workshops'
      : `${workshopRows.length} stages, avg ${avgClipsPerStage.toFixed(1)} clips`));
  console.log('');

  // ── Bar 5: evidence verification rate ────────────────────
  console.log(`▸ Quality bar 5: evidence verification rate ≥ 90%`);
  const bar5Ok = totalCitations === 0 || verificationRate >= 0.9;
  console.log(`   ${bar5Ok ? '✓' : '✗'} ${Math.round(verificationRate*100)}% verified across ${totalCitations} citations (verified: ${verifiedCount}, needs_review: ${needsReviewCount}, unsupported: ${unsupportedCount})`);
  console.log('');

  // ── Bar 6: workshop avg clip relevance ───────────────────
  console.log(`▸ Quality bar 6: workshop avg clip relevance ≥ 90`);
  const bar6Ok = totalClipsForAvg === 0 || avgRelevance >= 90;
  console.log(`   ${bar6Ok ? '✓' : '✗'} avg relevance ${avgRelevance.toFixed(1)} across ${totalClipsForAvg} clips`);
  console.log('');

  // ── Bar 7: workshop clip durations in [30, 180]s ─────────
  console.log(`▸ Quality bar 7: workshop clip durations in [30, 180]s`);
  const bar7Ok = totalClipsForAvg === 0 || durationOutsideWindow === 0;
  console.log(`   ${bar7Ok ? '✓' : '✗'} ${totalClipsForAvg - durationOutsideWindow}/${totalClipsForAvg} in window (avg duration ${avgDuration.toFixed(1)}s)`);
  console.log('');

  // ── Bar 8: workshop completeness ────────────────────────
  console.log(`▸ Quality bar 8: workshop completeness`);
  const bar8Ok = workshopRows.length >= 3 && workshopClipCounts.every((c) => c >= 2);
  console.log(`   ${bar8Ok ? '✓' : '✗'} ${workshopRows.length} stages (target ≥3), every stage ≥2 clips: ${workshopClipCounts.every((c) => c >= 2) ? 'yes' : 'no'}`);
  console.log('');

  // ── Bar 3: thinnest body paywall-worthy ─────────────────
  // Threshold is type-aware so a 320w definition isn't flagged when its
  // spec range is 200-500w. Mirrors canon-body-writer's minWordCount().
  function paywallMin(type: string | undefined): number {
    switch (type) {
      case 'definition': case 'aha_moment': case 'quote': return 200;
      case 'example': return 250;
      case 'lesson': case 'pattern': case 'tactic': return 300;
      case 'principle': case 'topic': return 350;
      case 'framework': return 400;
      case 'playbook': return 500;
      default: return 300;
    }
  }
  console.log(`▸ Quality bar 3: thinnest body (paywall test proxy)`);
  const allBodies = standardCanon
    .map((c) => ({
      title: (c.payload as { title?: string }).title ?? '?',
      type: (c.payload as { type?: string }).type,
      body: (c.payload as { body?: string }).body ?? '',
    }))
    .filter((x) => x.body.length > 0)
    .map((x) => ({
      title: x.title,
      type: x.type,
      words: wordCount(x.body),
      citations: citationCount(x.body),
      minForType: paywallMin(x.type),
    }))
    .sort((a, b) => (a.words - a.minForType) - (b.words - b.minForType));
  if (allBodies.length === 0) {
    console.log('   (no bodies to evaluate)');
  } else {
    const thinnest = allBodies[0]!;
    console.log(`   Thinnest:  "${thinnest.title}" [${thinnest.type}] → ${thinnest.words}w · ${thinnest.citations} citations (type min ${thinnest.minForType}w)`);
    const median = allBodies[Math.floor(allBodies.length / 2)]!;
    console.log(`   Median:    "${median.title}" [${median.type}] → ${median.words}w · ${median.citations} citations`);
    const fattest = allBodies[allBodies.length - 1]!;
    console.log(`   Fattest:   "${fattest.title}" [${fattest.type}] → ${fattest.words}w · ${fattest.citations} citations`);
    console.log(`   Bar test:  thinnest ≥ ${thinnest.minForType}w ${thinnest.words >= thinnest.minForType ? '✓' : '✗'} · ${thinnest.citations} citations ${thinnest.citations >= 4 ? '✓' : '✗'}`);
  }
  console.log('');

  // ── Bar 2: hero billboard quality ───────────────────────
  console.log(`▸ Quality bar 2: hero candidates (read aloud — billboard worthy?)`);
  console.log(`   hub_title:   ${cp.hub_title ?? '(missing)'}`);
  console.log(`   hub_tagline: ${cp.hub_tagline ?? '(missing)'}`);
  (cp.hero_candidates ?? []).forEach((h, i) => {
    const angle = ['Pain', 'Aspiration', 'Contrarian', 'Number', 'Curiosity'][i] ?? `#${i + 1}`;
    console.log(`   ${angle.padEnd(11)} "${h}"`);
  });
  console.log('');

  // ── Bar 1: read-aloud sample ────────────────────────────
  console.log(`▸ Quality bar 1: 3 random canon body excerpts (does it sound like a chapter?)`);
  const samples = pickRandom(standardCanon, 3, runId.charCodeAt(0) || 1);
  for (const s of samples) {
    const p = s.payload as { title?: string; body?: string };
    const body = p.body ?? '';
    const excerpt = body.split(/\s+/).slice(0, 80).join(' ');
    console.log(`   ─── "${p.title}" (${wordCount(body)}w · ${citationCount(body)} citations) ───`);
    console.log(`   ${excerpt}…`);
    console.log('');
  }

  // ── Voice leak ──────────────────────────────────────────
  console.log(`▸ Third-person leak scan (rendered fields)`);
  let leaks = 0;
  function scan(text: string | undefined, location: string): void {
    if (!text) return;
    for (const [, re] of THIRD_PERSON_PATTERNS) {
      if (re.test(text)) {
        const match = text.match(re);
        if (match) {
          console.warn(`   ⚠️ ${location}: "${match[0]}"`);
          leaks += 1;
        }
      }
    }
  }
  scan(cp.hub_title, 'hub_title');
  scan(cp.hub_tagline, 'hub_tagline');
  (cp.hero_candidates ?? []).forEach((h, i) => scan(h, `hero_candidates[${i}]`));
  for (const c of v2Canon) {
    const p = c.payload as { title?: string; lede?: string; body?: string; _index_phases?: Array<{ title?: string; hook?: string; body?: string }> };
    scan(p.title, `${c.id}.title`);
    scan(p.lede, `${c.id}.lede`);
    scan(p.body, `${c.id}.body`);
    (p._index_phases ?? []).forEach((ph, i) => {
      scan(ph.title, `${c.id}.phases[${i}].title`);
      scan(ph.hook, `${c.id}.phases[${i}].hook`);
      scan(ph.body, `${c.id}.phases[${i}].body`);
    });
  }
  for (const b of v2Briefs) {
    const p = b.payload as { pageTitle?: string; hook?: string; lede?: string; body?: string; cta?: { primary?: string; secondary?: string } };
    scan(p.pageTitle, 'brief.pageTitle');
    scan(p.hook, 'brief.hook');
    scan(p.lede, 'brief.lede');
    scan(p.body, 'brief.body');
    scan(p.cta?.primary, 'brief.cta.primary');
    scan(p.cta?.secondary, 'brief.cta.secondary');
  }
  for (const v of v2Vics) {
    const p = v.payload as { video_summary?: string };
    scan(p.video_summary, 'vic.video_summary');
  }
  console.log(`   ${leaks === 0 ? '✓' : '✗'} Total leaks: ${leaks}`);
  console.log('');

  console.log(`════════════════════════════════════════════════════════════`);

  // Machine-readable METRIC lines for v2-cohort-report stable parsing.
  const layerStatuses = [
    heroOk,
    standardWithBody === standardCanon.length && standardCanon.length > 0,
    synthesis.length >= 2 && synthesisWithBody === synthesis.length,
    !!journey && journeyPhasesWithBody === journeyPhases.length && journeyPhases.length >= 3,
    v2Briefs.length > 0 && briefsWithBody === v2Briefs.length,
    evidenceLayerOk,
    workshopOk,
  ];
  const layersGreen = layerStatuses.filter(Boolean).length;
  const layersTotal = layerStatuses.length;
  console.info(`[completeness] METRIC creator=${(cp?.creatorName ?? '?').replace(/\s+/g, '_')}`);
  console.info(`[completeness] METRIC archetype=${cp?._index_archetype ?? '?'}`);
  console.info(`[completeness] METRIC layers_green=${layersGreen}/${layersTotal}`);
  console.info(`[completeness] METRIC verification_rate=${Math.round(verificationRate * 100)}`);

  await closeDb();
}

main().catch(async (err) => {
  await closeDb();
  console.error('[completeness] FAILED', err);
  process.exit(1);
});
