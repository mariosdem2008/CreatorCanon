/**
 * Third-person leak detector (Phase 5 / Task 6.6).
 *
 * The v2 schema spec rule #1: "No third-person leak in rendered fields."
 *
 * The Jordan v1 hub failed because canon bodies and briefs were written in
 * third-person ("Jordan says...", "the creator argues..."), and the builder
 * rendered them as if Jordan had written them himself. v2 fixes this by
 * flipping voice at extraction. This validator catches regressions.
 *
 * Scans every RENDERED field on every v2 payload for third-person markers:
 *   - "the creator", "the speaker", "the host", "the author", "the narrator"
 *   - "<creatorName> says/argues/explains/notes/claims/believes"
 *   - "she says", "he says", "they (the creator) " (any subject pronoun + says verb)
 *   - "in this episode", "in this video"
 *
 * Rendered fields scanned (per v2 schema):
 *   - ChannelProfile_v2: hub_title, hub_tagline, hero_candidates[]
 *   - CanonNode_v2: title, lede, body
 *   - CanonNode_v2 with kind='reader_journey': _index_phases[].title/hook/body
 *   - PageBrief_v2: pageTitle, hook, lede, body, cta.primary, cta.secondary
 *   - VIC_v2: video_summary
 *
 * NEVER scans _internal_* or _index_* fields (those allow third-person).
 *
 * Output: /tmp/third-person-leak-<runId>.md plus stdout summary. Exit 2 on
 * any leak (hard fail per spec).
 *
 * Usage:
 *   tsx ./src/scripts/check-third-person-leak.ts <runId>
 */

import fs from 'node:fs';
import path from 'node:path';

import { closeDb, eq, getDb } from '@creatorcanon/db';
import {
  canonNode,
  channelProfile,
  pageBrief,
  videoIntelligenceCard,
} from '@creatorcanon/db/schema';

import { loadDefaultEnvFiles } from '../env-files';

loadDefaultEnvFiles();

interface LeakHit {
  /** Where the leak was found, e.g. "canon[cn_xxx].body". */
  location: string;
  /** The pattern that matched. */
  pattern: string;
  /** ~80-char excerpt around the match. */
  excerpt: string;
}

/** Build the third-person regex bank, including a personalized creator-name
 *  variant when known. Returns array of [label, regex] tuples. */
function buildPatterns(creatorName: string | null): Array<[string, RegExp]> {
  const base: Array<[string, RegExp]> = [
    ['the creator', /\bthe creator\b/i],
    ['the speaker', /\bthe speaker\b/i],
    ['the host', /\bthe host\b/i],
    ['the author', /\bthe author\b/i],
    ['the narrator', /\bthe narrator\b/i],
    ['<pronoun> says/argues', /\b(she|he|they) (says|argues|explains|notes|claims|believes|describes|recalls|recommends|suggests)\b/i],
    ['in this episode', /\bin this (episode|video|talk|interview)\b/i],
  ];
  if (creatorName && creatorName.trim().length > 0) {
    // Escape regex specials in the creator name.
    const escaped = creatorName.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    base.push([
      `<creator> says/argues`,
      new RegExp(`\\b${escaped}\\s+(says|argues|explains|notes|claims|believes|describes|recalls|recommends|suggests)\\b`, 'i'),
    ]);
    // Also catch first-name only (when creatorName is "Matt Walker" — "Walker says")
    const lastWord = creatorName.trim().split(/\s+/).pop();
    if (lastWord && lastWord.length > 2 && lastWord.toLowerCase() !== creatorName.trim().toLowerCase()) {
      const escapedLast = lastWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      base.push([
        `<lastname> says/argues`,
        new RegExp(`\\b${escapedLast}\\s+(says|argues|explains|notes|claims|believes|describes|recalls|recommends|suggests)\\b`, 'i'),
      ]);
    }
  }
  return base;
}

function scanField(
  value: string | undefined | null,
  location: string,
  patterns: Array<[string, RegExp]>,
): LeakHit[] {
  if (typeof value !== 'string' || value.length === 0) return [];
  const hits: LeakHit[] = [];
  for (const [label, re] of patterns) {
    const match = value.match(re);
    if (match && typeof match.index === 'number') {
      const start = Math.max(0, match.index - 35);
      const end = Math.min(value.length, match.index + match[0].length + 45);
      const excerpt = value.slice(start, end).replace(/\s+/g, ' ').trim();
      hits.push({ location, pattern: label, excerpt });
    }
  }
  return hits;
}

async function main() {
  const runId = process.argv[2];
  if (!runId) throw new Error('Usage: tsx ./src/scripts/check-third-person-leak.ts <runId>');

  const db = getDb();

  // ── Load channel profile ─────────────────────────────────
  const cpRows = await db
    .select({ payload: channelProfile.payload })
    .from(channelProfile)
    .where(eq(channelProfile.runId, runId));
  const cp = cpRows[0]?.payload as { schemaVersion?: string; creatorName?: string;
    hub_title?: string; hub_tagline?: string; hero_candidates?: string[] } | undefined;

  if (!cp || cp.schemaVersion !== 'v2') {
    console.info(`[3p-leak] runId=${runId} — channel profile is not v2 (skipping)`);
    await closeDb();
    process.exit(0);
  }

  const creatorName = cp.creatorName ?? null;
  const patterns = buildPatterns(creatorName);

  const allHits: LeakHit[] = [];

  // ChannelProfile rendered fields.
  allHits.push(...scanField(cp.hub_title, 'channelProfile.hub_title', patterns));
  allHits.push(...scanField(cp.hub_tagline, 'channelProfile.hub_tagline', patterns));
  if (Array.isArray(cp.hero_candidates)) {
    cp.hero_candidates.forEach((line, i) => {
      allHits.push(...scanField(line, `channelProfile.hero_candidates[${i}]`, patterns));
    });
  }

  // ── Canon nodes ──────────────────────────────────────────
  const canonRows = await db
    .select({ id: canonNode.id, payload: canonNode.payload })
    .from(canonNode)
    .where(eq(canonNode.runId, runId));

  let canonScanned = 0;
  for (const c of canonRows) {
    const p = c.payload as {
      schemaVersion?: string;
      kind?: string;
      title?: string;
      lede?: string;
      body?: string;
      _index_phases?: Array<{ title?: string; hook?: string; body?: string }>;
    };
    if (p.schemaVersion !== 'v2') continue;
    canonScanned += 1;
    const prefix = `canon[${c.id}]`;
    allHits.push(...scanField(p.title, `${prefix}.title`, patterns));
    allHits.push(...scanField(p.lede, `${prefix}.lede`, patterns));
    allHits.push(...scanField(p.body, `${prefix}.body`, patterns));
    if (p.kind === 'reader_journey' && Array.isArray(p._index_phases)) {
      p._index_phases.forEach((phase, i) => {
        allHits.push(...scanField(phase.title, `${prefix}.phases[${i}].title`, patterns));
        allHits.push(...scanField(phase.hook, `${prefix}.phases[${i}].hook`, patterns));
        allHits.push(...scanField(phase.body, `${prefix}.phases[${i}].body`, patterns));
      });
    }
  }

  // ── Page briefs ──────────────────────────────────────────
  const briefRows = await db
    .select({ id: pageBrief.id, payload: pageBrief.payload })
    .from(pageBrief)
    .where(eq(pageBrief.runId, runId));

  let briefsScanned = 0;
  for (const b of briefRows) {
    const p = b.payload as {
      schemaVersion?: string;
      pageTitle?: string;
      hook?: string;
      lede?: string;
      body?: string;
      cta?: { primary?: string; secondary?: string };
    };
    if (p.schemaVersion !== 'v2') continue;
    briefsScanned += 1;
    const prefix = `brief[${b.id}]`;
    allHits.push(...scanField(p.pageTitle, `${prefix}.pageTitle`, patterns));
    allHits.push(...scanField(p.hook, `${prefix}.hook`, patterns));
    allHits.push(...scanField(p.lede, `${prefix}.lede`, patterns));
    allHits.push(...scanField(p.body, `${prefix}.body`, patterns));
    allHits.push(...scanField(p.cta?.primary, `${prefix}.cta.primary`, patterns));
    allHits.push(...scanField(p.cta?.secondary, `${prefix}.cta.secondary`, patterns));
  }

  // ── VICs ─────────────────────────────────────────────────
  const vicRows = await db
    .select({ videoId: videoIntelligenceCard.videoId, payload: videoIntelligenceCard.payload })
    .from(videoIntelligenceCard)
    .where(eq(videoIntelligenceCard.runId, runId));

  let vicsScanned = 0;
  for (const v of vicRows) {
    const p = v.payload as { schemaVersion?: string; video_summary?: string };
    if (p.schemaVersion !== 'v2') continue;
    vicsScanned += 1;
    allHits.push(...scanField(p.video_summary, `vic[${v.videoId}].video_summary`, patterns));
  }

  // ── Report ───────────────────────────────────────────────
  const md = renderMarkdown(runId, creatorName, allHits, {
    canonScanned, briefsScanned, vicsScanned,
  });
  const outPath = path.join(
    process.env.TEMP || process.env.TMPDIR || '/tmp',
    `third-person-leak-${runId}.md`,
  );
  fs.writeFileSync(outPath, md);

  console.info(`[3p-leak] runId=${runId}`);
  console.info(`[3p-leak]   creator: ${creatorName ?? '(unknown)'}`);
  console.info(`[3p-leak]   scanned: ${canonScanned} canon · ${briefsScanned} briefs · ${vicsScanned} VICs · 1 channel profile`);
  console.info(`[3p-leak]   leaks found: ${allHits.length}`);
  if (allHits.length > 0) {
    const sample = allHits.slice(0, 5);
    for (const h of sample) {
      console.warn(`[3p-leak]   ${h.location}: «${h.pattern}» → "${h.excerpt}"`);
    }
    if (allHits.length > 5) console.warn(`[3p-leak]   …and ${allHits.length - 5} more`);
  }
  console.info(`[3p-leak] report written: ${outPath}`);

  await closeDb();
  if (allHits.length > 0) process.exit(2);
}

function renderMarkdown(
  runId: string,
  creatorName: string | null,
  hits: LeakHit[],
  scanned: { canonScanned: number; briefsScanned: number; vicsScanned: number },
): string {
  const lines: string[] = [];
  lines.push(`# Third-Person Leak Scan — \`${runId}\``);
  lines.push('');
  lines.push(`_Generated: ${new Date().toISOString()}_`);
  lines.push(`_Creator: ${creatorName ?? '(unknown)'}_`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Canon nodes scanned: **${scanned.canonScanned}**`);
  lines.push(`- Page briefs scanned: **${scanned.briefsScanned}**`);
  lines.push(`- VICs scanned: **${scanned.vicsScanned}**`);
  lines.push(`- Channel profile scanned: **1**`);
  lines.push(`- **Leaks found: ${hits.length}**`);
  lines.push('');
  if (hits.length === 0) {
    lines.push('✅ No third-person leaks in any rendered field. v2 voice flip held.');
    return lines.join('\n');
  }

  lines.push('## Leaks');
  lines.push('');
  lines.push('| Location | Pattern | Excerpt |');
  lines.push('|---|---|---|');
  for (const h of hits) {
    const excerpt = h.excerpt.replace(/\|/g, '\\|').slice(0, 100);
    lines.push(`| \`${h.location}\` | ${h.pattern} | ${excerpt} |`);
  }
  lines.push('');
  lines.push('Each leak above is a HARD-FAIL per the v2 schema spec (rule #1: "No third-person leak in rendered fields"). Re-run the relevant body writer with --regen-bodies / --regen-synthesis / --regen-journey / --regen-briefs / --regen-hero.');
  lines.push('');
  return lines.join('\n');
}

main().catch(async (err) => {
  await closeDb();
  console.error('[3p-leak] FAILED', err);
  process.exit(1);
});
