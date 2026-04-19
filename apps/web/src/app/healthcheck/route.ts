import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = async () => {
  return NextResponse.json({
    ok: true,
    service: 'atlas-web',
    version: process.env.NEXT_PUBLIC_GIT_SHA ?? 'dev',
    time: new Date().toISOString(),
  });
};
