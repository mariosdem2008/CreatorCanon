import { NextResponse } from 'next/server';

const AUTH_COOKIE_NAMES = [
  'authjs.session-token',
  '__Secure-authjs.session-token',
  'authjs.csrf-token',
  '__Host-authjs.csrf-token',
  'authjs.callback-url',
  '__Secure-authjs.callback-url',
  'next-auth.session-token',
  '__Secure-next-auth.session-token',
  'next-auth.csrf-token',
  '__Host-next-auth.csrf-token',
  'next-auth.callback-url',
  '__Secure-next-auth.callback-url',
];

export async function GET(request: Request) {
  if (process.env.DEV_AUTH_BYPASS_ENABLED !== 'true') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const url = new URL('/sign-in', request.url);
  const response = NextResponse.redirect(url);
  for (const name of AUTH_COOKIE_NAMES) {
    response.cookies.set(name, '', {
      path: '/',
      expires: new Date(0),
    });
  }
  return response;
}
