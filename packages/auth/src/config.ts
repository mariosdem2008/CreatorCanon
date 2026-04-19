// Edge-safe NextAuth config. No DB adapter, no Node-only imports.
// The full config (with DrizzleAdapter) is assembled in `./index.ts` for the
// Node runtime; this edge slice is consumed by `apps/web/src/middleware.ts`
// so route protection works on the edge without pulling in `postgres`.

import type { NextAuthConfig } from 'next-auth';
import Google from 'next-auth/providers/google';

import './types';

// Paths that require a signed-in user. The middleware `authorized` callback
// reads this list; keep it in sync with the route groups under apps/web.
const PROTECTED_PREFIXES = ['/app', '/admin'] as const;

// Paths restricted to admins (users with `isAdmin = true`).
const ADMIN_PREFIXES = ['/admin'] as const;

export const authConfig = {
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      // `offline` + `prompt=consent` so we reliably receive a refresh token.
      // YouTube scopes are requested separately during the channel-connect
      // flow (ticket 3.x) via an incremental OAuth step, not here.
      authorization: {
        params: {
          prompt: 'consent',
          access_type: 'offline',
          response_type: 'code',
          scope: [
          'openid',
          'email',
          'profile',
          'https://www.googleapis.com/auth/youtube.readonly',
        ].join(' '),
        },
      },
      // Keep false: with multiple providers it would enable account-takeover
      // via provider-verified email. Google-only is safe today but leave this
      // off to block future unsafe combinations.
      allowDangerousEmailAccountLinking: false,
    }),
  ],
  pages: {
    signIn: '/sign-in',
    error: '/sign-in',
  },
  session: { strategy: 'jwt' },
  callbacks: {
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      const isAuthed = !!auth?.user;
      const isAdmin = auth?.user?.isAdmin === true;

      const needsAuth = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
      const needsAdmin = ADMIN_PREFIXES.some((p) => pathname.startsWith(p));

      if (needsAdmin) return isAuthed && isAdmin;
      if (needsAuth) return isAuthed;
      return true;
    },
    jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
        token.isAdmin = user.isAdmin ?? false;
      }
      return token;
    },
    session({ session, token }) {
      // JWT has Record<string,unknown> index signature — cast to expected types.
      session.user.id = ((token.userId as string | undefined) ?? token.sub) ?? '';
      session.user.isAdmin = (token.isAdmin as boolean | undefined) ?? false;
      return session;
    },
  },
  trustHost: true,
} satisfies NextAuthConfig;
