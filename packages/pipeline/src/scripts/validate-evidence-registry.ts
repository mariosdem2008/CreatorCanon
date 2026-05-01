/**
 * Evidence registry validator (Phase 7 / Task 7.6).
 *
 * Scans every `_index_evidence_registry` in the run. For each body-bearing v2
 * entity (canon nodes, synthesis nodes, journey phases, page briefs):
 *
 * HARD FAILS (non-zero exit, surfaced in markdown report):
 * - Any UUID in body markdown that has NO entry in registry → "orphan citation"
 * - Any registry entry whose UUID is NOT in the body → "stale entry"
 * - `supportingPhrase` not a substring of the segment text → "unsupported"
 * - `relevanceScore` not in [0, 100]
 * - `evidenceType` not in canonical 8-value enum
 *
 * SOFT WARNS (per-entity + aggregate stats):
 * - Report counts of `verified` / `needs_review` / `unsupported` entries
 * - Aggregate % of citations by status
 *
 * Output: /tmp/evidence-registry-<runId>.md plus stdout summary. Exit 2 on
 * any hard-fail per spec.
 *
 * Usage:
 *   tsx ./src/scripts/validate-evidence-registry.ts <runId>
 */

import fs from 'node:fs';
import path from 'node:path';

import { closeDb, eq, getDb } from '@creatorcanon/db';
import {
  canonNode,
  pageBrief,
  segment,
} from '@creatorcanon/db/schema';

import { loadDefaultEnvFiles } from '../env-files';
import type { EvidenceEntry, EvidenceType } from './util/evidence-tagger';

loadDefaultEnvFiles();

// ──────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────

interface HardFail {
  /** Entity ID (cn_xxx, pb_xxx, etc.). */
  entityId: string;
  /** The UUID that caused the issue, or "N/A" if registry-wide. */
  uuid: string;
  /** What went wrong. */
  issue: string;
}

interface EntityVerificationCounts {
  verified: number;
  needs_review: number;
  unsupported: number;
}

interface EntityReport {
  entityId: string;
  entityType: string; // "canon", "brief", "journey-phase"
  entityTitle: string;
  counts: EntityVerificationCounts;
}

// ──────────────────────────────────────────────────────────────────────────
// Validators
// ──────────────────────────────────────────────────────────────────────────

const EVIDENCE_TYPE_ENUM = new Set<EvidenceType>([
  'claim',
  'framework_step',
  'example',
  'caveat',
  'mistake',
  'tool',
  'story',
  'proof',
]);

const UUID_REGEX = /\[([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\]/g;

/** Extract all UUID citations from body markdown. */
function extractCitedUUIDs(body: string | undefined): Set<string> {
  if (typeof body !== 'string') return new Set();
  const matches = Array.from(body.matchAll(UUID_REGEX)).map((m) => m[1]!);
  return new Set(matches);
}

/** Validate a single evidence entry. */
function validateEntry(
  entry: Record<string, unknown>,
  uuid: string,
  segmentText: string,
): string | null {
  const e = entry as Partial<EvidenceEntry>;

  // Check supportingPhrase is a substring of segment text
  if (typeof e.supportingPhrase !== 'string' || e.supportingPhrase.length === 0) {
    return 'supportingPhrase is missing or empty';
  }
  if (!segmentText.includes(e.supportingPhrase)) {
    return `supportingPhrase not in segment text: "${e.supportingPhrase}"`;
  }

  // Check relevanceScore is in [0, 100]
  const score = Number(e.relevanceScore);
  if (!Number.isFinite(score) || score < 0 || score > 100) {
    return `relevanceScore out of [0,100]: ${e.relevanceScore}`;
  }

  // Check evidenceType is in canonical enum
  if (!EVIDENCE_TYPE_ENUM.has(e.evidenceType as EvidenceType)) {
    return `evidenceType not in canonical enum: ${e.evidenceType}`;
  }

  return null; // no error
}

// ──────────────────────────────────────────────────────────────────────────
// Main logic
// ──────────────────────────────────────────────────────────────────────────

async function main() {
  const runId = process.argv[2];
  if (!runId) throw new Error('Usage: tsx ./src/scripts/validate-evidence-registry.ts <runId>');

  const db = getDb();

  // ── Load all segments into a lookup map ──────────────────────────────────
  const segmentRows = await db
    .select({ id: segment.id, text: segment.text })
    .from(segment)
    .where(eq(segment.runId, runId));
  const segmentTextById = new Map<string, string>();
  for (const s of segmentRows) {
    segmentTextById.set(s.id, s.text ?? '');
  }

  const hardFails: HardFail[] = [];
  const entityReports: EntityReport[] = [];

  let canonScanned = 0;
  let synthesisScanned = 0;
  let journeyPhasesScanned = 0;
  let briefsScanned = 0;
  let totalCitations = 0;
  const verificationTotals: EntityVerificationCounts = {
    verified: 0,
    needs_review: 0,
    unsupported: 0,
  };

  // ── Scan canon nodes ────────────────────────────────────────────────────
  const canonRows = await db
    .select({ id: canonNode.id, payload: canonNode.payload })
    .from(canonNode)
    .where(eq(canonNode.runId, runId));

  for (const row of canonRows) {
    const p = row.payload as {
      schemaVersion?: string;
      kind?: string;
      title?: string;
      body?: string;
      _index_evidence_registry?: Record<string, unknown>;
      _index_phases?: Array<{
        title?: string;
        body?: string;
        _index_evidence_registry?: Record<string, unknown>;
      }>;
    };

    if (p.schemaVersion !== 'v2') continue;

    if (p.kind === 'reader_journey') {
      // Handle journey phases separately below
      continue;
    }

    // Regular canon node
    canonScanned += 1;
    const entityType = p.kind === 'synthesis' ? 'synthesis' : 'canon';
    if (entityType === 'synthesis') synthesisScanned += 1;

    const citedUUIDs = extractCitedUUIDs(p.body);
    const registry = (p._index_evidence_registry ?? {}) as Record<string, unknown>;

    // Check for orphan citations (UUID in body but not in registry)
    for (const uuid of citedUUIDs) {
      if (!(uuid in registry)) {
        hardFails.push({
          entityId: row.id,
          uuid,
          issue: 'orphan citation (UUID in body but not in registry)',
        });
      }
    }

    // Check for stale entries (UUID in registry but not in body)
    for (const uuid in registry) {
      if (!citedUUIDs.has(uuid)) {
        hardFails.push({
          entityId: row.id,
          uuid,
          issue: 'stale entry (UUID in registry but not in body)',
        });
      }
    }

    // Validate each entry
    const counts: EntityVerificationCounts = {
      verified: 0,
      needs_review: 0,
      unsupported: 0,
    };

    for (const uuid in registry) {
      const entry = registry[uuid];
      const segmentText = segmentTextById.get(uuid) ?? '';

      const validationError = validateEntry(entry as Record<string, unknown>, uuid, segmentText);
      if (validationError) {
        hardFails.push({
          entityId: row.id,
          uuid,
          issue: validationError,
        });
      }

      // Count verification status
      const status = (entry as Partial<EvidenceEntry>).verificationStatus;
      if (status === 'verified') counts.verified += 1;
      else if (status === 'needs_review') counts.needs_review += 1;
      else if (status === 'unsupported') counts.unsupported += 1;
    }

    totalCitations += Object.keys(registry).length;
    verificationTotals.verified += counts.verified;
    verificationTotals.needs_review += counts.needs_review;
    verificationTotals.unsupported += counts.unsupported;

    entityReports.push({
      entityId: row.id,
      entityType,
      entityTitle: p.title ?? '(Untitled)',
      counts,
    });
  }

  // ── Scan reader_journey phases ──────────────────────────────────────────
  for (const row of canonRows) {
    const p = row.payload as {
      schemaVersion?: string;
      kind?: string;
      _index_phases?: Array<{
        title?: string;
        body?: string;
        _index_evidence_registry?: Record<string, unknown>;
      }>;
    };

    if (p.schemaVersion !== 'v2' || p.kind !== 'reader_journey') continue;
    if (!Array.isArray(p._index_phases)) continue;

    for (let phaseIdx = 0; phaseIdx < p._index_phases.length; phaseIdx += 1) {
      const phase = p._index_phases[phaseIdx]!;
      journeyPhasesScanned += 1;

      const citedUUIDs = extractCitedUUIDs(phase.body);
      const registry = (phase._index_evidence_registry ?? {}) as Record<string, unknown>;

      const phaseId = `${row.id}._phases[${phaseIdx}]`;

      // Check for orphan citations
      for (const uuid of citedUUIDs) {
        if (!(uuid in registry)) {
          hardFails.push({
            entityId: phaseId,
            uuid,
            issue: 'orphan citation (UUID in body but not in registry)',
          });
        }
      }

      // Check for stale entries
      for (const uuid in registry) {
        if (!citedUUIDs.has(uuid)) {
          hardFails.push({
            entityId: phaseId,
            uuid,
            issue: 'stale entry (UUID in registry but not in body)',
          });
        }
      }

      // Validate each entry
      const counts: EntityVerificationCounts = {
        verified: 0,
        needs_review: 0,
        unsupported: 0,
      };

      for (const uuid in registry) {
        const entry = registry[uuid];
        const segmentText = segmentTextById.get(uuid) ?? '';

        const validationError = validateEntry(
          entry as Record<string, unknown>,
          uuid,
          segmentText,
        );
        if (validationError) {
          hardFails.push({
            entityId: phaseId,
            uuid,
            issue: validationError,
          });
        }

        // Count verification status
        const status = (entry as Partial<EvidenceEntry>).verificationStatus;
        if (status === 'verified') counts.verified += 1;
        else if (status === 'needs_review') counts.needs_review += 1;
        else if (status === 'unsupported') counts.unsupported += 1;
      }

      totalCitations += Object.keys(registry).length;
      verificationTotals.verified += counts.verified;
      verificationTotals.needs_review += counts.needs_review;
      verificationTotals.unsupported += counts.unsupported;

      entityReports.push({
        entityId: phaseId,
        entityType: 'journey-phase',
        entityTitle: phase.title ?? `(Phase ${phaseIdx})`,
        counts,
      });
    }
  }

  // ── Scan page briefs ────────────────────────────────────────────────────
  const briefRows = await db
    .select({ id: pageBrief.id, payload: pageBrief.payload })
    .from(pageBrief)
    .where(eq(pageBrief.runId, runId));

  for (const row of briefRows) {
    const p = row.payload as {
      schemaVersion?: string;
      title?: string;
      body?: string;
      _index_evidence_registry?: Record<string, unknown>;
    };

    if (p.schemaVersion !== 'v2') continue;

    briefsScanned += 1;

    const citedUUIDs = extractCitedUUIDs(p.body);
    const registry = (p._index_evidence_registry ?? {}) as Record<string, unknown>;

    // Check for orphan citations
    for (const uuid of citedUUIDs) {
      if (!(uuid in registry)) {
        hardFails.push({
          entityId: row.id,
          uuid,
          issue: 'orphan citation (UUID in body but not in registry)',
        });
      }
    }

    // Check for stale entries
    for (const uuid in registry) {
      if (!citedUUIDs.has(uuid)) {
        hardFails.push({
          entityId: row.id,
          uuid,
          issue: 'stale entry (UUID in registry but not in body)',
        });
      }
    }

    // Validate each entry
    const counts: EntityVerificationCounts = {
      verified: 0,
      needs_review: 0,
      unsupported: 0,
    };

    for (const uuid in registry) {
      const entry = registry[uuid];
      const segmentText = segmentTextById.get(uuid) ?? '';

      const validationError = validateEntry(entry as Record<string, unknown>, uuid, segmentText);
      if (validationError) {
        hardFails.push({
          entityId: row.id,
          uuid,
          issue: validationError,
        });
      }

      // Count verification status
      const status = (entry as Partial<EvidenceEntry>).verificationStatus;
      if (status === 'verified') counts.verified += 1;
      else if (status === 'needs_review') counts.needs_review += 1;
      else if (status === 'unsupported') counts.unsupported += 1;
    }

    totalCitations += Object.keys(registry).length;
    verificationTotals.verified += counts.verified;
    verificationTotals.needs_review += counts.needs_review;
    verificationTotals.unsupported += counts.unsupported;

    entityReports.push({
      entityId: row.id,
      entityType: 'brief',
      entityTitle: p.title ?? '(Untitled)',
      counts,
    });
  }

  // ── Render markdown report ──────────────────────────────────────────────
  const md = renderMarkdown(runId, hardFails, entityReports, {
    totalCitations,
    verificationTotals,
    canonScanned,
    synthesisScanned,
    journeyPhasesScanned,
    briefsScanned,
  });

  const outPath = path.join(
    process.env.TEMP || process.env.TMPDIR || '/tmp',
    `evidence-registry-${runId}.md`,
  );
  fs.writeFileSync(outPath, md);

  // ── Stdout summary ──────────────────────────────────────────────────────
  const totalEntities = canonScanned + synthesisScanned + journeyPhasesScanned + briefsScanned;
  const verifiedPct = totalCitations > 0
    ? ((verificationTotals.verified / totalCitations) * 100).toFixed(1)
    : '0.0';
  const needsReviewPct = totalCitations > 0
    ? ((verificationTotals.needs_review / totalCitations) * 100).toFixed(1)
    : '0.0';
  const unsupportedPct = totalCitations > 0
    ? ((verificationTotals.unsupported / totalCitations) * 100).toFixed(1)
    : '0.0';

  console.info(`[evidence-registry] runId=${runId}`);
  console.info(`[evidence-registry]   entities scanned: ${totalEntities} (canon: ${canonScanned}, synthesis: ${synthesisScanned}, journey-phases: ${journeyPhasesScanned}, briefs: ${briefsScanned})`);
  console.info(`[evidence-registry]   total UUID citations: ${totalCitations}`);
  console.info(`[evidence-registry]   verified: ${verificationTotals.verified} (${verifiedPct}%)`);
  console.info(`[evidence-registry]   needs_review: ${verificationTotals.needs_review} (${needsReviewPct}%)`);
  console.info(`[evidence-registry]   unsupported: ${verificationTotals.unsupported} (${unsupportedPct}%)`);
  console.info(`[evidence-registry]   hard-fail count: ${hardFails.length}`);
  console.info(`[evidence-registry] report written: ${outPath}`);

  await closeDb();
  if (hardFails.length > 0) process.exit(2);
}

function renderMarkdown(
  runId: string,
  hardFails: HardFail[],
  entityReports: EntityReport[],
  stats: {
    totalCitations: number;
    verificationTotals: EntityVerificationCounts;
    canonScanned: number;
    synthesisScanned: number;
    journeyPhasesScanned: number;
    briefsScanned: number;
  },
): string {
  const lines: string[] = [];

  lines.push(`# Evidence Registry Validation — \`${runId}\``);
  lines.push('');
  lines.push(`_Generated: ${new Date().toISOString()}_`);
  lines.push('');

  // ── Summary section ─────────────────────────────────────────────────────
  lines.push('## Summary');
  lines.push('');
  lines.push(
    `- Entities scanned: **${stats.canonScanned + stats.synthesisScanned + stats.journeyPhasesScanned + stats.briefsScanned}** ` +
    `(canon: ${stats.canonScanned}, synthesis: ${stats.synthesisScanned}, journey-phases: ${stats.journeyPhasesScanned}, briefs: ${stats.briefsScanned})`,
  );
  lines.push(`- Total UUID citations: **${stats.totalCitations}**`);

  const verifiedPct = stats.totalCitations > 0
    ? ((stats.verificationTotals.verified / stats.totalCitations) * 100).toFixed(1)
    : '0.0';
  const needsReviewPct = stats.totalCitations > 0
    ? ((stats.verificationTotals.needs_review / stats.totalCitations) * 100).toFixed(1)
    : '0.0';
  const unsupportedPct = stats.totalCitations > 0
    ? ((stats.verificationTotals.unsupported / stats.totalCitations) * 100).toFixed(1)
    : '0.0';

  lines.push(`- Verified: **${stats.verificationTotals.verified}** (${verifiedPct}%)`);
  lines.push(`- Needs review: **${stats.verificationTotals.needs_review}** (${needsReviewPct}%)`);
  lines.push(`- Unsupported: **${stats.verificationTotals.unsupported}** (${unsupportedPct}%)`);
  lines.push(`- Hard-fail count: **${hardFails.length}**`);
  lines.push('');

  // ── Hard fails section ──────────────────────────────────────────────────
  if (hardFails.length === 0) {
    lines.push('✅ No hard fails. Evidence registries are structurally sound.');
  } else {
    lines.push('## Hard fails');
    lines.push('');
    lines.push('| Entity | UUID | Issue |');
    lines.push('|---|---|---|');
    for (const fail of hardFails) {
      const issue = fail.issue.replace(/\|/g, '\\|');
      lines.push(`| \`${fail.entityId}\` | \`${fail.uuid}\` | ${issue} |`);
    }
    lines.push('');
  }

  // ── Per-entity verification rates ───────────────────────────────────────
  if (entityReports.length > 0) {
    lines.push('## Per-entity verification rates');
    lines.push('');
    lines.push('| Entity | Verified | Needs review | Unsupported |');
    lines.push('|---|---:|---:|---:|');
    for (const report of entityReports) {
      const entityLabel =
        report.entityType === 'journey-phase'
          ? `${report.entityId} (journey-phase, "${report.entityTitle}")`
          : `${report.entityId} (${report.entityType}, "${report.entityTitle}")`;
      lines.push(
        `| \`${entityLabel}\` | ${report.counts.verified} | ${report.counts.needs_review} | ${report.counts.unsupported} |`,
      );
    }
    lines.push('');
  }

  return lines.join('\n');
}

main().catch(async (err) => {
  await closeDb();
  console.error('[evidence-registry] FAILED', err);
  process.exit(1);
});
