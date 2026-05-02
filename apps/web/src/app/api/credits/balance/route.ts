/**
 * GET /api/credits/balance
 *
 * Returns the authed user's current balance for all 3 credit kinds.
 * Used by the dashboard EntitlementsBadge (Phase E, Codex side).
 *
 *   200 { balances: { hours: 12, builder_credits: 230, chat_credits: 850 } }
 *   401 — caller not authenticated
 */

import { NextResponse } from 'next/server';

import { auth } from '@creatorcanon/auth';
import { getDb } from '@creatorcanon/db';
import { DrizzleCreditLedger, getBalance } from '@creatorcanon/synthesis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getDb();
  const store = new DrizzleCreditLedger(db);
  const balances = await getBalance(store, session.user.id);
  return NextResponse.json({ balances });
}
