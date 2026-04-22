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
  youtubeVideoId: string;
  r2Key: string;
  provider: 'youtube_timedtext' | 'whisper' | 'existing';
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
  if (!text.trim().startsWith('WEBVTT')) return null;
  return text;
}

/**
 * Strategy 3: Parse the YouTube watch page for `ytInitialPlayerResponse` and
 * extract caption track base URLs from the `captionTracks` array.
 * This is the most reliable approach for modern YouTube videos whose ASR
 * captions are not served through the unofficial timedtext API.
 */
async function fetchVttViaWatchPage(youtubeVideoId: string): Promise<{ vtt: string; lang: string; isAuto: boolean } | null> {
  const watchUrl = `https://www.youtube.com/watch?v=${youtubeVideoId}&hl=en`;
  let html: string;
  try {
    const res = await fetch(watchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return null;
    html = await res.text();
  } catch {
    return null;
  }

  // Extract ytInitialPlayerResponse JSON from the page
  const match = html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\})(?:;\s*(?:var|const|let)\s|;\s*<\/script>)/s);
  if (!match?.[1]) return null;

  let playerResponse: unknown;
  try {
    playerResponse = JSON.parse(match[1]);
  } catch {
    return null;
  }

  // Navigate into captionTracks
  const captions = (playerResponse as Record<string, unknown>)?.captions;
  if (!captions || typeof captions !== 'object') return null;
  const renderer = (captions as Record<string, unknown>)?.playerCaptionsTracklistRenderer;
  if (!renderer || typeof renderer !== 'object') return null;
  const tracks = (renderer as Record<string, unknown>)?.captionTracks;
  if (!Array.isArray(tracks) || tracks.length === 0) return null;

  type CaptionTrack = { baseUrl?: string; languageCode?: string; kind?: string; name?: { simpleText?: string } };
  const typedTracks = tracks as CaptionTrack[];

  // Pick best: prefer manual English, then ASR English, then any manual, then first
  const pick =
    typedTracks.find((t) => t.languageCode === 'en' && t.kind !== 'asr') ??
    typedTracks.find((t) => t.languageCode === 'en') ??
    typedTracks.find((t) => t.kind !== 'asr') ??
    typedTracks[0];

  if (!pick?.baseUrl) return null;

  // Convert to VTT format by appending fmt=vtt
  const vttUrl = `${pick.baseUrl}&fmt=vtt`;
  try {
    const res = await fetch(vttUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return null;
    const text = await res.text();
    if (!text.trim().startsWith('WEBVTT')) return null;
    return { vtt: text, lang: pick.languageCode ?? 'en', isAuto: pick.kind === 'asr' };
  } catch {
    return null;
  }
}

function countWords(vttContent: string): number {
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
      await db.update(video).set({ captionStatus: 'available' }).where(eq(video.id, vid.id));
      continue;
    }

    let vttContent: string | null = null;
    let chosenLang = 'en';
    let isAutoCaption = false;
    let skipReason = 'No captions available';
    const provider: TranscriptResult['provider'] = 'youtube_timedtext';

    try {
      // Strategy 1: Use the track-list API to discover available tracks.
      const tracks = await listTimedtextTracks(vid.youtubeVideoId);
      const best = pickBestTrack(tracks);
      if (best) {
        vttContent = await downloadVtt(vid.youtubeVideoId, best.lang, best.kind, best.name);
        chosenLang = best.lang;
        isAutoCaption = best.kind === 'asr';
        if (!vttContent) {
          skipReason = `Caption track was found (${best.lang}), but timedtext download did not return usable VTT.`;
        }
      }

      // Strategy 2 (fallback): The track-list API returns empty for many newer videos whose
      // captions are served through YouTube's ASR pipeline. Try direct VTT endpoints instead.
      if (!vttContent) {
        // 2a — Manual/translated English captions
        vttContent = await downloadVtt(vid.youtubeVideoId, 'en', 'standard', '');
        if (vttContent) {
          chosenLang = 'en';
          isAutoCaption = false;
        }
      }
      if (!vttContent) {
        // 2b — Auto-generated ASR English captions
        vttContent = await downloadVtt(vid.youtubeVideoId, 'en', 'asr', '');
        if (vttContent) {
          chosenLang = 'en';
          isAutoCaption = true;
        }
      }

      // Strategy 3 (final fallback): Parse ytInitialPlayerResponse from the watch page.
      // Modern YouTube serves ASR captions at signed baseUrls that aren't exposed by
      // the timedtext API — only discoverable via the watch page's player response JSON.
      if (!vttContent) {
        const watchResult = await fetchVttViaWatchPage(vid.youtubeVideoId);
        if (watchResult) {
          vttContent = watchResult.vtt;
          chosenLang = watchResult.lang;
          isAutoCaption = watchResult.isAuto;
        }
      }

      if (!vttContent) {
        skipReason = tracks.length > 0
          ? `Caption track was found (${tracks.map((t) => t.lang).join(', ')}), but all VTT downloads returned empty content (tried timedtext API, direct ASR, and watch-page ytInitialPlayerResponse).`
          : 'No public YouTube caption tracks were found for this video (timedtext list API, direct ASR fallback, and watch-page ytInitialPlayerResponse all returned empty).';
      }
    } catch (error) {
      skipReason = error instanceof Error
        ? `Timedtext lookup failed: ${error.message}`
        : 'Timedtext lookup failed for an unknown reason.';
    }

    if (!vttContent) {
      await db.update(video).set({ captionStatus: 'none' }).where(eq(video.id, vid.id));
      results.push({
        videoId: vid.id,
        youtubeVideoId: vid.youtubeVideoId,
        r2Key: '',
        provider: 'youtube_timedtext',
        wordCount: 0,
        language: 'en',
        skipped: true,
        skipReason,
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

    await db.insert(transcriptAsset).values({
      id: crypto.randomUUID(),
      workspaceId: input.workspaceId,
      videoId: vid.id,
      provider: 'youtube_captions',
      language: chosenLang,
      r2Key,
      wordCount,
      isCanonical: true,
    }).onConflictDoNothing();
    await db
      .update(video)
      .set({ captionStatus: isAutoCaption ? 'auto_only' : 'available' })
      .where(eq(video.id, vid.id));

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
