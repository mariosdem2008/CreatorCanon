import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildVisualMomentYoutubeUrl,
  formatVisualMomentTimestamp,
  parseBodyReferences,
} from './body-references';

describe('parseBodyReferences', () => {
  it('detects segment citations and visual moment markers in body order', () => {
    const refs = parseBodyReferences(
      'Start [VM:vm_demo123]. Claim [a1b2c3d4-e5f6-7890-abcd-ef1234567890]. Later [vm_demo456].',
    );

    assert.deepEqual(
      refs.map((r) => ({ kind: r.kind, id: r.id, token: r.token })),
      [
        { kind: 'visualMoment', id: 'vm_demo123', token: '[VM:vm_demo123]' },
        { kind: 'segment', id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', token: '[a1b2c3d4-e5f6-7890-abcd-ef1234567890]' },
        { kind: 'visualMoment', id: 'vm_demo456', token: '[vm_demo456]' },
      ],
    );
  });

  it('does not treat non-vm bracketed tokens as visual moments', () => {
    const refs = parseBodyReferences('Ignore [cn_abc123456789] and [ex_001].');
    assert.deepEqual(refs, []);
  });
});

describe('formatVisualMomentTimestamp', () => {
  it('formats minute timestamps', () => {
    assert.equal(formatVisualMomentTimestamp(65_000), '1:05');
  });

  it('formats hour timestamps', () => {
    assert.equal(formatVisualMomentTimestamp(3_665_000), '1:01:05');
  });
});

describe('buildVisualMomentYoutubeUrl', () => {
  it('builds a YouTube deep link at the visual moment timestamp', () => {
    assert.equal(
      buildVisualMomentYoutubeUrl('abc123', 65_900),
      'https://youtube.com/watch?v=abc123&t=65s',
    );
  });

  it('returns null without a YouTube id', () => {
    assert.equal(buildVisualMomentYoutubeUrl(null, 65_900), null);
  });
});
