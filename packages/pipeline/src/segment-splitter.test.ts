import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { splitSegment, type WhisperSegment } from './segment-splitter';

test('short segments are returned unchanged', () => {
  const input: WhisperSegment = { startMs: 0, endMs: 8000, text: 'Hello there.' };
  const out = splitSegment(input, { maxDurationMs: 12000 });
  assert.equal(out.length, 1);
  const first = out[0];
  assert.ok(first, 'expected at least one sub-segment');
  assert.equal(first.text, 'Hello there.');
});

test('long segment without sentence boundaries splits at maxDurationMs', () => {
  const input: WhisperSegment = {
    startMs: 0,
    endMs: 30000,
    text: 'hello world hello world hello world hello world hello world',
  };
  const out = splitSegment(input, { maxDurationMs: 12000 });
  assert.ok(out.length >= 2, `expected >=2, got ${out.length}`);
  for (const s of out) assert.ok(s.endMs - s.startMs <= 12000, `segment ${s.endMs - s.startMs}ms exceeds 12000`);
});

test('long segment WITH sentence boundaries splits on those boundaries', () => {
  const input: WhisperSegment = {
    startMs: 0,
    endMs: 30000,
    text: 'First sentence goes here. Second one follows! And third? Four.',
  };
  const out = splitSegment(input, { maxDurationMs: 12000 });
  assert.ok(out.length >= 2, `expected >=2 sub-segments, got ${out.length}`);
  const first = out[0];
  assert.ok(first, 'expected at least one sub-segment');
  assert.ok(/[.!?]\s*$/.test(first.text), `first sub-segment doesn't end in sentence punct: ${first.text}`);
});

test('preserves start/end continuity across sub-segments', () => {
  const input: WhisperSegment = { startMs: 1000, endMs: 31000, text: 'one. two. three. four. five.' };
  const out = splitSegment(input, { maxDurationMs: 8000 });
  assert.ok(out.length > 0, 'expected at least one sub-segment');
  for (let i = 0; i < out.length - 1; i += 1) {
    const cur = out[i];
    const next = out[i + 1];
    assert.ok(cur && next);
    assert.equal(cur.endMs, next.startMs, `gap at boundary ${i}`);
  }
  const first = out[0];
  const last = out[out.length - 1];
  assert.ok(first && last);
  assert.equal(first.startMs, 1000);
  assert.equal(last.endMs, 31000);
});

test('empty text produces no sub-segments', () => {
  const input: WhisperSegment = { startMs: 0, endMs: 5000, text: '' };
  const out = splitSegment(input, { maxDurationMs: 12000 });
  assert.equal(out.length, 0);
});
