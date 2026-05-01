import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeTranscriptText, DEFAULT_SUBSTITUTIONS } from '../sanitize';

describe('sanitizeTranscriptText', () => {
  it('replaces Chat2BT with ChatGPT', () => {
    const result = sanitizeTranscriptText('We send the data to Chat2BT and parse the response.', DEFAULT_SUBSTITUTIONS);
    assert.equal(result, 'We send the data to ChatGPT and parse the response.');
  });

  it('replaces multiple occurrences in a single pass', () => {
    const result = sanitizeTranscriptText('Chat2BT first, then Chat2BT again.', DEFAULT_SUBSTITUTIONS);
    assert.equal(result, 'ChatGPT first, then ChatGPT again.');
  });

  it('is case sensitive on the canonical brand to avoid false positives', () => {
    // The Whisper error is exactly "Chat2BT" (with that capitalization).
    // We DO NOT replace lowercased "chat2bt" the same way — at this point
    // it's not the same artifact and we want explicit visibility.
    const result = sanitizeTranscriptText('chat2bt is different', DEFAULT_SUBSTITUTIONS);
    assert.equal(result, 'chat2bt is different');
  });

  it('does not match inside other words', () => {
    const result = sanitizeTranscriptText('preChat2BTpost', DEFAULT_SUBSTITUTIONS);
    // \b boundaries — "Chat2BT" embedded in a longer identifier is NOT replaced
    assert.equal(result, 'preChat2BTpost');
  });

  it('returns the input unchanged when the map is empty', () => {
    const result = sanitizeTranscriptText('Anything goes here', {});
    assert.equal(result, 'Anything goes here');
  });

  it('handles empty input', () => {
    const result = sanitizeTranscriptText('', DEFAULT_SUBSTITUTIONS);
    assert.equal(result, '');
  });

  it('preserves surrounding punctuation', () => {
    const result = sanitizeTranscriptText('"Chat2BT," she said.', DEFAULT_SUBSTITUTIONS);
    assert.equal(result, '"ChatGPT," she said.');
  });

  it('accepts a custom substitution map', () => {
    const result = sanitizeTranscriptText('Make . com is the tool', { 'Make \\. com': 'Make.com' });
    assert.equal(result, 'Make.com is the tool');
  });
});
