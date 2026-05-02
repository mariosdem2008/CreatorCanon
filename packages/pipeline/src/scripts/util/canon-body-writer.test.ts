import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { detectRefusalPattern, MIN_BODY_WORDS_FALLBACK } from './canon-body-writer';

describe('detectRefusalPattern', () => {
  test('detects "I can\'t produce" refusal', () => {
    const body = "I can't produce a valid cited body from this input because no transcript segment UUIDs were provided.";
    assert.equal(detectRefusalPattern(body), true);
  });

  test('detects "I cannot write" refusal', () => {
    const body = "I cannot write the canon body without segment UUIDs.";
    assert.equal(detectRefusalPattern(body), true);
  });

  test('detects "the source section is empty"', () => {
    const body = "the source section is empty";
    assert.equal(detectRefusalPattern(body), true);
  });

  test('detects "no transcript segment uuids"', () => {
    const body = "the prompt contains no transcript segment uuids or woven item labels";
    assert.equal(detectRefusalPattern(body), true);
  });

  test('does NOT flag legitimate first-person prose that uses "I cannot" but is long enough', () => {
    // 200+ words body that happens to contain "I cannot" non-refusally.
    // The under-length guard only triggers when the body is BOTH short AND
    // matches a refusal pattern.
    const longBody = (
      "I cannot overstate how important this is. " +
      "The mechanism is well-documented across the literature. " +
      "Researchers have studied this for decades. ".repeat(60)
    );
    assert.equal(detectRefusalPattern(longBody), false);
  });

  test('does NOT flag normal-length operator body', () => {
    const body = (
      "I do not sell leads. I sell movement. I map the value ladder before I build the AI sales system. " +
      "I want to know where the money starts, where it compounds, and where it leaks. ".repeat(20)
    );
    assert.equal(detectRefusalPattern(body), false);
  });

  test('flags suspiciously short bodies (under MIN_BODY_WORDS_FALLBACK = 100)', () => {
    const body = "Short body about delegation upstream. You should learn this before scaling.";
    assert.equal(detectRefusalPattern(body), true);
  });

  test('flags empty body', () => {
    assert.equal(detectRefusalPattern(''), true);
  });

  test('MIN_BODY_WORDS_FALLBACK is 100', () => {
    assert.equal(MIN_BODY_WORDS_FALLBACK, 100);
  });
});
