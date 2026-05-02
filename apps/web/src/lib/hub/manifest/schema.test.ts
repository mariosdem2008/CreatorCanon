import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import { hubManifestSchema } from './schema';
import { sampleCreatorManualManifest } from '../creator-manual/sampleManifest';

test('hub manifest: parses creator manual manifests', () => {
  const result = hubManifestSchema.safeParse(sampleCreatorManualManifest);
  assert.equal(result.success, true);
});

test('hub manifest: rejects unknown schema versions', () => {
  const result = hubManifestSchema.safeParse({
    ...sampleCreatorManualManifest,
    schemaVersion: 'wrong_version',
  });

  assert.equal(result.success, false);
});
