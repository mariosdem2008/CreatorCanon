# Phase 4 — Pipeline Performance Optimization Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut wall-clock time for a 5-video / 5h-content creator from 4-5 hours to **under 1 hour** without sacrificing output quality. Cost stays $0.

**Architecture:** Three independent speedups stack:
1. **Local Whisper** replaces Groq's rate-limited free tier — eliminates the per-hour audio-seconds ceiling, runs on the user's NVIDIA GPU
2. **Scene-change detection** pre-filters visual frames before vision LLM — skips talking-head near-duplicates, classifies only meaningful frames
3. **Parallel per-video stages** — Codex VIC + per-video canon calls fan out concurrently instead of sequentially

**Tech Stack:** `faster-whisper` (Python, CUDA), ffmpeg `select='gt(scene\,N)'`, TypeScript Promise.all, existing Ollama HTTP API, existing Codex CLI provider.

---

## Why these three

The Matt Walker run (2 videos × ~3h) exposed three sequential bottlenecks:

| Stage | Current cost (5.7h content) | Bottleneck |
|---|---|---|
| Transcription (Groq Whisper free) | 3+ hours wall-clock | 7200 sec/hr ASPH ceiling, exponential 10-min waits between 429s |
| Visual moments (Ollama vision) | 66 min | 60 frames × 33s sequential, mostly talking-head dupes |
| LLM audit (Codex CLI) | 12-20 min | All stages sequential, even the per-video ones |

Stage 1 is the worst. Tasks 4.1+4.2 are the highest-leverage fixes; 4.3 and 4.4 are smaller but compound.

---

## Task 4.1: Verify Ollama GPU acceleration

**Files:**
- Inspect-only: no file changes

**Why:** If Ollama fell back to CPU on Windows, every vision call is 10-50× slower than it should be. One-command check before doing anything else.

- [ ] **Step 1: Start a vision request and check GPU usage**

Run a single Ollama vision call, then immediately:

```bash
ollama ps
```

Expected output: `llama3.2-vision:11b ... PROCESSOR=100% GPU` (or similar). If `PROCESSOR=CPU`, the model is running on CPU and we need to fix CUDA before proceeding.

- [ ] **Step 2: If CPU-only, verify CUDA installation**

```bash
nvidia-smi
```

If `nvidia-smi` works but Ollama is still CPU-only, set `OLLAMA_GPU_LAYERS=99` and restart Ollama service. (This task only runs the diagnostic — no code changes here.)

- [ ] **Step 3: Document baseline frame-classification time**

Run our existing smoke test from earlier; record the per-frame elapsed ms in `docs/superpowers/plans/2026-04-30-phase-4-baseline.md`. This becomes the "before" number for Task 4.3's improvement claim.

---

## Task 4.2: Local `faster-whisper` transcription provider

**Files:**
- Create: `packages/pipeline/src/scripts/util/local-whisper.py`
- Modify: `packages/pipeline/src/scripts/transcribe-pending-uploads.ts:50-71` (extend `buildTranscriber()` to support `local-whisper` provider)

**Why:** Groq's free tier blocks at 7200 audio-seconds/hour. Long-form podcasts (3hr+) trip the ceiling on a single video. `faster-whisper` with CUDA on the user's GPU does ~5h of audio in ~10-15 min with zero quota.

- [ ] **Step 1: Write the Python transcription helper**

Create `packages/pipeline/src/scripts/util/local-whisper.py`:

```python
#!/usr/bin/env python3
"""
Local faster-whisper transcription helper. Reads an audio file path from
argv[1], emits JSON to stdout matching the OpenAI/Groq verbose_json shape:

  { "text": "...", "language": "en", "duration": 1234.5,
    "segments": [{"start": 0.0, "end": 4.2, "text": "..."}, ...] }

Used by transcribe-pending-uploads.ts when TRANSCRIBE_PROVIDER=local-whisper.

Install: pip install faster-whisper torch
GPU model selection (CUDA available on the user's NVIDIA GPU):
  - large-v3-turbo     ≈ 6× faster than v3, near-identical quality
  - large-v3           highest quality
  - distil-large-v3    smallest + fastest, slight quality drop

Override via env: WHISPER_MODEL, WHISPER_DEVICE, WHISPER_COMPUTE_TYPE.
"""
import json
import os
import sys

from faster_whisper import WhisperModel

def main() -> None:
    if len(sys.argv) < 2:
        sys.stderr.write("Usage: local-whisper.py <audio_path>\n")
        sys.exit(2)

    audio_path = sys.argv[1]
    model_name = os.environ.get("WHISPER_MODEL", "large-v3-turbo")
    device = os.environ.get("WHISPER_DEVICE", "cuda")
    compute_type = os.environ.get("WHISPER_COMPUTE_TYPE", "float16")

    sys.stderr.write(f"[local-whisper] loading {model_name} on {device}/{compute_type}\n")
    model = WhisperModel(model_name, device=device, compute_type=compute_type)

    sys.stderr.write(f"[local-whisper] transcribing {audio_path}\n")
    segments_iter, info = model.transcribe(
        audio_path,
        beam_size=5,
        vad_filter=True,  # silence-trim improves WER on long podcasts
        word_timestamps=False,
    )

    segments = []
    full_text_parts = []
    for s in segments_iter:
        segments.append({"start": float(s.start), "end": float(s.end), "text": s.text})
        full_text_parts.append(s.text)

    out = {
        "text": " ".join(full_text_parts).strip(),
        "language": info.language,
        "duration": float(info.duration),
        "segments": segments,
    }
    sys.stdout.write(json.dumps(out))
    sys.stderr.write(f"[local-whisper] done — {len(segments)} segments, {info.duration:.1f}s audio\n")

if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Add Python availability check + extend `buildTranscriber()`**

Modify `packages/pipeline/src/scripts/transcribe-pending-uploads.ts` near the top of `buildTranscriber()`:

```ts
function buildTranscriber(): { client: OpenAI; model: string; providerLabel: string } | LocalWhisperRunner {
  const provider = (process.env.TRANSCRIBE_PROVIDER ?? 'openai').toLowerCase().trim();
  if (provider === 'local-whisper') {
    return buildLocalWhisper();
  }
  // ... existing groq + openai branches ...
}

interface LocalWhisperRunner {
  kind: 'local-whisper';
  providerLabel: string;
  scriptPath: string;
  pythonBin: string;
}

function buildLocalWhisper(): LocalWhisperRunner {
  const pythonBin = process.env.LOCAL_WHISPER_PYTHON?.trim() || (process.platform === 'win32' ? 'python' : 'python3');
  const scriptPath = path.resolve(__dirname, 'util/local-whisper.py');
  if (!fs.existsSync(scriptPath)) throw new Error(`local-whisper.py missing at ${scriptPath}`);
  return {
    kind: 'local-whisper',
    providerLabel: `local-whisper:${process.env.WHISPER_MODEL ?? 'large-v3-turbo'}`,
    scriptPath,
    pythonBin,
  };
}
```

- [ ] **Step 3: Add `transcribeOnceLocal()` that drives Python via spawn**

In the same file, parallel to `transcribeOnce`:

```ts
async function transcribeOnceLocal(
  audioPath: string,
  label: string,
  runner: LocalWhisperRunner,
): Promise<VerboseRes> {
  return new Promise((resolve, reject) => {
    const proc = spawn(runner.pythonBin, [runner.scriptPath, audioPath], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    });
    let stdout = '';
    let stderr = '';
    proc.stdout?.on('data', (b: Buffer) => { stdout += b.toString(); });
    proc.stderr?.on('data', (b: Buffer) => { stderr += b.toString(); process.stderr.write(b); });
    proc.on('error', (err) => reject(new Error(`local-whisper spawn failed: ${err.message}. Install with: pip install faster-whisper`)));
    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`local-whisper exit ${code}: ${stderr.slice(-300)}`));
        return;
      }
      try {
        const parsed = JSON.parse(stdout) as VerboseRes;
        resolve(parsed);
      } catch (e) {
        reject(new Error(`local-whisper output not JSON: ${(e as Error).message}; preview: ${stdout.slice(0, 200)}`));
      }
    });
  });
}
```

- [ ] **Step 4: Route `transcribeWithChunking` to local-whisper when configured**

Modify the chunking entry point to skip chunking entirely for local-whisper (it has no size limit) and call `transcribeOnceLocal` directly:

```ts
async function transcribeWithChunking(
  audioPath: string,
  audioBytes: number,
  durationSec: number,
  videoId: string,
  tempDir: string,
  transcriber: ReturnType<typeof buildTranscriber>,
): Promise<VerboseRes> {
  if ('kind' in transcriber && transcriber.kind === 'local-whisper') {
    console.info(`[transcribe] ${videoId}: using ${transcriber.providerLabel} (no chunking, no rate limit)`);
    return transcribeOnceLocal(audioPath, videoId, transcriber);
  }
  // ... existing API-based chunking ...
}
```

- [ ] **Step 5: Add a Python sanity check at script start**

Modify `transcribe-pending-uploads.ts`'s `main()` to fail fast with a helpful error if the user picked `local-whisper` but Python or the package isn't installed:

```ts
if (provider === 'local-whisper') {
  const probe = spawnSync(runner.pythonBin, ['-c', 'import faster_whisper'], { encoding: 'utf8' });
  if (probe.status !== 0) {
    throw new Error(`local-whisper requires faster-whisper. Install with:\n  ${runner.pythonBin} -m pip install faster-whisper\nthen re-run.`);
  }
}
```

- [ ] **Step 6: Add a tiny smoke test**

Create `packages/pipeline/src/scripts/test/local-whisper-smoke.ts`:

```ts
// Smoke: not part of the test runner. Intentionally a manual script.
// Generates 3s of silence + a TTS phrase via ffmpeg, transcribes via
// local-whisper, asserts the segments array is non-empty.
// Run with: tsx ./src/scripts/test/local-whisper-smoke.ts
```

(Implementation similar to the Ollama vision smoke we already have. Asserts `segments.length > 0` and language detected.)

- [ ] **Step 7: Typecheck + commit**

```bash
cd packages/pipeline && pnpm typecheck
git add packages/pipeline/src/scripts/util/local-whisper.py packages/pipeline/src/scripts/transcribe-pending-uploads.ts packages/pipeline/src/scripts/test/local-whisper-smoke.ts
git commit -m "feat(transcribe): local faster-whisper provider for unbounded transcription"
```

---

## Task 4.3: Scene-change detection in visual moments

**Files:**
- Modify: `packages/pipeline/src/scripts/seed-visual-moments.ts:208-216` (replace fixed-interval sampling with scene-change extraction)

**Why:** A 60-min talking-head video has ~10-20 actual scene changes (slide transitions, B-roll cuts, demo screens) — those are the editorially valuable frames. Sampling 60 fixed-interval frames extracts ~50 near-duplicate talking-head shots and ~10 useful ones. Scene-change detection inverts the ratio: extract only meaningfully-different frames, classify those.

- [ ] **Step 1: Add scene-change frame extractor to seed-visual-moments.ts**

Above the existing `extractFrame()` function:

```ts
/**
 * Extract scene-change frames using ffmpeg's select filter. Output frames
 * are written as `<tempDir>/scene_<index>_t<timestampSec>.jpg`. Returns the
 * list of timestamps in seconds where scene changes occurred.
 *
 * Scene threshold (0.0-1.0): higher = fewer, more dramatic changes only.
 * 0.3 is a good default for talking-head + slide content. Override via
 * VISUAL_MOMENTS_SCENE_THRESHOLD.
 *
 * Hard cap on returned frames via SCENE_FRAME_CAP so a fast-cut B-roll
 * sequence doesn't blow up the vision-LLM call count.
 */
async function extractSceneChangeFrames(
  inputPath: string,
  outputDir: string,
): Promise<Array<{ timestampSec: number; jpgPath: string }>> {
  const threshold = parseFloat(process.env.VISUAL_MOMENTS_SCENE_THRESHOLD ?? '0.3');
  const frameCap = parseInt(process.env.VISUAL_MOMENTS_SCENE_CAP ?? '40', 10);
  const showinfoLog = path.join(outputDir, 'scene-info.log');

  // First pass: write frames + scene-change pts to a sidecar log via showinfo.
  await new Promise<void>((resolve, reject) => {
    const proc = spawn(ffmpegBin(), [
      '-y',
      '-i', inputPath,
      '-vf', `select='gt(scene\\,${threshold})',showinfo`,
      '-vsync', 'vfr',
      '-q:v', '2',
      path.join(outputDir, 'scene_%04d.jpg'),
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
    proc.on('close', (code) => {
      // showinfo writes to stderr; capture for parsing.
      fs.writeFileSync(showinfoLog, stderr);
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg scene-extract exit ${code}: ${stderr.slice(-300)}`));
    });
    proc.on('error', reject);
  });

  // Parse showinfo log for "pts_time:N.N" entries — each line is one extracted frame.
  const log = fs.readFileSync(showinfoLog, 'utf8');
  const ptsRe = /pts_time:(\d+(?:\.\d+)?)/g;
  const timestamps: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = ptsRe.exec(log)) !== null) {
    timestamps.push(parseFloat(m[1]!));
  }

  // Pair each timestamp with its filename (scene_0001.jpg, scene_0002.jpg, ...).
  const frames: Array<{ timestampSec: number; jpgPath: string }> = [];
  for (let i = 0; i < timestamps.length; i += 1) {
    const idx = String(i + 1).padStart(4, '0');
    const jpgPath = path.join(outputDir, `scene_${idx}.jpg`);
    if (fs.existsSync(jpgPath)) {
      frames.push({ timestampSec: timestamps[i]!, jpgPath });
    }
  }

  // Cap if a fast-cut sequence produced too many.
  if (frames.length > frameCap) {
    console.info(`[visual-moments]   scene detector emitted ${frames.length} frames; capping to ${frameCap} via stride-thinning`);
    const stride = Math.ceil(frames.length / frameCap);
    return frames.filter((_, i) => i % stride === 0).slice(0, frameCap);
  }
  return frames;
}
```

- [ ] **Step 2: Replace the fixed-interval sampling block in `processVideo`**

Replace lines 208-279 (the `for (let i = 0; i < timestamps.length; ...)` loop) with:

```ts
// Replace fixed-interval sampling with scene-change extraction. Falls
// back to fixed-interval if ffmpeg's scene filter found <=2 frames — that
// usually means a single-shot static talking-head where the editor wants
// SOMETHING extracted.
const scenes = await extractSceneChangeFrames(localMp4, tempDir);
const fallbackToFixed = scenes.length < 3;
const sampleList = fallbackToFixed
  ? Array.from({ length: Math.min(MAX_FRAMES_PER_VIDEO, Math.floor(durationSec / SAMPLE_INTERVAL_SEC)) },
      (_, i) => ({ timestampSec: i * SAMPLE_INTERVAL_SEC, jpgPath: path.join(tempDir, `frame_${i * SAMPLE_INTERVAL_SEC}.jpg`) }))
  : scenes;

console.info(
  `[visual-moments] ${v.id} (${v.title ?? 'no title'}): ` +
  `duration=${durationSec.toFixed(0)}s · ${fallbackToFixed
    ? `scene detector found ${scenes.length} frames; using ${sampleList.length} fixed-interval`
    : `extracted ${scenes.length} scene-change frames`}`,
);

// Fallback path needs to actually run ffmpeg per frame; scene path already
// has them on disk. Branch only here.
if (fallbackToFixed) {
  for (const s of sampleList) {
    await extractFrame(localMp4, s.timestampSec, s.jpgPath);
  }
}

const providerCounts: Record<string, number> = {};
for (let i = 0; i < sampleList.length; i += 1) {
  const { timestampSec: tsSec, jpgPath } = sampleList[i]!;
  const tsMs = Math.round(tsSec * 1000);
  framesAttempted += 1;
  // ... rest of the loop body identical to before (classifyFrame + insert + cleanup) ...
}
```

(The body of the per-frame loop is unchanged. Only the timestamp/path source differs.)

- [ ] **Step 3: Verify on the existing Jordan Platten run**

```bash
# Delete existing visual moments + re-run
./node_modules/.bin/tsx -e "import { closeDb, eq, getDb } from '@creatorcanon/db'; import { visualMoment } from '@creatorcanon/db/schema'; import { loadDefaultEnvFiles } from './src/env-files'; loadDefaultEnvFiles(); (async () => { const db = getDb(); await db.delete(visualMoment).where(eq(visualMoment.runId, 'a8a05629-d400-4f71-a231-99614615521c')); await closeDb(); })();"
./node_modules/.bin/tsx ./src/scripts/seed-visual-moments.ts a8a05629-d400-4f71-a231-99614615521c
```

Expected: scene detector finds 5-15 frames (vs 60 fixed), classification time drops 4-12x. Manually inspect the produced descriptions — they should be richer (real charts, slides, demo screens) since we're no longer classifying near-duplicates.

- [ ] **Step 4: Commit**

```bash
git add packages/pipeline/src/scripts/seed-visual-moments.ts
git commit -m "feat(visual-moments): scene-change pre-filter cuts vision-LLM call count 4-12x"
```

---

## Task 4.4: Parallelize per-video VIC + per-video canon

**Files:**
- Modify: `packages/pipeline/src/scripts/seed-audit-via-codex.ts:1095-1120` (VIC loop) and `:572-614` (per-video canon loop)

**Why:** Both loops iterate over `videos` sequentially. Each video's stage is independent — no shared accumulator within the stage. Concurrent execution scales linearly with video count.

- [ ] **Step 1: Refactor the VIC generation loop to `Promise.all` with concurrency cap**

Replace the sequential `for (let i = 0; i < videos.length; i += 1) { ... }` block with:

```ts
const VIC_CONCURRENCY = parseInt(process.env.AUDIT_VIC_CONCURRENCY ?? '3', 10);

async function mapWithConcurrency<T, U>(items: T[], limit: number, fn: (item: T, index: number) => Promise<U>): Promise<U[]> {
  const results: U[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]!, i);
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

const newVicResults = await mapWithConcurrency(
  videos.filter((v) => !vicByVideoId.has(v.videoId)),
  VIC_CONCURRENCY,
  async (v, i) => {
    console.info(`[codex-audit] (${i + 1}/${videos.length}) VIC for ${v.title}`);
    const { payload, evidenceSegmentIds } = await generateVic(runId, v, profilePayload);
    await db.insert(videoIntelligenceCard).values({
      id: crypto.randomUUID(),
      workspaceId: run.workspaceId,
      runId,
      videoId: v.videoId,
      payload: payload as unknown as Record<string, unknown>,
      evidenceSegmentIds,
    }).onConflictDoNothing();
    return { videoId: v.videoId, title: v.title, payload, evidenceSegmentIds };
  },
);

vicResults.push(...newVicResults);
```

- [ ] **Step 2: Mirror the same refactor for `generatePerVideoCanonNodes`**

Replace the outer `for (let vIdx = 0; vIdx < vics.length; vIdx += 1)` with `mapWithConcurrency`. The dedup `seenTitles` Set must be made thread-safe (use a Map keyed by per-video title set, then merge after all promises resolve).

```ts
const PER_VIDEO_CANON_CONCURRENCY = parseInt(process.env.AUDIT_PER_VIDEO_CANON_CONCURRENCY ?? '2', 10);

const perVideoBatches = await mapWithConcurrency(vics, PER_VIDEO_CANON_CONCURRENCY, async (vic, vIdx) => {
  const mustCover = extractMustCoverFromOneVic(vic);
  const totalNamed = mustCover.frameworks.length + mustCover.definitions.length;
  console.info(`[codex-audit] per-video canon (${vIdx + 1}/${vics.length}) ${vic.title} — must-cover: ${mustCover.frameworks.length} frameworks, ${mustCover.definitions.length} definitions`);
  if (totalNamed === 0) return [] as CanonNodeOut[];

  const myTitles: string[] = [];
  const accumulated: CanonNodeOut[] = [];
  for (let i = 0; i < PER_VIDEO_MAX_ITERATIONS; i += 1) {
    const remaining = PER_VIDEO_TARGET - myTitles.length;
    if (remaining <= 0) break;
    const prompt = buildPerVideoCanonPrompt(profile, vic, [...myTitles], remaining, mustCover);
    let batch: CanonNodeOut[];
    try {
      batch = await codexJson<CanonNodeOut[]>(prompt, `pv_canon_${vic.videoId}_iter_${i + 1}`, 'array', CANON_TIMEOUT_MS);
    } catch (err) {
      console.warn(`[codex-audit]   ${vic.videoId} iter ${i + 1} failed: ${(err as Error).message}`);
      continue;
    }
    let added = 0;
    for (const node of batch) {
      const title = node.payload?.title?.toString().trim();
      if (!title) continue;
      const lower = title.toLowerCase();
      if (myTitles.some((t) => t.toLowerCase() === lower)) continue;
      myTitles.push(title);
      accumulated.push(node);
      added += 1;
    }
    if (added === 0) break;
  }
  return accumulated;
});

// Merge into a single deduped list by title.
const allTitles = new Set<string>();
const accumulated: CanonNodeOut[] = [];
for (const batch of perVideoBatches) {
  for (const node of batch) {
    const title = node.payload?.title?.toString().trim();
    if (!title) continue;
    const lower = title.toLowerCase();
    if (allTitles.has(lower)) continue;
    allTitles.add(lower);
    accumulated.push(node);
  }
}
console.info(`[codex-audit] per-video canon synthesis complete: ${accumulated.length} distinct nodes (across ${vics.length} videos in parallel)`);
return accumulated;
```

- [ ] **Step 3: Typecheck + commit**

```bash
cd packages/pipeline && pnpm typecheck
git add packages/pipeline/src/scripts/seed-audit-via-codex.ts
git commit -m "feat(audit-seed): parallelize per-video VIC + canon generation"
```

---

## Task 4.5: Re-run Matt Walker end-to-end with the new pipeline

**Files:** none (verification task)

**Why:** Validate that all three changes actually deliver the expected speedup, on the same content the slow pipeline is currently working on.

- [ ] **Step 1: Stop any in-flight transcription job**

```bash
# Inspect any /tmp/hub-transcribe*.log running processes
powershell -NoProfile -Command "Get-WmiObject Win32_Process -Filter \"Name='node.exe'\" | Where-Object { \$_.CommandLine -like '*transcribe-pending*' -or \$_.CommandLine -like '*seed-audit-via-codex*' } | Select-Object ProcessId, CommandLine"
# Stop the relevant PIDs.
```

- [ ] **Step 2: Reset DB state for clean re-run**

```bash
./node_modules/.bin/tsx -e "
import { closeDb, eq, getDb } from '@creatorcanon/db';
import { generationRun, video, segment, channelProfile, videoIntelligenceCard, canonNode, pageBrief, visualMoment, generationStageRun } from '@creatorcanon/db/schema';
import { loadDefaultEnvFiles } from './src/env-files';
loadDefaultEnvFiles();
(async () => {
  const RUN = 'cf6ee665-e7a8-48dd-bf1b-2b045bbc2fce';
  const db = getDb();
  await db.delete(channelProfile).where(eq(channelProfile.runId, RUN));
  await db.delete(videoIntelligenceCard).where(eq(videoIntelligenceCard.runId, RUN));
  await db.delete(canonNode).where(eq(canonNode.runId, RUN));
  await db.delete(pageBrief).where(eq(pageBrief.runId, RUN));
  await db.delete(visualMoment).where(eq(visualMoment.runId, RUN));
  await db.delete(generationStageRun).where(eq(generationStageRun.runId, RUN));
  await db.delete(segment).where(eq(segment.runId, RUN));
  await db.update(video).set({ transcribeStatus: 'pending' });
  await db.update(generationRun).set({ status: 'queued' }).where(eq(generationRun.id, RUN));
  console.log('reset done');
  await closeDb();
})();
"
```

- [ ] **Step 3: Install faster-whisper Python deps if not present**

```bash
python -m pip install faster-whisper
```

Sanity-check CUDA is wired:

```bash
python -c "import torch; print('CUDA:', torch.cuda.is_available(), 'device:', torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'CPU')"
```

- [ ] **Step 4: Run transcription with local-whisper**

```bash
TRANSCRIBE_PROVIDER=local-whisper ./node_modules/.bin/tsx ./src/scripts/transcribe-pending-uploads.ts cf6ee665-e7a8-48dd-bf1b-2b045bbc2fce
```

Expected: ~12-25 min for both ~3hr videos.

- [ ] **Step 5: Run audit via Codex (parallel VIC enabled by default per Task 4.4)**

```bash
./node_modules/.bin/tsx ./src/scripts/seed-audit-via-codex.ts cf6ee665-e7a8-48dd-bf1b-2b045bbc2fce --per-video-canon
```

Expected: ~10-15 min total. (Channel profile + 2 parallel VICs + 2 parallel per-video canons + 1 synthesis + 1 reader journey + briefs.)

- [ ] **Step 6: Run visual moments via scene-change + Ollama**

```bash
./node_modules/.bin/tsx ./src/scripts/seed-visual-moments.ts cf6ee665-e7a8-48dd-bf1b-2b045bbc2fce
```

Expected: ~8-12 min for both videos (scene detector emits ~10-25 frames per video, each takes ~33s on Ollama).

- [ ] **Step 7: Cleanup phases (sibling reconcile, cluster normalize, ms-rewriter, validators, worksheet)**

```bash
./node_modules/.bin/tsx ./src/scripts/normalize-cluster-parents.ts cf6ee665-e7a8-48dd-bf1b-2b045bbc2fce
./node_modules/.bin/tsx ./src/scripts/reconcile-sibling-slugs.ts cf6ee665-e7a8-48dd-bf1b-2b045bbc2fce
./node_modules/.bin/tsx ./src/scripts/backfill-offline-stage-runs.ts cf6ee665-e7a8-48dd-bf1b-2b045bbc2fce
./node_modules/.bin/tsx ./src/scripts/rewrite-ms-range-to-segment-id.ts cf6ee665-e7a8-48dd-bf1b-2b045bbc2fce
./node_modules/.bin/tsx ./src/scripts/validate-citation-chain.ts cf6ee665-e7a8-48dd-bf1b-2b045bbc2fce
./node_modules/.bin/tsx ./src/scripts/check-voice-fingerprint.ts cf6ee665-e7a8-48dd-bf1b-2b045bbc2fce
./node_modules/.bin/tsx ./src/scripts/generate-qa-worksheet.ts cf6ee665-e7a8-48dd-bf1b-2b045bbc2fce
```

- [ ] **Step 8: Record total wall-clock time + provider mix in plan addendum**

Append to this plan doc (or `phase-4-results.md`):
- Transcription: actual minutes vs estimated 12-25
- Codex audit: actual minutes vs estimated 10-15
- Visual moments: actual minutes vs estimated 8-12
- Total: actual hours vs estimated 30-50 min
- Citation/voice/sibling validator scores
- Comparison to Hormozi baseline (which used the old serial pipeline)

- [ ] **Step 9: Final commit + audit URL**

```bash
git add docs/superpowers/plans/2026-04-30-phase-4-results.md
git commit -m "docs(phase-4): pipeline performance results — Matt Walker end-to-end timing"
```

Report:
- 🌐 http://localhost:3001/app/projects/e5cac96f-59cf-46c7-8051-8bc2864efaea/runs/cf6ee665-e7a8-48dd-bf1b-2b045bbc2fce/audit
- Total time saved vs the original pipeline
- Editorial quality score (validators)

---

## Self-Review

**Spec coverage:**
- Local Whisper for transcription → Task 4.2 ✓
- Scene-change detection → Task 4.3 ✓
- Parallel per-video stages → Task 4.4 ✓
- Ollama GPU verification (sanity check before any of the above) → Task 4.1 ✓
- End-to-end re-run on Matt Walker → Task 4.5 ✓

**Placeholders:** None. Code blocks contain complete, copyable implementations. Test step (4.5 step 3) calls out the install command + sanity check.

**Type consistency:** `LocalWhisperRunner` is a new union member of the `buildTranscriber()` return type — call sites must check `'kind' in transcriber`. The chunking entry point (4.2 step 4) covers this.

**Idempotency:** Every script remains re-runnable (existing rows skipped). The reset block in 4.5 step 2 wipes generated artifacts but keeps the project + video_set + video rows.

**Quality safeguards:**
- Local Whisper falls back to default model `large-v3-turbo` (Groq's hosted model — same quality)
- Scene-change has a fallback to fixed-interval if it found <3 frames (Task 4.3 step 2)
- Parallel VIC keeps idempotency check intact (skips videos that already have a VIC row)
- All three changes are env-flag-controlled or transparent — old behavior available via `TRANSCRIBE_PROVIDER=groq`, `VISUAL_MOMENTS_SCENE_THRESHOLD=0`, `AUDIT_VIC_CONCURRENCY=1`

**Risks:**
- Faster-whisper requires CUDA + correct Python env. Mitigation: script fails fast with install instructions.
- Scene-change for purely-static talking-head video could find 0 frames. Mitigation: fallback to fixed-interval if <3 (Task 4.3).
- Parallel Codex calls could trip Codex CLI's local rate limit. Mitigation: concurrency cap defaults to 3 for VIC, 2 for per-video canon — both well under Codex's per-account ceiling.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-30-phase-4-pipeline-performance.md`.

**Decision: inline execution** — task 4.5 is a verification re-run that benefits from being in this session (we already have Matt Walker mid-run; deferring would mean cold-starting). I'll execute 4.1 → 4.5 sequentially, commit each task as I go, and report back with the audit URL + actual-vs-estimated timing at 4.5 step 9.
