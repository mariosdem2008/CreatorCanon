/**
 * Voice-fingerprint compliance checker: for each brief, scores how well its
 * declared editorialStrategy.voiceFingerprint matches the actual brief
 * content (audienceQuestion + openingHook + outline section titles + intent).
 *
 * Heuristic score:
 *   - preserveTerms hit rate: % of declared terms that appear somewhere in the
 *     brief's prose. Terms missing from the prose suggest the brief drifted
 *     from the creator's vocabulary.
 *   - tonePreset alignment: cheap signals per preset
 *       blunt-tactical: short sentences (avg ≤ 18 words), imperatives, no hedges
 *       analytical-detached: 1+ hedge per 3 sentences, citations, longer sentences
 *       warm-coaching: 2nd-person "you", encouraging verbs
 *       reflective-thoughtful: subordinate clauses, paradox words
 *   - profanity-rule compliance: if profanityAllowed=false but prose contains
 *     curse words → violation. (We tolerate "shit happens" in operator-coach
 *     prose because profanityAllowed=true.)
 *
 * Output:
 *   /tmp/voice-fingerprint-<runId>.md — markdown report
 *   stdout: per-brief score lines + aggregate
 *
 * Usage:
 *   tsx ./src/scripts/check-voice-fingerprint.ts <runId>
 */

import fs from 'node:fs';
import path from 'node:path';

import { closeDb, eq, getDb, asc } from '@creatorcanon/db';
import { pageBrief } from '@creatorcanon/db/schema';

import { loadDefaultEnvFiles } from '../env-files';

loadDefaultEnvFiles();

const PROFANITY_PATTERN = /\b(fuck|shit|asshole|bullshit|damn|hell|crap|piss)\b/gi;
const HEDGES_PATTERN = /\b(might|may|could|seems|appears|suggests|likely|probably|in some cases|tends to|often|sometimes|generally|typically)\b/gi;
const PARADOX_PATTERN = /\b(yet|however|although|nonetheless|despite|even though|paradoxically|on the other hand)\b/gi;
const SECOND_PERSON_PATTERN = /\byou(\b|'re|'ll|'ve|'d|r)/gi;
const IMPERATIVE_VERBS = /^(map|cut|sell|do|stop|start|build|focus|measure|pick|choose|audit|kill|skip|drop|track|write|publish|run|test)\b/gim;

interface VoiceFingerprint {
  profanityAllowed?: boolean;
  tonePreset?: string;
  preserveTerms?: string[];
}

interface BriefScore {
  slug: string;
  title: string;
  fingerprint: VoiceFingerprint;
  preserveTermsHits: number;
  preserveTermsTotal: number;
  preserveTermsMissing: string[];
  toneScore: number; // 0-100, heuristic
  toneNotes: string[];
  profanityViolations: string[]; // empty = compliant
  overallScore: number; // 0-100, average of dimensions
}

function buildBriefProse(p: {
  pageTitle?: string;
  openingHook?: string;
  audienceQuestion?: string;
  outline?: Array<{ sectionTitle?: string; intent?: string }>;
}): string {
  const parts: string[] = [];
  if (p.pageTitle) parts.push(p.pageTitle);
  if (p.openingHook) parts.push(p.openingHook);
  if (p.audienceQuestion) parts.push(p.audienceQuestion);
  for (const s of p.outline ?? []) {
    if (s.sectionTitle) parts.push(s.sectionTitle);
    if (s.intent) parts.push(s.intent);
  }
  return parts.join(' ').toLowerCase();
}

function scorePreserveTerms(prose: string, terms: string[]): { hits: number; missing: string[] } {
  if (terms.length === 0) return { hits: 0, missing: [] };
  let hits = 0;
  const missing: string[] = [];
  for (const term of terms) {
    const t = term.trim().toLowerCase();
    if (t.length === 0) continue;
    if (prose.includes(t)) hits += 1;
    else missing.push(term);
  }
  return { hits, missing };
}

function avgWordsPerSentence(prose: string): number {
  const sentences = prose.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  if (sentences.length === 0) return 0;
  const totalWords = sentences.reduce((sum, s) => sum + s.trim().split(/\s+/).length, 0);
  return totalWords / sentences.length;
}

function scoreTone(prose: string, tonePreset: string | undefined): { score: number; notes: string[] } {
  const notes: string[] = [];
  if (!tonePreset) return { score: 50, notes: ['(no tone preset declared)'] };

  const avgLen = avgWordsPerSentence(prose);
  const hedges = (prose.match(HEDGES_PATTERN) ?? []).length;
  const sentences = prose.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const sentenceCount = Math.max(1, sentences.length);
  const hedgeRatio = hedges / sentenceCount;
  const secondPerson = (prose.match(SECOND_PERSON_PATTERN) ?? []).length;
  const paradox = (prose.match(PARADOX_PATTERN) ?? []).length;
  const imperatives = (prose.match(IMPERATIVE_VERBS) ?? []).length;

  let score = 50;
  switch (tonePreset) {
    case 'blunt-tactical': {
      // Hormozi-style: short sentences, imperatives, no hedges
      if (avgLen <= 18) { score += 20; notes.push(`avg sentence ${avgLen.toFixed(1)} words ≤ 18 ✓`); } else { notes.push(`avg sentence ${avgLen.toFixed(1)} words > 18 (too long for blunt-tactical)`); }
      if (hedgeRatio < 0.2) { score += 15; notes.push(`hedge ratio ${(hedgeRatio * 100).toFixed(0)}% < 20% ✓`); } else { score -= 15; notes.push(`hedge ratio ${(hedgeRatio * 100).toFixed(0)}% ≥ 20% (too soft)`); }
      if (imperatives > 0) { score += 15; notes.push(`${imperatives} imperative verb(s) ✓`); }
      break;
    }
    case 'analytical-detached': {
      // Huberman-style: hedged claims, longer sentences, mechanism words
      if (avgLen >= 18) { score += 15; notes.push(`avg sentence ${avgLen.toFixed(1)} words ≥ 18 ✓`); } else { notes.push(`avg sentence ${avgLen.toFixed(1)} words < 18 (too clipped for analytical-detached)`); }
      if (hedgeRatio >= 0.15) { score += 25; notes.push(`hedge ratio ${(hedgeRatio * 100).toFixed(0)}% ≥ 15% ✓`); } else { score -= 10; notes.push(`hedge ratio ${(hedgeRatio * 100).toFixed(0)}% < 15% (claims too absolute)`); }
      break;
    }
    case 'warm-coaching': {
      if (secondPerson > 0) { score += 25; notes.push(`${secondPerson} 2nd-person reference(s) ✓`); } else { score -= 20; notes.push(`no 2nd-person — feels distant`); }
      if (avgLen <= 22) { score += 10; notes.push(`avg sentence ${avgLen.toFixed(1)} words ≤ 22 ✓`); }
      break;
    }
    case 'reflective-thoughtful': {
      if (paradox > 0) { score += 20; notes.push(`${paradox} paradox word(s) ✓`); }
      if (avgLen >= 20) { score += 15; notes.push(`avg sentence ${avgLen.toFixed(1)} words ≥ 20 ✓`); }
      if (hedgeRatio >= 0.1) { score += 10; notes.push(`hedge ratio ${(hedgeRatio * 100).toFixed(0)}% ≥ 10% ✓ (comfort with uncertainty)`); }
      break;
    }
    default:
      notes.push(`(unknown tone preset "${tonePreset}" — using default 50)`);
  }
  return { score: Math.max(0, Math.min(100, score)), notes };
}

function scoreProfanity(prose: string, allowed: boolean): string[] {
  const matches = prose.match(PROFANITY_PATTERN) ?? [];
  if (allowed) return []; // no violation possible
  return [...new Set(matches.map((m) => m.toLowerCase()))];
}

async function main() {
  const runId = process.argv[2];
  if (!runId) throw new Error('Usage: tsx ./src/scripts/check-voice-fingerprint.ts <runId>');

  const db = getDb();
  const briefs = await db
    .select({ payload: pageBrief.payload })
    .from(pageBrief)
    .where(eq(pageBrief.runId, runId))
    .orderBy(asc(pageBrief.position));

  const scores: BriefScore[] = [];
  for (const b of briefs) {
    const p = b.payload as {
      slug?: string;
      pageTitle?: string;
      openingHook?: string;
      audienceQuestion?: string;
      outline?: Array<{ sectionTitle?: string; intent?: string }>;
      editorialStrategy?: { voiceFingerprint?: VoiceFingerprint };
    };
    const fingerprint = p.editorialStrategy?.voiceFingerprint ?? {};
    const prose = buildBriefProse(p);

    const { hits, missing } = scorePreserveTerms(prose, fingerprint.preserveTerms ?? []);
    const tone = scoreTone(prose, fingerprint.tonePreset);
    const profanityViolations = scoreProfanity(prose, fingerprint.profanityAllowed ?? false);

    const preserveTermsTotal = (fingerprint.preserveTerms ?? []).length;
    const preservePct = preserveTermsTotal > 0 ? (100 * hits) / preserveTermsTotal : 100;

    let overall = 0;
    let parts = 0;
    overall += preservePct; parts += 1;
    overall += tone.score; parts += 1;
    overall += profanityViolations.length === 0 ? 100 : 50; parts += 1;
    overall = overall / parts;

    scores.push({
      slug: p.slug ?? '?',
      title: p.pageTitle ?? '?',
      fingerprint,
      preserveTermsHits: hits,
      preserveTermsTotal,
      preserveTermsMissing: missing,
      toneScore: tone.score,
      toneNotes: tone.notes,
      profanityViolations,
      overallScore: Math.round(overall),
    });
  }

  const md = renderMarkdown(runId, scores);
  const outPath = path.join(
    process.env.TEMP || process.env.TMPDIR || '/tmp',
    `voice-fingerprint-${runId}.md`,
  );
  fs.writeFileSync(outPath, md);

  // stdout summary
  const avgScore = scores.length > 0 ? Math.round(scores.reduce((s, x) => s + x.overallScore, 0) / scores.length) : 0;
  const avgPreserve = scores.length > 0
    ? Math.round(
        scores.reduce(
          (s, x) => s + (x.preserveTermsTotal > 0 ? (100 * x.preserveTermsHits) / x.preserveTermsTotal : 100),
          0,
        ) / scores.length,
      )
    : 100;
  const avgTone = scores.length > 0 ? Math.round(scores.reduce((s, x) => s + x.toneScore, 0) / scores.length) : 50;
  const profanityViolations = scores.filter((s) => s.profanityViolations.length > 0).length;

  console.info(`[voice-fingerprint] runId=${runId}`);
  console.info(`[voice-fingerprint]   briefs scored: ${scores.length}`);
  console.info(`[voice-fingerprint]   avg overall score: ${avgScore}/100`);
  console.info(`[voice-fingerprint]   avg preserve-terms hit rate: ${avgPreserve}%`);
  console.info(`[voice-fingerprint]   avg tone score: ${avgTone}/100`);
  console.info(`[voice-fingerprint]   profanity-rule violations: ${profanityViolations}/${scores.length}`);
  console.info(`[voice-fingerprint] report written: ${outPath}`);

  await closeDb();
}

function renderMarkdown(runId: string, scores: BriefScore[]): string {
  const lines: string[] = [];
  lines.push(`# Voice-Fingerprint Compliance — \`${runId}\``);
  lines.push('');
  lines.push(`_Generated: ${new Date().toISOString()}_`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  if (scores.length === 0) {
    lines.push('_No briefs to score._');
    return lines.join('\n');
  }
  const avg = Math.round(scores.reduce((s, x) => s + x.overallScore, 0) / scores.length);
  const avgPreserve = Math.round(
    scores.reduce(
      (s, x) => s + (x.preserveTermsTotal > 0 ? (100 * x.preserveTermsHits) / x.preserveTermsTotal : 100),
      0,
    ) / scores.length,
  );
  const avgTone = Math.round(scores.reduce((s, x) => s + x.toneScore, 0) / scores.length);
  const profanityViolations = scores.filter((s) => s.profanityViolations.length > 0).length;
  lines.push(`- Briefs scored: **${scores.length}**`);
  lines.push(`- Average overall: **${avg}/100**`);
  lines.push(`- Average preserve-terms hit rate: **${avgPreserve}%**`);
  lines.push(`- Average tone alignment: **${avgTone}/100**`);
  lines.push(`- Profanity-rule violations: **${profanityViolations}**`);
  lines.push('');

  lines.push('## Per-brief scores');
  lines.push('');
  lines.push('| Slug | Title | Tone preset | Preserve hits | Tone | Overall |');
  lines.push('|---|---|---|---:|---:|---:|');
  for (const s of scores) {
    lines.push(
      `| \`${s.slug}\` | ${truncate(s.title, 40)} | ${s.fingerprint.tonePreset ?? '?'} | ${s.preserveTermsHits}/${s.preserveTermsTotal} | ${s.toneScore} | **${s.overallScore}** |`,
    );
  }
  lines.push('');

  // Detail any below 70 or with violations
  const concerns = scores.filter(
    (s) => s.overallScore < 70 || s.profanityViolations.length > 0 || s.preserveTermsMissing.length > s.preserveTermsTotal / 2,
  );
  if (concerns.length > 0) {
    lines.push('## Briefs needing editor review');
    lines.push('');
    for (const s of concerns) {
      lines.push(`### \`${s.slug}\` — ${s.title}`);
      lines.push(`- Overall: ${s.overallScore}/100`);
      lines.push(`- Tone preset: \`${s.fingerprint.tonePreset ?? '(none)'}\` · score ${s.toneScore}/100`);
      if (s.toneNotes.length > 0) {
        for (const n of s.toneNotes) lines.push(`    - ${n}`);
      }
      lines.push(`- Preserve terms: ${s.preserveTermsHits}/${s.preserveTermsTotal} hit`);
      if (s.preserveTermsMissing.length > 0) {
        lines.push(`    - missing: ${s.preserveTermsMissing.map((t) => `"${t}"`).join(', ')}`);
      }
      if (s.profanityViolations.length > 0) {
        lines.push(`- ⚠️ Profanity violation (profanityAllowed=false): ${s.profanityViolations.join(', ')}`);
      }
      lines.push('');
    }
  } else {
    lines.push('_No briefs flagged for review._');
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push('## Editor sign-off');
  lines.push('');
  lines.push('I have reviewed each flagged brief above and confirm:');
  lines.push('');
  lines.push('- [ ] All overall scores ≥ 70 (or briefs with lower scores have been edited or accepted)');
  lines.push('- [ ] Profanity-rule violations resolved (or accepted as intentional)');
  lines.push('- [ ] Missing preserve-terms either added back or removed from the fingerprint declaration');
  lines.push('');
  lines.push(`Signed: _____________________   Date: __________`);
  return lines.join('\n');
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 3) + '...';
}

main().catch(async (err) => {
  await closeDb();
  console.error('[voice-fingerprint] FAILED', err);
  process.exit(1);
});
