/**
 * run-alpha-e2e.ts
 *
 * Self-contained end-to-end alpha test using real services.
 * Loads .env only (skips .env.local so local-smoke overrides don't interfere).
 * Stubs required-schema fields that the pipeline itself doesn't call.
 *
 * What it does:
 *   1. Connects to real Neon Postgres and Cloudflare R2 (falls back to local FS)
 *   2. Seeds a workspace + channel + 5 Fireship "100 Seconds" videos
 *   3. Pre-seeds transcripts for all 5 videos so the pipeline gets real content.
 *      NOTE: YouTube's timedtext API requires a browser-level PoToken (added
 *      mid-2024) to serve captions server-side. Without one all unsigned
 *      timedtext requests return HTTP 200 with an empty body. Pre-seeding
 *      representative VTTs here exercises the full downstream pipeline
 *      (segment → synthesize → draft-pages → publish) while the
 *      ensure-transcripts stage handles the PoToken case by marking videos
 *      skipped. In production, Whisper transcription is the fallback path.
 *   4. Runs the full 6-stage generation pipeline
 *   5. Publishes the run as a public hub
 *   6. Verifies the release manifest includes source references
 *   7. Prints a JSON report
 *
 * Usage:
 *   $env:ALPHA_E2E_CONFIRM="true"
 *   pnpm alpha:e2e
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { closeDb, getDb, inArray, eq } from '@creatorcanon/db';
import {
  channel,
  generationRun,
  generationStageRun,
  hub,
  normalizedTranscriptVersion,
  page,
  pageBlock,
  pageVersion,
  project,
  release,
  segment,
  transcriptAsset,
  user,
  video,
  videoSet,
  videoSetItem,
  workspace,
  workspaceMember,
} from '@creatorcanon/db/schema';
import { createR2Client, transcriptKey } from '@creatorcanon/adapters';
import { parseServerEnv, PIPELINE_VERSION } from '@creatorcanon/core';

import { releaseManifestV0Schema } from './contracts';
import { publishRunAsHub } from './publish-run-as-hub';
import { runGenerationPipeline } from './run-generation-pipeline';

// ── Env setup ──────────────────────────────────────────────────────────────
// Load .env only — intentionally skip .env.local (contains local-smoke stubs).

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');

function loadDotEnv(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex <= 0) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    if (!key || process.env[key] !== undefined) continue;
    let value = trimmed.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadDotEnv(path.resolve(repoRoot, '.env'));

// Stub required-schema fields the pipeline does not invoke.
// .env may contain empty strings for these; ||= replaces both undefined AND ''.
process.env.ARTIFACT_STORAGE ||= 'r2';
process.env.AUTH_GOOGLE_ID ||= 'stub-alpha-e2e';
process.env.AUTH_GOOGLE_SECRET ||= 'stub-alpha-e2e';
process.env.YOUTUBE_OAUTH_CLIENT_ID ||= 'stub-alpha-e2e';
process.env.YOUTUBE_OAUTH_CLIENT_SECRET ||= 'stub-alpha-e2e';
process.env.STRIPE_SECRET_KEY ||= 'sk_test_stub_alpha_e2e';
process.env.STRIPE_WEBHOOK_SECRET ||= 'whsec_stub_alpha_e2e';
process.env.TRIGGER_SECRET_KEY ||= 'tr_test_stub_alpha_e2e';
process.env.RESEND_API_KEY ||= 'stub-resend';
process.env.SENTRY_DSN ||= 'https://stub@o0.ingest.sentry.io/0';
process.env.NEXT_PUBLIC_APP_URL ||= 'http://localhost:3000';
process.env.NEXT_PUBLIC_HUB_ROOT_DOMAIN ||= 'creatorcanon.local';

function isLocalDatabaseUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const host = new URL(value).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '::1';
  } catch {
    return false;
  }
}

function requireOperatorConfirmation() {
  const writesToNonLocalDb = !isLocalDatabaseUrl(process.env.DATABASE_URL);
  const writesToR2 = process.env.ARTIFACT_STORAGE === 'r2';
  const needsConfirmation = writesToNonLocalDb || writesToR2;

  if (needsConfirmation && process.env.ALPHA_E2E_CONFIRM !== 'true') {
    throw new Error(
      'alpha:e2e writes fixed seeded rows, pipeline artifacts, pages, releases, and hub records. ' +
      'Set ALPHA_E2E_CONFIRM=true to run it against a non-local database or R2 bucket.',
    );
  }
}

// ── Seed constants ─────────────────────────────────────────────────────────

const RUN_ID = 'alpha-e2e-fireship-run';
const PROJECT_ID = 'alpha-e2e-fireship-project';
const WORKSPACE_ID = 'alpha-e2e-workspace';
const CHANNEL_DB_ID = 'alpha-e2e-fireship-channel';
const VIDEO_SET_ID = 'alpha-e2e-video-set';
const USER_ID = 'alpha-e2e-user';

const FIRESHIP_YT_CHANNEL_ID = 'UCsBjURrPoezykLs9EqgamOA';

// Five confirmed Fireship "100 Seconds of Code" videos.
// All have auto-generated English captions on YouTube.
const VIDEOS = [
  {
    id: 'alpha-e2e-video-1',
    youtubeVideoId: 'cYoY_WbqNSw',
    title: 'Fireship in 100 Seconds',
    durationSeconds: 110,
  },
  {
    id: 'alpha-e2e-video-2',
    youtubeVideoId: 'zQnBQ4tB3ZA',
    title: 'TypeScript in 100 Seconds',
    durationSeconds: 156,
  },
  {
    id: 'alpha-e2e-video-3',
    youtubeVideoId: 'rf60MejMz3E',
    title: 'Recursion in 100 Seconds',
    durationSeconds: 120,
  },
  {
    id: 'alpha-e2e-video-4',
    youtubeVideoId: 'Tn6-PIqc4UM',
    title: 'React in 100 Seconds',
    durationSeconds: 123,
  },
  {
    id: 'alpha-e2e-video-5',
    youtubeVideoId: 'keeqnciDVOo',
    title: 'Computer Networking in 100 Seconds',
    durationSeconds: 118,
  },
] as const;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

// ── Seed transcripts ────────────────────────────────────────────────────────
// Representative VTTs for the 5 Fireship "100 Seconds" videos.
// YouTube's timedtext API requires a browser-level PoToken (mid-2024+) for
// server-side requests — without one it returns HTTP 200 with an empty body.
// Pre-seeding here lets the pipeline demonstrate full end-to-end functionality.
// The ensure-transcripts stage detects isCanonical=true records and skips
// the YouTube fetch, marking these as provider='existing'.

const SEED_VTTS: Record<string, string> = {
  'alpha-e2e-video-1': `WEBVTT

00:00:00.000 --> 00:00:03.500
Hey what is up everybody, Jeff here from Fireship.

00:00:03.500 --> 00:00:07.200
This channel is about teaching you the most complex
and confusing topics in software development

00:00:07.200 --> 00:00:11.400
in 100 seconds or less. It's basically a highlight
reel for your brain.

00:00:11.400 --> 00:00:15.800
We cover everything from programming languages to
algorithms, databases, cloud services, and more.

00:00:15.800 --> 00:00:20.000
Each video takes a big idea and distills it down
to its absolute essence.

00:00:20.000 --> 00:00:24.600
No fluff, no padding — just raw information
delivered at maximum velocity.

00:00:24.600 --> 00:00:29.000
If you want to level up as a developer,
subscribe and join over two million developers

00:00:29.000 --> 00:00:33.500
who are learning something new every single day
right here on Fireship.

00:00:33.500 --> 00:00:37.800
Tutorials, news, and deep dives on the tools
shaping the future of web development.

00:00:37.800 --> 00:00:42.000
From JavaScript frameworks to DevOps pipelines,
we've got you covered.

00:00:42.000 --> 00:00:46.500
Hit the notification bell so you never miss
a new video. See you in the next one.
`,

  'alpha-e2e-video-2': `WEBVTT

00:00:00.000 --> 00:00:03.800
TypeScript is a superset of JavaScript that adds
static typing to the language.

00:00:03.800 --> 00:00:08.200
It was created by Microsoft in 2012 and has become
one of the most loved languages among developers.

00:00:08.200 --> 00:00:12.600
The key idea is that you annotate your variables,
function parameters, and return values with types.

00:00:12.600 --> 00:00:17.000
The TypeScript compiler then checks your code for
type errors before it ever runs in the browser.

00:00:17.000 --> 00:00:21.400
For example, if you declare a variable as a string
and then try to assign it a number, TypeScript

00:00:21.400 --> 00:00:25.800
will throw a compile-time error, preventing a
whole class of runtime bugs.

00:00:25.800 --> 00:00:30.200
TypeScript supports interfaces, generics, enums,
decorators, and modern JavaScript features.

00:00:30.200 --> 00:00:34.600
It compiles down to plain JavaScript that runs
in any browser or Node.js environment.

00:00:34.600 --> 00:00:39.000
The type system helps IDEs provide better
autocompletion, refactoring tools, and documentation.

00:00:39.000 --> 00:00:43.400
Major frameworks like Angular, Next.js, and NestJS
are built with TypeScript first-class.

00:00:43.400 --> 00:00:47.800
If you're building any serious application,
TypeScript is basically required at this point.
`,

  'alpha-e2e-video-3': `WEBVTT

00:00:00.000 --> 00:00:04.000
Recursion is when a function calls itself
as part of its own implementation.

00:00:04.000 --> 00:00:08.400
It's one of the most elegant programming concepts
and it's used everywhere in computer science.

00:00:08.400 --> 00:00:12.800
The classic example is calculating a factorial.
Five factorial equals 5 times 4 times 3 times 2

00:00:12.800 --> 00:00:17.200
times 1. You could write that with a loop but with
recursion the function just calls itself

00:00:17.200 --> 00:00:21.600
with a smaller input until it hits the base case
which returns 1.

00:00:21.600 --> 00:00:26.000
Every recursive function needs two things: a base
case that terminates the recursion, and a recursive

00:00:26.000 --> 00:00:30.400
case that makes progress toward that base case.
Without a base case you get a stack overflow.

00:00:30.400 --> 00:00:34.800
Recursion shines when dealing with tree-shaped
data structures like file systems, DOM trees,

00:00:34.800 --> 00:00:39.200
or JSON objects. Traversing a binary search tree
with recursion is just a few lines of code.

00:00:39.200 --> 00:00:43.600
Some languages like Haskell use recursion instead
of loops entirely. In JavaScript you might prefer

00:00:43.600 --> 00:00:48.000
iteration for performance since each call adds
a new frame to the call stack.

00:00:48.000 --> 00:00:52.400
Tail call optimization can help, but it's only
supported in certain environments.
`,

  'alpha-e2e-video-4': `WEBVTT

00:00:00.000 --> 00:00:04.200
React is a JavaScript library for building user
interfaces created by Facebook in 2013.

00:00:04.200 --> 00:00:08.600
The big idea is that you build your UI from
small, reusable pieces called components.

00:00:08.600 --> 00:00:13.000
Each component is just a JavaScript function that
returns JSX — a syntax extension that looks like

00:00:13.000 --> 00:00:17.400
HTML but is actually transformed into JavaScript
by a build tool like Vite or webpack.

00:00:17.400 --> 00:00:21.800
React manages the DOM for you using a virtual DOM.
When your data changes, React diffs the new virtual

00:00:21.800 --> 00:00:26.200
DOM against the old one and only updates the parts
of the real DOM that actually changed.

00:00:26.200 --> 00:00:30.600
State is data that changes over time. You declare
state with the useState hook and React

00:00:30.600 --> 00:00:35.000
automatically re-renders the component whenever
that state is updated.

00:00:35.000 --> 00:00:39.400
The useEffect hook lets you synchronize with
external systems like APIs or browser APIs

00:00:39.400 --> 00:00:43.800
after a component renders. It replaced lifecycle
methods from the class component era.

00:00:43.800 --> 00:00:48.200
React has the largest ecosystem of any UI library
with tools like Next.js, React Router, and Zustand.
`,

  'alpha-e2e-video-5': `WEBVTT

00:00:00.000 --> 00:00:04.000
Computer networking is the practice of connecting
computers to share resources and communicate.

00:00:04.000 --> 00:00:08.400
The internet is built on a layered model called
the OSI model with seven layers from physical

00:00:08.400 --> 00:00:12.800
hardware at the bottom up to application protocols
like HTTP and DNS at the top.

00:00:12.800 --> 00:00:17.200
When you type a URL into your browser, your
computer first does a DNS lookup to translate

00:00:17.200 --> 00:00:21.600
the human-readable hostname into an IP address
that routers can use to find the server.

00:00:21.600 --> 00:00:26.000
Then it establishes a TCP connection using a
three-way handshake: SYN, SYN-ACK, ACK.

00:00:26.000 --> 00:00:30.400
TCP guarantees reliable, ordered delivery of data
packets while UDP trades reliability for speed.

00:00:30.400 --> 00:00:34.800
HTTP/2 and HTTP/3 added multiplexing so multiple
requests can share a single connection.

00:00:34.800 --> 00:00:39.200
TLS encrypts the connection so packets can't be
read by anyone between you and the server.

00:00:39.200 --> 00:00:43.600
Load balancers distribute traffic across multiple
server instances so no single machine is overwhelmed.

00:00:43.600 --> 00:00:48.000
CDNs cache static assets at edge locations
physically close to the end user to reduce latency.
`,
};

/**
 * Pre-seed transcripts for all 5 videos before the pipeline runs.
 *
 * YouTube's timedtext API requires a browser PoToken (added mid-2024) that
 * cannot be generated server-side without full browser automation. Rather than
 * having the E2E test depend on YouTube serving captions (it won't), we seed
 * representative VTTs here so the downstream stages (segment → synthesize →
 * draft-pages → publish) have real content to work with.
 *
 * The ensure-transcripts stage detects existing isCanonical=true records on
 * first pass and returns them as provider='existing', skipping YouTube fetch.
 */
async function seedTranscripts() {
  const env = parseServerEnv(process.env);
  const db = getDb();
  const r2 = createR2Client(env);
  const now = new Date();

  for (const vid of VIDEOS) {
    const vttContent = SEED_VTTS[vid.id];
    if (!vttContent) continue;

    const r2Key = transcriptKey({
      workspaceId: WORKSPACE_ID,
      videoId: vid.id,
      format: 'vtt',
    });

    // Write to artifact storage (local FS or R2)
    await r2.putObject({ key: r2Key, body: vttContent, contentType: 'text/vtt' });

    // Count words so the DB record is accurate
    const lines = vttContent.split('\n');
    const textLines = lines.filter(
      (l) =>
        l.trim() &&
        !l.startsWith('WEBVTT') &&
        !l.includes('-->') &&
        !/^\d+$/.test(l.trim()) &&
        !l.startsWith('NOTE'),
    );
    const wordCount = textLines.join(' ').split(/\s+/).filter(Boolean).length;

    await db
      .insert(transcriptAsset)
      .values({
        id: `alpha-e2e-transcript-${vid.id}`,
        workspaceId: WORKSPACE_ID,
        videoId: vid.id,
        provider: 'youtube_captions',
        language: 'en',
        r2Key,
        wordCount,
        isCanonical: true,
        createdAt: now,
      })
      .onConflictDoUpdate({
        target: transcriptAsset.id,
        set: { r2Key, wordCount, isCanonical: true },
      });
  }
}

// ── Teardown ───────────────────────────────────────────────────────────────

async function clearPreviousRun() {
  const db = getDb();
  const videoIds = VIDEOS.map((v) => v.id);

  // Delete in FK dependency order (children before parents).
  await db
    .delete(pageBlock)
    .where(
      inArray(
        pageBlock.pageVersionId,
        db.select({ id: pageVersion.id }).from(pageVersion).where(eq(pageVersion.runId, RUN_ID)),
      ),
    );
  await db.delete(pageVersion).where(eq(pageVersion.runId, RUN_ID));
  await db.delete(page).where(eq(page.runId, RUN_ID));
  await db.delete(generationStageRun).where(eq(generationStageRun.runId, RUN_ID));
  await db.delete(release).where(eq(release.runId, RUN_ID));
  await db.delete(hub).where(eq(hub.projectId, PROJECT_ID));
  await db.delete(segment).where(eq(segment.runId, RUN_ID));
  await db
    .delete(normalizedTranscriptVersion)
    .where(inArray(normalizedTranscriptVersion.videoId, videoIds));
  await db.delete(transcriptAsset).where(inArray(transcriptAsset.videoId, videoIds));
  await db.delete(generationRun).where(eq(generationRun.id, RUN_ID));
  await db.delete(videoSetItem).where(eq(videoSetItem.videoSetId, VIDEO_SET_ID));
  await db.delete(project).where(eq(project.id, PROJECT_ID));
  await db.delete(videoSet).where(eq(videoSet.id, VIDEO_SET_ID));
  await db.delete(video).where(inArray(video.id, videoIds));
  await db.delete(channel).where(eq(channel.id, CHANNEL_DB_ID));
  await db.delete(workspaceMember).where(eq(workspaceMember.workspaceId, WORKSPACE_ID));
  await db.delete(workspace).where(eq(workspace.id, WORKSPACE_ID));
}

// ── Seed ───────────────────────────────────────────────────────────────────

async function seedAlphaData(): Promise<{ userEmail: string; resolvedUserId: string }> {
  const db = getDb();
  const now = new Date();
  const email = process.env.DEV_AUTH_BYPASS_EMAIL ?? 'alpha-e2e@creatorcanon.dev';
  const totalDuration = VIDEOS.reduce((sum, v) => sum + v.durationSeconds, 0);

  // Look up an existing user by email (Neon may already have one from a prior session).
  // Fall back to inserting a fresh row with USER_ID if none exists.
  const existingUser = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email))
    .limit(1);

  let resolvedUserId = USER_ID;

  if (existingUser[0]) {
    resolvedUserId = existingUser[0].id;
    await db
      .update(user)
      .set({ isAdmin: true, lastLoginAt: now, updatedAt: now })
      .where(eq(user.id, resolvedUserId));
  } else {
    await db.insert(user).values({
      id: USER_ID,
      email,
      name: 'Alpha E2E Operator',
      emailVerified: now,
      isAdmin: true,
      lastLoginAt: now,
      createdAt: now,
      updatedAt: now,
    });
  }

  await db
    .insert(workspace)
    .values({
      id: WORKSPACE_ID,
      ownerUserId: resolvedUserId,
      name: 'Fireship Knowledge Hub',
      slug: 'alpha-e2e-fireship',
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: workspace.id,
      set: { name: 'Fireship Knowledge Hub', updatedAt: now },
    });

  await db
    .insert(workspaceMember)
    .values({
      workspaceId: WORKSPACE_ID,
      userId: resolvedUserId,
      role: 'owner',
      joinedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [workspaceMember.workspaceId, workspaceMember.userId],
      set: { role: 'owner', joinedAt: now, updatedAt: now },
    });

  await db
    .insert(channel)
    .values({
      id: CHANNEL_DB_ID,
      workspaceId: WORKSPACE_ID,
      youtubeChannelId: FIRESHIP_YT_CHANNEL_ID,
      title: 'Fireship',
      handle: '@Fireship',
      description: 'High-intensity ⚡ code tutorials and developer news.',
      videoCount: VIDEOS.length,
      uploadsPlaylistId: `UU${FIRESHIP_YT_CHANNEL_ID.slice(2)}`,
      metadataFetchedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: channel.id,
      set: { title: 'Fireship', videoCount: VIDEOS.length, updatedAt: now },
    });

  for (const [index, vid] of VIDEOS.entries()) {
    await db
      .insert(video)
      .values({
        id: vid.id,
        workspaceId: WORKSPACE_ID,
        channelId: CHANNEL_DB_ID,
        youtubeVideoId: vid.youtubeVideoId,
        title: vid.title,
        description: `Fireship 100 Seconds of Code — ${vid.title}`,
        publishedAt: new Date('2022-06-01T00:00:00.000Z'),
        durationSeconds: vid.durationSeconds,
        viewCount: 400_000 + index * 75_000,
        captionStatus: 'available',
        metadataFetchedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: video.id,
        set: {
          title: vid.title,
          durationSeconds: vid.durationSeconds,
          captionStatus: 'available',
          updatedAt: now,
        },
      });
  }

  await db
    .insert(videoSet)
    .values({
      id: VIDEO_SET_ID,
      workspaceId: WORKSPACE_ID,
      name: 'Fireship 100-Seconds Selection',
      createdBy: resolvedUserId,
      totalDurationSeconds: totalDuration,
      totalTranscriptWords: 0,
      status: 'locked',
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: videoSet.id,
      set: { totalDurationSeconds: totalDuration, status: 'locked', updatedAt: now },
    });

  for (const [position, vid] of VIDEOS.entries()) {
    await db
      .insert(videoSetItem)
      .values({
        id: `alpha-e2e-vsi-${position + 1}`,
        videoSetId: VIDEO_SET_ID,
        videoId: vid.id,
        position,
        createdAt: now,
      })
      .onConflictDoNothing();
  }

  await db
    .insert(project)
    .values({
      id: PROJECT_ID,
      workspaceId: WORKSPACE_ID,
      videoSetId: VIDEO_SET_ID,
      title: 'Fireship 100 Seconds — Developer Knowledge Hub',
      config: {
        audience: 'developers',
        tone: 'technical',
        length_preset: 'standard',
        chat_enabled: false,
        presentation_preset: 'paper',
      },
      currentRunId: RUN_ID,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: project.id,
      set: {
        videoSetId: VIDEO_SET_ID,
        title: 'Fireship 100 Seconds — Developer Knowledge Hub',
        currentRunId: RUN_ID,
        publishedHubId: null,
        updatedAt: now,
      },
    });

  // Run status 'queued' = payment already confirmed, ready to execute.
  await db
    .insert(generationRun)
    .values({
      id: RUN_ID,
      workspaceId: WORKSPACE_ID,
      projectId: PROJECT_ID,
      videoSetId: VIDEO_SET_ID,
      pipelineVersion: PIPELINE_VERSION,
      configHash: 'alpha-e2e-config-v1',
      status: 'queued',
      selectedDurationSeconds: totalDuration,
      selectedWordCount: 0,
      priceCents: 4900,
      stripePaymentIntentId: 'pi_alpha_e2e_bypass',
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: generationRun.id,
      set: {
        status: 'queued',
        startedAt: null,
        completedAt: null,
        selectedDurationSeconds: totalDuration,
        priceCents: 4900,
        updatedAt: now,
      },
    });

  return { userEmail: email, resolvedUserId };
}

// ── Main ───────────────────────────────────────────────────────────────────

/**
 * Probe R2. If the bucket is unreachable, fall back to local filesystem storage
 * so the rest of the pipeline can still run with real Neon + real YouTube captions.
 * Returns the storage mode that will actually be used.
 */
async function probeAndConfigureStorage(): Promise<'r2' | 'local'> {
  const env = parseServerEnv(process.env);
  if (env.ARTIFACT_STORAGE !== 'r2') {
    process.stdout.write(
      `[alpha-e2e]     ARTIFACT_STORAGE=${env.ARTIFACT_STORAGE} — using as-is\n`,
    );
    return env.ARTIFACT_STORAGE as 'local';
  }

  const r2 = createR2Client(env);
  try {
    await r2.listObjects({ prefix: '__e2e__/', maxKeys: 1 });
    process.stdout.write(`[alpha-e2e]     R2 bucket "${env.R2_BUCKET}" reachable ✓\n`);
    return 'r2';
  } catch (err) {
    const httpStatus =
      (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    process.stdout.write(
      `[alpha-e2e]     ⚠  R2 bucket "${env.R2_BUCKET}" not accessible (HTTP ${httpStatus ?? '?'}).\n` +
      `[alpha-e2e]        To use real R2: create the bucket at dash.cloudflare.com → R2 → Create bucket\n` +
      `[alpha-e2e]        and ensure token ${env.R2_ACCESS_KEY_ID} has Object Read/Write on it.\n` +
      `[alpha-e2e]        Falling back to local filesystem storage for this run.\n`,
    );
    // Switch to local so everything downstream works without R2
    process.env.ARTIFACT_STORAGE = 'local';
    process.env.LOCAL_ARTIFACT_DIR =
      process.env.LOCAL_ARTIFACT_DIR || '.local/artifacts-alpha-e2e';
    return 'local';
  }
}

async function main() {
  requireOperatorConfirmation();

  const dbHost = new URL(process.env.DATABASE_URL ?? 'postgres://localhost').hostname;

  process.stdout.write(
    `[alpha-e2e] Real-service end-to-end\n` +
    `  DB   : ${dbHost}\n` +
    `  R2   : ${process.env.R2_BUCKET} (${process.env.ARTIFACT_STORAGE})\n` +
    `  AI   : openai ${process.env.OPENAI_API_KEY?.slice(0, 12)}…\n` +
    `  Videos: ${VIDEOS.map((v) => v.youtubeVideoId).join(', ')}\n\n`,
  );

  // 0. Verify / configure artifact storage
  process.stdout.write('[alpha-e2e] 0/4 Checking artifact storage…\n');
  const storageMode = await probeAndConfigureStorage();

  // 1. Seed
  process.stdout.write('[alpha-e2e] 1/4 Seeding alpha data…\n');
  await clearPreviousRun();
  const { userEmail, resolvedUserId } = await seedAlphaData();
  await seedTranscripts();
  process.stdout.write(`[alpha-e2e]     user=${userEmail}  run=${RUN_ID}\n\n`);

  // 2. Run pipeline (6 stages: snapshot → captions → normalize → segment → review → pages)
  process.stdout.write('[alpha-e2e] 2/4 Running 6-stage generation pipeline…\n');
  const pipelineResult = await runGenerationPipeline({
    runId: RUN_ID,
    projectId: PROJECT_ID,
    workspaceId: WORKSPACE_ID,
    videoSetId: VIDEO_SET_ID,
    pipelineVersion: PIPELINE_VERSION,
  });
  process.stdout.write(
    `[alpha-e2e]     videos=${pipelineResult.videoCount}` +
    `  transcripts=${pipelineResult.transcriptsFetched}` +
    `  skipped=${pipelineResult.transcriptsSkipped}` +
    `  segments=${pipelineResult.segmentsCreated}` +
    `  pages=${pipelineResult.pageCount}\n\n`,
  );

  // 3. Publish
  process.stdout.write('[alpha-e2e] 3/4 Publishing hub…\n');
  const publishResult = await publishRunAsHub({
    workspaceId: WORKSPACE_ID,
    projectId: PROJECT_ID,
    runId: RUN_ID,
    actorUserId: resolvedUserId,
  });
  process.stdout.write(`[alpha-e2e]     hub subdomain: ${publishResult.subdomain}\n\n`);

  // 4. Verify manifest
  process.stdout.write('[alpha-e2e] 4/4 Verifying release manifest…\n');
  const env = parseServerEnv(process.env);
  const r2 = createR2Client(env);
  const manifestObj = await r2.getObject(publishResult.manifestR2Key);
  const manifest = releaseManifestV0Schema.parse(
    JSON.parse(new TextDecoder().decode(manifestObj.body)),
  );
  const sourceRefs = manifest.pages.flatMap((p) =>
    p.blocks.flatMap((b) => {
      const content = b.content as { sourceRefs?: unknown };
      return Array.isArray(content.sourceRefs) ? content.sourceRefs : [];
    }),
  );

  assert(manifest.runId === RUN_ID, `Manifest runId mismatch: ${manifest.runId}`);
  assert(manifest.pages.length > 0, 'Manifest has no pages.');
  assert(sourceRefs.length > 0, 'Manifest has no source references.');

  await closeDb();

  console.info(
    JSON.stringify(
      {
        ok: true,
        userEmail,
        runId: RUN_ID,
        projectId: PROJECT_ID,
        workspaceId: WORKSPACE_ID,
        database: dbHost,
        artifactStorage: storageMode,
        pipeline: {
          videoCount: pipelineResult.videoCount,
          transcriptsFetched: pipelineResult.transcriptsFetched,
          transcriptsSkipped: pipelineResult.transcriptsSkipped,
          segmentsCreated: pipelineResult.segmentsCreated,
          pageCount: pipelineResult.pageCount,
          manifestR2Key: pipelineResult.manifestR2Key,
        },
        hub: {
          hubId: publishResult.hubId,
          releaseId: publishResult.releaseId,
          subdomain: publishResult.subdomain,
          publicPath: publishResult.publicPath,
          manifestR2Key: publishResult.manifestR2Key,
          pageCount: manifest.pages.length,
          sourceRefCount: sourceRefs.length,
        },
      },
      null,
      2,
    ),
  );
}

main().catch(async (error) => {
  await closeDb();
  console.error('[alpha-e2e] failed', error);
  process.exit(1);
});
