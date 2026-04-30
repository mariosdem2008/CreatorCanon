/**
 * Build a comprehensive markdown export of a run audit.
 *
 * Reads from a `RunAuditView` (the same shape the audit page renders) and
 * produces a portable, complete dump suitable for pasting into ChatGPT,
 * Notion, email, or anywhere else the operator wants to review the full
 * pipeline output.
 *
 * Pure function — no I/O.
 */

import type { RunAuditView } from './types';

export function buildAuditMarkdown(view: RunAuditView): string {
  const lines: string[] = [];

  // ── Header ─────────────────────────────────────────────
  lines.push(`# Run Audit — ${view.projectTitle ?? '(untitled project)'}`);
  lines.push(``);
  lines.push(`- **Run ID:** \`${view.runId}\``);
  lines.push(`- **Project ID:** \`${view.projectId}\``);
  lines.push(`- **Status:** ${view.status}`);
  lines.push(`- **Total cost so far:** $${(view.costCents / 100).toFixed(2)}`);
  lines.push(``);

  // ── Channel profile ────────────────────────────────────
  lines.push(`## Channel Profile`);
  lines.push(``);
  if (!view.channelProfile) {
    lines.push(`_Not yet captured._`);
  } else {
    const cp = view.channelProfile;
    writeKv(lines, 'Creator name', cp.creatorName);
    writeKv(lines, 'Niche', cp.niche);
    writeKv(lines, 'Audience', cp.audience);
    writeKv(lines, 'Dominant tone', cp.dominantTone);
    writeKv(lines, 'Recurring promise', cp.recurringPromise);
    writeKv(lines, 'Why people follow', cp.whyPeopleFollow);
    writeKv(lines, 'Expertise category', cp.expertiseCategory);
    writeKv(lines, 'Monetization angle', cp.monetizationAngle);
    writeKv(lines, 'Positioning summary', cp.positioningSummary);
    writeStringArray(lines, 'Content formats', cp.contentFormats);
    writeStringArray(lines, 'Recurring themes', cp.recurringThemes);
    writeStringArray(lines, 'Vocabulary preserved verbatim', cp.creatorTerminology);
    // Anything else from the raw payload we didn't render
    const renderedKeys = new Set([
      'creatorName',
      'niche',
      'audience',
      'dominantTone',
      'recurringPromise',
      'whyPeopleFollow',
      'expertiseCategory',
      'monetizationAngle',
      'positioningSummary',
      'contentFormats',
      'recurringThemes',
      'creatorTerminology',
    ]);
    for (const [k, v] of Object.entries(cp.payload)) {
      if (renderedKeys.has(k) || v == null) continue;
      if (typeof v === 'string' && v.trim().length > 0) writeKv(lines, prettyKey(k), v);
      else if (Array.isArray(v) && v.length > 0) {
        const allStrings = v.every((x): x is string => typeof x === 'string');
        if (allStrings) writeStringArray(lines, prettyKey(k), v);
      }
    }
  }
  lines.push(``);

  // ── Visual moments ─────────────────────────────────────
  lines.push(`## Visual Moments (${view.visualMoments.length})`);
  lines.push(``);
  if (view.visualMoments.length === 0) {
    lines.push(`_None extracted (videos lacked usable on-screen content, or were transcript-only)._`);
  } else {
    for (let i = 0; i < view.visualMoments.length; i += 1) {
      const m = view.visualMoments[i]!;
      lines.push(`### ${i + 1}. ${m.type} · ${formatTs(m.timestampMs)} · ${m.videoTitle}`);
      const meta: string[] = [];
      if (m.usefulnessScore != null) meta.push(`usefulness=${m.usefulnessScore}`);
      if (meta.length > 0) lines.push(`_${meta.join(' · ')}_`);
      lines.push(m.description);
      if (m.hubUse) lines.push(`_Hub use: ${m.hubUse}_`);
      if (m.extractedText) {
        lines.push(``);
        lines.push(`> **Extracted on-screen text:**`);
        for (const ln of m.extractedText.split('\n')) lines.push(`> ${ln}`);
      }
      lines.push(``);
    }
  }
  lines.push(``);

  // ── Per-video intelligence cards (full content) ────────
  lines.push(`## Per-Video Intelligence (${view.videoIntelligenceCards.length})`);
  lines.push(``);
  for (const v of view.videoIntelligenceCards) {
    const youtubeId = view.youtubeIdByVideoId[v.videoId] ?? null;
    const headerSuffix = youtubeId
      ? ` · [▶ Watch on YouTube](https://www.youtube.com/watch?v=${youtubeId})`
      : '';
    lines.push(`### Video: ${v.videoTitle}${headerSuffix}`);
    lines.push(`_Video ID: \`${v.videoId}\` · Citing ${v.evidenceSegmentCount} segments_`);
    lines.push(``);
    const pl = v.payload;
    renderArraySection(lines, pl, 'mainIdeas', 'Main ideas');
    renderArraySection(lines, pl, 'frameworks', 'Frameworks');
    renderArraySection(lines, pl, 'lessons', 'Lessons');
    renderArraySection(lines, pl, 'examples', 'Examples');
    renderArraySection(lines, pl, 'stories', 'Stories');
    renderArraySection(lines, pl, 'mistakesToAvoid', 'Mistakes to avoid');
    renderArraySection(lines, pl, 'failureModes', 'Failure modes');
    renderArraySection(lines, pl, 'counterCases', 'Counter cases');
    renderArraySection(lines, pl, 'quotes', 'Quotes');
    renderArraySection(lines, pl, 'strongClaims', 'Strong claims');
    renderArraySection(lines, pl, 'contrarianTakes', 'Contrarian takes');
    renderArraySection(lines, pl, 'termsDefined', 'Terms defined');
    renderArraySection(lines, pl, 'toolsMentioned', 'Tools mentioned');
    renderArraySection(lines, pl, 'creatorVoiceNotes', 'Creator voice notes');
    renderArraySection(lines, pl, 'recommendedHubUses', 'Recommended hub uses');
    lines.push(``);
  }

  // ── Knowledge graph (canon nodes, full payload) ────────
  lines.push(`## Knowledge Graph — ${view.canonNodes.length} canon nodes`);
  lines.push(``);
  const order = [
    'playbook',
    'framework',
    'lesson',
    'principle',
    'definition',
    'tactic',
    'pattern',
    'example',
    'aha_moment',
    'quote',
    'topic',
  ];
  const byType = new Map<string, typeof view.canonNodes>();
  for (const n of view.canonNodes) {
    const arr = byType.get(n.type) ?? [];
    arr.push(n);
    byType.set(n.type, arr);
  }
  const sortedTypes = order
    .filter((t) => byType.has(t))
    .concat([...byType.keys()].filter((t) => !order.includes(t)));
  for (const t of sortedTypes) {
    const arr = byType.get(t)!;
    lines.push(`### ${t} (${arr.length})`);
    lines.push(``);
    for (const n of arr) {
      lines.push(`#### ${n.title ?? '(Untitled)'}`);
      const meta: string[] = [`id=\`${n.id}\``];
      if (n.pageWorthinessScore != null) meta.push(`pageWorthiness=${n.pageWorthinessScore}`);
      if (n.confidenceScore != null) meta.push(`confidence=${n.confidenceScore}`);
      if (n.specificityScore != null) meta.push(`specificity=${n.specificityScore}`);
      if (n.creatorUniquenessScore != null) meta.push(`creatorUniq=${n.creatorUniquenessScore}`);
      if (n.citationCount != null) meta.push(`citations=${n.citationCount}`);
      if (n.sourceCoverage != null) meta.push(`sourceCoverage=${n.sourceCoverage}`);
      if (n.evidenceQuality) meta.push(`evidence=${n.evidenceQuality}`);
      if (n.origin) meta.push(`origin=${n.origin}`);
      lines.push(`_${meta.join(' · ')}_`);
      if (n.sourceVideoTitles.length > 0) lines.push(`_Sources: ${n.sourceVideoTitles.join(' · ')}_`);
      lines.push(``);

      const pl = n.payload;
      writeKv(lines, 'Definition', stringOrNull(pl.definition));
      writeKv(lines, 'Summary', stringOrNull(pl.summary));
      writeKv(lines, 'When to use', stringOrNull(pl.whenToUse));
      writeKv(lines, 'When NOT to use', stringOrNull(pl.whenNotToUse));
      writeKv(lines, 'Common mistake', stringOrNull(pl.commonMistake));
      writeKv(lines, 'Success signal', stringOrNull(pl.successSignal));
      writeKv(lines, 'Sequencing rationale', stringOrNull(pl.sequencingRationale));
      writeArrayField(lines, pl, 'preconditions', 'Preconditions');
      writeArrayField(lines, pl, 'steps', 'Steps');
      writeArrayField(lines, pl, 'failureModes', 'Failure modes');
      writeArrayField(lines, pl, 'examples', 'Examples');

      const rendered = new Set([
        'title',
        'name',
        'term',
        'definition',
        'summary',
        'whenToUse',
        'whenNotToUse',
        'commonMistake',
        'successSignal',
        'sequencingRationale',
        'preconditions',
        'steps',
        'failureModes',
        'examples',
        'pageWorthinessScore',
        'confidenceScore',
        'specificityScore',
        'creatorUniquenessScore',
        'evidenceQuality',
        'origin',
        'visualMomentIds',
      ]);
      for (const [k, v] of Object.entries(pl)) {
        if (rendered.has(k) || v == null) continue;
        if (typeof v === 'string' && v.trim().length > 0) writeKv(lines, prettyKey(k), v);
        else if (Array.isArray(v) && v.length > 0) {
          const allStrings = v.every((x): x is string => typeof x === 'string');
          if (allStrings) writeStringArray(lines, prettyKey(k), v);
        }
      }
      lines.push(``);
    }
  }

  // ── Proposed pages (briefs) ────────────────────────────
  lines.push(`## Proposed Hub Pages — ${view.pageBriefs.length}`);
  lines.push(``);
  if (view.pageBriefs.length === 0) {
    lines.push(`_No briefs generated yet._`);
  } else {
    const titleById = new Map(view.canonNodes.map((n) => [n.id, n.title ?? '(Untitled)']));
    for (let i = 0; i < view.pageBriefs.length; i += 1) {
      const b = view.pageBriefs[i]!;
      lines.push(`### ${i + 1}. [${b.pageType}] ${b.pageTitle}`);
      const metaParts: string[] = [`brief id: \`${b.id}\``, `position: ${b.position}`];
      if (b.slug) metaParts.unshift(`slug: \`${b.slug}\``);
      if (b.pageWorthinessScore != null) metaParts.push(`pageWorthiness=${b.pageWorthinessScore}`);
      lines.push(`_${metaParts.join(' · ')}_`);
      writeKv(lines, 'Audience question', b.audienceQuestion);
      writeKv(lines, 'Opening hook', b.openingHook);
      if (b.primaryCanonNodeIds.length > 0) {
        lines.push(`**Primary canon nodes (${b.primaryCanonNodeIds.length}):**`);
        for (const id of b.primaryCanonNodeIds) {
          lines.push(`- \`${id}\` — ${titleById.get(id) ?? '(unknown)'}`);
        }
        lines.push(``);
      }
      if (b.supportingCanonNodeIds.length > 0) {
        lines.push(`**Supporting canon nodes (${b.supportingCanonNodeIds.length}):**`);
        for (const id of b.supportingCanonNodeIds) {
          lines.push(`- \`${id}\` — ${titleById.get(id) ?? '(unknown)'}`);
        }
        lines.push(``);
      }
      // Anything else in the brief payload
      const briefRendered = new Set([
        'pageType',
        'pageTitle',
        'slug',
        'audienceQuestion',
        'openingHook',
        'primaryCanonNodeIds',
        'supportingCanonNodeIds',
      ]);
      for (const [k, v] of Object.entries(b.payload)) {
        if (briefRendered.has(k) || v == null) continue;
        if (typeof v === 'string' && v.trim().length > 0) writeKv(lines, prettyKey(k), v);
        else if (Array.isArray(v) && v.length > 0) {
          const allStrings = v.every((x): x is string => typeof x === 'string');
          if (allStrings) writeStringArray(lines, prettyKey(k), v);
        }
      }
      lines.push(``);
    }
  }

  // ── Stage cost breakdown ───────────────────────────────
  lines.push(`## Stage Cost Breakdown`);
  lines.push(``);
  if (view.costByStage.length === 0) {
    lines.push(`_No stage cost data._`);
  } else {
    for (const s of view.costByStage) {
      lines.push(`- **${s.stage}**: $${(s.costCents / 100).toFixed(2)}`);
    }
    lines.push(`- **Total**: $${(view.costCents / 100).toFixed(2)}`);
  }
  lines.push(``);

  const raw = lines.join('\n');
  return linkifyCitations(raw, view.segmentMap, view.youtubeIdByVideoId);
}

function formatTs(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function stringOrNull(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v : null;
}

function writeKv(lines: string[], label: string, value: string | null): void {
  if (!value) return;
  lines.push(`**${label}:** ${value}`);
  lines.push(``);
}

function writeStringArray(lines: string[], label: string, values: string[]): void {
  if (values.length === 0) return;
  lines.push(`**${label} (${values.length}):**`);
  for (const v of values) lines.push(`- ${v}`);
  lines.push(``);
}

function writeArrayField(
  lines: string[],
  payload: Record<string, unknown>,
  key: string,
  label: string,
): void {
  const v = payload[key];
  if (!Array.isArray(v) || v.length === 0) return;
  lines.push(`**${label} (${v.length}):**`);
  for (const item of v) {
    if (typeof item === 'string') lines.push(`- ${item}`);
    else lines.push(`- ${JSON.stringify(item)}`);
  }
  lines.push(``);
}

function renderArraySection(
  lines: string[],
  payload: Record<string, unknown>,
  key: string,
  label: string,
): void {
  const v = payload[key];
  if (!Array.isArray(v) || v.length === 0) return;
  lines.push(`**${label} (${v.length}):**`);
  for (const item of v) {
    if (typeof item === 'string') {
      lines.push(`- ${item}`);
    } else if (item && typeof item === 'object') {
      const o = item as Record<string, unknown>;
      const mistake = stringOrNull(o.mistake);
      const why = stringOrNull(o.why);
      const correction = stringOrNull(o.correction);
      if (mistake) {
        let line = `- **Mistake:** ${mistake}`;
        if (why) line += ` _Why:_ ${why}`;
        if (correction) line += ` _Correction:_ ${correction}`;
        lines.push(line);
      } else if (
        stringOrNull(o.text) ||
        stringOrNull(o.body) ||
        stringOrNull(o.title) ||
        stringOrNull(o.name)
      ) {
        const primary =
          stringOrNull(o.text) ?? stringOrNull(o.body) ?? stringOrNull(o.title) ?? stringOrNull(o.name);
        lines.push(`- ${primary}`);
        for (const [k, vv] of Object.entries(o)) {
          if (k === 'text' || k === 'body' || k === 'title' || k === 'name') continue;
          if (typeof vv === 'string' && vv.trim().length > 0) {
            lines.push(`  - _${prettyKey(k)}:_ ${vv}`);
          } else if (Array.isArray(vv) && vv.length > 0) {
            const joined = vv.filter((x): x is string => typeof x === 'string').join(', ');
            if (joined) lines.push(`  - _${prettyKey(k)}:_ ${joined}`);
          }
        }
      } else {
        lines.push(`- ${JSON.stringify(item)}`);
      }
    }
  }
  lines.push(``);
}

function prettyKey(camel: string): string {
  const out = camel.replace(/([A-Z])/g, ' $1').toLowerCase();
  return out.charAt(0).toUpperCase() + out.slice(1);
}

function formatYoutubeTs(startMs: number): string {
  const totalSec = Math.max(0, Math.floor(startMs / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

function youtubeWatchUrl(youtubeId: string, startMs: number): string {
  const t = Math.max(0, Math.floor(startMs / 1000));
  return `https://www.youtube.com/watch?v=${youtubeId}&t=${t}s`;
}

/**
 * Replace inline `[seg_id]` tokens (UUIDs or hex IDs) with clickable
 * timestamp links. The agents' VIC outputs sometimes embed segmentIds in
 * brackets — we recognise UUID-shaped strings and look them up. Tokens
 * that don't resolve are left as-is so the audit still parses.
 */
function linkifyCitations(
  markdown: string,
  segmentMap: Record<string, { videoId: string; startMs: number }>,
  youtubeIdByVideoId: Record<string, string | null>,
): string {
  // Match [<id>] where <id> is a UUID-like or 12+ char alphanumeric.
  const pattern =
    /\[([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}|[a-f0-9]{12,})\]/gi;
  return markdown.replace(pattern, (whole, id: string) => {
    const seg = segmentMap[id];
    if (!seg) return whole;
    const yt = youtubeIdByVideoId[seg.videoId];
    if (!yt) return `[${formatYoutubeTs(seg.startMs)}]`;
    return `[${formatYoutubeTs(seg.startMs)}](${youtubeWatchUrl(yt, seg.startMs)})`;
  });
}
