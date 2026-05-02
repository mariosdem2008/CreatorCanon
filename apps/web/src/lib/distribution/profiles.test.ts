import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createDistributionProfileDraft,
  getDistributionProfileOption,
  isDistributionProfileType,
  profileRequiresBackend,
} from './profiles';

describe('distribution profile config', () => {
  it('creates a public profile draft with no backend-owned config', () => {
    const draft = createDistributionProfileDraft('public');

    assert.equal(draft.type, 'public');
    assert.deepEqual(draft.gatingRules, []);
    assert.equal(draft.espProvider, null);
    assert.equal(draft.oauthProvider, null);
  });

  it('creates lead magnet defaults with email capture UI copy', () => {
    const draft = createDistributionProfileDraft('lead_magnet');

    assert.equal(draft.type, 'lead_magnet');
    assert.equal(draft.espProvider, 'generic_webhook');
    assert.equal(draft.gatingRules[0]?.requirement, 'email');
    assert.match(draft.funnel.emailCapture.headline, /Keep reading/);
  });

  it('creates member defaults with Discord OAuth selected first', () => {
    const draft = createDistributionProfileDraft('member_library');

    assert.equal(draft.type, 'member_library');
    assert.equal(draft.oauthProvider, 'discord');
    assert.equal(draft.gatingRules[0]?.requirement, 'member');
  });

  it('validates profile type strings for form parsing', () => {
    assert.equal(isDistributionProfileType('paid_product'), true);
    assert.equal(isDistributionProfileType('bad_profile'), false);
  });

  it('reports backend dependency needs without implementing the backend', () => {
    assert.equal(profileRequiresBackend('public'), false);
    assert.equal(profileRequiresBackend('zip_export'), false);
    assert.equal(profileRequiresBackend('lead_magnet'), true);
    assert.equal(profileRequiresBackend('paid_product'), true);
    assert.equal(profileRequiresBackend('member_library'), true);
  });

  it('returns option metadata for UI cards', () => {
    const option = getDistributionProfileOption('paid_product');

    assert.equal(option.label, 'Paid product');
    assert.ok(option.badge);
    assert.equal(option.backendOwner, 'Claude');
  });
});
