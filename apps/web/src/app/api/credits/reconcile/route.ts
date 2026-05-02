/**
 * GET /api/credits/reconcile
 *
 * Vercel Cron entrypoint (see apps/web/vercel.json — schedule "0 3 * * *").
 *
 * Walks every credit_event, sums per (userId, kind), compares to the
 * materialized credit_balance, and self-heals drift. Drift reports go to
 * console.warn (Sentry-routable in production via the existing log pipeline).
 *
 * Auth: Vercel Cron sets `Authorization: Bearer <CRON_SECRET>` on the
 * request. We accept the request when:
 *   - Authorization header matches `Bearer ${process.env.CRON_SECRET}`, OR
 *   - the caller is authed AND `isAdmin` (manual trigger from an admin).
 *
 *   200 { result: { scanned, drifted, healed } }
 *   401 — neither cron secret nor admin session
 *   500 — reconciler threw
 */

import { NextResponse } from 'next/server';

import { auth } from '@creatorcanon/auth';
import { runReconciliation } from '@creatorcanon/synthesis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authz = req.headers.get('authorization') ?? '';
  const cronOk =
    cronSecret !== undefined &&
    cronSecret.length > 0 &&
    authz === `Bearer ${cronSecret}`;

  let adminOk = false;
  if (!cronOk) {
    const session = await auth();
    adminOk = Boolean(session?.user?.isAdmin);
  }

  if (!cronOk && !adminOk) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await runReconciliation();
    return NextResponse.json({ result });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[api/credits/reconcile] failed', err);
    return NextResponse.json(
      { error: 'Reconciler failed', message: (err as Error).message ?? 'unknown' },
      { status: 500 },
    );
  }
}
