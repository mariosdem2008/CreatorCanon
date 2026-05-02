import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { auditReportSchema } from './types';

describe('archive audit report contract', () => {
  it('accepts the public audit report shape used by audit-to-hub handoff', () => {
    const parsed = auditReportSchema.parse({
      version: 1,
      channel: {
        id: 'UC123',
        title: 'Creator Name',
        handle: '@creator',
        url: 'https://www.youtube.com/@creator',
        thumbnailUrl: null,
      },
      scanned: { videoCount: 12, transcriptCount: 4, publicDataOnly: true },
      scores: {
        overall: 82,
        knowledgeDensity: 84,
        sourceDepth: 78,
        positioningClarity: 80,
        monetizationPotential: 86,
      },
      positioning: {
        oneLineRead: 'Practical operator education.',
        audience: 'Founders',
        authorityAngle: 'Field-tested systems',
      },
      inventory: {
        frameworks: ['Offer design'],
        playbooks: ['Sales calls'],
        proofMoments: ['Workshop breakdown'],
        repeatedThemes: ['Pricing', 'Hiring', 'Lead flow'],
      },
      blueprint: {
        hubTitle: 'Creator Name Manual',
        tracks: [
          { title: 'Start', description: 'Core orientation.', candidatePages: ['Overview'] },
          { title: 'Build', description: 'Operating systems.', candidatePages: ['Systems'] },
          { title: 'Scale', description: 'Growth loops.', candidatePages: ['Growth'] },
        ],
        sampleLesson: {
          title: 'Offer ladder',
          promise: 'Clarify the next best offer.',
          sourceVideoIds: ['abc123'],
        },
      },
      monetization: {
        leadMagnet: 'A practical checklist.',
        paidHub: 'A premium manual.',
        authorityOffer: 'Advisory support.',
        priority: 'Build the first hub.',
      },
      gaps: [{ label: 'Transcript depth', severity: 'medium', fix: 'Connect the channel.' }],
      creatorCanonFit: {
        summary: 'Strong fit.',
        buildPlan: ['Pick sources.', 'Generate canon.', 'Publish manual.'],
        cta: 'Build the hub',
      },
      auditMemo: {
        headlineFinding: 'The archive can become a manual.',
        bestFirstHub: 'Creator Name Manual',
        whatINoticed: {
          summary: 'Clear repeated themes.',
          repeatedTopics: ['Pricing', 'Hiring', 'Lead flow'],
          currentFriction: ['Archive is scattered', 'No guided path', 'Weak citation surface'],
          opportunity: 'Package the operating system.',
        },
        fitScoreRows: [
          { signal: 'Useful archive depth', score: 8, whyItMatters: 'Enough videos.' },
          { signal: 'Evergreen value', score: 8, whyItMatters: 'Durable topics.' },
          { signal: 'Audience pain', score: 8, whyItMatters: 'Clear pain.' },
          { signal: 'Product potential', score: 9, whyItMatters: 'Strong use case.' },
        ],
        recommendedHub: {
          name: 'Creator Name Manual',
          targetAudience: 'Founders',
          outcome: 'Build better systems.',
          whyThisFirst: 'It is focused.',
          firstPages: ['Overview', 'Pricing', 'Sales', 'Hiring', 'Systems'],
        },
        examplePage: {
          title: 'Offer ladder',
          simpleSummary: 'A practical offer page.',
          recommendedPath: ['Watch', 'Extract', 'Apply', 'Review'],
          archiveConnection: 'Uses the strongest source videos.',
          sourceVideosUsed: [{ videoId: 'abc123', title: 'Offer video' }],
          takeaways: ['Clarify buyer', 'Name outcome', 'Sequence offers'],
        },
        businessUses: {
          leadMagnet: 'Checklist',
          paidMiniProduct: 'Paid manual',
          courseSupport: 'Course companion',
          authorityAsset: 'Public proof hub',
        },
      },
    });

    assert.equal(parsed.channel.title, 'Creator Name');
  });
});
