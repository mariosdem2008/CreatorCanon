/**
 * Unit tests for the orphaned-uploads-sweep task logic.
 *
 * All external dependencies (R2, DB, Trigger.dev) are stubbed via lightweight
 * in-memory fakes. No network calls, no Trigger.dev runtime. We exercise the
 * core reconciliation rules directly.
 *
 * Rules under test:
 *  1. Rows older than 1h with uploadStatus='uploading' are candidates.
 *  2. Candidate with no localR2Key → mark 'failed' (guarded on 'uploading').
 *  3. Candidate whose R2 object EXISTS → mark 'uploaded' + enqueue transcribe
 *     (only if .returning() confirms WE advanced the row).
 *  4. Candidate whose R2 object is MISSING → delete R2 key + mark 'failed'
 *     (guarded on 'uploading').
 *  5. Rows newer than 1h are NOT touched.
 *  6. Rows with uploadStatus !== 'uploading' are NOT touched.
 *  7. UPDATE is a no-op when row was concurrently moved to 'uploaded' (TOCTOU guard).
 *  8. Recovery path enqueues transcribe-uploaded-video task.
 *  9. Recovery path marks 'failed' when trigger.dev enqueue throws.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ── Shared types ──────────────────────────────────────────────────────────────

type UploadStatus = 'uploading' | 'uploaded' | 'failed';
type TranscribeStatus = 'pending' | 'transcribing' | 'ready' | 'failed';

interface VideoRow {
  id: string;
  workspaceId: string;
  uploadStatus: UploadStatus | null;
  localR2Key: string | null;
  createdAt: Date;
}

// ── Inline implementation of the sweep logic ──────────────────────────────────
// We extract the core reconciliation algorithm from the task so it can be
// tested without the Trigger.dev runtime or real database client.

interface MarkStatusResult {
  /** Number of rows actually updated (simulates .returning() behaviour). */
  rowsUpdated: number;
}

interface SweepDeps {
  getCandidates: (cutoff: Date) => Promise<VideoRow[]>;
  /**
   * Updates the row only if its current uploadStatus matches `guardStatus`.
   * Returns { rowsUpdated: 1 } when the guard matched, { rowsUpdated: 0 } otherwise.
   */
  markStatus: (
    id: string,
    status: UploadStatus,
    guardStatus?: UploadStatus,
    extraFields?: { transcribeStatus?: TranscribeStatus },
  ) => Promise<MarkStatusResult>;
  r2Head: (key: string) => Promise<void>;   // throws if missing
  r2Delete: (key: string) => Promise<void>;
  triggerTranscribe: (videoId: string, workspaceId: string) => Promise<void>;
}

interface SweepResult {
  candidates: number;
  recovered: number;
  failed: number;
}

async function runSweepLogic(deps: SweepDeps): Promise<SweepResult> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const candidates = await deps.getCandidates(oneHourAgo);

  let recovered = 0;
  let failed = 0;

  for (const v of candidates) {
    if (!v.localR2Key) {
      await deps.markStatus(v.id, 'failed', 'uploading');
      failed++;
      continue;
    }

    try {
      await deps.r2Head(v.localR2Key);
      // Object exists — recover by driving the row forward.
      const result = await deps.markStatus(
        v.id,
        'uploaded',
        'uploading',
        { transcribeStatus: 'transcribing' },
      );
      if (result.rowsUpdated > 0) {
        try {
          await deps.triggerTranscribe(v.id, v.workspaceId);
          recovered++;
        } catch (err) {
          // Trigger.dev unavailable — mark failed so user can retry.
          await deps.markStatus(v.id, 'failed');
          failed++;
        }
      }
      // else: concurrent writer already advanced the row — skip silently.
    } catch {
      try {
        await deps.r2Delete(v.localR2Key);
      } catch {
        // best-effort
      }
      await deps.markStatus(v.id, 'failed', 'uploading');
      failed++;
    }
  }

  return { candidates: candidates.length, recovered, failed };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRow(
  id: string,
  overrides: Partial<VideoRow> = {},
): VideoRow {
  return {
    id,
    workspaceId: 'ws1',
    uploadStatus: 'uploading',
    localR2Key: `workspaces/ws1/uploads/${id}/video.mp4`,
    // Default: 2 hours ago — safely in candidate window.
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    ...overrides,
  };
}

interface BuildDepsResult {
  deps: SweepDeps;
  /** Final status per video id after the sweep runs. */
  statusUpdates: Record<string, UploadStatus>;
  deletedKeys: string[];
  /** Arguments passed to triggerTranscribe: [{ videoId, workspaceId }]. */
  triggerCalls: Array<{ videoId: string; workspaceId: string }>;
}

function buildDeps(
  candidates: VideoRow[],
  r2Keys: Set<string>,
  opts: {
    /** If set, triggerTranscribe will throw this error. */
    triggerError?: Error;
  } = {},
): BuildDepsResult {
  const statusUpdates: Record<string, UploadStatus> = {};
  const deletedKeys: string[] = [];
  const triggerCalls: Array<{ videoId: string; workspaceId: string }> = [];

  // In-memory DB rows: start from candidate uploadStatus values.
  const rowStatus: Record<string, UploadStatus | null> = {};
  for (const c of candidates) rowStatus[c.id] = c.uploadStatus;

  const deps: SweepDeps = {
    getCandidates: async (_cutoff) => candidates,
    markStatus: async (id, status, guardStatus?, _extraFields?) => {
      const current = rowStatus[id];
      if (guardStatus !== undefined && current !== guardStatus) {
        // Guard didn't match — simulate no-op (0 rows updated).
        return { rowsUpdated: 0 };
      }
      rowStatus[id] = status;
      statusUpdates[id] = status;
      return { rowsUpdated: 1 };
    },
    r2Head: async (key) => {
      if (!r2Keys.has(key)) throw new Error(`Not found: ${key}`);
    },
    r2Delete: async (key) => {
      deletedKeys.push(key);
      r2Keys.delete(key);
    },
    triggerTranscribe: async (videoId, workspaceId) => {
      if (opts.triggerError) throw opts.triggerError;
      triggerCalls.push({ videoId, workspaceId });
    },
  };

  return { deps, statusUpdates, deletedKeys, triggerCalls };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('orphaned-uploads-sweep — happy path (all candidates processed)', () => {
  it('returns correct aggregate counts', async () => {
    const r2Keys = new Set(['workspaces/ws1/uploads/v1/video.mp4']);
    const candidates = [
      makeRow('v1'), // R2 exists → recovered
      makeRow('v2', { localR2Key: 'workspaces/ws1/uploads/v2/video.mp4' }), // R2 missing → failed
    ];
    const { deps } = buildDeps(candidates, r2Keys);

    const result = await runSweepLogic(deps);

    assert.equal(result.candidates, 2);
    assert.equal(result.recovered, 1);
    assert.equal(result.failed, 1);
  });
});

describe('orphaned-uploads-sweep — recovery path', () => {
  it('marks uploaded when R2 object exists', async () => {
    const key = 'workspaces/ws1/uploads/v-recover/video.mp4';
    const r2Keys = new Set([key]);
    const candidates = [makeRow('v-recover', { localR2Key: key })];
    const { deps, statusUpdates } = buildDeps(candidates, r2Keys);

    await runSweepLogic(deps);

    assert.equal(statusUpdates['v-recover'], 'uploaded', 'should mark uploaded');
  });

  it('does NOT call r2Delete when object is found', async () => {
    const key = 'workspaces/ws1/uploads/v-recover2/video.mp4';
    const r2Keys = new Set([key]);
    const candidates = [makeRow('v-recover2', { localR2Key: key })];
    const { deps, deletedKeys } = buildDeps(candidates, r2Keys);

    await runSweepLogic(deps);

    assert.equal(deletedKeys.length, 0, 'should not delete existing R2 object');
  });

  it('recovery path enqueues transcribe-uploaded-video task', async () => {
    const key = 'workspaces/ws1/uploads/v-transcribe/video.mp4';
    const r2Keys = new Set([key]);
    const candidates = [makeRow('v-transcribe', { localR2Key: key, workspaceId: 'ws-abc' })];
    const { deps, triggerCalls } = buildDeps(candidates, r2Keys);

    await runSweepLogic(deps);

    assert.equal(triggerCalls.length, 1, 'should enqueue exactly one transcribe job');
    const firstCall = triggerCalls[0];
    assert.ok(firstCall !== undefined, 'triggerCalls[0] should exist');
    assert.equal(firstCall.videoId, 'v-transcribe');
    assert.equal(firstCall.workspaceId, 'ws-abc');
  });

  it('recovery path marks failed when trigger.dev enqueue throws', async () => {
    const key = 'workspaces/ws1/uploads/v-trigger-err/video.mp4';
    const r2Keys = new Set([key]);
    const candidates = [makeRow('v-trigger-err', { localR2Key: key })];
    const { deps, statusUpdates } = buildDeps(candidates, r2Keys, {
      triggerError: new Error('Trigger.dev unavailable'),
    });

    const result = await runSweepLogic(deps);

    assert.equal(statusUpdates['v-trigger-err'], 'failed', 'should mark failed when enqueue throws');
    assert.equal(result.failed, 1);
    assert.equal(result.recovered, 0);
  });
});

describe('orphaned-uploads-sweep — TOCTOU guard (R1)', () => {
  it('skips UPDATE when row was concurrently moved to uploaded (no overwrite)', async () => {
    // Simulate /complete winning the race: the row is already 'uploaded' in DB
    // even though our SELECT returned it as 'uploading'.
    const key = 'workspaces/ws1/uploads/v-race/video.mp4';
    const r2Keys = new Set([key]);
    // Row appears as 'uploading' in the SELECT result (stale read)...
    const candidates = [makeRow('v-race', { localR2Key: key })];

    const triggerCalls: Array<{ videoId: string; workspaceId: string }> = [];
    const statusUpdates: Record<string, UploadStatus> = {};

    // ...but the DB row is already 'uploaded' (concurrent /complete ran first).
    const currentDbStatus: Record<string, UploadStatus> = { 'v-race': 'uploaded' };

    const deps: SweepDeps = {
      getCandidates: async () => candidates,
      markStatus: async (id, status, guardStatus?) => {
        const current = currentDbStatus[id];
        if (guardStatus !== undefined && current !== guardStatus) {
          // Guard didn't match — no-op.
          return { rowsUpdated: 0 };
        }
        currentDbStatus[id] = status;
        statusUpdates[id] = status;
        return { rowsUpdated: 1 };
      },
      r2Head: async (k) => { if (!r2Keys.has(k)) throw new Error('Not found'); },
      r2Delete: async (k) => { r2Keys.delete(k); },
      triggerTranscribe: async (videoId, workspaceId) => {
        triggerCalls.push({ videoId, workspaceId });
      },
    };

    await runSweepLogic(deps);

    // The UPDATE was a no-op (guardStatus didn't match), so the row stays 'uploaded'.
    assert.equal(currentDbStatus['v-race'], 'uploaded', 'row should remain uploaded');
    // No transcribe job should have been enqueued (we didn't own the transition).
    assert.equal(triggerCalls.length, 0, 'should not enqueue transcribe when guard fails');
    // statusUpdates should be empty because we never wrote through.
    assert.equal(Object.keys(statusUpdates).length, 0, 'no status write should have occurred');
  });
});

describe('orphaned-uploads-sweep — cleanup path (R2 object missing)', () => {
  it('marks failed when R2 object does not exist', async () => {
    const key = 'workspaces/ws1/uploads/v-gone/video.mp4';
    const r2Keys = new Set<string>(); // empty — object is missing
    const candidates = [makeRow('v-gone', { localR2Key: key })];
    const { deps, statusUpdates } = buildDeps(candidates, r2Keys);

    await runSweepLogic(deps);

    assert.equal(statusUpdates['v-gone'], 'failed', 'should mark failed');
  });

  it('calls r2Delete with the correct key when object is missing', async () => {
    const key = 'workspaces/ws1/uploads/v-clean/video.mp4';
    const r2Keys = new Set<string>();
    const candidates = [makeRow('v-clean', { localR2Key: key })];
    const { deps, deletedKeys } = buildDeps(candidates, r2Keys);

    await runSweepLogic(deps);

    assert.ok(deletedKeys.includes(key), `Expected ${key} in deletedKeys`);
  });

  it('still marks failed even when r2Delete throws (best-effort delete)', async () => {
    const key = 'workspaces/ws1/uploads/v-delete-err/video.mp4';
    const candidates = [makeRow('v-delete-err', { localR2Key: key })];
    const statusUpdates: Record<string, UploadStatus> = {};
    const currentDbStatus: Record<string, UploadStatus> = { 'v-delete-err': 'uploading' };

    const deps: SweepDeps = {
      getCandidates: async () => candidates,
      markStatus: async (id, status, guardStatus?) => {
        const current = currentDbStatus[id];
        if (guardStatus !== undefined && current !== guardStatus) return { rowsUpdated: 0 };
        currentDbStatus[id] = status;
        statusUpdates[id] = status;
        return { rowsUpdated: 1 };
      },
      r2Head: async (_key) => { throw new Error('Not found'); },
      r2Delete: async (_key) => { throw new Error('S3 error'); },
      triggerTranscribe: async () => {},
    };

    await runSweepLogic(deps); // Must not throw

    assert.equal(statusUpdates['v-delete-err'], 'failed');
  });
});

describe('orphaned-uploads-sweep — no-localR2Key path', () => {
  it('marks failed immediately when localR2Key is null', async () => {
    const candidates = [makeRow('v-nokey', { localR2Key: null })];
    const r2Keys = new Set<string>();
    const { deps, statusUpdates, deletedKeys } = buildDeps(candidates, r2Keys);

    await runSweepLogic(deps);

    assert.equal(statusUpdates['v-nokey'], 'failed');
    assert.equal(deletedKeys.length, 0, 'should not attempt R2 delete');
  });
});

describe('orphaned-uploads-sweep — skip path: row newer than 1h', () => {
  it('does not process rows with createdAt in the past 30 minutes', async () => {
    // The sweep logic delegates time-filtering to getCandidates(cutoff).
    // We simulate DB correctly excluding the new row by returning empty candidates.
    const newRow = makeRow('v-new', {
      createdAt: new Date(Date.now() - 30 * 60 * 1000),
    });

    const statusUpdates: Record<string, UploadStatus> = {};
    const deps: SweepDeps = {
      // Simulate the DB WHERE clause: new row is excluded because createdAt > cutoff.
      getCandidates: async (cutoff) => {
        return [newRow].filter((r) => r.createdAt < cutoff);
      },
      markStatus: async (id, status) => {
        statusUpdates[id] = status;
        return { rowsUpdated: 1 };
      },
      r2Head: async (_key) => { /* would throw if called */ },
      r2Delete: async (_key) => { /* would throw if called */ },
      triggerTranscribe: async () => {},
    };

    const result = await runSweepLogic(deps);

    assert.equal(result.candidates, 0, 'new row should not be a candidate');
    assert.equal(Object.keys(statusUpdates).length, 0, 'no rows should be updated');
  });
});

describe('orphaned-uploads-sweep — skip path: uploadStatus !== uploading', () => {
  it('does not process rows whose uploadStatus is already uploaded', async () => {
    // DB WHERE clause filters by uploadStatus='uploading', so these never reach the task.
    const uploadedRow = makeRow('v-already-uploaded', { uploadStatus: 'uploaded' });
    const failedRow = makeRow('v-already-failed', { uploadStatus: 'failed' });

    const statusUpdates: Record<string, UploadStatus> = {};
    const deps: SweepDeps = {
      // Simulate DB filtering: only return rows where uploadStatus = 'uploading'.
      getCandidates: async (_cutoff) => {
        return [uploadedRow, failedRow].filter((r) => r.uploadStatus === 'uploading');
      },
      markStatus: async (id, status) => {
        statusUpdates[id] = status;
        return { rowsUpdated: 1 };
      },
      r2Head: async (_key) => {},
      r2Delete: async (_key) => {},
      triggerTranscribe: async () => {},
    };

    const result = await runSweepLogic(deps);

    assert.equal(result.candidates, 0, 'non-uploading rows should be excluded');
    assert.equal(Object.keys(statusUpdates).length, 0, 'no rows should be updated');
  });
});

describe('orphaned-uploads-sweep — empty candidate set', () => {
  it('returns zeros when no candidates exist', async () => {
    const { deps } = buildDeps([], new Set());
    const result = await runSweepLogic(deps);

    assert.equal(result.candidates, 0);
    assert.equal(result.recovered, 0);
    assert.equal(result.failed, 0);
  });
});

describe('orphaned-uploads-sweep — cutoff boundary', () => {
  it('passes a cutoff exactly 1 hour in the past to getCandidates', async () => {
    let receivedCutoff: Date | null = null;
    const deps: SweepDeps = {
      getCandidates: async (cutoff) => {
        receivedCutoff = cutoff;
        return [];
      },
      markStatus: async () => ({ rowsUpdated: 0 }),
      r2Head: async () => {},
      r2Delete: async () => {},
      triggerTranscribe: async () => {},
    };

    const before = Date.now();
    await runSweepLogic(deps);
    const after = Date.now();

    assert.ok(receivedCutoff !== null, 'cutoff should have been passed');
    const cutoffMs = (receivedCutoff as Date).getTime();
    const expectedMs = Date.now() - 60 * 60 * 1000;
    // Allow ±2 seconds of clock drift in the test.
    assert.ok(
      Math.abs(cutoffMs - (before - 60 * 60 * 1000)) <= 2000 ||
      Math.abs(cutoffMs - (after - 60 * 60 * 1000)) <= 2000,
      `Cutoff ${new Date(cutoffMs).toISOString()} should be ~1h before now`,
    );
    void expectedMs; // suppress unused-variable lint hint
  });
});
