# Hub Editorial Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the 4 editorial gaps surfaced by the dual-POV audit of release `952cee5d` so the v2 hub crosses from "useful reference companion" to "I'd be proud to publish this": clean Whisper transcription errors out of agent prompts and source-moment excerpts, give manual-uploaded videos human-readable titles in the existing run, give source-moment cards a working destination when YouTube IDs are null, and verify the flagship Build page ships a worked hypothetical example.

**Architecture:** Three surgical fixes (a 30-line transcript sanitizer applied at 4 read sites, a one-shot backfill script for null video titles, and a 1-line workbench-href fallback to the existing internal source route) plus one investigation that ends in either a Strategist-prompt tweak or a documented "ship as-is, source-thin corpus" decision.

**Tech Stack:** TypeScript, Drizzle ORM, Next.js app router, Zod, pnpm workspaces, Node 24's built-in test runner via tsx.

**Branch:** Continue work on `feat/hub-pipeline-workbench-v2` in worktree `C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/.worktrees/hub-pipeline-workbench-v2`.

**Hard constraint:** Do NOT modify `apps/web/src/styles/globals.css`. Do NOT touch files in the main workspace's working tree.

**Audit context (the 4 gaps in plain language):**
1. The string `"Chat2BT"` is a Whisper transcription error for `"ChatGPT"` that bled into `channel_profile.payload.creatorTerminology` and into source-moment excerpts shown on the home page. The Author's Studio prose correctly says `"OpenAI"` (the strategist swapped it), but agent-input segments and user-visible quotes still show the broken word.
2. The two manual-uploaded videos in run `97e8772c` have `title: null` in DB. They were uploaded before `apps/web/src/app/api/upload/init/route.ts:114` started defaulting the title from filename. The renderer falls back to `"Source N"` ordinals, but the underlying citation rows still carry `videoTitle: 'Untitled'`.
3. Source-moment cards on the home set `href: null` when `youtubeId` is null (manual uploads), so the card renders as a plain `<div>` with no destination. There's an existing internal route `apps/web/src/app/h/[hubSlug]/sources/[videoId]/page.tsx` that we can deep-link to with `?t=<seconds>`.
4. 6 of 8 pages have a `hypothetical_example` block. The 2 that don't are `JSON Format for Make.com AI Outputs` (LEARN-type, expected to skip per design.md §5) and `Business Proposal Generator` (the flagship Build page — surprising, worth investigating).

**Existing fixtures the plan reuses:**
- Run id: `97e8772c-07e3-4408-ba40-0a17450f33cf`
- Workspace id: `e1ad6446-d463-4ee9-9451-7be5ac76f187`
- Hub id: `4f83bf07-2574-483b-a17e-882190d34339`
- Subdomain: `ai-ultimate-knowledge-hub`
- Two manual-upload videos: `mu_9d970d091c38`, `mu_e0787f2f4a95`
- Latest release before this work: `952cee5d-8b32-443e-8797-d9f81d116a87`
- Last commit on the branch before this plan: `32ac6e5` (workbench outcome-gate fix from the audit)

---

## File map

| File | Status | Responsibility |
|---|---|---|
| `packages/pipeline/src/transcript/sanitize.ts` | create | Pure helper: apply substitution map to a string. Default map covers the known Whisper errors we've actually observed. |
| `packages/pipeline/src/transcript/test/sanitize.test.ts` | create | Unit tests (Node test runner via tsx) |
| `packages/pipeline/src/stages/preload-context.ts` | modify | Sanitize segment text before passing it to channel_profile / video_intelligence preload |
| `packages/pipeline/src/stages/page-composition.ts` | modify | Sanitize segment excerpts before they reach the prose specialist's user message |
| `packages/pipeline/src/stages/visual-context.ts` | modify | Sanitize segment text used as visual_frame_analyst prompt input |
| `packages/pipeline/src/adapters/editorial-atlas/project-citations.ts` | modify | Sanitize the citation excerpt that lands in the published manifest (renderer reads from there) |
| `packages/pipeline/src/scripts/backfill-manual-upload-titles.ts` | create | One-shot script: for every video with `title IS NULL AND source_kind = 'manual_upload'`, derive a title from `local_r2_key`'s filename or first segment text |
| `apps/web/src/lib/hub/workbench.ts` | modify | When `safeCitationHref` returns null but the citation has a `sourceVideoId`, return an internal `/h/<slug>/sources/<videoId>?t=<seconds>` URL so the source-moment card has a destination |
| `apps/web/src/lib/hub/test/workbench-source-moment-href.test.ts` | create | Unit test for the fallback href |
| `packages/pipeline/src/scripts/diagnose-hypothetical-example.ts` | create | Read agent transcripts from R2 for the BPG page run; report whether the Strategist requested `hypothetical_example` and whether the Specialist returned a valid one |

---

## Phase A — Transcript sanitization

### Task 1: `sanitizeTranscriptText` helper + tests

**Files:**
- Create: `packages/pipeline/src/transcript/sanitize.ts`
- Create: `packages/pipeline/src/transcript/test/sanitize.test.ts`

The helper is a pure function. We keep `segment.text` raw in the database (Whisper output is the source of truth), and apply substitutions only at read paths: agent prompt builders + the citation-projection layer that lands in the published manifest.

The default substitution map covers the actually-observed Whisper errors for this corpus. It uses word-boundary regex so `"Chat2BT"` is replaced but `"chat-bot"` etc. are not.

- [ ] **Step 1: Write the failing tests**

Create `packages/pipeline/src/transcript/test/sanitize.test.ts`:

```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeTranscriptText, DEFAULT_SUBSTITUTIONS } from '../sanitize';

describe('sanitizeTranscriptText', () => {
  it('replaces Chat2BT with ChatGPT', () => {
    const result = sanitizeTranscriptText('We send the data to Chat2BT and parse the response.', DEFAULT_SUBSTITUTIONS);
    assert.equal(result, 'We send the data to ChatGPT and parse the response.');
  });

  it('replaces multiple occurrences in a single pass', () => {
    const result = sanitizeTranscriptText('Chat2BT first, then Chat2BT again.', DEFAULT_SUBSTITUTIONS);
    assert.equal(result, 'ChatGPT first, then ChatGPT again.');
  });

  it('is case sensitive on the canonical brand to avoid false positives', () => {
    // The Whisper error is exactly "Chat2BT" (with that capitalization).
    // We DO NOT replace lowercased "chat2bt" the same way — at this point
    // it's not the same artifact and we want explicit visibility.
    const result = sanitizeTranscriptText('chat2bt is different', DEFAULT_SUBSTITUTIONS);
    assert.equal(result, 'chat2bt is different');
  });

  it('does not match inside other words', () => {
    const result = sanitizeTranscriptText('preChat2BTpost', DEFAULT_SUBSTITUTIONS);
    // \b boundaries — "Chat2BT" embedded in a longer identifier is NOT replaced
    assert.equal(result, 'preChat2BTpost');
  });

  it('returns the input unchanged when the map is empty', () => {
    const result = sanitizeTranscriptText('Anything goes here', {});
    assert.equal(result, 'Anything goes here');
  });

  it('handles empty input', () => {
    const result = sanitizeTranscriptText('', DEFAULT_SUBSTITUTIONS);
    assert.equal(result, '');
  });

  it('preserves surrounding punctuation', () => {
    const result = sanitizeTranscriptText('"Chat2BT," she said.', DEFAULT_SUBSTITUTIONS);
    assert.equal(result, '"ChatGPT," she said.');
  });

  it('accepts a custom substitution map', () => {
    const result = sanitizeTranscriptText('Make . com is the tool', { 'Make \\. com': 'Make.com' });
    assert.equal(result, 'Make.com is the tool');
  });
});
```

- [ ] **Step 2: Run the tests, verify they fail**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/.worktrees/hub-pipeline-workbench-v2/packages/pipeline" && NODE_ENV=test node --import ../../node_modules/.pnpm/tsx@4.19.1/node_modules/tsx/dist/loader.mjs --test src/transcript/test/sanitize.test.ts 2>&1 | tail -10
```

Expected: FAIL with `Cannot find module '../sanitize'`.

- [ ] **Step 3: Implement the helper**

Create `packages/pipeline/src/transcript/sanitize.ts`:

```typescript
/**
 * Apply a fixed map of {pattern: replacement} substitutions to a string.
 * Patterns are interpreted as regex sources with implicit `\b` boundaries
 * and the global flag. The default map covers Whisper transcription errors
 * we've observed in real corpora.
 *
 * Why a sanitizer at all: Whisper occasionally hallucinates phonetic
 * approximations ("Chat2BT" for "ChatGPT") that get lifted into the
 * channel's `creatorTerminology` and into source-moment excerpts. We keep
 * `segment.text` raw in the DB (one source of truth for the transcript)
 * and clean only at read paths: agent prompt builders + manifest projection.
 *
 * Add new entries here only when you've actually observed the error in
 * production transcripts. Do NOT pre-emptively add "common Whisper errors
 * from a blog post" — false positives cost more than the occasional miss.
 */
export const DEFAULT_SUBSTITUTIONS: Record<string, string> = {
  // Whisper consistently hears "ChatGPT" as "Chat2BT" on certain accents.
  'Chat2BT': 'ChatGPT',
};

export function sanitizeTranscriptText(text: string, substitutions: Record<string, string>): string {
  if (!text) return text;
  let out = text;
  for (const [pattern, replacement] of Object.entries(substitutions)) {
    // \b boundaries prevent embedding-in-other-words false positives.
    // Each iteration mutates `out`, so chained substitutions compose.
    const re = new RegExp(`\\b${pattern}\\b`, 'g');
    out = out.replace(re, replacement);
  }
  return out;
}
```

- [ ] **Step 4: Run the tests, verify they pass**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/.worktrees/hub-pipeline-workbench-v2/packages/pipeline" && NODE_ENV=test node --import ../../node_modules/.pnpm/tsx@4.19.1/node_modules/tsx/dist/loader.mjs --test src/transcript/test/sanitize.test.ts 2>&1 | tail -10
```

Expected: 8/8 PASS.

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/.worktrees/hub-pipeline-workbench-v2"
git add packages/pipeline/src/transcript/sanitize.ts packages/pipeline/src/transcript/test/sanitize.test.ts
git commit -m "feat(transcript): sanitizeTranscriptText helper for Whisper transcription errors"
```

---

### Task 2: Apply sanitization at all 4 read sites

**Files:**
- Modify: `packages/pipeline/src/stages/preload-context.ts:50` (channel_profile / video_intelligence preload)
- Modify: `packages/pipeline/src/stages/page-composition.ts:141` (Author's Studio segment excerpts)
- Modify: `packages/pipeline/src/stages/visual-context.ts:97` (visual_frame_analyst input)
- Modify: `packages/pipeline/src/adapters/editorial-atlas/project-citations.ts` (citation excerpt → manifest)

The existing read sites all do `segment.text` directly. We import `sanitizeTranscriptText` + `DEFAULT_SUBSTITUTIONS` and wrap the field at projection time. None of these touch DB writes — `segment.text` stays raw.

- [ ] **Step 1: Modify `preload-context.ts`**

Find the existing line that reads segment text into the preload context. The current shape is:

```typescript
      text: segment.text,
```

Replace with:

```typescript
      text: sanitizeTranscriptText(segment.text, DEFAULT_SUBSTITUTIONS),
```

Add the import at the top of the file:

```typescript
import { sanitizeTranscriptText, DEFAULT_SUBSTITUTIONS } from '../transcript/sanitize';
```

- [ ] **Step 2: Modify `page-composition.ts`**

Around line 141 the current shape is:

```typescript
const segs = segIds.size
  ? await db.select({ id: segment.id, videoId: segment.videoId, text: segment.text, startMs: segment.startMs, endMs: segment.endMs }).from(segment).where(and(eq(segment.runId, input.runId), inArray(segment.id, [...segIds])))
  : [];
```

We don't change the SQL — we sanitize when constructing `segmentExcerpts` later in the same file. Find the existing block (within the `for (const brief of briefs)` loop):

```typescript
    const segmentExcerpts = segs
      .filter((s) => allArtifactNodes.some((n) => (n.evidenceSegmentIds as string[]).includes(s.id)))
      .map((s) => ({ segmentId: s.id, videoId: s.videoId, text: s.text, startMs: s.startMs, endMs: s.endMs }));
```

Replace with:

```typescript
    const segmentExcerpts = segs
      .filter((s) => allArtifactNodes.some((n) => (n.evidenceSegmentIds as string[]).includes(s.id)))
      .map((s) => ({ segmentId: s.id, videoId: s.videoId, text: sanitizeTranscriptText(s.text, DEFAULT_SUBSTITUTIONS), startMs: s.startMs, endMs: s.endMs }));
```

Add the import at the top:

```typescript
import { sanitizeTranscriptText, DEFAULT_SUBSTITUTIONS } from '../transcript/sanitize';
```

- [ ] **Step 3: Modify `visual-context.ts`**

Around line 97 the current shape is:

```typescript
          text: segment.text,
```

Replace with:

```typescript
          text: sanitizeTranscriptText(segment.text, DEFAULT_SUBSTITUTIONS),
```

Add the import at the top:

```typescript
import { sanitizeTranscriptText, DEFAULT_SUBSTITUTIONS } from '../transcript/sanitize';
```

- [ ] **Step 4: Modify `project-citations.ts`**

Find where the citation excerpt is built. The current line ~61 has:

```typescript
        videoTitle: video.title ?? 'Untitled',
```

Above it (look for the line that builds `excerpt: ...`), the shape is something like `excerpt: segment.text.slice(0, ...)`. Wrap that field with the sanitizer. If you can't find an explicit `excerpt: segment.text...` line, search for `excerpt:` near the citation construction and apply the sanitizer there.

The change shape (find the line that puts segment text into the citation excerpt and wrap it):

```typescript
        // before
        excerpt: segment.text.slice(0, EXCERPT_LIMIT),
        // after
        excerpt: sanitizeTranscriptText(segment.text, DEFAULT_SUBSTITUTIONS).slice(0, EXCERPT_LIMIT),
```

If the existing code already extracts excerpt into a local variable, sanitize the variable instead. Match the existing shape.

Add the import at the top:

```typescript
import { sanitizeTranscriptText, DEFAULT_SUBSTITUTIONS } from '../../transcript/sanitize';
```

- [ ] **Step 5: Typecheck**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/.worktrees/hub-pipeline-workbench-v2/packages/pipeline" && pnpm typecheck 2>&1 | tail -5
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/.worktrees/hub-pipeline-workbench-v2"
git add packages/pipeline/src/stages/preload-context.ts packages/pipeline/src/stages/page-composition.ts packages/pipeline/src/stages/visual-context.ts packages/pipeline/src/adapters/editorial-atlas/project-citations.ts
git commit -m "feat(transcript): sanitize segment text at agent + citation read sites"
```

---

## Phase B — Manual-upload title backfill

### Task 3: Backfill script for null video titles

**Files:**
- Create: `packages/pipeline/src/scripts/backfill-manual-upload-titles.ts`

This is a one-shot script that runs once against the existing DB to fill in the two `title IS NULL` rows for `mu_9d970d091c38` and `mu_e0787f2f4a95` (and any others that match). New uploads already get `filenameToTitle(filename)` from `apps/web/src/app/api/upload/init/route.ts:114`, so there's no ongoing prevention needed — only the backfill.

Title-derivation rule, in order of preference:
1. Strip the directory prefix and extension from `local_r2_key` (e.g. `workspaces/.../uploads/mu_xxx/source.mp4` → there is no human filename here, fall through).
2. Use the first ~80 chars of the first segment's text (the speaker's opening line, sanitized) as a working title.
3. Last resort: `"Manual upload <yyyy-mm-dd>"` based on `created_at`.

For our existing 2 videos, paths 1 returns no useful info (filenames are just `source.mp4`), so path 2 will be used. The first segment's text begins with the creator's opening hook — that's a usable title.

- [ ] **Step 1: Create the backfill script**

Create `packages/pipeline/src/scripts/backfill-manual-upload-titles.ts`:

```typescript
/**
 * One-shot script to give every manual-upload video with a NULL title a
 * human-readable title. New uploads already get a title from filename via
 * apps/web/src/app/api/upload/init/route.ts; this fills in pre-fix rows.
 *
 * Usage (from packages/pipeline):
 *   tsx ./src/scripts/backfill-manual-upload-titles.ts            # dry-run
 *   tsx ./src/scripts/backfill-manual-upload-titles.ts --apply    # write changes
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { and, asc, eq, getDb, isNull } from '@creatorcanon/db';
import { segment, video } from '@creatorcanon/db/schema';
import { sanitizeTranscriptText, DEFAULT_SUBSTITUTIONS } from '../transcript/sanitize';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnv(p: string) {
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    const k = t.slice(0, i).trim();
    if (process.env[k] !== undefined) continue;
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[k] = v;
  }
}
loadEnv(path.resolve(__dirname, '../../../../.env'));

const APPLY = process.argv.includes('--apply');
const TITLE_MAX_CHARS = 80;

async function main() {
  const db = getDb();

  // 1. Find all manual_upload videos with NULL title.
  const targets = await db
    .select({ id: video.id, localR2Key: video.localR2Key, createdAt: video.createdAt })
    .from(video)
    .where(and(eq(video.sourceKind, 'manual_upload'), isNull(video.title)));

  if (targets.length === 0) {
    console.info('[backfill] No manual-upload videos with null title. Done.');
    return;
  }

  console.info(`[backfill] Found ${targets.length} manual-upload video(s) with null title.`);

  for (const v of targets) {
    // 2. Fetch the first segment by startMs to derive a title from the speaker's opener.
    const firstSeg = await db
      .select({ text: segment.text })
      .from(segment)
      .where(eq(segment.videoId, v.id))
      .orderBy(asc(segment.startMs))
      .limit(1);

    let derived: string;
    if (firstSeg[0]?.text) {
      const cleaned = sanitizeTranscriptText(firstSeg[0].text, DEFAULT_SUBSTITUTIONS).trim();
      // Take the first sentence, or the first TITLE_MAX_CHARS chars, whichever is shorter.
      const firstSentence = cleaned.split(/[.!?]\s/, 1)[0] ?? cleaned;
      derived = firstSentence.slice(0, TITLE_MAX_CHARS).trim();
      if (derived.length === TITLE_MAX_CHARS) derived = derived.replace(/\s+\S*$/, '') + '…';
    } else {
      const day = (v.createdAt as Date | null)?.toISOString().slice(0, 10) ?? 'unknown-date';
      derived = `Manual upload ${day}`;
    }

    if (!APPLY) {
      console.info(`  [dry-run] ${v.id} → ${JSON.stringify(derived)}`);
      continue;
    }

    await db.update(video).set({ title: derived }).where(eq(video.id, v.id));
    console.info(`  [applied] ${v.id} → ${JSON.stringify(derived)}`);
  }

  if (!APPLY) {
    console.info('[backfill] DRY RUN. Re-run with --apply to write changes.');
  } else {
    console.info('[backfill] Done.');
  }
}

main().catch((err) => {
  console.error('[backfill] failed:', err);
  process.exit(1);
});
```

- [ ] **Step 2: Dry-run the backfill**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/.worktrees/hub-pipeline-workbench-v2/packages/pipeline" && ./node_modules/.bin/tsx ./src/scripts/backfill-manual-upload-titles.ts 2>&1 | tail -10
```

Expected output: 2 dry-run lines, one per video, each with a derived title. Sanity-check that the titles look like plausible video subjects (e.g. *"This is one of the most important automations you can have for your business"*). They will be long-ish; that's fine — `TITLE_MAX_CHARS` caps them.

If a derived title looks bad (empty, garbage, just punctuation) — STOP and report. We need a different derivation rule.

- [ ] **Step 3: Apply the backfill**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/.worktrees/hub-pipeline-workbench-v2/packages/pipeline" && ./node_modules/.bin/tsx ./src/scripts/backfill-manual-upload-titles.ts --apply 2>&1 | tail -10
```

Expected: 2 `[applied]` lines and `[backfill] Done.`

- [ ] **Step 4: Verify in DB**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/.worktrees/hub-pipeline-workbench-v2/packages/db" && node -e "
const fs=require('node:fs');for(const f of['../../../../.env']){try{for(const l of fs.readFileSync(f,'utf8').split(/\r?\n/)){const t=l.trim();if(!t||t.startsWith('#'))continue;const i=t.indexOf('=');if(i<=0)continue;const k=t.slice(0,i).trim();if(process.env[k]!==undefined)continue;let v=t.slice(i+1).trim();if((v.startsWith('\"')&&v.endsWith('\"'))||(v.startsWith(\"'\")&&v.endsWith(\"'\")))v=v.slice(1,-1);process.env[k]=v;}}catch{}}
require('postgres')(process.env.DATABASE_URL,{idle_timeout:5,max:1})\`SELECT id, title FROM video WHERE id IN ('mu_9d970d091c38','mu_e0787f2f4a95')\`.then(r=>{for(const row of r)console.log(row);process.exit(0)});
" 2>&1 | tail -8
```

Expected: both rows now have non-null `title` strings.

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/.worktrees/hub-pipeline-workbench-v2"
git add packages/pipeline/src/scripts/backfill-manual-upload-titles.ts
git commit -m "feat(scripts): backfill null titles on manual-upload videos"
```

---

## Phase C — Source-moment fallback link

### Task 4: Internal source link when YouTube ID is null

**Files:**
- Modify: `apps/web/src/lib/hub/workbench.ts:369` (the source-moment href for the home & start pages)
- Modify: `apps/web/src/lib/hub/workbench.ts:284` (the source-moment href when projecting from a citation directly)
- Create: `apps/web/src/lib/hub/test/workbench-source-moment-href.test.ts`

The renderer's `WorkbenchCards.tsx:SourceMomentCard` already conditionally renders an `<a>` when `moment.href` is set, falling back to a non-clickable `<div>` when it's null. We just need to give `safeCitationHref` a fallback path.

Existing route: `/h/[hubSlug]/sources/[videoId]/page.tsx` (verified to exist). It already accepts a `videoId` URL segment. We pass timestamp via `?t=<seconds>` query param. The page may or may not already read that param — that's outside this fix; the link being non-broken is the user-visible win even if the page doesn't auto-scroll yet.

- [ ] **Step 1: Read the existing safeCitationHref usage in workbench.ts**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/.worktrees/hub-pipeline-workbench-v2" && sed -n '260,295p' apps/web/src/lib/hub/workbench.ts
sed -n '360,380p' apps/web/src/lib/hub/workbench.ts
```

Expected: two existing call sites that look like:

```typescript
href: safeCitationHref(citation, safeSource),
// ...later...
href: safeCitationHref({ timestampStart: moment.timestampStart }, source ?? { youtubeId: null }),
```

- [ ] **Step 2: Write the failing test**

Create `apps/web/src/lib/hub/test/workbench-source-moment-href.test.ts`:

```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveSourceMomentHref } from '../workbench';

describe('resolveSourceMomentHref', () => {
  it('returns YouTube URL when youtubeId is present', () => {
    const result = resolveSourceMomentHref({
      hubSlug: 'demo',
      sourceVideoId: 'vid_abc',
      timestampStart: 90,
      source: { youtubeId: 'YT123', url: undefined },
    });
    assert.equal(result, 'https://www.youtube.com/watch?v=YT123&t=90s');
  });

  it('returns the citation.url when present and valid', () => {
    const result = resolveSourceMomentHref({
      hubSlug: 'demo',
      sourceVideoId: 'vid_abc',
      timestampStart: 90,
      source: { youtubeId: null, url: 'https://example.com/watch' },
    });
    assert.equal(result, 'https://example.com/watch');
  });

  it('falls back to the internal source route when youtubeId is null', () => {
    const result = resolveSourceMomentHref({
      hubSlug: 'ai-ultimate-knowledge-hub',
      sourceVideoId: 'mu_9d970d091c38',
      timestampStart: 327,
      source: { youtubeId: null, url: undefined },
    });
    assert.equal(result, '/h/ai-ultimate-knowledge-hub/sources/mu_9d970d091c38?t=327');
  });

  it('floors fractional timestamps in the fallback', () => {
    const result = resolveSourceMomentHref({
      hubSlug: 'demo',
      sourceVideoId: 'vid_abc',
      timestampStart: 327.9,
      source: { youtubeId: null, url: undefined },
    });
    assert.equal(result, '/h/demo/sources/vid_abc?t=327');
  });

  it('returns null when no sourceVideoId is available', () => {
    // This is the only case where the source-moment card should render
    // as a non-clickable div: we genuinely have no destination.
    const result = resolveSourceMomentHref({
      hubSlug: 'demo',
      sourceVideoId: null,
      timestampStart: 0,
      source: { youtubeId: null, url: undefined },
    });
    assert.equal(result, null);
  });
});
```

- [ ] **Step 3: Run the test, verify it fails**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/.worktrees/hub-pipeline-workbench-v2/apps/web" && NODE_ENV=test node --import ../../node_modules/.pnpm/tsx@4.19.1/node_modules/tsx/dist/loader.mjs --test src/lib/hub/test/workbench-source-moment-href.test.ts 2>&1 | tail -10
```

Expected: FAIL with `resolveSourceMomentHref is not exported` (or similar).

- [ ] **Step 4: Add the helper to `workbench.ts`**

In `apps/web/src/lib/hub/workbench.ts`, near the top of the file (after the existing imports), add:

```typescript
import { citationUrl } from './manifest/empty-state';

export function resolveSourceMomentHref(input: {
  hubSlug: string;
  sourceVideoId: string | null;
  timestampStart: number;
  source: { youtubeId: string | null; url?: string | null };
}): string | null {
  const { hubSlug, sourceVideoId, timestampStart, source } = input;
  // 1. Citation has an explicit URL — use it (matching safeCitationHref).
  if (source.url && !source.url.includes('watch?v=null')) {
    try {
      const parsed = new URL(source.url);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return source.url;
    } catch {
      // Fall through.
    }
  }
  // 2. YouTube — synthesize the watch URL with timestamp anchor.
  if (source.youtubeId && source.youtubeId !== 'null') {
    return citationUrl({ url: undefined, timestampStart }, { youtubeId: source.youtubeId });
  }
  // 3. Manual upload (no youtubeId) — point at the internal source route.
  if (sourceVideoId) {
    return `/h/${hubSlug}/sources/${sourceVideoId}?t=${Math.floor(timestampStart)}`;
  }
  // 4. Genuinely no destination — let the card render as a non-clickable div.
  return null;
}
```

- [ ] **Step 5: Run the tests, verify they pass**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/.worktrees/hub-pipeline-workbench-v2/apps/web" && NODE_ENV=test node --import ../../node_modules/.pnpm/tsx@4.19.1/node_modules/tsx/dist/loader.mjs --test src/lib/hub/test/workbench-source-moment-href.test.ts 2>&1 | tail -10
```

Expected: 5/5 PASS.

- [ ] **Step 6: Replace the two existing `safeCitationHref` call sites**

In `apps/web/src/lib/hub/workbench.ts`, find the source-moment construction blocks. The 2 call sites (with their surrounding context) currently produce a `WorkbenchSourceMoment`. We replace `href: safeCitationHref(...)` with `href: resolveSourceMomentHref(...)`.

For the first call site (around line 284), the existing block looks like:

```typescript
function sourceMomentFromCitation(
  // ...
): WorkbenchSourceMoment {
  // ...
  return {
    id: ...,
    sourceTitle: safeSourceTitle(safeSource.title, ordinal),
    timestampStart: citation.timestampStart,
    timestampLabel: formatTimestampLabel(citation.timestampStart),
    excerpt: citation.excerpt,
    href: safeCitationHref(citation, safeSource),
  };
}
```

The function needs the hub slug to construct an internal URL. Look at the function's caller (search for `sourceMomentFromCitation(` in the file) — the caller already knows the manifest, which has `hubSlug`. Pass `hubSlug` as a parameter through.

The simplest non-disruptive shape: extend the function signature to take `hubSlug` and `sourceVideoId`:

```typescript
function sourceMomentFromCitation(
  hubSlug: string,
  citation: Citation,
  safeSource: SourceVideo,
  ordinal: number,
): WorkbenchSourceMoment {
  // ...existing fields...
  return {
    id: ...,
    sourceTitle: safeSourceTitle(safeSource.title, ordinal),
    timestampStart: citation.timestampStart,
    timestampLabel: formatTimestampLabel(citation.timestampStart),
    excerpt: citation.excerpt,
    href: resolveSourceMomentHref({
      hubSlug,
      sourceVideoId: citation.sourceVideoId,
      timestampStart: citation.timestampStart,
      source: { youtubeId: safeSource.youtubeId, url: citation.url },
    }),
  };
}
```

Update every caller of `sourceMomentFromCitation(` to pass `manifest.hubSlug` as the first argument.

For the second call site (around line 369), the existing block looks like:

```typescript
href: safeCitationHref({ timestampStart: moment.timestampStart }, source ?? { youtubeId: null }),
```

Replace with:

```typescript
href: resolveSourceMomentHref({
  hubSlug: manifest.hubSlug,
  sourceVideoId: moment.sourceVideoId ?? null,
  timestampStart: moment.timestampStart,
  source: { youtubeId: source?.youtubeId ?? null, url: undefined },
}),
```

If the surrounding scope doesn't already have `manifest` in lexical scope, walk up to the function signature and add `manifest: EditorialAtlasManifest` as a parameter. Update all callers.

- [ ] **Step 7: Typecheck**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/.worktrees/hub-pipeline-workbench-v2/apps/web" && pnpm typecheck 2>&1 | tail -5
```

Expected: clean.

- [ ] **Step 8: Verify in browser (if dev server is running)**

```bash
curl -sS "http://localhost:3003/h/ai-ultimate-knowledge-hub" --max-time 30 | grep -oE 'href="/h/[^"]+/sources/[^"]+"' | head -3
```

Expected: at least one match showing an internal sources href (proving the fallback fired for the manual-upload videos). If output is empty, the dev server may need a hot-reload restart.

- [ ] **Step 9: Commit**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/.worktrees/hub-pipeline-workbench-v2"
git add apps/web/src/lib/hub/workbench.ts apps/web/src/lib/hub/test/workbench-source-moment-href.test.ts
git commit -m "feat(hub): source-moment cards link to internal source route when youtubeId is null"
```

---

## Phase D — Hypothetical-example diagnosis

### Task 5: Diagnose missing hypothetical_example on the BPG flagship page

**Files:**
- Create: `packages/pipeline/src/scripts/diagnose-hypothetical-example.ts`
- Possibly modify: `packages/pipeline/src/agents/specialists/prompts.ts` (PAGE_STRATEGIST_PROMPT, only if diagnosis points there)

The Strategist plans which artifact kinds each page ships. The BPG (`pg-7d517d808e`) has 8 blocks but no `hypothetical_example`. We need to determine:
- (a) Did the Strategist's `PagePlan.artifacts` for BPG include `hypothetical_example`?
- (b) If yes, did the Specialist actually run? (Look for the example_author transcript on R2.)
- (c) If yes, did it return a valid artifact, or did Zod reject it / did the Critic suppress it?

Each agent's transcript is persisted at `workspaces/<ws>/runs/<run>/agents/<agent>/transcript.json`. The agent name + run ID + workspace ID give us the path.

- [ ] **Step 1: Create the diagnostic script**

Create `packages/pipeline/src/scripts/diagnose-hypothetical-example.ts`:

```typescript
/**
 * Read R2-persisted agent transcripts for a single page run and report
 * whether the Strategist requested a hypothetical_example artifact and
 * whether the example_author specialist actually returned one.
 *
 * Usage:
 *   tsx ./src/scripts/diagnose-hypothetical-example.ts <runId> <briefId>
 *
 * Example:
 *   tsx ./src/scripts/diagnose-hypothetical-example.ts 97e8772c-07e3-4408-ba40-0a17450f33cf pb_8736c3db98594fbe
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { eq, getDb } from '@creatorcanon/db';
import { generationRun, page, pageBrief, pageVersion } from '@creatorcanon/db/schema';
import { createR2Client } from '@creatorcanon/adapters';
import { parseServerEnv } from '@creatorcanon/core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function loadEnv(p: string) {
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    const k = t.slice(0, i).trim();
    if (process.env[k] !== undefined) continue;
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[k] = v;
  }
}
loadEnv(path.resolve(__dirname, '../../../../.env'));

const runId = process.argv[2];
const briefId = process.argv[3];
if (!runId || !briefId) {
  console.error('Usage: tsx ./src/scripts/diagnose-hypothetical-example.ts <runId> <briefId>');
  process.exit(1);
}

async function readTranscript(r2: ReturnType<typeof createR2Client>, key: string): Promise<Array<{ role: string; content: string }> | null> {
  try {
    const obj = await r2.getObject(key);
    return JSON.parse(new TextDecoder().decode(obj.body));
  } catch {
    return null;
  }
}

async function main() {
  const db = getDb();
  const env = parseServerEnv(process.env);
  const r2 = createR2Client(env);

  const runRows = await db
    .select({ workspaceId: generationRun.workspaceId })
    .from(generationRun)
    .where(eq(generationRun.id, runId))
    .limit(1);
  const workspaceId = runRows[0]?.workspaceId;
  if (!workspaceId) {
    console.error(`run ${runId} not found`);
    process.exit(2);
  }

  const briefRow = await db
    .select()
    .from(pageBrief)
    .where(eq(pageBrief.id, briefId))
    .limit(1);
  const brief = briefRow[0];
  if (!brief) {
    console.error(`brief ${briefId} not found`);
    process.exit(2);
  }
  const briefPayload = brief.payload as { pageTitle?: string; pageType?: string };
  console.info(`page=${briefPayload.pageTitle} (${briefPayload.pageType})`);

  // 1. Check Strategist transcript for the page plan
  const stratKey = `workspaces/${workspaceId}/runs/${runId}/agents/page_strategist/transcript.json`;
  const strat = await readTranscript(r2, stratKey);
  if (!strat) {
    console.info(`  page_strategist: NO transcript at ${stratKey}`);
  } else {
    const lastAssistant = [...strat].reverse().find((t) => t.role === 'assistant' && t.content?.trim().length > 0);
    if (!lastAssistant) {
      console.info('  page_strategist: empty transcript');
    } else {
      try {
        const trimmed = lastAssistant.content.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
        const plan = JSON.parse(trimmed) as { artifacts?: Array<{ kind: string }> };
        const kinds = (plan.artifacts ?? []).map((a) => a.kind);
        const hasHE = kinds.includes('hypothetical_example');
        console.info(`  page_strategist: artifacts=${JSON.stringify(kinds)} ${hasHE ? '(✓ requested HE)' : '(✗ HE NOT requested)'}`);
      } catch (err) {
        console.info('  page_strategist: could not parse plan JSON:', (err as Error).message);
      }
    }
  }

  // 2. Check example_author transcript
  const exKey = `workspaces/${workspaceId}/runs/${runId}/agents/example_author/transcript.json`;
  const ex = await readTranscript(r2, exKey);
  if (!ex) {
    console.info(`  example_author: NO transcript at ${exKey} (specialist did not run)`);
  } else {
    const lastAssistant = [...ex].reverse().find((t) => t.role === 'assistant' && t.content?.trim().length > 0);
    if (!lastAssistant) {
      console.info('  example_author: empty transcript');
    } else {
      const preview = lastAssistant.content.trim().slice(0, 240);
      console.info(`  example_author: returned content (first 240 chars): ${preview}`);
    }
  }

  // 3. Check the persisted page_version blocks for HE
  const pages = await db
    .select({ id: page.id })
    .from(page)
    .where(eq(page.runId, runId));
  for (const p of pages) {
    const pv = await db.select({ tree: pageVersion.blockTreeJson }).from(pageVersion).where(eq(pageVersion.pageId, p.id)).limit(1);
    const tree = pv[0]?.tree as { blocks?: Array<{ type: string }> };
    const hasHE = (tree?.blocks ?? []).some((b) => b.type === 'hypothetical_example');
    if (hasHE) console.info(`  page ${p.id}: has hypothetical_example block`);
  }
}

main().catch((err) => {
  console.error('diagnose failed:', err);
  process.exit(1);
});
```

- [ ] **Step 2: Look up the BPG brief id**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/.worktrees/hub-pipeline-workbench-v2/packages/db" && node -e "
const fs=require('node:fs');for(const f of['../../../../.env']){try{for(const l of fs.readFileSync(f,'utf8').split(/\r?\n/)){const t=l.trim();if(!t||t.startsWith('#'))continue;const i=t.indexOf('=');if(i<=0)continue;const k=t.slice(0,i).trim();if(process.env[k]!==undefined)continue;let v=t.slice(i+1).trim();if((v.startsWith('\"')&&v.endsWith('\"'))||(v.startsWith(\"'\")&&v.endsWith(\"'\")))v=v.slice(1,-1);process.env[k]=v;}}catch{}}
require('postgres')(process.env.DATABASE_URL,{idle_timeout:5,max:1})\`SELECT id, payload->>'pageTitle' AS t FROM page_brief WHERE run_id = '97e8772c-07e3-4408-ba40-0a17450f33cf' AND payload->>'pageTitle' ILIKE '%Business Proposal Generator%'\`.then(r=>{console.log(r);process.exit(0)});
" 2>&1 | tail -6
```

Expected: a single row with the brief id (call it `BPG_BRIEF_ID`).

- [ ] **Step 3: Run the diagnostic**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/.worktrees/hub-pipeline-workbench-v2/packages/pipeline" && ./node_modules/.bin/tsx ./src/scripts/diagnose-hypothetical-example.ts 97e8772c-07e3-4408-ba40-0a17450f33cf <BPG_BRIEF_ID> 2>&1 | tail -20
```

Expected output is one of these three branches:

| Diagnostic output | Diagnosis | Action |
|---|---|---|
| `page_strategist: artifacts=[...] (✗ HE NOT requested)` | Strategist did not include `hypothetical_example` for this page even though it's a flagship Build page | Step 4a |
| `page_strategist: ... (✓ requested HE)` AND `example_author: NO transcript` | Strategist requested it but the Specialist never ran (orchestrator skipped it) | Step 4b |
| `page_strategist: ... (✓ requested HE)` AND `example_author: returned content` | Specialist ran and returned content; the Critic likely flagged it and the Revise pass replaced it with nothing | Step 4c |

- [ ] **Step 4a (only if Strategist didn't request HE):** Tighten the Strategist prompt

In `packages/pipeline/src/agents/specialists/prompts.ts`, find `PAGE_STRATEGIST_PROMPT`. Locate the artifact-selection rules section. The current `playbook` line is:

```
- playbook: cited_prose + roadmap + diagram + common_mistakes (always); hypothetical_example only when canon nodes have rich examples
```

Change to:

```
- playbook: cited_prose + roadmap + diagram + common_mistakes + hypothetical_example (always — readers of build pages benefit hugely from a worked example with a named protagonist; only skip when canon nodes have zero example or scenario content)
```

Apply the same change to the `framework` line (the BPG is technically classified `framework` per the page-type-enum mapping in `page-composition.ts`).

- [ ] **Step 4b (only if Strategist requested but Specialist didn't run):** Investigate orchestrator

This means `wantsKind('hypothetical_example')` returned false even though the Strategist plan included it. Check that the equality compare in `page-composition.ts:wantsKind` is robust (typo tolerance, whitespace). Add a console.warn when a requested artifact kind is dropped.

In `packages/pipeline/src/stages/page-composition.ts`, find the `wantsKind` definition and add logging right after it:

```typescript
const wantsKind = (k: ArtifactKind) => plan.artifacts.some((a) => a.kind === k);

// Telemetry: log when a kind appears in plan.artifacts but doesn't match a known kind.
const knownKinds: ArtifactKind[] = ['cited_prose', 'roadmap', 'hypothetical_example', 'diagram', 'common_mistakes'];
for (const a of plan.artifacts) {
  if (!knownKinds.includes(a.kind)) {
    console.warn(`[page-composition] strategist requested unknown artifact kind: ${a.kind} for page ${plan.pageTitle}`);
  }
}
```

- [ ] **Step 4c (only if Specialist returned content but it didn't land):** Inspect Critic + Revise

The Specialist returned a valid artifact but it's missing from the final block tree. The likely culprit: the Critic flagged it and the Revise pass produced a null in its place. Check `runRevisePass` and confirm its diagram-style fallback (return original artifact when revision returns null) also exists for example_author. If example_author's revise wrapper doesn't have the `?? input.artifacts.example` fallback that the diagram one does, add it.

Read `packages/pipeline/src/authors-studio/revise.ts` and ensure the `if (input.artifacts.example)` branch falls back to the original when the revise call returns falsy.

- [ ] **Step 5: If you took action in 4a/4b/4c, typecheck + commit**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/.worktrees/hub-pipeline-workbench-v2/packages/pipeline" && pnpm typecheck 2>&1 | tail -3
```

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/.worktrees/hub-pipeline-workbench-v2"
git add packages/pipeline/src/scripts/diagnose-hypothetical-example.ts packages/pipeline/src/agents/specialists/prompts.ts packages/pipeline/src/stages/page-composition.ts packages/pipeline/src/authors-studio/revise.ts
git commit -m "fix(authors-studio): ensure flagship build pages ship a worked hypothetical example"
```

If diagnosis 4a/4b/4c didn't apply (specialist actually shipped a worked example but it's hidden by a renderer bug), update this plan with what you found and stop here — that's a different fix.

If diagnosis suggests a corpus-thinness limitation (Strategist requested HE but the Specialist correctly returned null because canon nodes have no useful example material for THIS page), document that finding in a `docs/superpowers/notes/` markdown file and commit it. Don't force a synthetic example.

---

## Phase E — End-to-end verification

### Task 6: Re-run the run, verify all 4 fixes landed

**Files:**
- N/A (verification only)

We re-run page_composition + page_quality + adapt with the same fixtures, then re-verify against the audit checklist.

- [ ] **Step 1: Reset only the downstream stages**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/.worktrees/hub-pipeline-workbench-v2/packages/db" && node -e "
const fs=require('node:fs');for(const f of['../../../../.env']){try{for(const l of fs.readFileSync(f,'utf8').split(/\r?\n/)){const t=l.trim();if(!t||t.startsWith('#'))continue;const i=t.indexOf('=');if(i<=0)continue;const k=t.slice(0,i).trim();if(process.env[k]!==undefined)continue;let v=t.slice(i+1).trim();if((v.startsWith('\"')&&v.endsWith('\"'))||(v.startsWith(\"'\")&&v.endsWith(\"'\")))v=v.slice(1,-1);process.env[k]=v;}}catch{}}
const sql=require('postgres')(process.env.DATABASE_URL,{idle_timeout:5,max:1});
(async()=>{
  const RUN='97e8772c-07e3-4408-ba40-0a17450f33cf';
  await sql\`DELETE FROM page_quality_report WHERE run_id = \${RUN}\`;
  await sql\`DELETE FROM page_version WHERE run_id = \${RUN}\`;
  await sql\`DELETE FROM page WHERE run_id = \${RUN}\`;
  await sql\`DELETE FROM generation_stage_run WHERE run_id = \${RUN} AND stage_name IN ('page_composition','page_quality','adapt')\`;
  await sql\`UPDATE generation_run SET status = 'queued', started_at = NULL, completed_at = NULL WHERE id = \${RUN}\`;
  console.log('reset complete');
  await sql.end();
})();
" 2>&1 | tail -3
```

**IMPORTANT:** Do NOT reset `video_intelligence` or `canon` — those stages cost real money and contain Whisper-original (now-sanitized-at-read-time) content. The Phase A read-site sanitization makes new agent runs see clean text without re-running upstream.

Note that the existing `canon_node` and `video_intelligence_card` rows still contain `"Chat2BT"` in their payload JSON because they were generated before sanitization. The Phase A fix sanitizes at SEGMENT read time, but VIC/canon payloads were already written. For the existing run, the only place "Chat2BT" leaks to user-visible content is via `citation.excerpt` (covered by Phase A's project-citations.ts change). New runs from VIC onward would need a full reset. We accept the partial fix here.

- [ ] **Step 2: Re-dispatch**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/.worktrees/hub-pipeline-workbench-v2/packages/pipeline" && PIPELINE_CONTENT_ENGINE=canon_v1 PIPELINE_QUALITY_MODE=production_economy ./node_modules/.bin/tsx ./src/dispatch-queued-run.ts 97e8772c-07e3-4408-ba40-0a17450f33cf 2>&1 | tee /tmp/canon-studio-polish.log
```

Expected: `[dispatch] complete` with `pageCount: 8` after roughly 20 minutes (Author's Studio runs again for 8 pages).

- [ ] **Step 3: Re-publish**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/.worktrees/hub-pipeline-workbench-v2/packages/db" && node -e "
const fs=require('node:fs');for(const f of['../../../../.env']){try{for(const l of fs.readFileSync(f,'utf8').split(/\r?\n/)){const t=l.trim();if(!t||t.startsWith('#'))continue;const i=t.indexOf('=');if(i<=0)continue;const k=t.slice(0,i).trim();if(process.env[k]!==undefined)continue;let v=t.slice(i+1).trim();if((v.startsWith('\"')&&v.endsWith('\"'))||(v.startsWith(\"'\")&&v.endsWith(\"'\")))v=v.slice(1,-1);process.env[k]=v;}}catch{}}
const sql=require('postgres')(process.env.DATABASE_URL,{idle_timeout:5,max:1});
(async()=>{
  const HUB='4f83bf07-2574-483b-a17e-882190d34339';
  const RUN='97e8772c-07e3-4408-ba40-0a17450f33cf';
  await sql\`UPDATE hub SET live_release_id = NULL WHERE id = \${HUB}\`;
  await sql\`DELETE FROM release WHERE hub_id = \${HUB} AND run_id = \${RUN}\`;
  await sql.end();
})();
" 2>&1 | tail -3 && cd ../pipeline && ./node_modules/.bin/tsx ./src/publish-now.ts 97e8772c-07e3-4408-ba40-0a17450f33cf 2>&1 | tail -10
```

Expected: `[publish] complete` with a new releaseId (call it `NEW_RELEASE_ID`).

- [ ] **Step 4: Acceptance — Chat2BT scrub**

```bash
curl -sS "http://localhost:3003/h/ai-ultimate-knowledge-hub" --max-time 30 | grep -oE 'Chat2BT' | head -3
```

Expected: NO matches. (If you get matches, the citation excerpts didn't get sanitized — Phase A Step 4 didn't actually wrap the right field. Re-check `project-citations.ts`.)

- [ ] **Step 5: Acceptance — Video titles**

```bash
curl -sS "http://localhost:3003/h/ai-ultimate-knowledge-hub" --max-time 30 | grep -oE 'class="line-clamp-1[^"]*">[^<]+' | head -8
```

Expected: instead of `Source 1` / `Source 2`, see real titles like `"This is one of the most important automations..."` (or whatever the backfill derived). If still showing `Source N`, the `safeSourceTitle` helper considered the title still empty — verify the backfill wrote.

- [ ] **Step 6: Acceptance — Source-moment internal links**

```bash
curl -sS "http://localhost:3003/h/ai-ultimate-knowledge-hub" --max-time 30 | grep -oE 'href="/h/ai-ultimate-knowledge-hub/sources/[^"]+"' | head -3
```

Expected: at least 2 internal source links with `?t=<n>` query param (one per manual-upload video).

- [ ] **Step 7: Acceptance — Hypothetical example on BPG**

```bash
curl -sS "http://localhost:3003/h/ai-ultimate-knowledge-hub/pages/pg-7d517d808e" --max-time 30 | grep -oE 'Worked example|Hypothetical' | head -3
```

Expected: at least one match indicating the worked-example block rendered. (If the diagnosis from Task 5 showed a corpus-thinness limitation and you decided not to force one, this step's expected output is "still missing — documented in notes" and the check below relaxes accordingly.)

- [ ] **Step 8: Tag the milestone**

If all 4 acceptance checks pass:

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/.worktrees/hub-pipeline-workbench-v2"
git tag canon-v1-authors-studio-shipped
git push origin canon-v1-authors-studio-shipped
```

If 1-2 checks fail, capture exact failure output in `docs/superpowers/notes/2026-04-29-editorial-polish-followup.md` and stop. Don't tag a partial win.

---

## Self-Review

**Spec coverage** — every audit gap maps to a task:

| Audit gap | Task |
|---|---|
| Chat2BT in agent terminology + source moments | Tasks 1 + 2 |
| "Untitled" video labels | Task 3 (backfill) |
| Source-moment cards have null href on manual uploads | Task 4 |
| BPG missing hypothetical_example | Task 5 |

**Placeholder scan** — every `Step` shows the actual code or actual command needed. The diagnosis branches in Task 5 use a decision table to map observed output to a specific action, not a vague "investigate further."

**Type consistency** — `sanitizeTranscriptText`, `DEFAULT_SUBSTITUTIONS`, and `resolveSourceMomentHref` are defined in Phase A/C with explicit signatures and used verbatim in later tasks. The diagnostic script in Task 5 uses the same R2 transcript layout (`workspaces/<ws>/runs/<run>/agents/<agent>/transcript.json`) as the existing harness.

**Scope check** — these are 4 surgical fixes plus 1 investigation, all in the worktree. They do not touch main. They do not modify `globals.css`. They do not require schema migrations. The plan is appropriately sized (estimated 1.5-2.5 hours of execution time, dominated by the ~20-min re-run in Task 6).

**Risk** — the two highest-risk steps are (a) Task 4's caller-update of `sourceMomentFromCitation` (forgetting one caller breaks render), mitigated by typecheck in Step 7; and (b) the Task 5 prompt change in 4a, which alters Strategist behavior for ALL future runs and could over-pressure the Specialist on framework pages without enough source material — mitigated by the careful "only skip when canon nodes have zero example or scenario content" guidance left in the prompt.
