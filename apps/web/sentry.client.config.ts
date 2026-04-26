import * as Sentry from '@sentry/nextjs';

const isProd = process.env.NODE_ENV === 'production';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: isProd ? 0.1 : 0.05,
  replaysOnErrorSampleRate: isProd ? 1.0 : 0,
  replaysSessionSampleRate: isProd ? 0.01 : 0,
  integrations: isProd
    ? [Sentry.replayIntegration({ maskAllText: false, blockAllMedia: false })]
    : [],
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
});
