/**
 * Unit tests for the ensure-transcripts stage — sourceKind switch.
 *
 * We test the decision logic exercised by the manual_upload branch without
 * hitting real DB, R2, or YouTube endpoints. The test re-implements the
 * branch as a pure function extracted from the stage and asserts on its
 * behaviour.
 *
 * Integration coverage (with a real DB) is provided by the existing
 * pipeline smoke test. The tests here focus on:
 * - A video set with one YouTube + one manual_upload (status=ready)
 *   produces results for both
 * - manual_upload with status != 'ready' throws a clear error
 * - manual_upload with status='failed' throws
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ── Types ─────────────────────────────────────────────────────────────────────

type TranscribeStatus = 'pending' | 'transcribing' | 'ready' | 'failed' | 'unknown';
type SourceKind = 'youtube' | 'manual_upload';

interface VideoInput {
  id: string;
  youtubeVideoId: string | null;
  title: string | null;
  durationSeconds: number | null;
  sourceKind: SourceKind;
}

interface TranscriptResult {
  videoId: string;
  skipped: boolean;
  skipReason?: string;
  provider: string;
}

// ── Pure branch logic (mirrors the stage implementation) ─────────────────────

/**
 * Simulates the manual_upload guard branch in ensure-transcripts.
 * Returns a TranscriptResult for the video if it's OK to continue,
 * or throws if the video is not ready.
 */
function handleManualUploadBranch(
  vid: VideoInput,
  transcribeStatus: TranscribeStatus,
): TranscriptResult {
  if (transcribeStatus !== 'ready') {
    throw new Error(
      `Manual upload ${vid.id} (${vid.title ?? 'untitled'}) is not transcribed yet ` +
      `(status: ${transcribeStatus}). Re-upload or wait for transcription to complete.`,
    );
  }
  // status=ready but no canonical transcript row — edge case
  return {
    videoId: vid.id,
    skipped: true,
    skipReason: `Manual upload transcript not found in canonical index despite status=ready. Check transcriptAsset row for videoId=${vid.id}.`,
    provider: 'existing',
  };
}

/**
 * Simulates the full per-video decision for a list of videos, using a
 * callback to resolve existing transcripts and transcribeStatus.
 */
async function simulateEnsureTranscripts(
  videos: VideoInput[],
  opts: {
    existingTranscript: (videoId: string) => { r2Key: string; wordCount: number } | null;
    transcribeStatus: (videoId: string) => TranscribeStatus;
  },
): Promise<TranscriptResult[]> {
  const results: TranscriptResult[] = [];

  for (const vid of videos) {
    // 1. Check for existing canonical transcript
    const existing = opts.existingTranscript(vid.id);
    if (existing) {
      results.push({
        videoId: vid.id,
        skipped: false,
        provider: 'existing',
      });
      continue;
    }

    // 2. Manual-upload branch
    if (vid.sourceKind === 'manual_upload') {
      const status = opts.transcribeStatus(vid.id);
      // This will throw for non-ready status
      const result = handleManualUploadBranch(vid, status);
      results.push(result);
      continue;
    }

    // 3. YouTube path (stub — not tested in this file)
    results.push({
      videoId: vid.id,
      skipped: false,
      provider: 'youtube_captions',
    });
  }

  return results;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ensure-transcripts — sourceKind switch', () => {
  describe('mixed video set: one youtube + one manual_upload (ready)', () => {
    it('produces a result for both videos without throwing', async () => {
      const videos: VideoInput[] = [
        {
          id: 'yt_abc',
          youtubeVideoId: 'abc123',
          title: 'YouTube Video',
          durationSeconds: 600,
          sourceKind: 'youtube',
        },
        {
          id: 'mu_xyz',
          youtubeVideoId: null,
          title: 'Manual Upload',
          durationSeconds: 120,
          sourceKind: 'manual_upload',
        },
      ];

      // Simulate: YouTube has no existing transcript (needs fetching),
      // manual_upload has an existing canonical transcript row.
      const results = await simulateEnsureTranscripts(videos, {
        existingTranscript: (id) => {
          if (id === 'mu_xyz') return { r2Key: 'workspaces/ws/transcripts/mu_xyz/canonical.vtt', wordCount: 1234 };
          return null;
        },
        transcribeStatus: () => 'ready',
      });

      assert.equal(results.length, 2, 'should produce 2 results');
      const ytResult = results.find((r) => r.videoId === 'yt_abc');
      const muResult = results.find((r) => r.videoId === 'mu_xyz');
      assert.ok(ytResult, 'YouTube result must exist');
      assert.ok(muResult, 'Manual upload result must exist');
      assert.equal(ytResult.provider, 'youtube_captions');
      assert.equal(muResult.provider, 'existing');
      assert.equal(muResult.skipped, false, 'manual_upload with existing transcript should not be skipped');
    });
  });

  describe('manual_upload with transcribeStatus=transcribing', () => {
    it('throws with a clear error message', async () => {
      const videos: VideoInput[] = [
        {
          id: 'mu_pending',
          youtubeVideoId: null,
          title: 'My Upload',
          durationSeconds: null,
          sourceKind: 'manual_upload',
        },
      ];

      await assert.rejects(
        () =>
          simulateEnsureTranscripts(videos, {
            existingTranscript: () => null,
            transcribeStatus: () => 'transcribing',
          }),
        (err: Error) => {
          assert.ok(err.message.includes('not transcribed yet'), `Expected "not transcribed yet" in: ${err.message}`);
          assert.ok(err.message.includes('mu_pending'), `Expected videoId in: ${err.message}`);
          assert.ok(err.message.includes('transcribing'), `Expected status in: ${err.message}`);
          return true;
        },
      );
    });
  });

  describe('manual_upload with transcribeStatus=failed', () => {
    it('throws with a clear error message including status=failed', async () => {
      const videos: VideoInput[] = [
        {
          id: 'mu_failed',
          youtubeVideoId: null,
          title: 'Broken Upload',
          durationSeconds: null,
          sourceKind: 'manual_upload',
        },
      ];

      await assert.rejects(
        () =>
          simulateEnsureTranscripts(videos, {
            existingTranscript: () => null,
            transcribeStatus: () => 'failed',
          }),
        (err: Error) => {
          assert.ok(err.message.includes('not transcribed yet'));
          assert.ok(err.message.includes('failed'));
          return true;
        },
      );
    });
  });

  describe('manual_upload with transcribeStatus=pending', () => {
    it('throws with a clear error message including status=pending', async () => {
      const videos: VideoInput[] = [
        {
          id: 'mu_pending2',
          youtubeVideoId: null,
          title: null,
          durationSeconds: null,
          sourceKind: 'manual_upload',
        },
      ];

      await assert.rejects(
        () =>
          simulateEnsureTranscripts(videos, {
            existingTranscript: () => null,
            transcribeStatus: () => 'pending',
          }),
        (err: Error) => {
          assert.ok(err.message.includes('pending'));
          // Title is null → should use 'untitled'
          assert.ok(err.message.includes('untitled'), `Expected "untitled" fallback in: ${err.message}`);
          return true;
        },
      );
    });
  });

  describe('manual_upload with status=ready but no canonical transcript row', () => {
    it('returns a skipped result with informative reason (no throw)', async () => {
      const videos: VideoInput[] = [
        {
          id: 'mu_race',
          youtubeVideoId: null,
          title: 'Race Condition',
          durationSeconds: 60,
          sourceKind: 'manual_upload',
        },
      ];

      const results = await simulateEnsureTranscripts(videos, {
        existingTranscript: () => null, // no canonical row
        transcribeStatus: () => 'ready',
      });

      assert.equal(results.length, 1);
      const r = results[0]!;
      assert.equal(r.videoId, 'mu_race');
      assert.equal(r.skipped, true);
      assert.ok(r.skipReason?.includes('status=ready'), `Expected "status=ready" in: ${r.skipReason}`);
    });
  });

  describe('youtube video (control group)', () => {
    it('goes through YouTube path regardless of sourceKind guard', async () => {
      const videos: VideoInput[] = [
        {
          id: 'yt_control',
          youtubeVideoId: 'yt123',
          title: 'Control',
          durationSeconds: 300,
          sourceKind: 'youtube',
        },
      ];

      const results = await simulateEnsureTranscripts(videos, {
        existingTranscript: () => null,
        transcribeStatus: () => 'ready', // irrelevant for youtube
      });

      assert.equal(results.length, 1);
      assert.equal(results[0]!.provider, 'youtube_captions');
      assert.equal(results[0]!.skipped, false);
    });
  });
});
