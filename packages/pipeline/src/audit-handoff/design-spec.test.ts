import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFallbackCreatorManualDesignSpec,
  generateCreatorManualDesignSpec,
  generateCreatorManualDesignSpecWithProvenance,
} from './design-spec';
import type { AuditReport } from '../audit';

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
      currentFriction: ['Scattered', 'No guided path', 'Weak citation surface'],
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

describe('Creator Manual design spec agent', () => {
  it('builds a deterministic fallback when no model client is supplied', async () => {
    const spec = await generateCreatorManualDesignSpec({ auditReport: report, modelClient: null });
    assert.equal(spec.brand.name, 'Operator Lab Manual');
    assert.match(spec.brand.colors.accent, /^#[0-9a-fA-F]{6}$/);
  });

  it('keeps fallback color palette complete', () => {
    const spec = buildFallbackCreatorManualDesignSpec(report);
    assert.ok(spec.brand.colors.background);
    assert.ok(spec.brand.colors.foreground);
    assert.ok(spec.brand.colors.typeMap.framework);
  });

  it('compacts overlong audit text before building fallback schema fields', () => {
    const longText = 'Operator systems '.repeat(80);
    const overlongReport = {
      ...report,
      channel: { ...report.channel, title: longText },
      positioning: { ...report.positioning, audience: longText },
      inventory: { ...report.inventory, repeatedThemes: [longText, 'Pricing', 'Hiring'] },
      auditMemo: {
        ...report.auditMemo,
        bestFirstHub: longText,
        recommendedHub: { ...report.auditMemo.recommendedHub, targetAudience: longText },
      },
    } satisfies AuditReport;

    const spec = buildFallbackCreatorManualDesignSpec(overlongReport);

    assert.equal(spec.brand.name.length <= 120, true);
    assert.equal(spec.positioning.tagline.length <= 240, true);
    assert.equal(spec.positioning.homeHeadline.length <= 160, true);
    assert.equal(spec.positioning.homeSummary.length <= 420, true);
  });

  it('uses a valid injected model response', async () => {
    const generation = await generateCreatorManualDesignSpecWithProvenance({
      auditReport: report,
      modelClient: async ({ auditReport }) => ({
        version: 1,
        brand: {
          name: auditReport.blueprint.hubTitle,
          tone: 'Premium, precise, source-backed.',
          colors: {
            background: '#f8fafc',
            foreground: '#111827',
            surface: '#ffffff',
            elevated: '#ffffff',
            border: '#cbd5e1',
            muted: '#64748b',
            accent: '#2563eb',
            accentForeground: '#ffffff',
            warning: '#b45309',
            success: '#15803d',
            typeMap: {
              lesson: '#2563eb',
              framework: '#0f766e',
              playbook: '#7c3aed',
            },
          },
          typography: {
            headingFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
            bodyFamily: 'Geist, ui-sans-serif, system-ui, sans-serif',
          },
          assets: {},
          style: { mode: 'light' },
          labels: {
            evidence: 'Evidence',
            workshop: 'Workshop',
            library: 'Library',
          },
          radius: '6px',
          shadow: '0 20px 70px rgba(15, 23, 42, 0.12)',
        },
        positioning: {
          tagline: 'A premium operating manual.',
          homeHeadline: 'Operator Lab Manual',
          homeSummary: 'Systems, lessons, and evidence from the archive.',
        },
        motion: {
          intensity: 'subtle',
          principles: ['Fast reveals', 'Respect reduced motion'],
        },
        customization: {
          editableKeys: ['brand.colors.accent'],
        },
      }),
    });
    const spec = generation.spec;

    assert.equal(generation.source, 'model');
    assert.equal(spec.brand.colors.accent, '#2563eb');
    assert.equal(spec.positioning.tagline, 'A premium operating manual.');
  });

  it('falls back when the injected model response is invalid', async () => {
    const generation = await generateCreatorManualDesignSpecWithProvenance({
      auditReport: report,
      modelClient: async () => ({ version: 1 }),
    });
    const spec = generation.spec;

    assert.equal(generation.source, 'fallback');
    assert.match(generation.fallbackReason ?? '', /ZodError|Required/);
    assert.equal(spec.brand.name, 'Operator Lab Manual');
    assert.equal(
      spec.brand.colors.accent,
      buildFallbackCreatorManualDesignSpec(report).brand.colors.accent,
    );
  });

  it('records fallback provenance when the model client is disabled', async () => {
    const generation = await generateCreatorManualDesignSpecWithProvenance({
      auditReport: report,
      modelClient: null,
    });

    assert.equal(generation.source, 'fallback');
    assert.equal(generation.fallbackReason, 'model_client_disabled');
    assert.equal(generation.spec.brand.name, 'Operator Lab Manual');
  });
});
