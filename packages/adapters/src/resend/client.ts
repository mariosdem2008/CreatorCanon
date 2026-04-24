import { Resend } from 'resend';
import { CanonError } from '@creatorcanon/core';
import type { ServerEnv } from '@creatorcanon/core';
import { z } from 'zod';

/**
 * Minimal structural type for a React element — we avoid depending on
 * `react` directly in `@creatorcanon/adapters` so downstream packages pick their
 * own React version. At call time Resend validates this for us.
 */
export interface ReactEmailElement {
  readonly type: unknown;
  readonly props: unknown;
  readonly key?: string | number | null;
}

const sendEmailInputSchema = z.object({
  to: z.union([z.string().email(), z.array(z.string().email()).min(1)]),
  subject: z.string().min(1),
  /** React template element rendered to HTML by Resend. */
  react: z.custom<ReactEmailElement>(
    (val) =>
      typeof val === 'object' && val !== null && 'type' in (val as object),
    { message: 'react must be a valid React element' },
  ),
  from: z.string().email().optional(),
  replyTo: z.string().email().optional(),
  headers: z.record(z.string()).optional(),
});

export type SendEmailInput = z.infer<typeof sendEmailInputSchema>;

export interface SendEmailResult {
  id: string;
}

export interface ResendAdapterClient {
  readonly raw: Resend;
  send(input: SendEmailInput): Promise<SendEmailResult>;
}

const DEFAULT_FROM = 'CreatorCanon <noreply@creatorcanon.app>';

/**
 * Shape-only helper (pure, testable): converts our camelCase SendEmailInput
 * into the snake_case shape the Resend SDK expects. Exposed so tests can
 * lock the mapping without a live Resend key.
 */
export function buildSendPayload(input: SendEmailInput) {
  sendEmailInputSchema.parse(input);
  return {
    from: input.from ?? DEFAULT_FROM,
    to: input.to,
    subject: input.subject,
    react: input.react,
    ...(input.replyTo ? { reply_to: input.replyTo } : {}),
    ...(input.headers ? { headers: input.headers } : {}),
  };
}

/**
 * NOTE (contract ambiguity): `RESEND_API_KEY` is optional in
 * `@creatorcanon/core/env` because some deploys (local dev) skip email. We throw
 * an explicit `CanonError` at factory time in that case so the caller gets
 * a consistent error shape rather than a runtime null-deref deep inside the
 * Resend SDK.
 */
export const createResendClient = (env: ServerEnv): ResendAdapterClient => {
  if (!env.RESEND_API_KEY) {
    throw new CanonError({
      code: 'resend_disabled',
      category: 'internal',
      message:
        'RESEND_API_KEY is not configured; email delivery is disabled in this environment.',
    });
  }

  const raw = new Resend(env.RESEND_API_KEY);

  return {
    raw,
    async send(input) {
      const payload = buildSendPayload(input);
      const result = await raw.emails.send(
        payload as Parameters<typeof raw.emails.send>[0],
      );
      if (result.error) {
        throw new CanonError({
          code: 'resend_send_failed',
          category: 'internal',
          message: `Resend send failed: ${result.error.message}`,
        });
      }
      return { id: result.data?.id ?? 'unknown' };
    },
  };
};
