// apps/web/src/lib/hub/chat/schema.test.ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import { askRequestSchema, askResponseSchema } from './schema';

test('ask request: minimal valid', () => {
  const r = askRequestSchema.safeParse({
    hubId: 'hub_1',
    question: 'How does Ali plan his week?',
    filters: { topicSlugs: [], sourceVideoIds: [], pageIds: [] },
  });
  assert.equal(r.success, true);
});

test('ask request: question must be non-empty', () => {
  const r = askRequestSchema.safeParse({
    hubId: 'hub_1', question: '',
    filters: { topicSlugs: [], sourceVideoIds: [], pageIds: [] },
  });
  assert.equal(r.success, false);
});

test('ask response: successful answer with citationId-tagged bullets', () => {
  const r = askResponseSchema.safeParse({
    answer: {
      summary: 'Ali plans his week on Sunday by choosing 3 outcomes.',
      bullets: [
        { text: 'Review last week before planning the next.',  citationIds: ['c1'] },
        { text: 'Choose 1–3 meaningful outcomes for the week.', citationIds: ['c2'] },
      ],
      confidence: 'strong',
      evidenceQuality: 'strong',
      limitations: null,
    },
    citations: [
      { id: 'c1', sourceVideoId: 'vid_001', videoTitle: 'How I plan',
        timestampStart: 261, timestampEnd: 318, timestampLabel: '04:21',
        excerpt: 'Plan on Sunday.', url: 'https://yt/?v=x&t=261s' },
      { id: 'c2', sourceVideoId: 'vid_002', videoTitle: 'My system',
        timestampStart: 100, timestampEnd: 150, timestampLabel: '01:40',
        excerpt: 'Three outcomes per week.', url: 'https://yt/?v=y&t=100s' },
    ],
    relatedPages: [
      { id: 'pg_1', title: 'How I plan my week', type: 'playbook', slug: 'how-i-plan-my-week' },
    ],
    suggestedFollowups: ['What is the weekly review checklist?'],
  });
  assert.equal(r.success, true);
});

test('ask response: unsupported variant', () => {
  const r = askResponseSchema.safeParse({
    answer: null,
    unsupported: true,
    message: 'Not enough source support.',
    partialMatches: [{ type: 'topic', title: 'Productivity', slug: 'productivity' }],
    suggestedSearches: ['weekly planning'],
  });
  assert.equal(r.success, true);
});

test('ask response: cannot mix unsupported with answer', () => {
  const r = askResponseSchema.safeParse({
    answer: { summary: 'x', bullets: [], confidence: 'strong', evidenceQuality: 'strong', limitations: null },
    unsupported: true,
    message: 'x',
    partialMatches: [],
    suggestedSearches: [],
  });
  assert.equal(r.success, false);
});
