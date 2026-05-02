import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { resolveCreatorManualManifestMetadata } from '..';

describe('creator-manual metadata resolver', () => {
  it('maps normalized audit handoff metadata into manifest presentation fields', () => {
    const resolved = resolveCreatorManualManifestMetadata({
      metadata: {
        tagline: 'A source-backed operating manual.',
        homeHeadline: 'Evidence-Led Creator Manual',
        homeSummary: 'A practical hub organized around claims, clips, and reusable decisions.',
        brand: {
          name: 'Audit Manual',
          tone: 'Direct and practical.',
          colors: {
            accent: '#123456',
            typeMap: {
              lesson: '#0f766e',
              experiment: '#7c3aed',
            },
          },
          typography: {
            headingFamily: 'Inter, system-ui',
            bodyFamily: 'Source Sans 3, system-ui',
          },
          assets: {
            logoUrl: 'https://example.com/logo.png',
            heroImageUrl: 'javascript:alert(1)',
            patternImageUrl: 'https://example.com/x"),url(https://attacker.test/pixel)/*',
          },
          style: { mode: 'dark' },
          labels: {
            evidence: 'Receipts',
            workshop: 'Lab',
            library: 'Archive',
          },
          radius: 'lg',
          shadow: '0 18px 60px rgba(15, 23, 42, 0.12)',
        },
        designSpec: {
          version: 1,
          customization: { editableKeys: ['brand.name'] },
          motion: { intensity: 'subtle', principles: ['Keep transitions quiet.'] },
        },
      },
      creatorName: 'Fixture Creator',
      projectTitle: 'Fixture Project',
    });

    assert.equal(resolved.tagline, 'A source-backed operating manual.');
    assert.equal(resolved.home.headline, 'Evidence-Led Creator Manual');
    assert.equal(resolved.home.summary, 'A practical hub organized around claims, clips, and reusable decisions.');
    assert.equal(resolved.brand.name, 'Audit Manual');
    assert.equal(resolved.brand.tone, 'Direct and practical.');
    assert.equal(resolved.brand.tokens.colors.accent, '#123456');
    assert.equal(resolved.brand.tokens.colors.typeMap?.lesson, '#0f766e');
    assert.equal(resolved.brand.tokens.colors.typeMap?.experiment, '#7c3aed');
    assert.equal(resolved.brand.tokens.typography.headingFamily, 'Inter, system-ui');
    assert.equal(resolved.brand.tokens.typography.bodyFamily, 'Source Sans 3, system-ui');
    assert.equal(resolved.brand.tokens.radius, 'lg');
    assert.equal(resolved.brand.tokens.shadow, '0 18px 60px rgba(15, 23, 42, 0.12)');
    assert.equal(resolved.brand.style.mode, 'dark');
    assert.equal(resolved.brand.labels.evidence, 'Receipts');
    assert.equal(resolved.brand.labels.workshop, 'Lab');
    assert.equal(resolved.brand.labels.library, 'Archive');
    assert.equal(resolved.brand.assets?.logoUrl, 'https://example.com/logo.png');
    assert.equal(resolved.brand.assets?.heroImageUrl, undefined);
    assert.equal(resolved.brand.assets?.patternImageUrl, undefined);
  });

  it('keeps defaults when metadata contains unsafe or malformed presentation tokens', () => {
    const resolved = resolveCreatorManualManifestMetadata({
      metadata: {
        tagline: 'internal review source-backed manual.',
        homeHeadline: 'Internal review headline',
        brand: {
          colors: {
            accent: 'url(javascript:alert(1))',
            typeMap: {
              lesson: 'expression(alert(1))',
              'bad key': '#111111',
            },
          },
          style: { mode: 'javascript:alert(1)' },
          labels: {
            evidence: 'internal review receipts',
          },
          radius: 'calc(100vw + script)',
          shadow: '0 0 0 url(javascript:alert(1))',
        },
      },
      creatorName: 'Fixture Creator',
      projectTitle: 'Fixture Project',
    });

    assert.equal(resolved.tagline, 'editorial review source-backed manual.');
    assert.equal(resolved.home.headline, 'editorial review headline');
    assert.equal(resolved.brand.tokens.colors.accent, '#246b5f');
    assert.equal(resolved.brand.tokens.colors.typeMap?.lesson, '#246b5f');
    assert.equal(resolved.brand.tokens.colors.typeMap?.['bad key'], undefined);
    assert.equal(resolved.brand.style.mode, 'custom');
    assert.equal(resolved.brand.labels.evidence, 'editorial review receipts');
    assert.equal(resolved.brand.labels.workshop, 'Workshop');
    assert.equal(resolved.brand.tokens.radius, '8px');
    assert.equal(resolved.brand.tokens.shadow, '0 18px 60px rgba(25, 23, 22, 0.12)');
  });

  it('uses tagline as the home summary fallback for existing tagline-only hubs', () => {
    const resolved = resolveCreatorManualManifestMetadata({
      metadata: {
        tagline: 'A configured summary from existing hub metadata.',
      },
      creatorName: 'Fixture Creator',
      projectTitle: 'Fixture Project',
    });

    assert.equal(resolved.tagline, 'A configured summary from existing hub metadata.');
    assert.equal(resolved.home.headline, 'Fixture Project');
    assert.equal(resolved.home.summary, 'A configured summary from existing hub metadata.');
  });
});
