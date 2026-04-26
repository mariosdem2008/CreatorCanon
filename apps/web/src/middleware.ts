// Root middleware: wraps the edge-safe NextAuth instance. The `authorized`
// callback in @creatorcanon/auth/config decides redirect vs. pass-through based on
// the requested pathname. Redirects to /sign-in are handled by NextAuth.

export { edgeAuth as default } from '@creatorcanon/auth/middleware';

export const config = {
  // Run on everything except: static assets, images, NextAuth handler,
  // public hub pages (/h/*), the healthcheck endpoint, and the request-access
  // public form. Skipping these avoids an edge function invocation on every
  // public navigation.
  matcher: [
    '/((?!api/auth|_next/static|_next/image|favicon.ico|monitoring|h/|healthcheck|request-access|.*\\..*).*)',
  ],
};
