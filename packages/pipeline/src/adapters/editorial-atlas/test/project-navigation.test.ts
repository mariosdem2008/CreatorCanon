import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { projectNavigation } from '../project-navigation';

describe('projectNavigation', () => {
  it('omits Highlights when none', () => {
    const nav = projectNavigation({ hasHighlights: false });
    assert.ok(!nav.primary.find((n) => n.label === 'Highlights'));
  });

  it('includes Highlights when present', () => {
    const nav = projectNavigation({ hasHighlights: true });
    assert.ok(nav.primary.find((n) => n.label === 'Highlights'));
  });
});
