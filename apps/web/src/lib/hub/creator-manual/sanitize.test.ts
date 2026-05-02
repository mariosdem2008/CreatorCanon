import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import { sampleCreatorManualManifest } from './sampleManifest';
import {
  findCreatorManualManifestPublicTextIssues,
  isCreatorManualManifestPublicTextSafe,
} from './sanitize';

test('manifest public text scanner accepts the sample manifest', () => {
  assert.equal(isCreatorManualManifestPublicTextSafe(sampleCreatorManualManifest), true);
});

test('manifest public text scanner reports nested public text leaks with paths', () => {
  const manifest = structuredClone(sampleCreatorManualManifest);
  manifest.pillars[0]!.description = 'Manual review: confirm 123e4567-e89b-12d3-a456-426614174000 before launch.';

  const issues = findCreatorManualManifestPublicTextIssues(manifest);

  assert.equal(issues.length, 2);
  assert.deepEqual(issues.map((issue) => issue.path), [
    ['pillars', 0, 'description'],
    ['pillars', 0, 'description'],
  ]);
});

test('manifest public text scanner ignores internal identifiers and URLs', () => {
  const manifest = structuredClone(sampleCreatorManualManifest);
  manifest.sources[0]!.id = '123e4567-e89b-12d3-a456-426614174000';
  manifest.sources[0]!.url = 'https://example.com/internal-review';

  assert.equal(isCreatorManualManifestPublicTextSafe(manifest), true);
});
