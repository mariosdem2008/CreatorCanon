// NextAuth route handlers. Runs on the Node runtime so the DrizzleAdapter
// (postgres.js) works during the sign-in → DB write path.

import { handlers } from '@creatorcanon/auth';

// Cast through a minimal handler type so TS doesn't try to name a
// non-portable NextRequest symbol path from a nested pnpm resolution.
// Next.js runtime only cares about the GET/POST shape at runtime.
type RouteHandler = (req: Request) => Promise<Response> | Response;
export const GET = handlers.GET as unknown as RouteHandler;
export const POST = handlers.POST as unknown as RouteHandler;

export const runtime = 'nodejs';
