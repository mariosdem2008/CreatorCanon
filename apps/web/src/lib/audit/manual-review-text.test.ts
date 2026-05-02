import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  assertRewrittenParagraphPreservesTokens,
  buildParagraphRewritePrompt,
  findMissingPreservedTokens,
  rewriteParagraphRequestSchema,
  splitManualReviewParagraphs,
  updateCanonPayloadParagraph,
} from './manual-review-text';

describe('splitManualReviewParagraphs', () => {
  test('splits markdown-ish body text into reviewable paragraphs', () => {
    const paragraphs = splitManualReviewParagraphs('First paragraph.\n\n## Heading\n\nSecond paragraph.\nStill second.');

    assert.deepEqual(paragraphs, [
      'First paragraph.',
      '## Heading',
      'Second paragraph.\nStill second.',
    ]);
  });

  test('falls back to one paragraph for single-block bodies', () => {
    assert.deepEqual(splitManualReviewParagraphs('One compact body.'), ['One compact body.']);
  });
});

describe('rewriteParagraphRequestSchema', () => {
  test('accepts a paragraph and operator instruction', () => {
    const parsed = rewriteParagraphRequestSchema.parse({
      paragraph: 'This paragraph needs work.',
      instruction: 'Tighten the wording.',
    });

    assert.equal(parsed.paragraph, 'This paragraph needs work.');
    assert.equal(parsed.instruction, 'Tighten the wording.');
  });
});

describe('updateCanonPayloadParagraph', () => {
  test('replaces only the requested paragraph and records review metadata', () => {
    const updated = updateCanonPayloadParagraph(
      { title: 'Canon', body: 'Keep this.\n\nReplace me.\n\nKeep this too.' },
      {
        paragraph: 'Replace me.',
        rewrittenParagraph: 'Rewritten version.',
        instruction: 'Make it sharper.',
      },
    );

    assert.equal(updated.body, 'Keep this.\n\nRewritten version.\n\nKeep this too.');
    assert.equal(updated._manual_review?.lastInstruction, 'Make it sharper.');
    assert.equal(updated._manual_review?.rewriteCount, 1);
  });

  test('throws when the paragraph is not present', () => {
    assert.throws(() =>
      updateCanonPayloadParagraph(
        { body: 'Existing body.' },
        {
          paragraph: 'Missing paragraph.',
          rewrittenParagraph: 'No-op.',
          instruction: 'Try.',
        },
      ),
    );
  });
});

describe('buildParagraphRewritePrompt', () => {
  test('asks Codex for a JSON rewrite while preserving citations', () => {
    const prompt = buildParagraphRewritePrompt({
      paragraph: 'We use the offer first [11111111-1111-4111-8111-111111111111].',
      instruction: 'Make it more direct.',
      canonTitle: 'Grand Slam Offer',
    });

    assert.match(prompt, /JSON/);
    assert.match(prompt, /rewrittenParagraph/);
    assert.match(prompt, /preserve citation tokens/i);
    assert.match(prompt, /Grand Slam Offer/);
  });
});

describe('findMissingPreservedTokens', () => {
  test('requires rewritten paragraphs to preserve evidence and visual tokens exactly', () => {
    const original = 'Use the offer first [11111111-1111-4111-8111-111111111111] and show it [VM:vm_offer_1].';
    const rewritten = 'Use the offer first [11111111-1111-4111-8111-111111111111] without losing proof.';

    assert.deepEqual(findMissingPreservedTokens(original, rewritten), ['[VM:vm_offer_1]']);
    assert.throws(() => assertRewrittenParagraphPreservesTokens(original, rewritten));
  });

  test('passes when all preserved tokens remain unchanged', () => {
    const original = 'Proof lives here [cn_c29bb69e-577] and here [VM:vm_offer_1].';
    const rewritten = 'Proof still lives here [cn_c29bb69e-577] and here [VM:vm_offer_1].';

    assert.deepEqual(findMissingPreservedTokens(original, rewritten), []);
    assert.doesNotThrow(() => assertRewrittenParagraphPreservesTokens(original, rewritten));
  });
});
