'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { getDb } from '@creatorcanon/db';
import { allowlistEmail } from '@creatorcanon/db/schema';

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
  await db
    .insert(allowlistEmail)
    .values({
      email: rawEmail,
      approved: false,
      requestedByIp: ip,
    })
    .onConflictDoNothing();

  redirect('/request-access?status=submitted');
}
