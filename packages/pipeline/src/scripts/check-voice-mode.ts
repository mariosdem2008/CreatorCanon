import fs from 'node:fs';
import path from 'node:path';

import { closeDb, eq, getDb } from '@creatorcanon/db';
import {
  canonNode,
  channelProfile,
  pageBrief,
} from '@creatorcanon/db/schema';

import { loadDefaultEnvFiles } from '../env-files';
import {
  type VoiceMode,
  hasFirstPersonMarkers,
  hasThirdPersonAttribution,
} from './util/voice-mode';

loadDefaultEnvFiles();

interface Violation {
  location: string;
  rule: string;
  excerpt: string;
}

function scanFirstPersonBody(
  text: string | undefined,
  location: string,
  creatorName: string,
  violations: Violation[],
): void {
  if (!text) return;
  if (hasThirdPersonAttribution(text, creatorName)) {
    violations.push({
      location,
      rule: 'first_person body should not contain third-person attribution',
      excerpt: text.slice(0, 200).replace(/\s+/g, ' '),
    });
  }
}

function scanThirdPersonBody(
  text: string | undefined,
  location: string,
  violations: Violation[],
): void {
  if (!text) return;
  if (hasFirstPersonMarkers(text)) {
    violations.push({
      location,
      rule: 'third_person_editorial body should not contain first-person markers',
      excerpt: text.slice(0, 200).replace(/\s+/g, ' '),
    });
  }
}

async function main() {
  const runId = process.argv[2];
  if (!runId) throw new Error('Usage: tsx ./src/scripts/check-voice-mode.ts <runId>');

  const db = getDb();

  const cpRows = await db.select({ payload: channelProfile.payload })
    .from(channelProfile).where(eq(channelProfile.runId, runId));
  const cp = cpRows[0]?.payload as {
    schemaVersion?: string;
    creatorName?: string;
    _index_voice_mode?: VoiceMode;
  } | undefined;
  if (!cp || cp.schemaVersion !== 'v2') {
    console.info(`[voice-mode] runId=${runId} — not v2, skipping`);
    await closeDb();
    return;
  }

  const voiceMode: VoiceMode = cp._index_voice_mode ?? 'first_person';
  const creatorName = cp.creatorName ?? '';
  const violations: Violation[] = [];

  // Canon nodes (incl. synthesis; excl. reader_journey for now — phases handled separately)
  const canonRows = await db.select({ id: canonNode.id, payload: canonNode.payload })
    .from(canonNode).where(eq(canonNode.runId, runId));

  for (const c of canonRows) {
    const p = c.payload as { schemaVersion?: string; kind?: string; body?: string; _index_phases?: any[] };
    if (p.schemaVersion !== 'v2') continue;
    if (p.kind === 'reader_journey') {
      // Per-phase scan
      for (const phase of (p._index_phases ?? [])) {
        const phaseLoc = `canon[${c.id}].phases[${phase._index_phase_number}].body`;
        if (voiceMode === 'first_person') {
          scanFirstPersonBody(phase.body, phaseLoc, creatorName, violations);
        } else if (voiceMode === 'third_person_editorial') {
          scanThirdPersonBody(phase.body, phaseLoc, violations);
        }
      }
      continue;
    }
    const loc = `canon[${c.id}].body`;
    if (voiceMode === 'first_person') {
      scanFirstPersonBody(p.body, loc, creatorName, violations);
    } else if (voiceMode === 'third_person_editorial') {
      scanThirdPersonBody(p.body, loc, violations);
    }
    // hybrid: no violations checked (mixed register is by design)
  }

  // Page briefs
  const briefRows = await db.select({ id: pageBrief.id, payload: pageBrief.payload })
    .from(pageBrief).where(eq(pageBrief.runId, runId));
  for (const b of briefRows) {
    const p = b.payload as { schemaVersion?: string; body?: string };
    if (p.schemaVersion !== 'v2') continue;
    const loc = `brief[${b.id}].body`;
    if (voiceMode === 'first_person') {
      scanFirstPersonBody(p.body, loc, creatorName, violations);
    } else if (voiceMode === 'third_person_editorial') {
      scanThirdPersonBody(p.body, loc, violations);
    }
  }

  // Render markdown report
  const reportPath = path.join(
    process.env.TEMP || process.env.TMPDIR || '/tmp',
    `voice-mode-${runId}.md`,
  );
  const lines = [
    `# Voice Mode Validation — \`${runId}\``,
    '',
    `_Generated: ${new Date().toISOString()}_`,
    `_Creator: ${creatorName}_`,
    `_Voice mode: ${voiceMode}_`,
    '',
    `## Violations: ${violations.length}`,
    '',
  ];
  if (violations.length === 0) {
    lines.push('✅ No violations. Voice mode adherence verified across all body fields.');
  } else {
    for (const v of violations) {
      lines.push(`### \`${v.location}\``);
      lines.push(`Rule: ${v.rule}`);
      lines.push('');
      lines.push(`> ${v.excerpt}…`);
      lines.push('');
    }
  }
  fs.writeFileSync(reportPath, lines.join('\n'));

  // Stdout summary
  console.info(`[voice-mode] runId=${runId}`);
  console.info(`[voice-mode]   creator: ${creatorName}`);
  console.info(`[voice-mode]   voiceMode: ${voiceMode}`);
  console.info(`[voice-mode]   violations: ${violations.length}`);
  console.info(`[voice-mode] report: ${reportPath}`);

  // Machine-readable METRIC lines for v2-cohort-report stable parsing.
  console.info(`[voice-mode] METRIC voice_mode=${voiceMode}`);
  console.info(`[voice-mode] METRIC voice_mode_violations=${violations.length}`);

  await closeDb();
  if (violations.length > 0) process.exit(2);
}

main().catch(async (err) => {
  await closeDb();
  console.error('[voice-mode] FAILED', err);
  process.exit(1);
});
