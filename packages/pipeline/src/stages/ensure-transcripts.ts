import { and, eq, getDb } from '@creatorcanon/db';
import { transcriptAsset } from '@creatorcanon/db/schema';
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
      continue;
    }

    let vttContent: string | null = null;
    let chosenLang = 'en';
    const provider: TranscriptResult['provider'] = 'youtube_timedtext';

    try {
      const tracks = await listTimedtextTracks(vid.youtubeVideoId);
      const best = pickBestTrack(tracks);
      if (best) {
        vttContent = await downloadVtt(vid.youtubeVideoId, best.lang, best.kind, best.name);
        chosenLang = best.lang;
      }
    } catch {
      // Network errors are non-fatal; video will be skipped.
    }

    if (!vttContent) {
      results.push({
        videoId: vid.id,
        youtubeVideoId: vid.youtubeVideoId,
        r2Key: '',
        provider: 'youtube_timedtext',
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
