import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  addOxfordCommas,
  analyzeSentenceCadence,
  normalizeDashes,
  normalizeQuotes,
  polishBody,
} from './editorial-polish';

describe('normalizeDashes', () => {
  test('normalizes common dash variants between words to spaced em dashes', () => {
    assert.equal(
      normalizeDashes('Build -- ship - learn — repeat – compound.'),
      'Build — ship — learn — repeat — compound.',
    );
  });

  test('does not rewrite hyphenated words', () => {
    assert.equal(normalizeDashes('high-ticket low-friction offer'), 'high-ticket low-friction offer');
  });
});

describe('normalizeQuotes', () => {
  test('normalizes smart quotes to straight quotes', () => {
    assert.equal(normalizeQuotes('“This isn’t magic,” she said.'), '"This isn\'t magic," she said.');
  });
});

describe('addOxfordCommas', () => {
  test('adds an Oxford comma to simple three-item lists', () => {
    assert.equal(
      addOxfordCommas('You need strategy, systems and standards.'),
      'You need strategy, systems, and standards.',
    );
  });
});

describe('analyzeSentenceCadence', () => {
  test('flags three long sentences in a row', () => {
    const long = Array.from({ length: 36 }, (_, i) => `word${i}`).join(' ');
    const analysis = analyzeSentenceCadence(`${long}. ${long}. ${long}. Short.`);
    assert.equal(analysis.longSentenceRuns.length, 1);
    assert.equal(analysis.longSentenceRuns[0]?.count, 3);
  });

  test('flags low sentence-length variance', () => {
    const analysis = analyzeSentenceCadence('One two three four. Five six seven eight. Nine ten eleven twelve. Red blue green gold.');
    assert.equal(analysis.lowVariance, true);
  });
});

describe('polishBody', () => {
  test('applies deterministic transforms and returns change labels', () => {
    const result = polishBody('“Build -- ship, learn and compound,” I said.');
    assert.equal(result.body, '"Build — ship, learn, and compound," I said.');
    assert.deepEqual(result.changes, ['dashes', 'quotes', 'oxford_commas']);
  });
});
