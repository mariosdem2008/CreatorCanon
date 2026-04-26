'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { createResendClient } from '@creatorcanon/adapters';
import { parseServerEnv } from '@creatorcanon/core';
import { getDb, withDbRetry } from '@creatorcanon/db';
import { allowlistEmail } from '@creatorcanon/db/schema';

import AccessRequestedEmail from '@/emails/AccessRequestedEmail';

const OPERATOR_EMAIL =
  process.env.OPERATOR_ALERT_EMAIL ?? 'mariosdemosthenous11@gmail.com';

export async function requestAccess(formData: FormData): Promise<void> {
  const rawEmail = (formData.get('email') as string | null)?.trim().toLowerCase();
  if (!rawEmail || !rawEmail.includes('@') || rawEmail.length < 5) {
    redirect('/request-access?status=invalid');
  }

  // Best-effort IP capture for abuse triage (operator-only, not shown to users).
  const hdrs = await headers();
  const forwarded = hdrs.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() ?? null;

  const db = getDb();
  await withDbRetry(
    () =>
      db
        .insert(allowlistEmail)
        .values({
          email: rawEmail,
          approved: false,
          requestedByIp: ip,
        })
        .onConflictDoNothing(),
    { label: 'request-access:insert' },
  );

  // Best-effort operator notification. Never throw — the creator's submission
  // must succeed even if email delivery fails or RESEND_API_KEY is unset.
  try {
    const env = parseServerEnv(process.env);
    if (env.RESEND_API_KEY) {
      const resend = createResendClient(env);
      await resend.send({
        to: OPERATOR_EMAIL,
        subject: `Alpha access request — ${rawEmail}`,
        react: AccessRequestedEmail({
          email: rawEmail!,
          ip,
          submittedAt: new Date().toISOString(),
        }) as Parameters<typeof resend.send>[0]['react'],
      });
    }
  } catch (err) {
    console.error('[request-access] operator notify failed (non-blocking):', err);
  }

  redirect('/request-access?status=submitted');
}
