// Root middleware: wraps the edge-safe NextAuth instance. The `authorized`
// callback in @atlas/auth/config decides redirect vs. pass-through based on
// the requested pathname. Redirects to /sign-in are handled by NextAuth.

export { edgeAuth as default } from '@atlas/auth/middleware';

export const config = {
  // Run on everything except static assets, images, and the NextAuth API
  // itself (the handler must not be wrapped in auth middleware).
  matcher: [
    '/((?!api/auth|_next/static|_next/image|favicon.ico|monitoring|.*\\..*).*)',
  ],
};
