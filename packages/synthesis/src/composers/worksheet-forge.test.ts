/**
 * Tests for worksheet-forge.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  composeWorksheets,
  decomposeBodyToFields,
  detectDecisionBranches,
} from './worksheet-forge';
import type { CanonRef, CodexClient, ComposeInput } from '../types';

function makeCanon(id: string, type: string, body: string, title?: string): CanonRef {
  return { id, payload: { type, title: title ?? id, body } };
}

describe('decomposeBodyToFields', () => {
  test('detects subheadings as text_long fields', () => {
    const body = [
      '## Map your value ladder',
      'Some prose.',
      '## Price each tier',
      'More prose.',
    ].join('\n');
    const fields = decomposeBodyToFields(body);
    assert.ok(fields.length >= 2);
    const labels = fields.map((f) => f.label);
    assert.ok(labels.includes('Map your value ladder'));
    assert.ok(labels.includes('Price each tier'));
  });

  test('detects imperative bullets as text_short fields', () => {
    const body = [
      '- You stop chasing every platform.',
      '- You pick one channel and ship for 90 days.',
    ].join('\n');
    const fields = decomposeBodyToFields(body);
    assert.ok(fields.length >= 2);
    assert.equal(fields[0]!.type, 'text_short');
  });

  test('returns at least one field on empty input (graceful default)', () => {
    const fields = decomposeBodyToFields('');
    assert.ok(fields.length >= 1);
  });
});

describe('detectDecisionBranches', () => {
  test('finds "if X, do Y" branches', () => {
    const body =
      "If your CAC is over $500, do not scale yet. If your retention is above 60%, double down on paid acquisition.";
    const branches = detectDecisionBranches(body);
    assert.ok(branches.length >= 1);
    assert.ok(branches[0]!.trigger.toLowerCase().includes('cac'));
  });

  test('returns empty when no branches present', () => {
    const branches = detectDecisionBranches('Plain prose with no conditional.');
    assert.equal(branches.length, 0);
  });
});

describe('composeWorksheets (with mocked Codex)', () => {
  function makeMockCodex(): CodexClient {
    return {
      run: async (_prompt: string) =>
        JSON.stringify({
          setupQuestion: 'Before you do this, write down your starting point.',
          outputRubric: "You'll know it's done when each row has a number.",
          estimatedMinutes: 15,
        }),
    };
  }

  test('emits one worksheet per eligible canon', async () => {
    const canons: CanonRef[] = [
      makeCanon(
        'fw1',
        'framework',
        '## Map the ladder\nDo step 1.\n## Price\nDo step 2.',
        'Value Ladder',
      ),
      makeCanon(
        'pb1',
        'playbook',
        '- You map your value ladder.\n- You price each tier.',
        'Pricing Playbook',
      ),
      makeCanon('skip', 'aphorism', 'Generic.'),
    ];
    const input: ComposeInput = {
      runId: 'r1',
      canons,
      channelProfile: { creatorName: 'Test' },
      voiceMode: 'first_person',
      creatorName: 'Test',
    };
    const worksheets = await composeWorksheets(input, { codex: makeMockCodex() });
    assert.equal(worksheets.length, 2);
    for (const w of worksheets) {
      assert.ok(w.fields.length > 0);
      assert.ok(w.setupQuestion.length > 0);
      assert.ok(w.outputRubric.length > 0);
      assert.equal(typeof w.estimatedMinutes, 'number');
    }
  });

  test('emits decision_branch field when body contains conditionals', async () => {
    const canons: CanonRef[] = [
      makeCanon(
        'fw',
        'framework',
        '## Decide pricing\nIf your LTV is above $1000, charge premium. ',
        'Decide Pricing',
      ),
    ];
    const input: ComposeInput = {
      runId: 'r2',
      canons,
      channelProfile: { creatorName: 'Test' },
      voiceMode: 'first_person',
      creatorName: 'Test',
    };
    const [worksheet] = await composeWorksheets(input, { codex: makeMockCodex() });
    assert.ok(worksheet);
    const decisionFields = worksheet.fields.filter((f) => f.type === 'decision_branch');
    assert.ok(decisionFields.length >= 1);
  });
});
