import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { resolveHubManifestSelector } from './manifest-selector';

describe('resolveHubManifestSelector', () => {
  it('uses the route slug for shared app hub rendering', () => {
    assert.deepEqual(resolveHubManifestSelector('demo', {}), {
      column: 'subdomain',
      value: 'demo',
    });
  });

  it('uses HUB_ID for per-creator Vercel projects', () => {
    assert.deepEqual(resolveHubManifestSelector('demo', { HUB_ID: 'hub_123' }), {
      column: 'id',
      value: 'hub_123',
    });
  });
});
