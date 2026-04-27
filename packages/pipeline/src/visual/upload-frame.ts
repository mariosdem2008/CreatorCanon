import type { R2Client } from '@creatorcanon/adapters';

/**
 * Persist one extracted JPG frame to R2.
 * Layout: workspaces/{workspaceId}/runs/{runId}/visual_context/{videoId}/{ts}.jpg
 * Returns the R2 key suitable for `visual_moment.frame_r2_key`.
 */
export async function uploadFrame(input: {
  r2: R2Client;
  workspaceId: string;
  runId: string;
  videoId: string;
  timestampMs: number;
  bytes: Buffer;
}): Promise<string> {
  const key = `workspaces/${input.workspaceId}/runs/${input.runId}/visual_context/${input.videoId}/${input.timestampMs}.jpg`;
  await input.r2.putObject({ key, body: input.bytes, contentType: 'image/jpeg' });
  return key;
}
