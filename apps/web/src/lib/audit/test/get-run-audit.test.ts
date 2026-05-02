import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildR2PublicUrl, shapeChannelProfile, shapeCanonNode, shapePageBrief } from '../get-run-audit';

describe('shapeChannelProfile', () => {
  it('extracts creator-facing fields from raw payload', () => {
    const view = shapeChannelProfile({
      creatorName: 'Duncan',
      niche: 'AI automations',
      audience: 'Builders',
      dominantTone: 'practitioner',
      recurringPromise: 'Faster proposals',
      positioningSummary: 'Make.com guides',
      creatorTerminology: ['blueprint', 'Make.com', 'Chat2BT'],
      contentFormats: ['Tutorials', 'Live builds'],
      recurringThemes: ['Automation', 'AI'],
      whyPeopleFollow: 'Concrete builds you can ship',
      expertiseCategory: 'Operator',
      monetizationAngle: 'Templates',
    });
    assert.equal(view?.creatorName, 'Duncan');
    assert.equal(view?.niche, 'AI automations');
    assert.deepEqual(view?.creatorTerminology, ['blueprint', 'Make.com', 'Chat2BT']);
    assert.deepEqual(view?.contentFormats, ['Tutorials', 'Live builds']);
    assert.equal(view?.whyPeopleFollow, 'Concrete builds you can ship');
    assert.equal(view?.expertiseCategory, 'Operator');
    assert.equal(view?.monetizationAngle, 'Templates');
  });

  it('preserves the raw payload', () => {
    const raw = { creatorName: 'X', custom: 'extra' };
    const view = shapeChannelProfile(raw);
    assert.deepEqual(view?.payload, raw);
  });

  it('handles missing fields gracefully', () => {
    const view = shapeChannelProfile({});
    assert.equal(view?.creatorName, null);
    assert.equal(view?.niche, null);
    assert.deepEqual(view?.creatorTerminology, []);
    assert.deepEqual(view?.contentFormats, []);
  });

  it('returns null for null input', () => {
    assert.equal(shapeChannelProfile(null), null);
  });

  it('drops non-string entries from creatorTerminology', () => {
    const view = shapeChannelProfile({
      creatorTerminology: ['ok', 42, null, 'also-ok'],
    });
    assert.deepEqual(view?.creatorTerminology, ['ok', 'also-ok']);
  });
});

describe('shapeCanonNode', () => {
  it('extracts type, title, payload, scores, and source titles', () => {
    const view = shapeCanonNode({
      id: 'cn_abc',
      type: 'framework',
      payload: {
        title: 'Proposal Intake Framework',
        whenToUse: 'Use before generating any proposal.',
        summary: 'A four-step intake.',
      },
      sourceVideoIds: ['v1', 'v2'],
      sourceVideoTitles: ['Video A', 'Video B'],
      evidenceQuality: 'strong',
      origin: 'single_video',
      confidenceScore: 80,
      pageWorthinessScore: 85,
      specificityScore: 70,
      creatorUniquenessScore: 60,
      citationCount: 4,
      sourceCoverage: 2,
    });
    assert.equal(view.id, 'cn_abc');
    assert.equal(view.type, 'framework');
    assert.equal(view.title, 'Proposal Intake Framework');
    assert.equal(view.pageWorthinessScore, 85);
    assert.equal(view.evidenceQuality, 'strong');
    assert.deepEqual(view.sourceVideoTitles, ['Video A', 'Video B']);
    // The full payload travels through unchanged.
    assert.equal(view.payload.summary, 'A four-step intake.');
  });

  it('falls back to name or term when title is missing', () => {
    const view = shapeCanonNode({
      id: 'cn_x',
      type: 'definition',
      payload: { term: 'Chat2BT' },
      sourceVideoIds: [],
      sourceVideoTitles: [],
      evidenceQuality: null,
      origin: null,
      confidenceScore: null,
      pageWorthinessScore: null,
      specificityScore: null,
      creatorUniquenessScore: null,
      citationCount: null,
      sourceCoverage: null,
    });
    assert.equal(view.title, 'Chat2BT');
  });
});

describe('shapePageBrief', () => {
  it('extracts page metadata and canon node refs', () => {
    const view = shapePageBrief({
      id: 'pb_1',
      position: 3,
      payload: {
        pageType: 'framework',
        pageTitle: 'Build the Proposal Generator',
        audienceQuestion: 'How do I close faster?',
        openingHook: 'Most reps lose deals before the first call.',
        slug: 'proposal-generator',
        primaryCanonNodeIds: ['cn_a', 'cn_b'],
        supportingCanonNodeIds: ['cn_c'],
      },
      pageWorthinessScore: 90,
    });
    assert.equal(view.pageType, 'framework');
    assert.equal(view.pageTitle, 'Build the Proposal Generator');
    assert.equal(view.audienceQuestion, 'How do I close faster?');
    assert.equal(view.openingHook, 'Most reps lose deals before the first call.');
    assert.equal(view.slug, 'proposal-generator');
    assert.deepEqual(view.primaryCanonNodeIds, ['cn_a', 'cn_b']);
    assert.deepEqual(view.supportingCanonNodeIds, ['cn_c']);
    assert.equal(view.pageWorthinessScore, 90);
    assert.equal(view.position, 3);
  });

  it('falls back to safe defaults for missing fields', () => {
    const view = shapePageBrief({ id: 'pb_x', position: 0, payload: {}, pageWorthinessScore: null });
    assert.equal(view.pageType, 'lesson');
    assert.equal(view.pageTitle, '(Untitled)');
    assert.equal(view.audienceQuestion, null);
    assert.deepEqual(view.primaryCanonNodeIds, []);
    assert.deepEqual(view.supportingCanonNodeIds, []);
  });
});

describe('buildR2PublicUrl', () => {
  it('combines public base URL and R2 key', () => {
    assert.equal(
      buildR2PublicUrl('https://cdn.creatorcanon.test/assets/', 'workspaces/ws/runs/run/visual-moments/frame.jpg'),
      'https://cdn.creatorcanon.test/assets/workspaces/ws/runs/run/visual-moments/frame.jpg',
    );
  });

  it('returns null when base URL or key is missing', () => {
    assert.equal(buildR2PublicUrl('', 'workspaces/ws/frame.jpg'), null);
    assert.equal(buildR2PublicUrl('https://cdn.creatorcanon.test', null), null);
  });
});
