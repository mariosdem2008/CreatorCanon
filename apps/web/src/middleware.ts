import { NextResponse, type NextRequest } from 'next/server';

import { edgeAuth } from '@creatorcanon/auth/middleware';
import {
  buildHubRoutePath,
  buildPerProjectHubRoutePath,
  getHubSubdomainFromHost,
} from '@/lib/hub/public-url';

type EdgeAuthMiddleware = (
  request: NextRequest,
) => Response | null | void | Promise<Response | null | void>;

const runAuthMiddleware = edgeAuth as unknown as EdgeAuthMiddleware;

// Root middleware: wraps the edge-safe NextAuth instance. The `authorized`
// callback in @creatorcanon/auth/config decides redirect vs. pass-through based on
// the requested pathname. Redirects to /sign-in are handled by NextAuth.

export default function middleware(request: NextRequest) {
  const perProjectHubPath = buildPerProjectHubRoutePath(
    process.env.HUB_ID,
    request.nextUrl.pathname,
  );
  if (perProjectHubPath) {
    return rewriteToPath(request, perProjectHubPath);
  }

  const hubSubdomain = getHubSubdomainFromHost(
    request.headers.get('host'),
    process.env.NEXT_PUBLIC_HUB_ROOT_DOMAIN,
  );

  if (hubSubdomain) {
    return rewriteToHubRoute(request, hubSubdomain);
  }

  return runAuthMiddleware(request);
}

function rewriteToHubRoute(request: NextRequest, hubSlug: string) {
  return rewriteToPath(request, buildHubRoutePath(hubSlug, request.nextUrl.pathname));
}

function rewriteToPath(request: NextRequest, pathname: string) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  return NextResponse.rewrite(url);
}

export const config = {
  // Run on everything except: static assets, images, NextAuth handler,
  // public hub pages (/h/*), the healthcheck endpoint, and the request-access
  // public form. Skipping these avoids an edge function invocation on every
  // public navigation.
  matcher: [
    '/((?!api/auth|_next/static|_next/image|favicon.ico|monitoring|h/|healthcheck|request-access|.*\\..*).*)',
  ],
};
