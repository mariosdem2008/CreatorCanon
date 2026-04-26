import { and, eq, getDb } from '@creatorcanon/db';
import { transcriptAsset, video } from '@creatorcanon/db/schema';
import { createR2Client, transcriptKey } from '@creatorcanon/adapters';
import { parseServerEnv } from '@creatorcanon/core';
import type { SelectionSnapshotOutput } from './import-selection-snapshot';

export interface EnsureTranscriptsInput {
  runId: string;
  workspaceId: string;
  videos: SelectionSnapshotOutput['videos'];
}

export interface TranscriptResult {
  videoId: string;
  youtubeVideoId: string | null;
  r2Key: string;
  provider: 'youtube_captions' | 'whisper' | 'existing';
  wordCount: number;
  language: string;
  skipped: boolean;
  skipReason?: string;
}

export interface EnsureTranscriptsOutput {
  transcripts: TranscriptResult[];
  fetchedCount: number;
  skippedCount: number;
}

/** Fetch available caption tracks from YouTube's timedtext XML list endpoint. */
async function listTimedtextTracks(
  youtubeVideoId: string,
): Promise<Array<{ lang: string; name: string; kind: string }>> {
  const url = `https://www.youtube.com/api/timedtext?v=${youtubeVideoId}&type=list`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CreatorCanonPipeline/1.0)' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return [];
  const xml = await res.text();

  // Parse <track id="..." name="" lang_code="en" lang_original="English" kind="asr"/>
  const tracks: Array<{ lang: string; name: string; kind: string }> = [];
  const trackRe = /<track[^>]+>/g;
  for (const match of xml.matchAll(trackRe)) {
    const tag = match[0];
    const langMatch = tag.match(/lang_code="([^"]+)"/);
    const nameMatch = tag.match(/\bname="([^"]*)"/);
    const kindMatch = tag.match(/\bkind="([^"]+)"/);
    const lang = langMatch?.[1];
    if (lang) {
      tracks.push({
        lang,
        name: nameMatch?.[1] ?? '',
        kind: kindMatch?.[1] ?? 'standard',
      });
    }
  }
  return tracks;
}

/** Download a single VTT caption track from YouTube timedtext. */
async function downloadVtt(
  youtubeVideoId: string,
  lang: string,
  kind: string,
  name: string,
): Promise<string | null> {
  const params = new URLSearchParams({
    v: youtubeVideoId,
    lang,
    fmt: 'vtt',
  });
  if (kind === 'asr') params.set('kind', 'asr');
  if (name) params.set('name', name);

  const url = `https://www.youtube.com/api/timedtext?${params.toString()}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CreatorCanonPipeline/1.0)' },
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) return null;
  const text = await res.text();
  // VTT files start with "WEBVTT"
  if (!text.trim().startsWith('WEBVTT')) return null;
  return text;
}

function countWords(vttContent: string): number {
  // Strip VTT cue metadata, keep only spoken text
  const lines = vttContent.split('\n');
  const textLines = lines.filter(
    (l) =>
      l.trim() &&
      !l.startsWith('WEBVTT') &&
      !l.includes('-->') &&
      !/^\d+$/.test(l.trim()) &&
      !l.startsWith('NOTE'),
  );
  return textLines.join(' ').split(/\s+/).filter(Boolean).length;
}

/** Pick the best language from available tracks: prefer English, then first available. */
function pickBestTrack(
  tracks: Array<{ lang: string; name: string; kind: string }>,
): { lang: string; name: string; kind: string } | null {
  if (tracks.length === 0) return null;
  const enManual = tracks.find((t) => t.lang === 'en' && t.kind !== 'asr');
  if (enManual) return enManual;
  const enAsr = tracks.find((t) => t.lang === 'en');
  if (enAsr) return enAsr;
  const anyManual = tracks.find((t) => t.kind !== 'asr');
  if (anyManual) return anyManual;
  return tracks[0] ?? null;
}

export async function ensureTranscripts(
  input: EnsureTranscriptsInput,
): Promise<EnsureTranscriptsOutput> {
  const env = parseServerEnv(process.env);
  const db = getDb();
  const r2 = createR2Client(env);

  const results: TranscriptResult[] = [];

  for (const vid of input.videos) {
    // Check if a canonical transcript already exists
    const existing = await db
      .select()
      .from(transcriptAsset)
      .where(
        and(
          eq(transcriptAsset.videoId, vid.id),
          eq(transcriptAsset.isCanonical, true),
        ),
      )
      .limit(1);

    if (existing[0]) {
      results.push({
        videoId: vid.id,
        youtubeVideoId: vid.youtubeVideoId,
        r2Key: existing[0].r2Key,
        provider: 'existing',
        wordCount: existing[0].wordCount,
        language: existing[0].language ?? 'en',
        skipped: false,
      });
      continue;
    }

    // Manual-upload videos: the transcript is created by the transcribe-uploaded-video
    // Trigger.dev worker job before the run reaches this stage. If the video is not
    // yet in 'ready' state, we cannot proceed — surface a clear error to the caller.
    if (vid.sourceKind === 'manual_upload') {
      const videoRows = await db
        .select({ transcribeStatus: video.transcribeStatus })
        .from(video)
        .where(eq(video.id, vid.id))
        .limit(1);
      const transcribeStatus = videoRows[0]?.transcribeStatus ?? 'unknown';

      if (transcribeStatus !== 'ready') {
        throw new Error(
          `Manual upload ${vid.id} (${vid.title ?? 'untitled'}) is not transcribed yet ` +
          `(status: ${transcribeStatus}). Re-upload or wait for transcription to complete.`,
        );
      }

      // The transcriptAsset was already inserted by the worker job; it just wasn't
      // found in the canonical-transcript query above (e.g., workspaceId mismatch
      // or race). Mark as skipped-but-ok so downstream stages know there is a gap.
      // In practice, if the worker job succeeded the canonical row exists and we
      // would have taken the `existing[0]` branch above.
      results.push({
        videoId: vid.id,
        youtubeVideoId: vid.youtubeVideoId,
        r2Key: '',
        provider: 'existing',
        wordCount: 0,
        language: 'en',
        skipped: true,
        skipReason: `Manual upload transcript not found in canonical index despite status=ready. Check transcriptAsset row for videoId=${vid.id}.`,
      });
      continue;
    }

    // Try YouTube timedtext (only for videos with a YouTube ID)
    let vttContent: string | null = null;
    let chosenLang = 'en';
    const provider: TranscriptResult['provider'] = 'youtube_captions';

    if (vid.youtubeVideoId) {
      try {
        const tracks = await listTimedtextTracks(vid.youtubeVideoId);
        const best = pickBestTrack(tracks);
        if (best) {
          vttContent = await downloadVtt(vid.youtubeVideoId, best.lang, best.kind, best.name);
          chosenLang = best.lang;
        }
      } catch {
        // Network errors are non-fatal; video will be skipped
      }
    }

    if (!vttContent) {
      results.push({
        videoId: vid.id,
        youtubeVideoId: vid.youtubeVideoId,
        r2Key: '',
        provider: 'youtube_captions',
        wordCount: 0,
        language: 'en',
        skipped: true,
        skipReason: 'No captions available',
      });
      continue;
    }

    const r2Key = transcriptKey({
      workspaceId: input.workspaceId,
      videoId: vid.id,
      format: 'vtt',
    });

    await r2.putObject({
      key: r2Key,
      body: vttContent,
      contentType: 'text/vtt',
    });

    const wordCount = countWords(vttContent);

    const assetId = crypto.randomUUID();
    await db.insert(transcriptAsset).values({
      id: assetId,
      workspaceId: input.workspaceId,
      videoId: vid.id,
      provider: 'youtube_captions',
      language: chosenLang,
      r2Key,
      wordCount,
      isCanonical: true,
    }).onConflictDoNothing();

    results.push({
      videoId: vid.id,
      youtubeVideoId: vid.youtubeVideoId,
      r2Key,
      provider,
      wordCount,
      language: chosenLang,
      skipped: false,
    });
  }

  return {
    transcripts: results,
    fetchedCount: results.filter((r) => !r.skipped).length,
    skippedCount: results.filter((r) => r.skipped).length,
  };
}
