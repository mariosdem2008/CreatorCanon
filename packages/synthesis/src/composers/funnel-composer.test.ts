/**
 * Tests for funnel-composer.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  composeFunnel,
  pickShareCardCanons,
  type FunnelComposeInput,
} from './funnel-composer';
import type { CanonRef, CodexClient, CreatorConfig } from '../types';

describe('pickShareCardCanons', () => {
  test('prefers aphorisms', () => {
    const canons: CanonRef[] = [
      { id: 'a1', payload: { type: 'aphorism', title: 'A1', body: 'Short pithy quote.' } },
      { id: 'f1', payload: { type: 'framework', title: 'F1', body: 'Long framework body.' } },
    ];
    const picks = pickShareCardCanons(canons, 3);
    assert.equal(picks[0]?.id, 'a1');
  });

  test('limits to N picks', () => {
    const canons: CanonRef[] = Array.from({ length: 10 }, (_, i) => ({
      id: `a${i}`,
      payload: { type: 'aphorism', title: `Title ${i}`, body: `Body ${i}.` },
    }));
    const picks = pickShareCardCanons(canons, 3);
    assert.equal(picks.length, 3);
  });
});

describe('composeFunnel (with mocked Codex)', () => {
  function makeMockCodex(): CodexClient {
    return {
      run: async (prompt: string) => {
        if (prompt.includes('lead capture')) {
          return JSON.stringify({
            label: 'Get the free playbook',
            submitText: 'Send it',
            thankyouText: 'Check your inbox.',
          });
        }
        if (prompt.includes('paywall')) {
          return JSON.stringify({
            tagline: 'Ready for the full plan?',
            bullets: ['Action plan', 'Worksheets', 'Calculators'],
            ctaText: 'Unlock now',
          });
        }
        if (prompt.includes('login')) {
          return JSON.stringify({
            headline: 'Members only',
            ctaText: 'Sign in',
          });
        }
        if (prompt.includes('inline CTAs')) {
          return JSON.stringify({
            ctas: [
              { pageDepth: 'shallow', text: 'Try the free tool', href: '/tool' },
              { pageDepth: 'mid', text: 'Get the playbook', href: '/playbook' },
              { pageDepth: 'deep', text: 'Join the list', href: '/list' },
            ],
          });
        }
        if (prompt.includes('share-card')) {
          return JSON.stringify({
            title: 'A pithy claim',
            quote: 'You earn the right to niche down.',
          });
        }
        return JSON.stringify({});
      },
    };
  }

  function baseInput(goal: FunnelComposeInput['productGoal']): FunnelComposeInput {
    const canons: CanonRef[] = [
      { id: 'a1', payload: { type: 'aphorism', title: 'You earn the right', body: 'Pithy quote.' } },
      { id: 'a2', payload: { type: 'aphorism', title: 'Niche down', body: 'Niche down before you scale.' } },
    ];
    const creatorConfig: CreatorConfig = {
      brand: { primaryColor: '#000000' },
      ctas: { primary: { label: 'Start', href: '/start' } },
    };
    return {
      runId: 'r1',
      canons,
      channelProfile: { creatorName: 'Test' },
      voiceMode: 'first_person',
      creatorName: 'Test',
      productGoal: goal,
      creatorConfig,
    };
  }

  test('lead_magnet emits emailCapture, share cards, inline CTAs', async () => {
    const result = await composeFunnel(baseInput('lead_magnet'), { codex: makeMockCodex() });
    assert.equal(result.goal, 'lead_magnet');
    assert.ok(result.emailCapture);
    assert.equal(result.paywall, undefined);
    assert.equal(result.login, undefined);
    assert.ok(result.shareCardTemplates.length > 0);
    assert.ok(result.inlineCtas.length === 3);
  });

  test('paid_product emits paywall but not emailCapture', async () => {
    const result = await composeFunnel(baseInput('paid_product'), { codex: makeMockCodex() });
    assert.equal(result.goal, 'paid_product');
    assert.equal(result.emailCapture, undefined);
    assert.ok(result.paywall);
    assert.equal(result.login, undefined);
  });

  test('member_library emits login', async () => {
    const result = await composeFunnel(baseInput('member_library'), { codex: makeMockCodex() });
    assert.equal(result.goal, 'member_library');
    assert.equal(result.emailCapture, undefined);
    assert.equal(result.paywall, undefined);
    assert.ok(result.login);
  });
});
