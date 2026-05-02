import assert from 'node:assert/strict';
import test from 'node:test';

import { fetchTranscriptSamples } from './transcripts';

test('fetchTranscriptSamples treats transcript fetch rejection as unavailable', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async () => {
    throw new Error('network timeout');
  };

  const result = await fetchTranscriptSamples([
    {
      id: 'vid1',
      title: 'Source video',
      description: '',
    },
  ]);

  assert.deepEqual(result, {
    samples: [],
    unavailableVideoIds: ['vid1'],
  });
});
