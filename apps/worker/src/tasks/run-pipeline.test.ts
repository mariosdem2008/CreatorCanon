import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { runPipelineTaskBody } from './run-pipeline';

describe('runPipelineTaskBody', () => {
  it('returns the pipeline result when audit completion fails after generation succeeds', async () => {
    const messages: { level: string; msg: string; meta?: Record<string, unknown> }[] = [];

    const result = await runPipelineTaskBody(
      {
        runId: 'run_1',
        projectId: 'prj_1',
        workspaceId: 'ws_1',
        videoSetId: 'vset_1',
        pipelineVersion: 'v1.0.0',
      },
      {
        logger: {
          info: (msg, meta) => messages.push({ level: 'info', msg, meta }),
          error: (msg, meta) => messages.push({ level: 'error', msg, meta }),
        },
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
        completeAuditGeneratedRun: async () => {
          throw new Error('link update failed');
        },
      },
    );

    assert.equal(result.runId, 'run_1');
    assert.equal(result.pageCount, 5);
    assert.equal(messages.at(-1)?.msg, 'Audit generated hub completion failed');
    assert.equal(messages.at(-1)?.meta?.error, 'link update failed');
  });

  it('rethrows when the generation pipeline fails', async () => {
    const messages: { level: string; msg: string; meta?: Record<string, unknown> }[] = [];
    const failureUpdates: unknown[] = [];

    await assert.rejects(
      runPipelineTaskBody(
        {
          runId: 'run_1',
          projectId: 'prj_1',
          workspaceId: 'ws_1',
          videoSetId: 'vset_1',
          pipelineVersion: 'v1.0.0',
        },
        {
          logger: {
            info: (msg, meta) => messages.push({ level: 'info', msg, meta }),
            error: (msg, meta) => messages.push({ level: 'error', msg, meta }),
          },
          runGenerationPipeline: async () => {
            throw new Error('pipeline failed');
          },
          markAuditGeneratedRunFailed: async (input) => {
            failureUpdates.push(input);
            return true;
          },
          completeAuditGeneratedRun: async () => {
            throw new Error('should not complete');
          },
        },
      ),
      /pipeline failed/,
    );

    assert.equal(
      messages.find((message) => message.msg === 'Pipeline failed')?.meta?.error,
      'pipeline failed',
    );
    assert.equal(failureUpdates.length, 1);
    assert.equal((failureUpdates[0] as { runId: string }).runId, 'run_1');
    assert.equal((failureUpdates[0] as { error: Error }).error.message, 'pipeline failed');
  });
});
