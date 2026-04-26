export async function register() {
  const isProd = process.env.NODE_ENV === 'production';

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { init } = await import('@sentry/nextjs');
    init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV,
      tracesSampleRate: isProd ? 0.1 : 0.05,
      enabled: !!process.env.SENTRY_DSN,
    });
  }

  // Edge runtime intentionally skipped: middleware runs on every navigation,
  // and Sentry's edge tracing adds 10–50ms per request. Errors here surface
  // via Vercel logs.
}
