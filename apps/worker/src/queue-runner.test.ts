import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { processQueuedRun } from './queue-runner';

describe('processQueuedRun', () => {
  it('completes the generation pipeline then auto-publishes linked audit handoff runs', async () => {
    const messages: { msg: string; meta?: Record<string, unknown> }[] = [];

    await processQueuedRun(
      {
        runId: 'run_1',
        projectId: 'prj_1',
        workspaceId: 'ws_1',
        videoSetId: 'vset_1',
        pipelineVersion: 'v1.0.0',
      },
      {
        log: (msg, meta) => messages.push({ msg, meta }),
        runGenerationPipeline: async (payload) => ({
          runId: payload.runId,
          videoCount: 3,
          transcriptsFetched: 2,
          transcriptsSkipped: 1,
          segmentsCreated: 20,
          findingCount: 8,
          pageCount: 5,
          manifestR2Key: 'artifacts/run_1/adapt/manifest.json',
        }),
        completeAuditGeneratedRun: async ({ runId }) => {
          assert.equal(runId, 'run_1');
          return {
            auditHubGenerationId: 'ahg_1',
            auditId: 'aa_123',
            projectId: 'prj_1',
            runId: 'run_1',
            hubId: 'hub_1',
            releaseId: 'rel_1',
            publicPath: '/h/operator-lab',
            status: 'published',
          };
        },
      },
    );

    assert.equal(messages.at(-1)?.msg, 'auto-published audit generated hub');
    assert.equal(messages.at(-1)?.meta?.releaseId, 'rel_1');
  });

  it('marks linked audit handoff runs failed when queued generation fails', async () => {
    const messages: { msg: string; meta?: Record<string, unknown> }[] = [];
    const failureUpdates: unknown[] = [];

    await processQueuedRun(
      {
        runId: 'run_1',
        projectId: 'prj_1',
        workspaceId: 'ws_1',
        videoSetId: 'vset_1',
        pipelineVersion: 'v1.0.0',
      },
      {
        log: (msg, meta) => messages.push({ msg, meta }),
        runGenerationPipeline: async () => {
          throw new Error('pipeline failed');
        },
        completeAuditGeneratedRun: async () => {
          throw new Error('should not complete');
        },
        markAuditGeneratedRunFailed: async (input) => {
          failureUpdates.push(input);
          return true;
        },
      },
    );

    assert.equal(
      messages.find((message) => message.msg === 'queued run failed')?.meta?.error,
      'pipeline failed',
    );
    assert.equal(failureUpdates.length, 1);
    assert.equal((failureUpdates[0] as { runId: string }).runId, 'run_1');
    assert.equal((failureUpdates[0] as { error: Error }).error.message, 'pipeline failed');
  });
});
