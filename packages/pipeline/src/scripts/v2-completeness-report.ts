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

  // ── Bar 4: Completeness layers ───────────────────────────
  console.log(`▸ Quality bar 4: completeness (5 layers)`);
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

  await closeDb();
}

main().catch(async (err) => {
  await closeDb();
  console.error('[completeness] FAILED', err);
  process.exit(1);
});
