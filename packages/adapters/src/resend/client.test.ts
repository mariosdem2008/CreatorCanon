import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { buildSendPayload } from './client';

test('buildSendPayload converts SendEmailInput to Resend API shape', () => {
  const element = { type: 'div', props: {}, key: null } as const;
  const payload = buildSendPayload({
    to: 'a@b.com',
    subject: 'hi',
    react: element,
    from: 'noreply@creatorcanon.app',
  });
  assert.equal(payload.subject, 'hi');
  assert.equal(payload.to, 'a@b.com');
  assert.equal(payload.from, 'noreply@creatorcanon.app');
  assert.strictEqual(payload.react, element);
});

test('buildSendPayload defaults from when not set', () => {
  const element = { type: 'div', props: {}, key: null } as const;
  const payload = buildSendPayload({
    to: 'a@b.com',
    subject: 'hi',
    react: element,
  });
  assert.equal(payload.from, 'CreatorCanon <noreply@creatorcanon.app>');
});

test('buildSendPayload propagates reply_to in Resend snake_case', () => {
  const element = { type: 'div', props: {}, key: null } as const;
  const payload = buildSendPayload({
    to: 'a@b.com',
    subject: 'hi',
    react: element,
    replyTo: 'support@creatorcanon.app',
  });
  assert.equal((payload as unknown as { reply_to?: string }).reply_to, 'support@creatorcanon.app');
});
