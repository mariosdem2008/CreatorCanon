import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { shapeChannelProfile, shapeCanonNode, shapePageBrief } from '../get-run-audit';

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
    });
    assert.equal(view?.creatorName, 'Duncan');
    assert.equal(view?.niche, 'AI automations');
    assert.deepEqual(view?.creatorTerminology, ['blueprint', 'Make.com', 'Chat2BT']);
  });

  it('handles missing fields gracefully', () => {
    const view = shapeChannelProfile({});
    assert.equal(view?.creatorName, null);
    assert.equal(view?.niche, null);
    assert.deepEqual(view?.creatorTerminology, []);
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
  it('extracts type, title, whenToUse, and pageWorthiness', () => {
    const view = shapeCanonNode({
      id: 'cn_abc',
      type: 'framework',
      payload: {
        title: 'Proposal Intake Framework',
        whenToUse: 'Use before generating any proposal.',
        pageWorthinessScore: 85,
      },
    });
    assert.equal(view.id, 'cn_abc');
    assert.equal(view.type, 'framework');
    assert.equal(view.title, 'Proposal Intake Framework');
    assert.equal(view.whenToUse, 'Use before generating any proposal.');
    assert.equal(view.pageWorthinessScore, 85);
  });

  it('handles missing payload fields', () => {
    const view = shapeCanonNode({ id: 'cn_x', type: 'lesson', payload: {} });
    assert.equal(view.title, null);
    assert.equal(view.whenToUse, null);
    assert.equal(view.pageWorthinessScore, null);
  });
});

describe('shapePageBrief', () => {
  it('extracts pageTitle, pageType, audienceQuestion, primaryCanonNodeIds', () => {
    const view = shapePageBrief({
      id: 'pb_1',
      position: 3,
      payload: {
        pageType: 'framework',
        pageTitle: 'Build the Proposal Generator',
        audienceQuestion: 'How do I close faster?',
        primaryCanonNodeIds: ['cn_a', 'cn_b'],
      },
    });
    assert.equal(view.pageType, 'framework');
    assert.equal(view.pageTitle, 'Build the Proposal Generator');
    assert.equal(view.audienceQuestion, 'How do I close faster?');
    assert.deepEqual(view.primaryCanonNodeIds, ['cn_a', 'cn_b']);
    assert.equal(view.position, 3);
  });

  it('falls back to safe defaults for missing fields', () => {
    const view = shapePageBrief({ id: 'pb_x', position: 0, payload: {} });
    assert.equal(view.pageType, 'lesson');
    assert.equal(view.pageTitle, '(Untitled)');
    assert.equal(view.audienceQuestion, null);
    assert.deepEqual(view.primaryCanonNodeIds, []);
  });
});
