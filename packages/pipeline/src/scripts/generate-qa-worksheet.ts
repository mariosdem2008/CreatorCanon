/**
 * QA worksheet generator: produces a markdown checklist a human editor signs
 * before a hub goes to print. Pre-fills sampled spot-checks across canon
 * claim accuracy, voice compliance, cluster topology, and CTA alignment.
 *
 * Sections:
 *   1. Claim → segment verification (10 sampled)
 *   2. Voice compliance spot checks (3 sampled briefs)
 *   3. Cluster topology architecture review (per cluster)
 *   4. CTA alignment per brief
 *   5. Editor sign-off
 *
 * Output: /tmp/qa-worksheet-<runId>.md
 *
 * Usage:
 *   tsx ./src/scripts/generate-qa-worksheet.ts <runId>
 */

import fs from 'node:fs';
import path from 'node:path';

import { closeDb, eq, getDb, asc } from '@creatorcanon/db';
import {
  canonNode,
  channelProfile,
  pageBrief,
  segment,
  video,
  videoIntelligenceCard,
} from '@creatorcanon/db/schema';

import { loadDefaultEnvFiles } from '../env-files';

loadDefaultEnvFiles();

const UUID_PATTERN = /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi;

interface ClaimSpotCheck {
  source: string; // e.g. "VIC mu_xxx mainIdea[3]" or "canon node cn_xxx step[1]"
  claim: string;
  segmentId: string;
  segmentText: string;
  videoTitle: string;
  timestamp: string; // formatted m:ss
}

function formatTs(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Pick a deterministic random sample so re-runs produce stable worksheets. */
function pickN<T>(arr: T[], n: number, seed: string): T[] {
  if (arr.length <= n) return [...arr];
  // Cheap deterministic shuffle via seeded LCG
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) | 0;
  let rng = h >>> 0;
  const lcg = () => {
    rng = (rng * 1103515245 + 12345) & 0x7fffffff;
    return rng / 0x80000000;
  };
  const indexed = arr.map((v, i) => ({ v, k: lcg() }));
  indexed.sort((a, b) => a.k - b.k);
  return indexed.slice(0, n).map((x) => x.v);
}

interface ExtractedClaim {
  source: string;
  claim: string;
  segmentId: string;
}

function extractClaimsFromVic(
  vic: { videoId: string; payload: unknown },
): ExtractedClaim[] {
  const out: ExtractedClaim[] = [];
  const p = vic.payload as Record<string, unknown>;
  const fieldsToScan: Array<{ key: string; itemKey?: string }> = [
    { key: 'mainIdeas' },
    { key: 'lessons' },
    { key: 'examples' },
    { key: 'strongClaims' },
    { key: 'contrarianTakes' },
  ];
  for (const f of fieldsToScan) {
    const arr = p[f.key];
    if (!Array.isArray(arr)) continue;
    for (let i = 0; i < arr.length; i += 1) {
      const item = arr[i];
      const text = typeof item === 'string' ? item : JSON.stringify(item);
      const ids = text.match(UUID_PATTERN) ?? [];
      if (ids.length === 0) continue;
      out.push({
        source: `VIC ${vic.videoId} ${f.key}[${i}]`,
        claim: text,
        segmentId: ids[0]!,
      });
    }
  }
  return out;
}

function extractClaimsFromCanon(
  n: { id: string; type: string; payload: unknown },
): ExtractedClaim[] {
  const out: ExtractedClaim[] = [];
  const p = n.payload as Record<string, unknown>;
  const title = (p.title as string | undefined) ?? '(Untitled)';
  const fieldsToScan = ['steps', 'examples', 'preconditions', 'failureModes'];
  for (const k of fieldsToScan) {
    const arr = p[k];
    if (!Array.isArray(arr)) continue;
    for (let i = 0; i < arr.length; i += 1) {
      const item = arr[i];
      const text = typeof item === 'string' ? item : JSON.stringify(item);
      const ids = text.match(UUID_PATTERN) ?? [];
      if (ids.length === 0) continue;
      out.push({
        source: `canon \`${n.id}\` (${title}) ${k}[${i}]`,
        claim: text,
        segmentId: ids[0]!,
      });
    }
  }
  return out;
}

async function main() {
  const runId = process.argv[2];
  if (!runId) throw new Error('Usage: tsx ./src/scripts/generate-qa-worksheet.ts <runId>');

  const db = getDb();

  // Channel profile
  const cpRows = await db
    .select({ payload: channelProfile.payload })
    .from(channelProfile)
    .where(eq(channelProfile.runId, runId))
    .limit(1);
  const profile = cpRows[0]?.payload as
    | { creatorName?: string; monetizationAngle?: string; dominantTone?: string }
    | undefined;
  const creatorName = profile?.creatorName ?? '(unknown creator)';
  const monetization = profile?.monetizationAngle ?? '(no monetizationAngle in profile)';

  // Segments + videos for citation lookup
  const segs = await db
    .select({ id: segment.id, videoId: segment.videoId, startMs: segment.startMs, text: segment.text })
    .from(segment)
    .where(eq(segment.runId, runId));
  const segById = new Map(segs.map((s) => [s.id, s]));

  const vidRows = await db.select({ id: video.id, title: video.title }).from(video);
  const titleByVideoId = new Map(vidRows.map((v) => [v.id, v.title ?? v.id]));

  // VICs
  const vics = await db
    .select({ videoId: videoIntelligenceCard.videoId, payload: videoIntelligenceCard.payload })
    .from(videoIntelligenceCard)
    .where(eq(videoIntelligenceCard.runId, runId));

  // Canon nodes
  const canonRows = await db
    .select({ id: canonNode.id, type: canonNode.type, payload: canonNode.payload })
    .from(canonNode)
    .where(eq(canonNode.runId, runId));

  // Briefs
  const briefs = await db
    .select({ payload: pageBrief.payload })
    .from(pageBrief)
    .where(eq(pageBrief.runId, runId))
    .orderBy(asc(pageBrief.position));

  // ── 1. Claim → segment spot checks ──────────────────────
  const allClaims: ExtractedClaim[] = [];
  for (const v of vics) allClaims.push(...extractClaimsFromVic(v));
  for (const n of canonRows) allClaims.push(...extractClaimsFromCanon(n));

  const sampledClaims = pickN(allClaims, 10, runId);
  const claimChecks: ClaimSpotCheck[] = [];
  for (const c of sampledClaims) {
    const seg = segById.get(c.segmentId);
    if (!seg) continue;
    claimChecks.push({
      source: c.source,
      claim: c.claim,
      segmentId: c.segmentId,
      segmentText: seg.text,
      videoTitle: titleByVideoId.get(seg.videoId) ?? seg.videoId,
      timestamp: formatTs(seg.startMs),
    });
  }

  // ── 2. Voice compliance spot checks ─────────────────────
  const voiceSampleBriefs = pickN(briefs, 3, runId + ':voice');

  // ── 3. Cluster topology ─────────────────────────────────
  const byParent = new Map<string, Array<{ slug: string; title: string }>>();
  const pillars: Array<{ slug: string; title: string }> = [];
  for (const b of briefs) {
    const p = b.payload as {
      pageTitle?: string;
      slug?: string;
      editorialStrategy?: { clusterRole?: { tier?: string; parentTopic?: string | null } };
    };
    const cr = p.editorialStrategy?.clusterRole;
    if (!cr) continue;
    if (cr.tier === 'pillar') {
      pillars.push({ slug: p.slug ?? '?', title: p.pageTitle ?? '?' });
    } else {
      const parent = cr.parentTopic ?? '__orphan__';
      const arr = byParent.get(parent) ?? [];
      arr.push({ slug: p.slug ?? '?', title: p.pageTitle ?? '?' });
      byParent.set(parent, arr);
    }
  }

  // ── 4. CTA alignment ────────────────────────────────────
  const ctaSamples = pickN(briefs, 6, runId + ':cta');

  // ── Render markdown ─────────────────────────────────────
  const md = renderWorksheet({
    runId,
    creatorName,
    monetization,
    claimChecks,
    voiceSampleBriefs: voiceSampleBriefs.map((b) => b.payload as Record<string, unknown>),
    pillars,
    spokesByParent: byParent,
    ctaSamples: ctaSamples.map((b) => b.payload as Record<string, unknown>),
  });

  const outPath = path.join(
    process.env.TEMP || process.env.TMPDIR || '/tmp',
    `qa-worksheet-${runId}.md`,
  );
  fs.writeFileSync(outPath, md);

  console.info(`[qa-worksheet] runId=${runId}`);
  console.info(`[qa-worksheet]   creator: ${creatorName}`);
  console.info(`[qa-worksheet]   claim checks: ${claimChecks.length} (sampled from ${allClaims.length})`);
  console.info(`[qa-worksheet]   voice spot checks: ${voiceSampleBriefs.length}`);
  console.info(`[qa-worksheet]   clusters: ${byParent.size} (+ ${pillars.length} pillars)`);
  console.info(`[qa-worksheet]   CTA checks: ${ctaSamples.length}`);
  console.info(`[qa-worksheet] worksheet written: ${outPath}`);

  await closeDb();
}

interface WorksheetInput {
  runId: string;
  creatorName: string;
  monetization: string;
  claimChecks: ClaimSpotCheck[];
  voiceSampleBriefs: Record<string, unknown>[];
  pillars: Array<{ slug: string; title: string }>;
  spokesByParent: Map<string, Array<{ slug: string; title: string }>>;
  ctaSamples: Record<string, unknown>[];
}

function renderWorksheet(i: WorksheetInput): string {
  const lines: string[] = [];
  lines.push(`# QA Worksheet — ${i.creatorName}`);
  lines.push('');
  lines.push(`_Run: \`${i.runId}\` · Generated: ${new Date().toISOString()}_`);
  lines.push('');
  lines.push('Editor: complete each section below before signing at the bottom.');
  lines.push('');

  // 1. Claim verification
  lines.push('## 1. Claim → segment verification (10 spot checks)');
  lines.push('');
  if (i.claimChecks.length === 0) {
    lines.push('_No cited claims found in the run. Investigate citation density before publishing._');
  } else {
    for (let n = 0; n < i.claimChecks.length; n += 1) {
      const c = i.claimChecks[n]!;
      lines.push(`### Claim ${n + 1}: ${c.source}`);
      lines.push('');
      lines.push(`**Claim:** ${c.claim}`);
      lines.push('');
      lines.push(`**Cited segment:** \`${c.segmentId}\` from "${c.videoTitle}" at **[${c.timestamp}]**`);
      lines.push('');
      lines.push(`**Segment text:**`);
      lines.push('');
      lines.push(`> ${c.segmentText}`);
      lines.push('');
      lines.push('Does the claim accurately summarize the segment?');
      lines.push('');
      lines.push('- [ ] Yes, accurate');
      lines.push('- [ ] No, distorts the segment');
      lines.push('- [ ] Partial — needs editing');
      lines.push('');
      lines.push('Notes: ___________________________________________');
      lines.push('');
    }
  }

  // 2. Voice compliance
  lines.push('## 2. Voice compliance spot checks');
  lines.push('');
  lines.push(`Read each brief below aloud. Does it sound like **${i.creatorName}**?`);
  lines.push('');
  for (let n = 0; n < i.voiceSampleBriefs.length; n += 1) {
    const b = i.voiceSampleBriefs[n] as {
      pageTitle?: string;
      slug?: string;
      openingHook?: string;
      audienceQuestion?: string;
      editorialStrategy?: { voiceFingerprint?: { tonePreset?: string; preserveTerms?: string[] } };
    };
    const vf = b.editorialStrategy?.voiceFingerprint;
    lines.push(`### Voice check ${n + 1}: \`${b.slug}\` — ${b.pageTitle}`);
    lines.push('');
    lines.push(`- **Tone preset declared:** \`${vf?.tonePreset ?? '(none)'}\``);
    lines.push(`- **Preserve terms declared:** ${(vf?.preserveTerms ?? []).map((t) => `\`${t}\``).join(', ') || '(none)'}`);
    lines.push('');
    lines.push(`**Hook:** ${b.openingHook ?? '(none)'}`);
    lines.push('');
    lines.push(`**Audience question:** ${b.audienceQuestion ?? '(none)'}`);
    lines.push('');
    lines.push(`Does this sound like ${i.creatorName}?`);
    lines.push('');
    lines.push('- [ ] Yes, on-voice');
    lines.push('- [ ] No, sounds like generic AI prose');
    lines.push('- [ ] Mostly — needs minor edits');
    lines.push('');
    lines.push('Notes: ___________________________________________');
    lines.push('');
  }

  // 3. Cluster topology
  lines.push('## 3. Cluster topology architecture review');
  lines.push('');
  lines.push(`The audit produced ${i.pillars.length} pillar pages and ${i.spokesByParent.size} spoke clusters.`);
  lines.push('');
  lines.push('### Pillar pages');
  lines.push('');
  for (const p of i.pillars) lines.push(`- \`${p.slug}\` — ${p.title}`);
  lines.push('');
  lines.push('### Spoke clusters');
  lines.push('');
  for (const [parent, spokes] of i.spokesByParent) {
    lines.push(`**Parent: \`${parent}\`** (${spokes.length} spokes)`);
    lines.push('');
    for (const s of spokes) lines.push(`  - \`${s.slug}\` — ${s.title}`);
    lines.push('');
  }
  lines.push('Does this architecture make sense as hub navigation?');
  lines.push('');
  lines.push('- [ ] Yes, clusters and pillars feel coherent');
  lines.push('- [ ] No, some clusters belong together / apart');
  lines.push('- [ ] Mostly — minor regrouping needed');
  lines.push('');
  lines.push('Notes: ___________________________________________');
  lines.push('');

  // 4. CTA alignment
  lines.push('## 4. CTA alignment per brief');
  lines.push('');
  lines.push(`Channel monetization angle: **${i.monetization}**`);
  lines.push('');
  lines.push('For each brief, is the CTA aligned with the channel\'s monetization?');
  lines.push('');
  for (let n = 0; n < i.ctaSamples.length; n += 1) {
    const b = i.ctaSamples[n] as {
      pageTitle?: string;
      slug?: string;
      editorialStrategy?: { cta?: { primary?: string; secondary?: string } };
    };
    const cta = b.editorialStrategy?.cta;
    lines.push(`### CTA ${n + 1}: \`${b.slug}\` — ${b.pageTitle}`);
    lines.push('');
    lines.push(`- **Primary CTA:** ${cta?.primary ?? '(none)'}`);
    lines.push(`- **Secondary CTA:** ${cta?.secondary ?? '(none)'}`);
    lines.push('');
    lines.push('Aligned with channel monetization?');
    lines.push('');
    lines.push('- [ ] Yes');
    lines.push('- [ ] No');
    lines.push('- [ ] Needs editing');
    lines.push('');
    lines.push('Notes: ___________________________________________');
    lines.push('');
  }

  // 5. Editor sign-off
  lines.push('---');
  lines.push('');
  lines.push('## Editor sign-off');
  lines.push('');
  lines.push('I have completed the QA pass above and confirm:');
  lines.push('');
  lines.push('- [ ] At least 8/10 claims accurately summarize their cited segments');
  lines.push('- [ ] All 3 voice spot checks read on-voice (or have been flagged)');
  lines.push('- [ ] Cluster topology is coherent for hub navigation');
  lines.push('- [ ] CTAs are aligned with the channel\'s monetization angle');
  lines.push('- [ ] All issues flagged above have been triaged into edits or accepted');
  lines.push('');
  lines.push(`Editor: _____________________   Date: __________`);
  lines.push('');
  lines.push(`Run cleared for publishing: [ ] yes [ ] no — needs revisions`);
  return lines.join('\n');
}

main().catch(async (err) => {
  await closeDb();
  console.error('[qa-worksheet] FAILED', err);
  process.exit(1);
});
