import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  isVerificationTimedOut,
  resolveVerificationStep,
} from './verification-status';

describe('verification status helpers', () => {
  it('maps unverified domains to pending', () => {
    assert.equal(
      resolveVerificationStep({ domainVerified: false, sslReady: false, liveUrl: null }),
      'pending',
    );
  });

  it('maps verified domains without ssl to ssl provisioning', () => {
    assert.equal(
      resolveVerificationStep({ domainVerified: true, sslReady: false, liveUrl: null }),
      'ssl_provisioning',
    );
  });

  it('maps verified ssl domains with live url to live', () => {
    assert.equal(
      resolveVerificationStep({
        domainVerified: true,
        sslReady: true,
        liveUrl: 'https://learn.example.com',
        deploymentStatus: 'live',
      }),
      'live',
    );
  });

  it('maps verified ssl domains without a live deployment to deploying', () => {
    assert.equal(
      resolveVerificationStep({
        domainVerified: true,
        sslReady: true,
        liveUrl: null,
        deploymentStatus: 'building',
      }),
      'deploying',
    );
  });

  it('times out after 24 hours', () => {
    const now = new Date('2026-05-02T12:00:00Z');
    assert.equal(
      isVerificationTimedOut('2026-05-01T11:59:59Z', now),
      true,
    );
    assert.equal(
      isVerificationTimedOut('2026-05-01T12:00:01Z', now),
      false,
    );
  });
});
