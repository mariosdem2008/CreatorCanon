import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { assertEditorialAtlasManifest } from '../publish-run-as-hub';

describe('assertEditorialAtlasManifest', () => {
  it('accepts Editorial Atlas v1 and v2 manifests', () => {
    assert.doesNotThrow(() =>
      assertEditorialAtlasManifest({
        schemaVersion: 'editorial_atlas_v1',
        pages: [],
      }),
    );
    assert.doesNotThrow(() =>
      assertEditorialAtlasManifest({
        schemaVersion: 'editorial_atlas_v2',
        pages: [],
      }),
    );
  });

  it('rejects non-Editorial Atlas manifests', () => {
    assert.throws(
      () =>
        assertEditorialAtlasManifest({
          schemaVersion: 'other_manifest_v1',
          pages: [],
        }),
      /Expected 'editorial_atlas_v1' or 'editorial_atlas_v2'/,
    );
  });
});
