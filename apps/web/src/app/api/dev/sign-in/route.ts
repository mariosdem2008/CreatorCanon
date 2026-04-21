import { randomUUID } from 'node:crypto';

import { eq, getDb } from '@creatorcanon/db';
import { user } from '@creatorcanon/db/schema';
import { encode } from 'next-auth/jwt';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (process.env.DEV_AUTH_BYPASS_ENABLED !== 'true') {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  const email = process.env.DEV_AUTH_BYPASS_EMAIL ?? '';
  if (!email) {
    return Response.json({ error: 'DEV_AUTH_BYPASS_EMAIL is not configured.' }, { status: 500 });
  }

  const requestUrl = new URL(request.url);
  const rawCallbackUrl = requestUrl.searchParams.get('callbackUrl');
  const browserMode = requestUrl.searchParams.get('browser') === '1';
  const tokenMode = requestUrl.searchParams.get('token') === '1';
  const callbackUrl =
    rawCallbackUrl != null && rawCallbackUrl.startsWith('/') && !rawCallbackUrl.startsWith('//')
      ? rawCallbackUrl
      : '/app';

  const db = getDb();
  const rows = await db
    .select({
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
      isAdmin: user.isAdmin,
    })
    .from(user)
    .where(eq(user.email, email.trim().toLowerCase()))
    .limit(1);

  const devUser = rows[0];
  if (!devUser) {
    return Response.json({ error: 'Configured dev user does not exist.' }, { status: 404 });
  }

  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    return Response.json({ error: 'AUTH_SECRET is not configured.' }, { status: 500 });
  }

  const cookieName = 'authjs.session-token';
  const token = await encode({
    secret,
    salt: cookieName,
    token: {
      sub: devUser.id,
      userId: devUser.id,
      email: devUser.email,
      name: devUser.name,
      picture: devUser.image,
      isAdmin: devUser.isAdmin,
      jti: randomUUID(),
    },
  });
  const maxAge = 30 * 24 * 60 * 60;

  if (tokenMode) {
    return Response.json({
      cookieName,
      token,
      maxAge,
    }, {
      headers: {
        'cache-control': 'no-store',
      },
    });
  }

  const response = NextResponse.redirect(new URL(callbackUrl, request.url));
  response.cookies.set(cookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: false,
    maxAge,
  });
  if (browserMode) {
    response.headers.set('content-type', 'text/html; charset=utf-8');
    return new Response(
      `<!doctype html><meta charset="utf-8"><title>Local dev sign-in</title><script>document.cookie=${JSON.stringify(`${cookieName}=${token}; Path=/; SameSite=Lax; Max-Age=${maxAge}`)}; location.replace(${JSON.stringify(callbackUrl)});</script>`,
      {
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store',
        },
      },
    );
  }
  return response;
}
