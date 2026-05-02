import assert from 'node:assert/strict';
import test from 'node:test';

import { parseYouTubeChannelInput } from './url';

test('parses handle-only channel input', () => {
  assert.deepEqual(parseYouTubeChannelInput('@CreatorCanon'), {
    kind: 'handle',
    value: 'CreatorCanon',
    originalUrl: '@CreatorCanon',
  });
});

test('parses youtube handle url with videos path', () => {
  assert.deepEqual(parseYouTubeChannelInput('https://www.youtube.com/@CreatorCanon/videos'), {
    kind: 'handle',
    value: 'CreatorCanon',
    originalUrl: 'https://www.youtube.com/@CreatorCanon/videos',
  });
});

test('parses channel id and legacy username urls', () => {
  assert.equal(parseYouTubeChannelInput('https://www.youtube.com/channel/UC123').kind, 'channelId');
  assert.equal(parseYouTubeChannelInput('https://youtube.com/user/CreatorCanon').kind, 'username');
});

test('rejects custom channel urls', () => {
  assert.throws(() => parseYouTubeChannelInput('https://www.youtube.com/c/CreatorName'), {
    message: 'channel_url_unsupported',
  });
});

test('rejects non-youtube domains', () => {
  assert.throws(() => parseYouTubeChannelInput('https://example.com/@CreatorCanon'), {
    message: 'channel_url_not_youtube',
  });
});

test('rejects video urls', () => {
  assert.throws(() => parseYouTubeChannelInput('https://www.youtube.com/watch?v=abc'), {
    message: 'channel_url_unsupported',
  });
});
