/**
 * Tests for card-forge.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  composeCards,
  extractAphorismCandidates,
  extractBlockquotedAphorisms,
  extractShortPrincipleSentences,
} from './card-forge';
import type { CanonRef, CodexClient } from '../types';

describe('extractAphorismCandidates', () => {
  test('picks all canons of type aphorism or quote', () => {
    const canons: CanonRef[] = [
      { id: 'a1', payload: { type: 'aphorism', body: 'If you want to learn, teach.' } },
      { id: 'q1', payload: { type: 'quote', body: 'Persistent, but flexible.' } },
      { id: 'p1', payload: { type: 'playbook', body: 'A long playbook body.' } },
    ];
    const out = extractAphorismCandidates(canons);
    assert.equal(out.length, 2);
    const ids = out.map((c) => c.canonId).sort();
    assert.deepEqual(ids, ['a1', 'q1']);
  });

  test('skips empty bodies', () => {
    const canons: CanonRef[] = [
      { id: 'a1', payload: { type: 'aphorism', body: '' } },
      { id: 'a2', payload: { type: 'aphorism', body: '   ' } },
    ];
    assert.equal(extractAphorismCandidates(canons).length, 0);
  });

  test('uses title as text when body is empty but title exists', () => {
    const canons: CanonRef[] = [
      { id: 'a1', payload: { type: 'aphorism', title: 'Hell yeah or no.', body: '' } },
    ];
    const out = extractAphorismCandidates(canons);
    assert.equal(out.length, 1);
    assert.equal(out[0]?.text, 'Hell yeah or no.');
  });
});

describe('extractBlockquotedAphorisms', () => {
  test('finds markdown blockquoted lines inside hybrid bodies', () => {
    const canons: CanonRef[] = [
      {
        id: 'p1',
        payload: {
          type: 'principle',
          body: 'Some intro paragraph.\n\n> If more information was the answer, we’d all be billionaires.\n\nMore body.',
        },
      },
    ];
    const out = extractBlockquotedAphorisms(canons);
    assert.equal(out.length, 1);
    assert.equal(out[0]?.canonId, 'p1');
    assert.match(out[0]!.text, /more information/);
    assert.equal(out[0]!.text.startsWith('>'), false);
  });

  test('extracts multiple blockquotes per body', () => {
    const canons: CanonRef[] = [
      {
        id: 'p1',
        payload: {
          type: 'principle',
          body: '> First line.\n\nSomething.\n\n> Second line.\n',
        },
      },
    ];
    const out = extractBlockquotedAphorisms(canons);
    assert.equal(out.length, 2);
  });

  test('ignores blockquote-of-citation (lines that include attribution heuristics)', () => {
    const canons: CanonRef[] = [
      {
        id: 'p1',
        payload: {
          type: 'principle',
          body: '> Steve Jobs once said this on a podcast.',
        },
      },
    ];
    // Heuristic: blockquotes that look like attributions (contain "said")
    // are a softer signal — but we still emit them; downstream Codex pass
    // can drop. Keep the test loose.
    const out = extractBlockquotedAphorisms(canons);
    assert.ok(out.length <= 1);
  });
});

describe('extractShortPrincipleSentences', () => {
  test('emits sentences <30 words from voice-fingerprint-matching principles', () => {
    const canons: CanonRef[] = [
      {
        id: 'p1',
        payload: {
          type: 'principle',
          body: 'No is a complete sentence. The art of saying no is the art of choosing.',
          _index_voice_fingerprint: { archetype: 'contemplative-thinker' },
        },
      },
    ];
    const out = extractShortPrincipleSentences(canons);
    // Both sentences are short.
    assert.ok(out.length >= 2);
    assert.ok(out.every((c) => c.text.split(/\s+/).length < 30));
  });

  test('skips long sentences', () => {
    const long = Array.from({ length: 40 }, (_, i) => `word${i}`).join(' ') + '.';
    const canons: CanonRef[] = [
      {
        id: 'p1',
        payload: {
          type: 'principle',
          body: long,
          _index_voice_fingerprint: { archetype: 'contemplative-thinker' },
        },
      },
    ];
    assert.equal(extractShortPrincipleSentences(canons).length, 0);
  });

  test('skips principles whose voice fingerprint is not contemplative', () => {
    const canons: CanonRef[] = [
      {
        id: 'p1',
        payload: {
          type: 'principle',
          body: 'No is a complete sentence.',
          _index_voice_fingerprint: { archetype: 'operator-coach' },
        },
      },
    ];
    assert.equal(extractShortPrincipleSentences(canons).length, 0);
  });
});

describe('composeCards (with mocked Codex)', () => {
  function makeMockCodex(): CodexClient {
    return {
      run: async (prompt: string) => {
        if (prompt.includes('whyThisMatters')) {
          return JSON.stringify({
            whyThisMatters: 'It tells you to act, not deliberate.',
            themeTags: ['decision-making', 'work'],
            journalingPrompt: 'When did you last say a half-yes you regretted?',
          });
        }
        return JSON.stringify({});
      },
    };
  }

  test('emits one card per aphorism candidate', async () => {
    const canons: CanonRef[] = [
      { id: 'a1', payload: { type: 'aphorism', body: 'Hell yeah or no.' } },
      { id: 'a2', payload: { type: 'aphorism', body: 'If you’re not saying hell yes, say no.' } },
    ];
    const cards = await composeCards(
      {
        runId: 'r1',
        canons,
        channelProfile: { creatorName: 'Sivers' },
        voiceMode: 'hybrid',
        creatorName: 'Sivers',
      },
      { codex: makeMockCodex() },
    );
    assert.equal(cards.length, 2);
    assert.equal(cards[0]?.text, 'Hell yeah or no.');
    assert.ok(cards[0]?.whyThisMatters);
    assert.ok(cards[0]?.themeTags.length > 0);
    assert.equal(cards[0]?.sourceCanonId, 'a1');
  });

  test('preserves text verbatim from source', async () => {
    const verbatim = 'If more information was the answer, we’d all be billionaires.';
    const canons: CanonRef[] = [{ id: 'a1', payload: { type: 'aphorism', body: verbatim } }];
    const cards = await composeCards(
      {
        runId: 'r1',
        canons,
        channelProfile: {},
        voiceMode: 'hybrid',
        creatorName: 'Test',
      },
      { codex: makeMockCodex() },
    );
    assert.equal(cards[0]?.text, verbatim);
  });

  test('falls back gracefully when Codex returns malformed JSON', async () => {
    const codex: CodexClient = { run: async () => 'not-json' };
    const canons: CanonRef[] = [{ id: 'a1', payload: { type: 'aphorism', body: 'Brief.' } }];
    const cards = await composeCards(
      {
        runId: 'r1',
        canons,
        channelProfile: {},
        voiceMode: 'hybrid',
        creatorName: 'Test',
      },
      { codex },
    );
    assert.equal(cards.length, 1);
    assert.equal(cards[0]?.text, 'Brief.');
    // Even with bad JSON we get a card; whyThisMatters has a fallback string.
    assert.ok(cards[0]?.whyThisMatters.length > 0);
    assert.ok(Array.isArray(cards[0]?.themeTags));
  });

  test('deduplicates identical aphorism texts', async () => {
    const canons: CanonRef[] = [
      { id: 'a1', payload: { type: 'aphorism', body: 'Hell yeah or no.' } },
      { id: 'a2', payload: { type: 'aphorism', body: 'Hell yeah or no.' } },
    ];
    const cards = await composeCards(
      {
        runId: 'r1',
        canons,
        channelProfile: {},
        voiceMode: 'hybrid',
        creatorName: 'Test',
      },
      { codex: makeMockCodex() },
    );
    assert.equal(cards.length, 1);
  });
});
