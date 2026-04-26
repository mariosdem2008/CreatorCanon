import { before, after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadDefaultEnvFiles } from '../../env-files';
import { runAgent } from '../harness';
import { _resetRegistryForTests, registerAllTools } from '../tools/registry';
import { seedTestRun, teardownTestRun, type SeedResult } from '../../../test-helpers/fixtures';
import type { AgentProvider } from '../providers';

/** Build a stub R2 client that captures putObject calls. */
function makeCapturingR2() {
  const captured: Array<{ key: string; body: Uint8Array | string; contentType?: string }> = [];
  return {
    captured,
    client: {
      bucket: 'stub',
      async putObject(input: { key: string; body: Uint8Array | string; contentType?: string }) {
        captured.push({ key: input.key, body: input.body, contentType: input.contentType });
        return { key: input.key, etag: 'stub-etag' };
      },
      async getObject() { throw new Error('stub: getObject not used'); },
      async getSignedUrl() { throw new Error('stub: getSignedUrl not used'); },
      async deleteObject() { throw new Error('stub: deleteObject not used'); },
      async headObject() { throw new Error('stub: headObject not used'); },
      async listObjects() { throw new Error('stub: listObjects not used'); },
    } as any,
  };
}

describe('runAgent — error paths', () => {
  let seed: SeedResult;

  before(async () => {
    loadDefaultEnvFiles();
    _resetRegistryForTests();
    registerAllTools();
    seed = await seedTestRun({
      videos: [{ id: 'vid_err_v1', title: 'Error Test', durationSec: 600 }],
      segments: [{ id: 'seg_err_a', videoId: 'vid_err_v1', startMs: 0, endMs: 30_000, text: 'Test segment.' }],
    });
  });

  after(async () => { await teardownTestRun(seed); });

  it('attaches transcript on provider failure (does not silently swallow)', async () => {
    const r2 = makeCapturingR2();
    const failingProvider: AgentProvider = {
      name: 'openai',
      async chat() { throw new Error('Simulated provider crash'); },
    };
    await assert.rejects(
      () => runAgent({
        runId: seed.runId, workspaceId: seed.workspaceId,
        agent: 'topic_spotter', modelId: 'gemini-2.5-flash',
        provider: failingProvider, r2: r2.client,
        tools: ['listVideos', 'proposeTopic'],
        systemPrompt: 's', userMessage: 'u',
        caps: { maxCalls: 10, maxCostCents: 1000, maxWallMs: 60_000 },
      }),
      (err: Error) => {
        assert.equal(err.message, 'Simulated provider crash');
        return true;
      },
    );
    // On provider failure the harness should NOT persist a transcript to R2
    // (the putObject call lives on the success path, after the loop).
    assert.equal(r2.captured.length, 0);
  });
});
