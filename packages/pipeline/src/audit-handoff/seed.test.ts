import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { AuditReport } from '../audit';
import type { CreatorManualDesignSpec } from './types';
import {
  buildAuditChannelYoutubeId,
  buildAuditProjectConfig,
  buildAuditVideoSeedSet,
  buildHubSubdomainCandidates,
  seedAuditHubGeneration,
  type AuditHubGenerationStore,
} from './seed';

describe('audit handoff seed helpers', () => {
  it('selects source videos from sample lesson first, then recommended page sources', () => {
    const selected = buildAuditVideoSeedSet({
      sampleLessonVideoIds: ['a', 'b'],
      examplePageVideoIds: ['b', 'c'],
      maxVideos: 4,
    });

    assert.deepEqual(selected, ['a', 'b', 'c']);
  });

  it('stores audit and design context in project config', () => {
    const config = buildAuditProjectConfig({
      auditId: 'aa_123',
      designSpecId: 'design_1',
      audience: 'Founders',
      tone: 'High-trust, direct, evidence-led.',
    });

    assert.equal(config.audit_handoff?.auditId, 'aa_123');
    assert.equal(config.audience, 'Founders');
  });

  it('builds workspace-scoped audit channel identity', () => {
    assert.equal(buildAuditChannelYoutubeId('ws_1', 'UC1'), 'audit:ws_1:UC1');
    assert.equal(buildAuditChannelYoutubeId('ws_2', 'UC1'), 'audit:ws_2:UC1');
    assert.notEqual(
      buildAuditChannelYoutubeId('ws_1', 'UC1'),
      buildAuditChannelYoutubeId('ws_2', 'UC1'),
    );
  });

  it('builds deterministic fallback hub subdomain candidates', () => {
    const candidates = buildHubSubdomainCandidates('Operator Lab Manual', 'project_abcdef123456');

    assert.deepEqual(candidates.slice(0, 4), [
      'operator-lab-manual',
      'operator-lab-manual-2',
      'operator-lab-manual-3',
      'operator-lab-manual-4',
    ]);
    assert.equal(candidates.length, 21);
    assert.equal(candidates.at(-1), 'operator-lab-manual-project_');
    assert.equal(new Set(candidates).size, candidates.length);
    assert.ok(candidates.every((candidate) => candidate.length <= 30));
  });

  it('seeds source records and returns a queued pipeline payload', async () => {
    const store = createMemoryStore();

    const result = await seedAuditHubGeneration({
      auditId: 'aa_123',
      workspaceId: 'ws_1',
      actorUserId: 'user_1',
      auditReport: report,
      designSpec,
      designSpecId: 'design_1',
      maxVideos: 4,
      store,
      getOrCreateHub: async (input) => ({
        id: 'hub_1',
        workspaceId: input.workspaceId,
        projectId: input.projectId,
      }),
    });

    assert.equal(store.channels.length, 1);
    assert.equal(store.channels[0]?.youtubeChannelId, 'audit:ws_1:UC1');
    assert.deepEqual(
      store.videos.map((video) => [video.youtubeVideoId, video.title]),
      [
        ['yt1', 'Offer video'],
        ['yt2', 'Source video yt2'],
      ],
    );
    assert.equal(store.videoSets[0]?.status, 'locked');
    assert.equal(store.projects[0]?.title, 'Operator Lab Manual');
    assert.equal(store.runs[0]?.status, 'draft');
    assert.equal(store.hubMetadataUpdates[0]?.metadata.brand?.name, 'Operator Lab Manual');
    assert.equal(store.auditLinks[0]?.autoPublish, true);
    assert.deepEqual(result.payload, {
      runId: result.runId,
      projectId: result.projectId,
      workspaceId: 'ws_1',
      videoSetId: result.videoSetId,
      pipelineVersion: result.payload.pipelineVersion,
    });
  });

  it('queues the generation run only after the audit handoff link exists', async () => {
    const store = createMemoryStore();

    await seedAuditHubGeneration({
      auditId: 'aa_123',
      workspaceId: 'ws_1',
      actorUserId: 'user_1',
      auditReport: report,
      designSpec,
      store,
      getOrCreateHub: async () => ({ id: 'hub_1' }),
    });

    assert.deepEqual(store.events, [
      'createGenerationRun:draft',
      'updateHubMetadata',
      'createAuditHubGeneration',
      'queueGenerationRun',
    ]);
  });

  it('can seed a draft audit handoff without queueing the run', async () => {
    const store = createMemoryStore();

    const result = await seedAuditHubGeneration({
      auditId: 'aa_123',
      workspaceId: 'ws_1',
      actorUserId: 'user_1',
      auditReport: report,
      designSpec,
      queueRun: false,
      store,
      getOrCreateHub: async () => ({ id: 'hub_1' }),
    });

    assert.equal(result.runId, store.runs[0]?.id);
    assert.deepEqual(store.events, [
      'createGenerationRun:draft',
      'updateHubMetadata',
      'createAuditHubGeneration',
    ]);
  });

  it('returns the existing audit handoff without creating duplicates', async () => {
    const store = createMemoryStore();
    store.existingAuditLink = {
      id: 'ahg_existing',
      projectId: 'prj_existing',
      runId: 'run_existing',
      videoSetId: 'vset_existing',
      hubId: 'hub_existing',
      pipelineVersion: 'v1.0.0',
      runStatus: 'queued',
    };

    const result = await seedAuditHubGeneration({
      auditId: 'aa_123',
      workspaceId: 'ws_1',
      actorUserId: 'user_1',
      auditReport: report,
      designSpec,
      store,
      getOrCreateHub: async () => {
        throw new Error('should not create a hub for an existing link');
      },
    });

    assert.equal(result.projectId, 'prj_existing');
    assert.equal(result.auditHubGenerationId, 'ahg_existing');
    assert.equal(store.channels.length, 0);
    assert.equal(store.auditLinks.length, 0);
  });

  it('queues an existing audit handoff when the linked run is still draft', async () => {
    const store = createMemoryStore();
    store.existingAuditLink = {
      id: 'ahg_existing',
      projectId: 'prj_existing',
      runId: 'run_existing',
      videoSetId: 'vset_existing',
      hubId: 'hub_existing',
      pipelineVersion: 'v1.0.0',
      runStatus: 'draft',
    };

    const result = await seedAuditHubGeneration({
      auditId: 'aa_123',
      workspaceId: 'ws_1',
      actorUserId: 'user_1',
      auditReport: report,
      designSpec,
      store,
      getOrCreateHub: async () => {
        throw new Error('should not create a hub for an existing link');
      },
    });

    assert.equal(result.runId, 'run_existing');
    assert.equal(result.runStatus, 'queued');
    assert.deepEqual(store.events, ['queueGenerationRun']);
  });

  it('can return an existing draft audit handoff without queueing it', async () => {
    const store = createMemoryStore();
    store.existingAuditLink = {
      id: 'ahg_existing',
      projectId: 'prj_existing',
      runId: 'run_existing',
      videoSetId: 'vset_existing',
      hubId: 'hub_existing',
      pipelineVersion: 'v1.0.0',
      runStatus: 'draft',
    };

    const result = await seedAuditHubGeneration({
      auditId: 'aa_123',
      workspaceId: 'ws_1',
      actorUserId: 'user_1',
      auditReport: report,
      designSpec,
      queueRun: false,
      store,
    });

    assert.equal(result.runId, 'run_existing');
    assert.equal(result.runStatus, 'draft');
    assert.deepEqual(store.events, []);
  });

  it('does not queue an existing audit handoff when the linked run is already awaiting review', async () => {
    const store = createMemoryStore();
    store.existingAuditLink = {
      id: 'ahg_existing',
      projectId: 'prj_existing',
      runId: 'run_existing',
      videoSetId: 'vset_existing',
      hubId: 'hub_existing',
      pipelineVersion: 'v1.0.0',
      runStatus: 'awaiting_review',
    };

    const result = await seedAuditHubGeneration({
      auditId: 'aa_123',
      workspaceId: 'ws_1',
      actorUserId: 'user_1',
      auditReport: report,
      designSpec,
      store,
    });

    assert.equal(result.runStatus, 'awaiting_review');
    assert.deepEqual(store.events, []);
  });

  it('does not queue an existing audit handoff when the linked run is already published', async () => {
    const store = createMemoryStore();
    store.existingAuditLink = {
      id: 'ahg_existing',
      projectId: 'prj_existing',
      runId: 'run_existing',
      videoSetId: 'vset_existing',
      hubId: 'hub_existing',
      pipelineVersion: 'v1.0.0',
      runStatus: 'published',
    };

    const result = await seedAuditHubGeneration({
      auditId: 'aa_123',
      workspaceId: 'ws_1',
      actorUserId: 'user_1',
      auditReport: report,
      designSpec,
      store,
    });

    assert.equal(result.runStatus, 'published');
    assert.deepEqual(store.events, []);
  });

  it('recovers from a final audit link conflict by returning the existing handoff', async () => {
    const store = createMemoryStore();
    store.failAuditLinkWithConflict = true;

    const result = await seedAuditHubGeneration({
      auditId: 'aa_123',
      workspaceId: 'ws_1',
      actorUserId: 'user_1',
      auditReport: report,
      designSpec,
      store,
      getOrCreateHub: async () => ({ id: 'hub_1' }),
    });

    assert.equal(result.auditHubGenerationId, 'ahg_race_winner');
    assert.equal(result.runId, 'run_race_winner');
    assert.deepEqual(store.events.at(-2), 'createAuditHubGenerationConflict');
    assert.deepEqual(store.events.at(-1), 'queueGenerationRun');
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
      sourceVideoIds: ['yt1', 'yt2'],
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
      currentFriction: ['Scattered', 'No path', 'No citations'],
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

const designSpec = {
  version: 1,
  brand: {
    name: 'Operator Lab Manual',
    tone: 'High-trust, direct, evidence-led.',
    colors: {
      background: '#f8fafc',
      foreground: '#111827',
      surface: '#ffffff',
      elevated: '#ffffff',
      border: '#cbd5e1',
      muted: '#64748b',
      accent: '#0f766e',
      accentForeground: '#ffffff',
      warning: '#b45309',
      success: '#15803d',
      typeMap: {
        lesson: '#0f766e',
        framework: '#1d4ed8',
        playbook: '#7c3aed',
      },
    },
    typography: {
      headingFamily: 'Georgia, ui-serif, serif',
      bodyFamily: 'Geist, ui-sans-serif, system-ui, sans-serif',
    },
    assets: {},
    style: { mode: 'custom' },
    labels: {
      evidence: 'Source clips',
      workshop: 'Operating workshop',
      library: 'Manual library',
    },
    radius: '8px',
    shadow: '0 24px 80px rgba(15, 23, 42, 0.14)',
  },
  positioning: {
    tagline: 'A source-backed operating manual.',
    homeHeadline: 'Operator Lab Manual',
    homeSummary: 'A practical map of the archive.',
  },
  motion: {
    intensity: 'subtle',
    principles: ['Use fast staggered reveals.'],
  },
  customization: {
    editableKeys: ['brand.name'],
  },
} satisfies CreatorManualDesignSpec;

function createMemoryStore(): AuditHubGenerationStore & {
  existingAuditLink: Awaited<ReturnType<AuditHubGenerationStore['findAuditHubGeneration']>>;
  failAuditLinkWithConflict: boolean;
  channels: Parameters<AuditHubGenerationStore['createChannel']>[0][];
  videos: Parameters<AuditHubGenerationStore['createVideo']>[0][];
  videoSets: Parameters<AuditHubGenerationStore['createVideoSet']>[0][];
  projects: Parameters<AuditHubGenerationStore['createProject']>[0][];
  runs: Parameters<AuditHubGenerationStore['createGenerationRun']>[0][];
  auditLinks: Parameters<AuditHubGenerationStore['createAuditHubGeneration']>[0][];
  hubMetadataUpdates: Parameters<AuditHubGenerationStore['updateHubMetadata']>[0][];
  events: string[];
} {
  const channels: Parameters<AuditHubGenerationStore['createChannel']>[0][] = [];
  const videos: Parameters<AuditHubGenerationStore['createVideo']>[0][] = [];
  const videoSets: Parameters<AuditHubGenerationStore['createVideoSet']>[0][] = [];
  const projects: Parameters<AuditHubGenerationStore['createProject']>[0][] = [];
  const runs: Parameters<AuditHubGenerationStore['createGenerationRun']>[0][] = [];
  const auditLinks: Parameters<AuditHubGenerationStore['createAuditHubGeneration']>[0][] = [];
  const hubMetadataUpdates: Parameters<AuditHubGenerationStore['updateHubMetadata']>[0][] = [];
  const events: string[] = [];

  return {
    existingAuditLink: null,
    failAuditLinkWithConflict: false,
    channels,
    videos,
    videoSets,
    projects,
    runs,
    auditLinks,
    hubMetadataUpdates,
    events,
    async findAuditHubGeneration() {
      return this.existingAuditLink;
    },
    async findChannelByYoutubeId() {
      return null;
    },
    async createChannel(input) {
      channels.push(input);
      return { id: input.id };
    },
    async findVideoByYoutubeId(_workspaceId, youtubeVideoId) {
      const existing = videos.find((video) => video.youtubeVideoId === youtubeVideoId);
      return existing ? { id: existing.id } : null;
    },
    async createVideo(input) {
      videos.push(input);
      return { id: input.id };
    },
    async createVideoSet(input) {
      videoSets.push(input);
      return { id: input.id };
    },
    async createVideoSetItems() {},
    async createProject(input) {
      projects.push(input);
      return { id: input.id };
    },
    async createGenerationRun(input) {
      events.push(`createGenerationRun:${input.status}`);
      runs.push(input);
      return { id: input.id, pipelineVersion: input.pipelineVersion };
    },
    async updateProjectCurrentRun() {},
    async updateHubMetadata(input) {
      events.push('updateHubMetadata');
      hubMetadataUpdates.push(input);
    },
    async createAuditHubGeneration(input) {
      if (this.failAuditLinkWithConflict) {
        this.existingAuditLink = {
          id: 'ahg_race_winner',
          projectId: 'prj_race_winner',
          runId: 'run_race_winner',
          videoSetId: 'vset_race_winner',
          hubId: 'hub_race_winner',
          pipelineVersion: 'v1.0.0',
          runStatus: 'draft',
        };
        events.push('createAuditHubGenerationConflict');
        const error = new Error('duplicate key value violates unique constraint');
        (error as Error & { code?: string }).code = '23505';
        throw error;
      }
      events.push('createAuditHubGeneration');
      auditLinks.push(input);
      return { id: input.id };
    },
    async queueGenerationRun() {
      events.push('queueGenerationRun');
      return true;
    },
  };
}
