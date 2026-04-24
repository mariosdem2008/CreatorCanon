import { and, eq, getDb } from '@creatorcanon/db';
import { account, mediaAsset, transcriptAsset, video, workspace } from '@creatorcanon/db/schema';
import {
  createOpenAIClient,
  createR2Client,
  createYouTubeClient,
  transcriptKey,
  type Transcript,
} from '@creatorcanon/adapters';
import { parseServerEnv } from '@creatorcanon/core';
import { extractVideoAudioAssets } from '../audio-extraction';
import { recordCost } from '../cost-ledger-write';
import type { SelectionSnapshotOutput } from './import-selection-snapshot';

const FORCE_SSL_SCOPE = 'https://www.googleapis.com/auth/youtube.force-ssl';

/**
 * Strategy 0: use the workspace owner's stored Google OAuth token to call
 * YouTube Data API `captions.list` + `captions.download`. Works only for
 * videos the authenticated owner has access to (practically: their own
 * channel) and only when the access token carries the `youtube.force-ssl`
 * scope. Returns null on any failure so callers can fall through to the
 * public-endpoint strategies.
 */
// Preserved post-audit for reference. The owner-captions lane was disabled
// when youtube.force-ssl was dropped from sign-in scope. If you re-enable it,
// rename back to fetchOwnerCaptions and restore the call site in the try/catch.
async function _fetchOwnerCaptions(input: {
  workspaceId: string;
  youtubeVideoId: string;
}): Promise<{ vtt: string; lang: string; isAuto: boolean } | null> {
  const db = getDb();

  const ownerRows = await db
    .select({
      accessToken: account.access_token,
      refreshToken: account.refresh_token,
      expiresAt: account.expires_at,
      scope: account.scope,
    })
    .from(account)
    .innerJoin(workspace, eq(workspace.ownerUserId, account.userId))
    .where(and(eq(workspace.id, input.workspaceId), eq(account.provider, 'google')))
    .limit(1);

  const owner = ownerRows[0];
  if (!owner?.accessToken) return null;
  if (!owner.scope?.includes(FORCE_SSL_SCOPE)) return null;

  const client = createYouTubeClient({
    accessToken: owner.accessToken,
    refreshToken: owner.refreshToken ?? undefined,
    expiresAt: owner.expiresAt ? owner.expiresAt * 1000 : undefined,
    scope: owner.scope,
  });

  let tracks;
  try {
    tracks = await client.getCaptions(input.youtubeVideoId);
  } catch {
    return null;
  }
  if (!Array.isArray(tracks) || tracks.length === 0) return null;

  const usable = tracks.filter((t) => !t.isDraft);
  if (usable.length === 0) return null;

  const pick =
    usable.find((t) => t.language === 'en' && !t.isAuto) ??
    usable.find((t) => t.language === 'en') ??
    usable.find((t) => !t.isAuto) ??
    usable[0];
  if (!pick?.id) return null;

  let vtt: string;
  try {
    vtt = await client.downloadCaption(pick.id);
  } catch {
    return null;
  }
  if (!vtt || !vtt.trim().startsWith('WEBVTT')) return null;

  return { vtt, lang: pick.language || 'en', isAuto: pick.isAuto === true };
}

export interface EnsureTranscriptsInput {
  runId: string;
  workspaceId: string;
  videos: SelectionSnapshotOutput['videos'];
}

export interface TranscriptResult {
  videoId: string;
  youtubeVideoId: string;
  r2Key: string;
  provider: 'youtube_timedtext' | 'gpt-4o-mini-transcribe' | 'existing';
  wordCount: number;
  language: string;
  skipped: boolean;
  skipReason?: string;
}

export interface EnsureTranscriptsOutput {
  transcripts: TranscriptResult[];
  fetchedCount: number;
  skippedCount: number;
  providerCounts: Record<string, number>;
  audioFallback: {
    usedCount: number;
    extractedCount: number;
    reusedCount: number;
    failedCount: number;
  };
}

function shouldAttemptAutomaticExtraction() {
  return (process.env.PIPELINE_DISPATCH_MODE ?? 'inprocess') === 'worker';
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

function formatTimestamp(ms: number): string {
  const safeMs = Math.max(0, Math.round(ms));
  const hours = Math.floor(safeMs / 3_600_000);
  const minutes = Math.floor((safeMs % 3_600_000) / 60_000);
  const seconds = Math.floor((safeMs % 60_000) / 1000);
  const millis = safeMs % 1000;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

function transcriptToVtt(transcript: Transcript): string {
  const segments = transcript.segments?.filter((segment) => segment.text.trim()) ?? [];
  if (segments.length > 0) {
    return [
      'WEBVTT',
      '',
      ...segments.flatMap((segment, index) => [
        String(index + 1),
        `${formatTimestamp(segment.startMs)} --> ${formatTimestamp(Math.max(segment.endMs, segment.startMs + 1000))}`,
        segment.text.trim(),
        '',
      ]),
    ].join('\n');
  }

  const text = transcript.text.trim();
  if (!text) return 'WEBVTT\n';
  const durationMs = Math.max(30_000, Math.round((transcript.durationSeconds ?? 60) * 1000));
  return [
    'WEBVTT',
    '',
    '1',
    `00:00:00.000 --> ${formatTimestamp(durationMs)}`,
    text,
    '',
  ].join('\n');
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
  const openai = createOpenAIClient(env);

  const results: TranscriptResult[] = [];
  const providerCounts: Record<string, number> = {
    existing: 0,
    youtube_timedtext: 0,
    'gpt-4o-mini-transcribe': 0,
  };
  const audioFallback = {
    usedCount: 0,
    extractedCount: 0,
    reusedCount: 0,
    failedCount: 0,
  };

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
      providerCounts.existing = (providerCounts.existing ?? 0) + 1;
      await db.update(video).set({ captionStatus: 'available' }).where(eq(video.id, vid.id));
      continue;
    }

    let vttContent: string | null = null;
    let chosenLang = 'en';
    let isAutoCaption = false;
    let skipReason = 'No captions available';
    let provider: TranscriptResult['provider'] = 'youtube_timedtext';

    try {
      // Strategy 0 (disabled post-audit): Owner-OAuth captions.list +
      // captions.download. Required the `youtube.force-ssl` scope, which
      // was dropped from sign-in because this lane never fired successfully
      // in production. fetchOwnerCaptions() remains in the module for
      // reference; we no longer call it. All transcription goes through
      // Strategy 1-3 (public timedtext) or the audio-extraction + whisper
      // fallback below.

      // Strategy 1: Use the track-list API to discover available tracks.
      let tracks: Array<{ lang: string; name: string; kind: string }> = [];
      if (!vttContent) {
        tracks = await listTimedtextTracks(vid.youtubeVideoId);
        const best = pickBestTrack(tracks);
        if (best) {
          vttContent = await downloadVtt(vid.youtubeVideoId, best.lang, best.kind, best.name);
          chosenLang = best.lang;
          isAutoCaption = best.kind === 'asr';
          if (!vttContent) {
            skipReason = `Caption track was found (${best.lang}), but timedtext download did not return usable VTT.`;
          }
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
      let audioRows = await db
        .select({ r2Key: mediaAsset.r2Key })
        .from(mediaAsset)
        .where(and(
          eq(mediaAsset.workspaceId, input.workspaceId),
          eq(mediaAsset.videoId, vid.id),
          eq(mediaAsset.type, 'audio_m4a'),
        ))
        .limit(1);
      const hadAudioAssetBeforeExtraction = Boolean(audioRows[0]);

      if (!audioRows[0] && shouldAttemptAutomaticExtraction()) {
        try {
          const extraction = await extractVideoAudioAssets({
            workspaceId: input.workspaceId,
            runId: input.runId,
            videos: [{
              videoId: vid.id,
              youtubeVideoId: vid.youtubeVideoId,
              title: vid.title,
            }],
            requireConfirmation: false,
          });
          audioFallback.extractedCount += extraction.extractedCount;
          audioFallback.reusedCount += extraction.reusedCount;
          audioRows = extraction.items.length > 0
            ? [{ r2Key: extraction.items[0]!.audioR2Key }]
            : audioRows;
        } catch (error) {
          audioFallback.failedCount += 1;
          const extractionReason = error instanceof Error
            ? error.message
            : 'unknown automatic extraction error';
          skipReason = skipReason
            ? `${skipReason} Automatic audio extraction failed: ${extractionReason}`
            : `Automatic audio extraction failed: ${extractionReason}`;
        }
      }

      const audioR2Key = audioRows[0]?.r2Key;
      if (audioR2Key) {
        try {
          const audioObject = await r2.getObject(audioR2Key);
          const transcript = await openai.transcribe({
            bytes: audioObject.body,
            filename: `${vid.id}.m4a`,
            language: 'en',
          });
          // Cost log — whisper-1 priced $0.006 per minute as of 2025.
          // 0.006 USD/min = 0.6 cents/min, so costCents = seconds / 60 * 0.6.
          await recordCost({
            runId: input.runId,
            workspaceId: input.workspaceId,
            stageName: 'ensure_transcripts',
            provider: 'openai',
            model: 'whisper-1',
            inputSecondsVideo: transcript.durationSeconds ?? null,
            costCents: ((transcript.durationSeconds ?? 0) / 60) * 0.6,
            metadata: { videoId: vid.id, via: 'audio_fallback' },
          });
          vttContent = transcriptToVtt(transcript);
          chosenLang = transcript.language ?? 'en';
          provider = 'gpt-4o-mini-transcribe';
          skipReason = '';
          audioFallback.usedCount += 1;
          if (hadAudioAssetBeforeExtraction) {
            audioFallback.reusedCount += 1;
          }
        } catch (error) {
          skipReason = error instanceof Error
            ? `Audio transcription failed: ${error.message}`
            : 'Audio transcription failed for an unknown reason.';
        }
      }
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
      provider: provider === 'gpt-4o-mini-transcribe' ? 'gpt-4o-mini-transcribe' : 'youtube_captions',
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
    providerCounts[provider] = (providerCounts[provider] ?? 0) + 1;
  }

  return {
    transcripts: results,
    fetchedCount: results.filter((r) => !r.skipped).length,
    skippedCount: results.filter((r) => r.skipped).length,
    providerCounts,
    audioFallback,
  };
}
