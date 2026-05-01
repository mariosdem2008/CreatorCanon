// apps/web/src/app/h/[hubSlug]/ask/api/route.ts
//
// Mock grounded-chat endpoint. Returns canned answers for the 5 example
// questions; everything else returns the unsupported response shape.

import { NextResponse } from 'next/server';

import { askRequestSchema } from '@/lib/hub/chat/schema';
import { lookupMockAnswer } from '@/lib/hub/chat/mockAnswers';
import { loadEditorialAtlasManifest } from '../../manifest';

export const runtime = 'nodejs';

export async function POST(req: Request, { params }: { params: { hubSlug: string } }) {
  // loadEditorialAtlasManifest calls notFound() internally if the hub doesn't exist in R2.
  // We still need to return a proper 404 JSON response here since this is an API route.
  try {
    await loadEditorialAtlasManifest(params.hubSlug);
  } catch {
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
