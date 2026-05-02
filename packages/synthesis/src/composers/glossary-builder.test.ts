/**
 * Tests for glossary-builder.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  composeGlossary,
  extractCandidateTerms,
  termSlug,
} from './glossary-builder';
import type { CanonRef, CodexClient, ComposeInput } from '../types';

describe('extractCandidateTerms', () => {
  test('finds capitalized multi-word terms appearing 3+ times across canons', () => {
    const canons: CanonRef[] = [
      { id: 'c1', payload: { body: 'Linoleic Acid is everywhere. Linoleic Acid matters.' } },
      { id: 'c2', payload: { body: 'Linoleic Acid is the focus today.' } },
      { id: 'c3', payload: { body: 'Other content here.' } },
    ];
    const terms = extractCandidateTerms(canons);
    const labels = terms.map((t) => t.term.toLowerCase());
    assert.ok(labels.includes('linoleic acid'));
  });

  test('does not return terms that appear < 3 times', () => {
    const canons: CanonRef[] = [
      { id: 'c1', payload: { body: 'Random Phrase.' } },
      { id: 'c2', payload: { body: 'Other content.' } },
    ];
    const terms = extractCandidateTerms(canons);
    assert.equal(terms.length, 0);
  });

  test('attaches every canon id where the term appears', () => {
    const canons: CanonRef[] = [
      { id: 'c1', payload: { body: 'Reactive Oxygen Species are byproducts.' } },
      { id: 'c2', payload: { body: 'Reactive Oxygen Species in mitochondria.' } },
      { id: 'c3', payload: { body: 'Reactive Oxygen Species again.' } },
      { id: 'c4', payload: { body: 'No mention here.' } },
    ];
    const terms = extractCandidateTerms(canons);
    const ros = terms.find((t) => t.term.toLowerCase() === 'reactive oxygen species');
    assert.ok(ros);
    assert.deepEqual(ros!.canonIds.sort(), ['c1', 'c2', 'c3']);
  });

  test('skips noisy stopword-leading phrases', () => {
    const canons: CanonRef[] = [
      { id: 'c1', payload: { body: 'The Big Picture. The Big Picture. The Big Picture.' } },
    ];
    const terms = extractCandidateTerms(canons);
    const stopwordy = terms.find((t) => /^the\b/i.test(t.term));
    assert.equal(stopwordy, undefined);
  });
});

describe('termSlug', () => {
  test('lowercases + dashifies', () => {
    assert.equal(termSlug('Linoleic Acid'), 'linoleic-acid');
  });
  test('strips punctuation', () => {
    assert.equal(termSlug('AMP-activated Protein Kinase'), 'amp-activated-protein-kinase');
  });
});

function makeMockCodex(): CodexClient {
  return {
    run: async (prompt: string) => {
      if (prompt.includes('glossary definition')) {
        return JSON.stringify({
          definition:
            'A polyunsaturated omega-6 fatty acid found in seed oils and many whole foods.',
        });
      }
      return JSON.stringify({});
    },
  };
}

function baseInput(canons: CanonRef[]): ComposeInput {
  return {
    runId: 'r1',
    canons,
    channelProfile: {
      archetype: 'science-explainer',
      voiceMode: 'third_person_editorial',
      creatorName: 'Test Scientist',
    },
    voiceMode: 'third_person_editorial',
    creatorName: 'Test Scientist',
  };
}

describe('composeGlossary (with mocked Codex)', () => {
  test('emits one GlossaryEntry per extracted term', async () => {
    const canons: CanonRef[] = [
      { id: 'c1', payload: { body: 'Linoleic Acid is here. Linoleic Acid matters.' } },
      { id: 'c2', payload: { body: 'Linoleic Acid context.' } },
    ];
    const result = await composeGlossary(baseInput(canons), {
      codex: makeMockCodex(),
    });
    assert.ok(result.entries.length >= 1);
    const entry = result.entries.find((e) => e.term.toLowerCase() === 'linoleic acid');
    assert.ok(entry);
    assert.ok(entry!.definition.length > 0);
    assert.deepEqual(entry!.appearsInCanonIds.sort(), ['c1', 'c2']);
  });

  test('returns empty entries when no terms detected', async () => {
    const canons: CanonRef[] = [
      { id: 'c1', payload: { body: 'short' } },
    ];
    const result = await composeGlossary(baseInput(canons), {
      codex: makeMockCodex(),
    });
    assert.equal(result.entries.length, 0);
  });
});
