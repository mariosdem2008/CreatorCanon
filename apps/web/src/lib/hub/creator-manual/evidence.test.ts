import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import {
  buildSourceTimestampUrl,
  buildYouTubeTimestampUrl,
  formatCreatorManualTimestamp,
  resolveEvidenceReferences,
} from './evidence';
import {
  findCreatorManualPublicTextIssues,
  isCreatorManualPublicTextSafe,
} from './sanitize';
import { sampleCreatorManualManifest } from './sampleManifest';

test('timestamp formatting supports minute and hour labels', () => {
  assert.equal(formatCreatorManualTimestamp(0), '0:00');
  assert.equal(formatCreatorManualTimestamp(65), '1:05');
  assert.equal(formatCreatorManualTimestamp(3661), '1:01:01');
  assert.equal(formatCreatorManualTimestamp(-10), '0:00');
});

test('youtube timestamp URL generation clamps seconds', () => {
  assert.equal(buildYouTubeTimestampUrl('abc123', 125), 'https://www.youtube.com/watch?v=abc123&t=125s');
  assert.equal(buildYouTubeTimestampUrl('abc123', -5), 'https://www.youtube.com/watch?v=abc123&t=0s');
});

test('source timestamp URL falls back to source url for non-youtube records', () => {
  const source = sampleCreatorManualManifest.sources.find((record) => record.id === 'src-workshop-notes');
  assert.ok(source);
  assert.equal(buildSourceTimestampUrl(source, 95), 'https://example.com/workshop-notes');
});

test('evidence references resolve source and segment pairs', () => {
  const [resolved] = resolveEvidenceReferences(sampleCreatorManualManifest, [
    { sourceId: 'src-positioning-roundtable', segmentId: 'seg-audience-job' },
  ]);

  assert.ok(resolved);
  assert.equal(resolved.source?.id, 'src-positioning-roundtable');
  assert.equal(resolved.segment?.id, 'seg-audience-job');
  assert.equal(resolved.timestampLabel, '2:05');
  assert.equal(resolved.url, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=125s');
  assert.equal(resolved.missingReason, null);
});

test('evidence resolution degrades on missing refs', () => {
  const [missingSource, missingSegment] = resolveEvidenceReferences(sampleCreatorManualManifest, [
    { sourceId: 'missing-source' },
    { sourceId: 'src-positioning-roundtable', segmentId: 'missing-segment' },
  ]);

  assert.ok(missingSource);
  assert.ok(missingSegment);
  assert.equal(missingSource.source, null);
  assert.equal(missingSource.segment, null);
  assert.equal(missingSource.url, null);
  assert.equal(missingSource.missingReason, 'source');

  assert.equal(missingSegment.source?.id, 'src-positioning-roundtable');
  assert.equal(missingSegment.segment, null);
  assert.equal(missingSegment.missingReason, 'segment');
});

test('public text sanitizer detects uuid-like tokens and internal language', () => {
  const text = 'Publish after internal review for 123e4567-e89b-12d3-a456-426614174000, then send to tagger.';
  const issues = findCreatorManualPublicTextIssues(text);

  assert.deepEqual(issues.map((issue) => issue.kind), ['internal_language', 'uuid', 'internal_language']);
  assert.equal(isCreatorManualPublicTextSafe(text), false);
  assert.equal(isCreatorManualPublicTextSafe('Publish the practical creator manual.'), true);
});
