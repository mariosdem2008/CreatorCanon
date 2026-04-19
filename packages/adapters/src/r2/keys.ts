/**
 * Pure functions that build canonical R2 keys. The shapes here are the single
 * source of truth for artifact layout; see plan/03-target-architecture.md
 * (§ Artifact storage).
 *
 * No side effects, no network, no env. Cheap to call.
 */

import { z } from 'zod';

const nonEmpty = z.string().min(1);

const artifactKeySchema = z.object({
  workspaceId: nonEmpty,
  runId: nonEmpty,
  stage: nonEmpty,
  /** Final path component under the stage folder, e.g. `input_hash/output.json`. */
  name: nonEmpty,
});

export type ArtifactKeyInput = z.infer<typeof artifactKeySchema>;

/**
 * workspaces/{ws_id}/runs/{run_id}/{stage}/{name}
 */
export const artifactKey = (input: ArtifactKeyInput): string => {
  const { workspaceId, runId, stage, name } = artifactKeySchema.parse(input);
  return `workspaces/${workspaceId}/runs/${runId}/${stage}/${name}`;
};

const visualAssetKindSchema = z.enum([
  'keyframe',
  'contact_sheet',
  'thumbnail',
  'slide',
  'screen',
  'chart',
  'whiteboard',
  'code',
  'ui',
  'diagram',
]);

export type VisualAssetKind = z.infer<typeof visualAssetKindSchema>;

const visualAssetKeySchema = z.object({
  workspaceId: nonEmpty,
  runId: nonEmpty,
  videoId: nonEmpty,
  kind: visualAssetKindSchema,
});

export type VisualAssetKeyInput = z.infer<typeof visualAssetKeySchema>;

/**
 * workspaces/{ws_id}/runs/{run_id}/visual/{video_id}/{kind}.jpg
 */
export const visualAssetKey = (input: VisualAssetKeyInput): string => {
  const { workspaceId, runId, videoId, kind } =
    visualAssetKeySchema.parse(input);
  return `workspaces/${workspaceId}/runs/${runId}/visual/${videoId}/${kind}.jpg`;
};

const releaseKeySchema = z.object({
  hubId: nonEmpty,
  releaseId: nonEmpty,
  /** Path beneath the release root; caller owns the shape (e.g. `pages/home.html.static`). */
  path: nonEmpty,
});

export type ReleaseKeyInput = z.infer<typeof releaseKeySchema>;

/**
 * releases/{hub_id}/{release_id}/{path}
 *
 * Note: the architecture doc also shows a run-scoped path
 * `releases/{run_id}/{release_id}/…`. We follow the hub-scoped form because
 * releases are owned by a hub (multi-release history per hub). `hubId` is the
 * `published_hub` primary key.
 */
export const releaseKey = (input: ReleaseKeyInput): string => {
  const { hubId, releaseId, path } = releaseKeySchema.parse(input);
  return `releases/${hubId}/${releaseId}/${path}`;
};

const transcriptFormatSchema = z.enum(['vtt', 'json', 'srt']);

export type TranscriptFormat = z.infer<typeof transcriptFormatSchema>;

const transcriptKeySchema = z.object({
  workspaceId: nonEmpty,
  videoId: nonEmpty,
  format: transcriptFormatSchema,
});

export type TranscriptKeyInput = z.infer<typeof transcriptKeySchema>;

/**
 * workspaces/{ws_id}/transcripts/{video_id}/canonical.{format}
 *
 * Transcripts are scoped to a workspace (not a run) because they're reused
 * across runs of the same workspace per the artifact-reuse rules in
 * plan/03-target-architecture.md.
 */
export const transcriptKey = (input: TranscriptKeyInput): string => {
  const { workspaceId, videoId, format } = transcriptKeySchema.parse(input);
  return `workspaces/${workspaceId}/transcripts/${videoId}/canonical.${format}`;
};
