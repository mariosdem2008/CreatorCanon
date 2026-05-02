/**
 * GET /api/credits/events?kind=hours&limit=50&cursor=<iso>
 *
 * Paged event history for the authed user. Used by the billing/history UI
 * (Phase E, Codex side).
 *
 *   200 { events: CreditEventRow[], nextCursor: string | null }
 *   400 — bad params
 *   401 — caller not authenticated
 *
 * Cursor is the ISO `created_at` of the last returned row; results are
 * ordered DESC by created_at, so passing back the cursor pages forward.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { auth } from '@creatorcanon/auth';
import { and, desc, eq, getDb, lt } from '@creatorcanon/db';
import { creditEvent } from '@creatorcanon/db/schema';
import { isCreditKind } from '@creatorcanon/synthesis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const QuerySchema = z.object({
  kind: z.string().optional(),
  limit: z.coerce.number().int().positive().max(200).default(50),
  cursor: z.string().datetime().optional(),
});

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    kind: url.searchParams.get('kind') ?? undefined,
    limit: url.searchParams.get('limit') ?? undefined,
    cursor: url.searchParams.get('cursor') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Bad request', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { kind, limit, cursor } = parsed.data;
  if (kind !== undefined && !isCreditKind(kind)) {
    return NextResponse.json({ error: 'Bad kind' }, { status: 400 });
  }

  const db = getDb();

  const filters = [eq(creditEvent.userId, session.user.id)];
  if (kind) filters.push(eq(creditEvent.kind, kind));
  if (cursor) filters.push(lt(creditEvent.createdAt, new Date(cursor)));

  const rows = await db
    .select({
      id: creditEvent.id,
      kind: creditEvent.kind,
      delta: creditEvent.delta,
      source: creditEvent.source,
      reference: creditEvent.reference,
      createdAt: creditEvent.createdAt,
    })
    .from(creditEvent)
    .where(and(...filters))
    .orderBy(desc(creditEvent.createdAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const events = hasMore ? rows.slice(0, limit) : rows;
  const lastRow = events[events.length - 1];
  const nextCursor =
    hasMore && lastRow ? lastRow.createdAt.toISOString() : null;

  return NextResponse.json({ events, nextCursor });
}
