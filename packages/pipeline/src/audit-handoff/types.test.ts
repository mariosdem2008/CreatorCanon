import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  creatorManualDesignSpecSchema,
  normalizeDesignSpecForHubMetadata,
} from './types';

function makeSpec() {
  return {
    version: 1,
    brand: {
      name: 'Creator Manual',
      tone: 'High-trust, direct, evidence-led.',
      colors: {
        background: '#f7f3ea',
        foreground: '#161513',
        surface: '#fffaf0',
        elevated: '#ffffff',
        border: '#d8cebd',
        muted: '#686056',
        accent: '#0f766e',
        accentForeground: '#ffffff',
        warning: '#b45309',
        success: '#15803d',
        typeMap: {
          lesson: '#0f766e',
          framework: '#1d4ed8',
          playbook: '#7c3aed',
        },
      },
      typography: {
        headingFamily: 'Georgia, serif',
        bodyFamily: 'Geist, ui-sans-serif, system-ui, sans-serif',
      },
      assets: {},
      style: { mode: 'custom' },
      labels: {
        evidence: 'Source clips',
        workshop: 'Operating workshop',
        library: 'Manual library',
      },
      radius: '8px',
      shadow: '0 18px 60px rgba(22, 21, 19, 0.14)',
    },
    positioning: {
      tagline: 'A source-backed operating manual.',
      homeHeadline: 'The Creator Manual',
      homeSummary: 'A practical map of the archive.',
    },
    motion: {
      intensity: 'standard',
      principles: ['Fast staggered reveals', 'No blocking animation'],
    },
    customization: {
      editableKeys: ['brand.colors.accent', 'brand.typography.headingFamily'],
    },
  } as const;
}

describe('Creator Manual design spec contract', () => {
  it('requires complete brand colors and customization metadata', () => {
    const spec = creatorManualDesignSpecSchema.parse(makeSpec());

    const metadata = normalizeDesignSpecForHubMetadata(spec);

    assert.equal(metadata.brand?.colors?.accent, '#0f766e');
    assert.equal(metadata.brand?.labels?.evidence, 'Source clips');
    assert.equal(metadata.tagline, 'A source-backed operating manual.');
  });

  it('rejects non-web asset URL protocols', () => {
    for (const unsafeUrl of [
      'javascript:alert(1)',
      'data:image/svg+xml,<svg></svg>',
      'file:///etc/passwd',
      'ftp://example.com/logo.png',
    ]) {
      const spec = makeSpec();
      assert.throws(() =>
        creatorManualDesignSpecSchema.parse({
          ...spec,
          brand: {
            ...spec.brand,
            assets: { logoUrl: unsafeUrl },
          },
        }),
      );
    }
  });

  it('rejects huge or control-character typography values', () => {
    for (const family of ['A'.repeat(161), 'Inter\nInjected', 'Inter; color:red', 'Inter { color: red }']) {
      const spec = makeSpec();
      assert.throws(() =>
        creatorManualDesignSpecSchema.parse({
          ...spec,
          brand: {
            ...spec.brand,
            typography: { ...spec.brand.typography, headingFamily: family },
          },
        }),
      );
    }
  });

  it('rejects malformed radius and shadow values', () => {
    const invalidValues = [
      { radius: 'calc(100% - 1px)' },
      { radius: '8px; color:red' },
      { radius: 'A'.repeat(33) },
      { shadow: '0 0 1px red; background: blue' },
      { shadow: `0 0 1px red\nbackground: blue` },
      { shadow: '0 0 1px red { background: blue }' },
      { shadow: 'A'.repeat(181) },
    ];

    for (const invalid of invalidValues) {
      const spec = makeSpec();
      assert.throws(() =>
        creatorManualDesignSpecSchema.parse({
          ...spec,
          brand: {
            ...spec.brand,
            ...invalid,
          },
        }),
      );
    }
  });

  it('rejects unsupported editable keys and oversized editable key arrays', () => {
    for (const editableKeys of [
      ['__proto__.polluted'],
      ['brand.colors.accent', 'arbitrary.path'],
      Array.from({ length: 40 }, () => 'brand.colors.accent'),
    ]) {
      const spec = makeSpec();
      assert.throws(() =>
        creatorManualDesignSpecSchema.parse({
          ...spec,
          customization: { editableKeys },
        }),
      );
    }
  });
});
