import { NextResponse } from 'next/server';

import { VercelApiError } from './client';

export class VercelRouteError extends Error {
  readonly response: NextResponse;

  constructor(response: NextResponse) {
    super('Vercel route error');
    this.name = 'VercelRouteError';
    this.response = response;
  }
}

export function toVercelRouteError(error: unknown): VercelRouteError {
  if (!(error instanceof VercelApiError)) throw error;

  const status = mapVercelStatus(error.status);
  return new VercelRouteError(
    NextResponse.json(
      {
        error: error.message,
        code: error.code,
        upstreamStatus: error.status,
      },
      { status },
    ),
  );
}

export function unwrapVercelRouteError(error: unknown): NextResponse | never {
  if (error instanceof VercelRouteError) return error.response;
  if (error instanceof Error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ error: 'Unexpected server error' }, { status: 500 });
}

function mapVercelStatus(status: number): number {
  if (status === 429) return 429;
  if (status === 401 || status === 403) return 502;
  if (status === 404) return 409;
  if (status >= 400 && status < 500) return 409;
  return 502;
}
