import * as Sentry from '@sentry/node';

export const initTelemetry = () => {
  const dsn = process.env.SENTRY_DSN;
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.3 : 1.0,
    integrations: [Sentry.httpIntegration()],
    enabled: !!dsn,
  });
};

export const captureException = Sentry.captureException.bind(Sentry);
export const captureMessage = Sentry.captureMessage.bind(Sentry);

export const withSentrySpan = async <T>(
  name: string,
  fn: () => Promise<T>,
): Promise<T> => {
  return Sentry.startSpan({ name, op: 'pipeline.stage' }, () => fn());
};
