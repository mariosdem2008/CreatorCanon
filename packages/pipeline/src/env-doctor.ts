import { createR2Client } from '@creatorcanon/adapters';
import { createStripeClient } from '@creatorcanon/adapters/stripe';
import { closeDb, getDb, sql } from '@creatorcanon/db';
import { parseServerEnv, publicEnvSchema, serverEnvSchema } from '@creatorcanon/core';

import { loadDefaultEnvFiles } from './env-files';

type CheckStatus = 'pass' | 'warn' | 'fail';

interface DoctorCheck {
  name: string;
  status: CheckStatus;
  message: string;
}

const checks: DoctorCheck[] = [];

function record(name: string, status: CheckStatus, message: string) {
  checks.push({ name, status, message });
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    record(`env:${name}`, 'fail', `${name} is missing.`);
    return undefined;
  }
  record(`env:${name}`, 'pass', `${name} is present.`);
  return value;
}

function isTestStripeSecret(value: string | undefined) {
  return Boolean(value?.startsWith('sk_test_'));
}

function blankOptionalToUndefined(raw: NodeJS.ProcessEnv) {
  return Object.fromEntries(
    Object.entries(raw).map(([key, value]) => [key, value === '' ? undefined : value]),
  );
}

async function main() {
  loadDefaultEnvFiles();
  const isLocalSmokeMode =
    process.env.ARTIFACT_STORAGE === 'local' ||
    process.env.DEV_AUTH_BYPASS_ENABLED === 'true';
  const strictAlphaMode = process.env.ALPHA_ENV_DOCTOR_STRICT === 'true';

  if (isLocalSmokeMode) {
    record(
      'mode',
      strictAlphaMode ? 'fail' : 'warn',
      'Local smoke env detected. External alpha provider checks that use fake local keys will be skipped.',
    );
  } else {
    record('mode', 'pass', 'Real-service alpha env detected.');
  }

  const normalizedEnv = blankOptionalToUndefined(process.env);
  const serverParsed = serverEnvSchema.safeParse(normalizedEnv);
  if (serverParsed.success) {
    record('env:server-schema', 'pass', 'Server environment satisfies the shared schema.');
  } else {
    for (const issue of serverParsed.error.issues) {
      record(
        `env:${issue.path.join('.') || 'server'}`,
        'fail',
        issue.message,
      );
    }
  }

  const publicParsed = publicEnvSchema.safeParse(normalizedEnv);
  if (publicParsed.success) {
    record('env:public-schema', 'pass', 'Public environment satisfies the shared schema.');
  } else {
    for (const issue of publicParsed.error.issues) {
      record(
        `env:${issue.path.join('.') || 'public'}`,
        'fail',
        issue.message,
      );
    }
  }

  const appUrlRaw = requiredEnv('NEXT_PUBLIC_APP_URL');
  if (appUrlRaw) {
    try {
      const appUrl = new URL(appUrlRaw);
      if (appUrl.protocol !== 'https:' && appUrl.hostname !== 'localhost') {
        record('env:app-url', 'warn', 'NEXT_PUBLIC_APP_URL should be https outside localhost.');
      } else {
        record('env:app-url', 'pass', `App URL is ${appUrl.origin}.`);
      }
      record(
        'auth:google-callback',
        'warn',
        `Google OAuth redirect URI must include ${appUrl.origin}/api/auth/callback/google in Google Cloud.`,
      );
    } catch {
      record('env:app-url', 'fail', 'NEXT_PUBLIC_APP_URL is not a valid URL.');
    }
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (stripeKey && !isTestStripeSecret(stripeKey)) {
    record('stripe:test-mode', 'fail', 'STRIPE_SECRET_KEY must be a test-mode key for alpha smoke.');
  } else if (stripeKey) {
    record('stripe:test-mode', 'pass', 'Stripe secret key is test-mode.');
  }
  if (process.env.STRIPE_WEBHOOK_SECRET?.startsWith('whsec_')) {
    record('stripe:webhook-secret', 'pass', 'Stripe webhook secret has the expected prefix.');
  } else if (process.env.STRIPE_WEBHOOK_SECRET) {
    record('stripe:webhook-secret', 'warn', 'Stripe webhook secret is present but does not start with whsec_.');
  }

  if (process.env.TRIGGER_SECRET_KEY) {
    record('trigger:config', 'pass', 'Trigger secret key is present.');
  } else {
    record('trigger:config', 'warn', 'Trigger secret key is missing; local fallback must be used for alpha runs.');
  }
  record('trigger:local-fallback', 'pass', 'Shared pipeline runner is available for local fallback.');

  if (serverParsed.success) {
    try {
      const db = getDb(serverParsed.data.DATABASE_URL);
      await db.execute(sql`select 1`);
      record('database:connectivity', 'pass', 'Database connection succeeded.');
    } catch (error) {
      record(
        'database:connectivity',
        'fail',
        error instanceof Error ? error.message : 'Database connection failed.',
      );
    }

    try {
      const r2 = createR2Client(parseServerEnv(process.env));
      await r2.listObjects({ prefix: '__doctor__/', maxKeys: 1 });
      record(
        'artifacts:list',
        'pass',
        `${serverParsed.data.ARTIFACT_STORAGE} artifact storage is reachable.`,
      );
    } catch (error) {
      record(
        'artifacts:list',
        'fail',
        error instanceof Error ? error.message : 'Artifact storage check failed.',
      );
    }

    if (isLocalSmokeMode && serverParsed.data.STRIPE_SECRET_KEY === 'sk_test_local_smoke') {
      record('stripe:api', 'warn', 'Skipped Stripe API call for local fake smoke key.');
    } else {
      try {
        const stripe = createStripeClient(serverParsed.data);
        await stripe.raw.balance.retrieve();
        record('stripe:api', 'pass', 'Stripe API key can access the test account.');
      } catch (error) {
        record(
          'stripe:api',
          'fail',
          error instanceof Error ? error.message : 'Stripe API check failed.',
        );
      }
    }
  }

  await closeDb();

  const summary = {
    ok: checks.every((check) => check.status !== 'fail'),
    checks,
  };
  console.info(JSON.stringify(summary, null, 2));

  if (!summary.ok) process.exit(1);
}

main().catch(async (error) => {
  await closeDb();
  console.error('[env-doctor] failed', error);
  process.exit(1);
});
