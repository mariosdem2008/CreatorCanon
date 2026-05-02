import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildAuditCtaUrl, buildAuditGeneratedProjectUrl } from './audit-view-model';

describe('archive audit view model', () => {
  it('preserves old request access CTA for unauthenticated visitors', () => {
    assert.equal(
      buildAuditCtaUrl('https://www.youtube.com/@creator'),
      '/request-access?source=archive-audit&channel=https%3A%2F%2Fwww.youtube.com%2F%40creator',
    );
  });

  it('builds project URL for generated hubs', () => {
    assert.equal(buildAuditGeneratedProjectUrl('prj_123'), '/app/projects/prj_123');
  });
});
