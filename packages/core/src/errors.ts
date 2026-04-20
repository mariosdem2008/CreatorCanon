export type ErrorCategory =
  | 'validation'
  | 'auth'
  | 'not_found'
  | 'conflict'
  | 'rate_limited'
  | 'provider_upstream'
  | 'quota_exhausted'
  | 'internal';

export class CanonError extends Error {
  readonly code: string;
  readonly category: ErrorCategory;
  readonly retryable: boolean;
  readonly meta: Record<string, unknown>;

  constructor(opts: {
    code: string;
    message: string;
    category: ErrorCategory;
    retryable?: boolean;
    meta?: Record<string, unknown>;
    cause?: unknown;
  }) {
    super(opts.message, { cause: opts.cause });
    this.name = 'CanonError';
    this.code = opts.code;
    this.category = opts.category;
    this.retryable = opts.retryable ?? false;
    this.meta = opts.meta ?? {};
  }
}

export const isCanonError = (e: unknown): e is CanonError =>
  e instanceof CanonError;
