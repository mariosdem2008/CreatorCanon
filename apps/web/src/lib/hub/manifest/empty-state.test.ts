// apps/web/src/lib/hub/manifest/empty-state.test.ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import {
  citationUrl,
  formatTimestampLabel,
  resolveAccentColor,
  ACCENT_COLORS,
  safeCitationHref,
  safeSourceTitle,
} from './empty-state';

test('citationUrl: uses citation.url when present', () => {
  const cit = { url: 'https://example.com/x', timestampStart: 100 };
  const vid = { youtubeId: 'YT123' };
  assert.equal(citationUrl(cit, vid), 'https://example.com/x');
});

test('citationUrl: synthesizes from youtubeId + timestampStart when url missing', () => {
  const cit = { url: undefined, timestampStart: 261 };
  const vid = { youtubeId: 'YT123' };
  assert.equal(citationUrl(cit, vid), 'https://www.youtube.com/watch?v=YT123&t=261s');
});

test('citationUrl: floors fractional timestamps', () => {
  const cit = { url: undefined, timestampStart: 261.7 };
  const vid = { youtubeId: 'YT123' };
  assert.equal(citationUrl(cit, vid), 'https://www.youtube.com/watch?v=YT123&t=261s');
});

test('formatTimestampLabel: mm:ss for under one hour', () => {
  assert.equal(formatTimestampLabel(0),    '0:00');
  assert.equal(formatTimestampLabel(5),    '0:05');
  assert.equal(formatTimestampLabel(65),   '1:05');
  assert.equal(formatTimestampLabel(261),  '4:21');
  assert.equal(formatTimestampLabel(3599), '59:59');
});

test('formatTimestampLabel: h:mm:ss for one hour and over', () => {
  assert.equal(formatTimestampLabel(3600), '1:00:00');
  assert.equal(formatTimestampLabel(3661), '1:01:01');
});

test('resolveAccentColor: returns input when in palette', () => {
  for (const color of ACCENT_COLORS) {
    assert.equal(resolveAccentColor(color), color);
  }
});

test('resolveAccentColor: falls back to slate for unknown', () => {
  assert.equal(resolveAccentColor('neon-pink' as never), 'slate');
  assert.equal(resolveAccentColor(undefined as never),   'slate');
});

test('safeCitationHref returns null instead of watch?v=null', () => {
  const href = safeCitationHref(
    { url: undefined, timestampStart: 42 },
    { youtubeId: null },
  );
  assert.equal(href, null);
});

test('safeCitationHref rejects stale citation urls containing watch?v=null', () => {
  const href = safeCitationHref(
    { url: 'https://www.youtube.com/watch?v=null&t=42s', timestampStart: 42 },
    { youtubeId: null },
  );
  assert.equal(href, null);
});

test('safeCitationHref rejects unsafe citation url protocols', () => {
  assert.equal(
    safeCitationHref({ url: 'javascript:alert(1)', timestampStart: 42 }, { youtubeId: null }),
    null,
  );
  assert.equal(
    safeCitationHref({ url: 'data:text/html,<script>alert(1)</script>', timestampStart: 42 }, { youtubeId: null }),
    null,
  );
  assert.equal(
    safeCitationHref({ url: 'javascript:alert(1)', timestampStart: 42 }, { youtubeId: 'YT123' }),
    'https://www.youtube.com/watch?v=YT123&t=42s',
  );
});

test('safeSourceTitle converts weak titles to stable ordinal labels', () => {
  assert.equal(safeSourceTitle('Untitled', 3), 'Source 3');
  assert.equal(safeSourceTitle('Untitled source', 4), 'Source 4');
  assert.equal(safeSourceTitle('Untitled video', 5), 'Source 5');
  assert.equal(safeSourceTitle('Source · 18 min', 6), 'Source 6');
  assert.equal(safeSourceTitle('Source - 18 min', 7), 'Source 7');
  assert.equal(safeSourceTitle('Build a Proposal Generator', 1), 'Build a Proposal Generator');
});
