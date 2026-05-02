import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { AuditReport } from '../audit';
import { buildFallbackCreatorManualDesignSpec } from './design-spec';
import {
  completeAuditGeneratedRun,
  markAuditGeneratedRunFailed,
  startAuditHubGeneration,
  summarizeAuditHubGenerationResult,
} from './run-audit-hub-generation';

describe('audit hub generation result summary', () => {
  it('returns project, run, hub, and release IDs for UI redirects', () => {
    const summary = summarizeAuditHubGenerationResult({
      auditId: 'aa_123',
      projectId: 'prj_1',
      runId: 'run_1',
      hubId: 'hub_1',
      releaseId: 'rel_1',
      publicPath: '/h/operator-lab',
      status: 'published',
    });

    assert.equal(summary.projectPath, '/app/projects/prj_1');
    assert.equal(summary.publicPath, '/h/operator-lab');
  });
});

const report = {
  version: 1,
  channel: {
    id: 'UC1',
    title: 'Operator Lab',
    handle: '@operatorlab',
    url: 'https://www.youtube.com/@operatorlab',
    thumbnailUrl: null,
  },
  scanned: { videoCount: 20, transcriptCount: 5, publicDataOnly: true },
  scores: {
    overall: 88,
    knowledgeDensity: 90,
    sourceDepth: 82,
    positioningClarity: 84,
    monetizationPotential: 91,
  },
  positioning: {
    oneLineRead: 'Operator education.',
    audience: 'Founders',
    authorityAngle: 'Field-tested systems',
  },
  inventory: {
    frameworks: ['Offer systems'],
    playbooks: ['Sales operating rhythm'],
    proofMoments: ['Workshop clip'],
    repeatedThemes: ['Sales', 'Pricing', 'Hiring'],
  },
  blueprint: {
    hubTitle: 'Operator Lab Manual',
    tracks: [
      { title: 'Start', description: 'Start here.', candidatePages: ['Overview'] },
      { title: 'Build', description: 'Build systems.', candidatePages: ['Systems'] },
      { title: 'Scale', description: 'Scale.', candidatePages: ['Scale'] },
    ],
    sampleLesson: {
      title: 'Offer systems',
      promise: 'Clarify the offer.',
      sourceVideoIds: ['yt1'],
    },
  },
  monetization: {
    leadMagnet: 'Checklist',
    paidHub: 'Manual',
    authorityOffer: 'Advisory',
    priority: 'Build hub',
  },
  gaps: [],
  creatorCanonFit: {
    summary: 'Strong fit',
    buildPlan: ['Extract', 'Organize', 'Publish'],
    cta: 'Build it',
  },
  auditMemo: {
    headlineFinding: 'Strong archive.',
    bestFirstHub: 'Operator Lab Manual',
    whatINoticed: {
      summary: 'Themes repeat.',
      repeatedTopics: ['Sales', 'Pricing', 'Hiring'],
      currentFriction: ['Scattered archive', 'No guided path', 'Weak citation surface'],
      opportunity: 'Package it.',
    },
    fitScoreRows: [
      { signal: 'Useful archive depth', score: 8, whyItMatters: 'Enough depth.' },
      { signal: 'Evergreen value', score: 8, whyItMatters: 'Evergreen.' },
      { signal: 'Audience pain', score: 9, whyItMatters: 'Pain.' },
      { signal: 'Product potential', score: 9, whyItMatters: 'Potential.' },
    ],
    recommendedHub: {
      name: 'Operator Lab Manual',
      targetAudience: 'Founders',
      outcome: 'Build systems.',
      whyThisFirst: 'Focused.',
      firstPages: ['Overview', 'Sales', 'Pricing', 'Hiring', 'Systems'],
    },
    examplePage: {
      title: 'Offer systems',
      simpleSummary: 'A page.',
      recommendedPath: ['Watch', 'Extract', 'Apply', 'Review'],
      archiveConnection: 'Uses sources.',
      sourceVideosUsed: [{ videoId: 'yt1', title: 'Offer video' }],
      takeaways: ['One', 'Two', 'Three'],
    },
    businessUses: {
      leadMagnet: 'Checklist',
      paidMiniProduct: 'Manual',
      courseSupport: 'Course',
      authorityAsset: 'Proof',
    },
  },
} satisfies AuditReport;

describe('startAuditHubGeneration', () => {
  it('loads a succeeded audit, builds a design spec, seeds the hub generation, and writes handoff artifacts', async () => {
    const designSpec = buildFallbackCreatorManualDesignSpec(report);
    const artifacts: { stage: string; output: unknown }[] = [];
    const events: string[] = [];

    const result = await startAuditHubGeneration(
      {
        auditId: 'aa_123',
        workspaceId: 'ws_1',
        actorUserId: 'user_1',
        autoPublish: true,
      },
      {
        store: {
          findArchiveAuditById: async (auditId) => ({
            id: auditId,
            status: 'succeeded',
            report,
          }),
        },
        generateDesignSpecWithProvenance: async ({ auditReport }) => {
          assert.equal(auditReport.channel.title, 'Operator Lab');
          return {
            spec: designSpec,
            source: 'fallback',
            fallbackReason: 'model_client_unavailable',
          };
        },
        seedAuditHubGeneration: async (input) => {
          assert.equal(input.auditId, 'aa_123');
          assert.equal(input.autoPublish, true);
          assert.equal(input.queueRun, false);
          assert.equal(input.designSpec.brand.name, 'Operator Lab Manual');
          events.push('seed');
          return {
            projectId: 'prj_1',
            runId: 'run_1',
            videoSetId: 'vset_1',
            hubId: 'hub_1',
            auditHubGenerationId: 'ahg_1',
            runStatus: 'draft',
            payload: {
              runId: 'run_1',
              projectId: 'prj_1',
              workspaceId: 'ws_1',
              videoSetId: 'vset_1',
              pipelineVersion: 'v1.0.0',
            },
          };
        },
        writeArtifact: async (artifact) => {
          events.push(`artifact:${artifact.stage}`);
          artifacts.push({ stage: artifact.stage, output: artifact.output });
          return artifact.output;
        },
        queueAuditHubGenerationRun: async ({ runId }) => {
          events.push(`queue:${runId}`);
          return true;
        },
      },
    );

    assert.equal(result.projectId, 'prj_1');
    assert.equal(result.payload.runId, 'run_1');
    assert.equal(result.queuedForDispatch, true);
    assert.deepEqual(
      artifacts.map((artifact) => artifact.stage),
      ['audit_handoff_context', 'audit_design_spec'],
    );
    const designSpecArtifact = artifacts.find((artifact) => artifact.stage === 'audit_design_spec')
      ?.output as {
      spec?: { brand?: { name?: string } };
      source?: string;
      fallbackReason?: string | null;
    };
    assert.equal(designSpecArtifact.source, 'fallback');
    assert.equal(designSpecArtifact.fallbackReason, 'model_client_unavailable');
    assert.equal(designSpecArtifact.spec?.brand?.name, 'Operator Lab Manual');
    assert.deepEqual(events, [
      'seed',
      'artifact:audit_handoff_context',
      'artifact:audit_design_spec',
      'queue:run_1',
    ]);
  });

  it('rejects audits that have not succeeded', async () => {
    await assert.rejects(
      startAuditHubGeneration(
        {
          auditId: 'aa_failed',
          workspaceId: 'ws_1',
          actorUserId: 'user_1',
        },
        {
          store: {
            findArchiveAuditById: async (auditId) => ({
              id: auditId,
              status: 'failed',
              report,
            }),
          },
        },
      ),
      /succeeded/,
    );
  });

  it('does not requeue an existing handoff whose run is already awaiting review', async () => {
    const designSpec = buildFallbackCreatorManualDesignSpec(report);
    const events: string[] = [];

    const result = await startAuditHubGeneration(
      {
        auditId: 'aa_123',
        workspaceId: 'ws_1',
        actorUserId: 'user_1',
        autoPublish: true,
      },
      {
        store: {
          findArchiveAuditById: async (auditId) => ({
            id: auditId,
            status: 'succeeded',
            report,
          }),
        },
        generateDesignSpec: async () => designSpec,
        seedAuditHubGeneration: async () => {
          events.push('seed');
          return {
            projectId: 'prj_1',
            runId: 'run_1',
            videoSetId: 'vset_1',
            hubId: 'hub_1',
            auditHubGenerationId: 'ahg_1',
            runStatus: 'awaiting_review',
            payload: {
              runId: 'run_1',
              projectId: 'prj_1',
              workspaceId: 'ws_1',
              videoSetId: 'vset_1',
              pipelineVersion: 'v1.0.0',
            },
          };
        },
        writeArtifact: async (artifact) => {
          events.push(`artifact:${artifact.stage}`);
          return artifact.output;
        },
        queueAuditHubGenerationRun: async () => {
          events.push('queue');
          return true;
        },
      },
    );

    assert.equal(result.runStatus, 'awaiting_review');
    assert.equal(result.queuedForDispatch, false);
    assert.deepEqual(events, [
      'seed',
      'artifact:audit_handoff_context',
      'artifact:audit_design_spec',
    ]);
  });

  it('does not requeue an existing handoff whose run is already published', async () => {
    const designSpec = buildFallbackCreatorManualDesignSpec(report);
    const events: string[] = [];

    const result = await startAuditHubGeneration(
      {
        auditId: 'aa_123',
        workspaceId: 'ws_1',
        actorUserId: 'user_1',
        autoPublish: true,
      },
      {
        store: {
          findArchiveAuditById: async (auditId) => ({
            id: auditId,
            status: 'succeeded',
            report,
          }),
        },
        generateDesignSpec: async () => designSpec,
        seedAuditHubGeneration: async () => {
          events.push('seed');
          return {
            projectId: 'prj_1',
            runId: 'run_1',
            videoSetId: 'vset_1',
            hubId: 'hub_1',
            auditHubGenerationId: 'ahg_1',
            runStatus: 'published',
            payload: {
              runId: 'run_1',
              projectId: 'prj_1',
              workspaceId: 'ws_1',
              videoSetId: 'vset_1',
              pipelineVersion: 'v1.0.0',
            },
          };
        },
        writeArtifact: async (artifact) => {
          events.push(`artifact:${artifact.stage}`);
          return artifact.output;
        },
        queueAuditHubGenerationRun: async () => {
          events.push('queue');
          return true;
        },
      },
    );

    assert.equal(result.runStatus, 'published');
    assert.equal(result.queuedForDispatch, false);
    assert.deepEqual(events, [
      'seed',
      'artifact:audit_handoff_context',
      'artifact:audit_design_spec',
    ]);
  });
});

describe('completeAuditGeneratedRun', () => {
  it('publishes linked audit handoff runs and stores the release result', async () => {
    const updates: unknown[] = [];

    const result = await completeAuditGeneratedRun(
      { runId: 'run_1' },
      {
        store: {
          findAuditHubGenerationByRunId: async () => ({
            id: 'ahg_1',
            auditId: 'aa_123',
            workspaceId: 'ws_1',
            projectId: 'prj_1',
            runId: 'run_1',
            hubId: 'hub_1',
            releaseId: null,
            actorUserId: 'user_1',
            autoPublish: true,
            status: 'queued',
            publicPath: null,
            runStatus: 'awaiting_review',
          }),
          markAuditHubGenerationPublished: async (input) => {
            updates.push(input);
          },
          markAuditHubGenerationFailed: async () => {
            throw new Error('should not fail');
          },
        },
        publishRunAsHub: async (input) => {
          assert.deepEqual(input, {
            workspaceId: 'ws_1',
            projectId: 'prj_1',
            runId: 'run_1',
            actorUserId: 'user_1',
          });
          return {
            hubId: 'hub_1',
            releaseId: 'rel_1',
            subdomain: 'operator-lab',
            publicPath: '/h/operator-lab',
            manifestR2Key: 'releases/hub_1/rel_1/manifest.json',
            pageCount: 5,
          };
        },
      },
    );

    assert.equal(result?.releaseId, 'rel_1');
    assert.equal(result?.publicPath, '/h/operator-lab');
    assert.equal(updates.length, 1);
  });

  it('returns null for manual runs with no audit handoff link', async () => {
    const result = await completeAuditGeneratedRun(
      { runId: 'run_manual' },
      {
        store: {
          findAuditHubGenerationByRunId: async () => null,
          markAuditHubGenerationPublished: async () => {
            throw new Error('should not publish');
          },
          markAuditHubGenerationFailed: async () => {
            throw new Error('should not fail');
          },
        },
      },
    );

    assert.equal(result, null);
  });

  it('marks linked audit handoff failed before rejecting invalid run status', async () => {
    const failures: unknown[] = [];

    await assert.rejects(
      completeAuditGeneratedRun(
        { runId: 'run_1' },
        {
          store: {
            findAuditHubGenerationByRunId: async () => ({
              id: 'ahg_1',
              auditId: 'aa_123',
              workspaceId: 'ws_1',
              projectId: 'prj_1',
              runId: 'run_1',
              hubId: 'hub_1',
              releaseId: null,
              actorUserId: 'user_1',
              autoPublish: true,
              status: 'queued',
              publicPath: null,
              runStatus: 'running',
            }),
            markAuditHubGenerationPublished: async () => {
              throw new Error('should not publish');
            },
            markAuditHubGenerationFailed: async (input) => {
              failures.push(input);
            },
          },
        },
      ),
      /status running/,
    );

    assert.equal(failures.length, 1);
    assert.equal((failures[0] as { id: string }).id, 'ahg_1');
  });

  it('marks linked audit handoff failed before rejecting a missing actor user', async () => {
    const failures: unknown[] = [];

    await assert.rejects(
      completeAuditGeneratedRun(
        { runId: 'run_1' },
        {
          store: {
            findAuditHubGenerationByRunId: async () => ({
              id: 'ahg_1',
              auditId: 'aa_123',
              workspaceId: 'ws_1',
              projectId: 'prj_1',
              runId: 'run_1',
              hubId: 'hub_1',
              releaseId: null,
              actorUserId: null,
              autoPublish: true,
              status: 'queued',
              publicPath: null,
              runStatus: 'awaiting_review',
            }),
            markAuditHubGenerationPublished: async () => {
              throw new Error('should not publish');
            },
            markAuditHubGenerationFailed: async (input) => {
              failures.push(input);
            },
          },
        },
      ),
      /without an actor user/,
    );

    assert.equal(failures.length, 1);
    assert.equal((failures[0] as { id: string }).id, 'ahg_1');
  });

  it('recovers a partially published audit handoff by marking the link published', async () => {
    const updates: unknown[] = [];
    const publishCalls: unknown[] = [];

    const result = await completeAuditGeneratedRun(
      { runId: 'run_1' },
      {
        store: {
          findAuditHubGenerationByRunId: async () => ({
            id: 'ahg_1',
            auditId: 'aa_123',
            workspaceId: 'ws_1',
            projectId: 'prj_1',
            runId: 'run_1',
            hubId: 'hub_1',
            releaseId: null,
            actorUserId: 'user_1',
            autoPublish: true,
            status: 'queued',
            publicPath: null,
            runStatus: 'published',
          }),
          markAuditHubGenerationPublished: async (input) => {
            updates.push(input);
          },
          markAuditHubGenerationFailed: async () => {
            throw new Error('should not fail');
          },
        },
        publishRunAsHub: async (input) => {
          publishCalls.push(input);
          return {
            hubId: 'hub_1',
            releaseId: 'rel_1',
            subdomain: 'operator-lab',
            publicPath: '/h/operator-lab',
            manifestR2Key: 'releases/hub_1/rel_1/manifest.json',
            pageCount: 5,
          };
        },
      },
    );

    assert.equal(result?.releaseId, 'rel_1');
    assert.equal(publishCalls.length, 1);
    assert.deepEqual(updates, [
      {
        id: 'ahg_1',
        releaseId: 'rel_1',
        publicPath: '/h/operator-lab',
      },
    ]);
  });

  it('returns an already-published audit handoff idempotently regardless of run status', async () => {
    const result = await completeAuditGeneratedRun(
      { runId: 'run_1' },
      {
        store: {
          findAuditHubGenerationByRunId: async () => ({
            id: 'ahg_1',
            auditId: 'aa_123',
            workspaceId: 'ws_1',
            projectId: 'prj_1',
            runId: 'run_1',
            hubId: 'hub_1',
            releaseId: 'rel_1',
            actorUserId: null,
            autoPublish: true,
            status: 'published',
            publicPath: '/h/operator-lab',
            runStatus: 'failed',
          }),
          markAuditHubGenerationPublished: async () => {
            throw new Error('should not publish');
          },
          markAuditHubGenerationFailed: async () => {
            throw new Error('should not fail');
          },
        },
        publishRunAsHub: async () => {
          throw new Error('should not publish');
        },
      },
    );

    assert.equal(result?.releaseId, 'rel_1');
    assert.equal(result?.publicPath, '/h/operator-lab');
  });

  it('marks linked audit handoff runs failed by run id', async () => {
    const failures: unknown[] = [];

    const updated = await markAuditGeneratedRunFailed(
      { runId: 'run_1', error: new Error('pipeline failed') },
      {
        store: {
          findAuditHubGenerationByRunId: async () => ({
            id: 'ahg_1',
            auditId: 'aa_123',
            workspaceId: 'ws_1',
            projectId: 'prj_1',
            runId: 'run_1',
            hubId: 'hub_1',
            releaseId: null,
            actorUserId: 'user_1',
            autoPublish: true,
            status: 'queued',
            publicPath: null,
            runStatus: 'failed',
          }),
          markAuditHubGenerationPublished: async () => {
            throw new Error('should not publish');
          },
          markAuditHubGenerationFailed: async (input) => {
            failures.push(input);
          },
        },
      },
    );

    assert.equal(updated, true);
    assert.equal(failures.length, 1);
    assert.equal((failures[0] as { id: string }).id, 'ahg_1');
    assert.equal((failures[0] as { error: Error }).error.message, 'pipeline failed');
  });
});
