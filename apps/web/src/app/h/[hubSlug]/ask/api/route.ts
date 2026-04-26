// apps/web/src/app/h/[hubSlug]/ask/api/route.ts
//
// Mock grounded-chat endpoint. Returns canned answers for the 5 example
// questions; everything else returns the unsupported response shape.

import { NextResponse } from 'next/server';

import { askRequestSchema } from '@/lib/hub/chat/schema';
import { lookupMockAnswer } from '@/lib/hub/chat/mockAnswers';
import { mockManifest } from '@/lib/hub/manifest/mockManifest';

export const runtime = 'nodejs';

export async function POST(req: Request, { params }: { params: { hubSlug: string } }) {
  if (params.hubSlug !== mockManifest.hubSlug) {
    return NextResponse.json({ error: 'Hub not found' }, { status: 404 });
  }
  const body = await req.json().catch(() => null);
  const parsed = askRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Bad request', issues: parsed.error.issues }, { status: 400 });
  }
  const answer = lookupMockAnswer(parsed.data.question);
  return NextResponse.json(answer);
}
