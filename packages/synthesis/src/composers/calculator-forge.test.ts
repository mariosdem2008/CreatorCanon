/**
 * Tests for calculator-forge.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  composeCalculators,
  evaluateFormula,
  extractQuantifiedClaims,
} from './calculator-forge';
import type { CanonRef, CodexClient, ComposeInput } from '../types';

describe('extractQuantifiedClaims', () => {
  test('extracts dollar amounts', () => {
    const claims = extractQuantifiedClaims('Average deal $5,000. Premium tier $25,000.');
    assert.ok(claims.length >= 2);
    assert.equal(claims[0]!.kind, 'currency');
  });

  test('extracts percentages', () => {
    const claims = extractQuantifiedClaims('CAC payback in 3 months. Retention rate is 70%.');
    const pct = claims.filter((c) => c.kind === 'percentage');
    assert.ok(pct.length >= 1);
    assert.equal(pct[0]!.value, 70);
  });

  test('extracts ROI multipliers', () => {
    const claims = extractQuantifiedClaims('Expect 5x ROI on cold outreach.');
    const roi = claims.filter((c) => c.kind === 'roi_multiplier');
    assert.equal(roi.length, 1);
    assert.equal(roi[0]!.value, 5);
  });

  test('extracts months payback', () => {
    const claims = extractQuantifiedClaims('Payback period is 6 months payback.');
    const months = claims.filter((c) => c.kind === 'months_payback');
    assert.equal(months.length, 1);
  });

  test('extracts LTV/CAC ratio', () => {
    const claims = extractQuantifiedClaims('Healthy SaaS shows 3:1 LTV to CAC.');
    const ratios = claims.filter((c) => c.kind === 'ltv_cac_ratio');
    assert.equal(ratios.length, 1);
  });
});

describe('evaluateFormula', () => {
  test('evaluates simple multiplication', () => {
    const out = evaluateFormula('a * b', { a: 10, b: 5 });
    assert.equal(out, 50);
  });

  test('respects operator precedence', () => {
    const out = evaluateFormula('a + b * c', { a: 1, b: 2, c: 3 });
    assert.equal(out, 7);
  });

  test('honours parentheses', () => {
    const out = evaluateFormula('(a + b) * c', { a: 1, b: 2, c: 3 });
    assert.equal(out, 9);
  });

  test('handles division', () => {
    const out = evaluateFormula('a / b', { a: 10, b: 4 });
    assert.equal(out, 2.5);
  });

  test('throws on missing variable', () => {
    assert.throws(() => evaluateFormula('a + b', { a: 1 }));
  });

  test('throws on disallowed identifier', () => {
    // No keywords like Math.sqrt allowed.
    assert.throws(() => evaluateFormula('Math.sqrt(a)', { a: 9 }));
  });

  test('handles numeric literals', () => {
    const out = evaluateFormula('a * 12', { a: 100 });
    assert.equal(out, 1200);
  });

  test('handles unary minus', () => {
    const out = evaluateFormula('-a + b', { a: 3, b: 10 });
    assert.equal(out, 7);
  });
});

describe('composeCalculators (with mocked Codex)', () => {
  function makeMockCodex(): CodexClient {
    return {
      run: async (_prompt: string) =>
        JSON.stringify({
          title: 'LTV Calculator',
          description: 'Estimate customer lifetime value.',
          variables: [
            {
              id: 'monthlyRevenue',
              label: 'Monthly revenue per customer',
              type: 'currency',
              defaultValue: 100,
            },
            {
              id: 'lifetimeMonths',
              label: 'Average customer lifetime (months)',
              type: 'months',
              defaultValue: 12,
            },
          ],
          formula: 'monthlyRevenue * lifetimeMonths',
          outputLabel: 'Lifetime value',
          outputUnit: '$',
          interpretation: 'A 3:1 LTV-to-CAC means healthy unit economics.',
        }),
    };
  }

  test('emits a calculator per claim cluster meeting the threshold', async () => {
    const canons: CanonRef[] = [
      {
        id: 'c1',
        payload: {
          type: 'framework',
          title: 'Unit economics',
          body:
            'Average deal $5,000. Lifetime $50,000. CAC $2,000. Healthy 3:1 LTV to CAC. Payback 6 months payback. Premium tier $25,000.',
        },
      },
    ];
    const input: ComposeInput = {
      runId: 'r1',
      canons,
      channelProfile: { creatorName: 'Test' },
      voiceMode: 'first_person',
      creatorName: 'Test',
    };
    const calcs = await composeCalculators(input, { codex: makeMockCodex() });
    assert.ok(calcs.length >= 1);
    const first = calcs[0]!;
    assert.ok(first.variables.length >= 2);
    assert.ok(first.formula.length > 0);
    // Formula must evaluate without throwing under default values.
    const defaults: Record<string, number> = {};
    for (const v of first.variables) defaults[v.id] = v.defaultValue;
    const result = evaluateFormula(first.formula, defaults);
    assert.equal(typeof result, 'number');
  });

  test('skips creators with too few quantified claims', async () => {
    const canons: CanonRef[] = [
      { id: 'c1', payload: { type: 'framework', body: 'No numbers here.' } },
    ];
    const input: ComposeInput = {
      runId: 'r2',
      canons,
      channelProfile: { creatorName: 'Test' },
      voiceMode: 'first_person',
      creatorName: 'Test',
    };
    const calcs = await composeCalculators(input, { codex: makeMockCodex() });
    assert.equal(calcs.length, 0);
  });

  test('rejects calculators whose variable id is __proto__ (prototype-pollution defense)', async () => {
    // Codex output is non-deterministic; if it ever names a variable __proto__,
    // assigning to defaults[id] would mutate Object.prototype. We must reject.
    const malicious: CodexClient = {
      run: async () =>
        JSON.stringify({
          title: 'Bad Calculator',
          description: '',
          variables: [
            { id: '__proto__', label: 'x', type: 'currency', defaultValue: 1 },
            { id: 'y', label: 'y', type: 'currency', defaultValue: 1 },
          ],
          formula: 'y',
          outputLabel: 'out',
          outputUnit: '$',
          interpretation: '',
        }),
    };
    const canons: CanonRef[] = [
      {
        id: 'c1',
        payload: {
          type: 'framework',
          body:
            'Average deal $5,000. Lifetime $50,000. CAC $2,000. 3:1 LTV to CAC. Payback 6 months payback. Premium tier $25,000.',
        },
      },
    ];
    const input: ComposeInput = {
      runId: 'r-evil',
      canons,
      channelProfile: { creatorName: 'Test' },
      voiceMode: 'first_person',
      creatorName: 'Test',
    };
    const calcs = await composeCalculators(input, { codex: malicious });
    assert.equal(calcs.length, 0, 'malicious calculator must be filtered out');
    // Belt-and-braces: confirm Object.prototype was not polluted.
    assert.equal(({} as any).__proto__?.['1'], undefined);
  });

  test('rejects calculators with non-identifier variable id', async () => {
    const malicious: CodexClient = {
      run: async () =>
        JSON.stringify({
          title: 'Bad Calculator',
          description: '',
          variables: [
            { id: 'x.y', label: 'x', type: 'currency', defaultValue: 1 },
          ],
          formula: 'x',
          outputLabel: 'out',
          outputUnit: '$',
          interpretation: '',
        }),
    };
    const canons: CanonRef[] = [
      {
        id: 'c1',
        payload: {
          type: 'framework',
          body:
            'Average deal $5,000. Lifetime $50,000. CAC $2,000. 3:1 LTV to CAC. Payback 6 months payback. Premium tier $25,000.',
        },
      },
    ];
    const input: ComposeInput = {
      runId: 'r-bad',
      canons,
      channelProfile: { creatorName: 'Test' },
      voiceMode: 'first_person',
      creatorName: 'Test',
    };
    const calcs = await composeCalculators(input, { codex: malicious });
    assert.equal(calcs.length, 0);
  });
});
