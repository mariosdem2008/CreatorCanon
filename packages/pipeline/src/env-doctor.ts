import { createR2Client } from '@creatorcanon/adapters';
import { createStripeClient } from '@creatorcanon/adapters/stripe';
import { closeDb, getDb, sql } from '@creatorcanon/db';
import { parseServerEnv, publicEnvSchema, serverEnvSchema } from '@creatorcanon/core';
import { spawnSync } from 'node:child_process';

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

function optionalEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    record(`env:${name}`, 'warn', `${name} is not set.`);
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

function formatError(error: unknown, fallback: string): string {
  if (error instanceof AggregateError) {
    const messages = error.errors
      .map((item) => item instanceof Error ? item.message : String(item))
      .filter(Boolean);
    return messages.length > 0 ? messages.join('; ') : fallback;
  }
  if (error instanceof Error) return error.message || fallback;
  return String(error || fallback);
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function checkBinary(
  name: string,
  command: string,
  args: string[],
): DoctorCheck {
  const result = spawnSync(command, args, {
    stdio: 'ignore',
  });
  if (result.status === 0) {
    return {
      name,
      status: 'pass',
      message: `${command} is available.`,
    };
  }
  return {
    name,
    status: 'warn',
    message: `${command} is not available in this environment.`,
  };
}

async function withRetry<T>(
  operation: () => Promise<T>,
  opts: { attempts: number; baseDelayMs: number },
): Promise<{ value: T; attemptsUsed: number }> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= opts.attempts; attempt++) {
    try {
      return { value: await operation(), attemptsUsed: attempt };
    } catch (error) {
      lastError = error;
      await closeDb().catch(() => undefined);
      if (attempt < opts.attempts) {
        await wait(opts.baseDelayMs * attempt);
      }
    }
  }

  throw lastError;
}

async function main() {
  loadDefaultEnvFiles();
  const isLocalSmokeMode =
    process.env.ARTIFACT_STORAGE === 'local' ||
    process.env.DEV_AUTH_BYPASS_ENABLED === 'true';
  const strictAlphaMode = process.env.ALPHA_ENV_DOCTOR_STRICT === 'true';
  const hostedUrlCheck = process.env.ALPHA_HOSTED_URL_CHECK === 'true';

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
      const isLocalAppUrl = appUrl.hostname === 'localhost' || appUrl.hostname === '127.0.0.1';
      if (appUrl.protocol !== 'https:' && appUrl.hostname !== 'localhost') {
        record('env:app-url', 'warn', 'NEXT_PUBLIC_APP_URL should be https outside localhost.');
      } else {
        record('env:app-url', 'pass', `App URL is ${appUrl.origin}.`);
      }
      if (hostedUrlCheck && isLocalAppUrl) {
        record('hosted:app-url', 'fail', 'Hosted URL check cannot use localhost NEXT_PUBLIC_APP_URL.');
      } else if (strictAlphaMode && isLocalAppUrl) {
        record(
          'hosted:app-url',
          'warn',
          'Strict alpha env uses localhost NEXT_PUBLIC_APP_URL; this is acceptable for Stripe CLI/manual alpha but not hosted deploy proof.',
        );
      } else if (!isLocalAppUrl) {
        record('hosted:app-url', 'pass', 'NEXT_PUBLIC_APP_URL targets a hosted origin.');
      }
      record(
        'auth:google-callback',
        'warn',
        `Google OAuth redirect URI must include ${appUrl.origin}/api/auth/callback/google in Google Cloud.`,
      );
      record(
        'stripe:webhook-endpoint',
        'warn',
        `Stripe test webhook endpoint must point to ${appUrl.origin}/api/stripe/webhook.`,
      );
      if (hostedUrlCheck) {
        try {
          const response = await fetch(new URL('/healthcheck', appUrl), {
            headers: { accept: 'application/json' },
          });
          if (!response.ok) {
            record('hosted:healthcheck', 'fail', `Hosted healthcheck returned HTTP ${response.status}.`);
          } else {
            const body = await response.json() as { ok?: unknown; service?: unknown };
            if (body.ok === true) {
              record('hosted:healthcheck', 'pass', `Hosted healthcheck responded for ${body.service ?? 'web'}.`);
            } else {
              record('hosted:healthcheck', 'fail', 'Hosted healthcheck response did not include ok:true.');
            }
          }
        } catch (error) {
          record(
            'hosted:healthcheck',
            'fail',
            formatError(error, 'Hosted healthcheck request failed.'),
          );
        }
      } else {
        record(
          'hosted:healthcheck',
          'warn',
          'Skipped hosted healthcheck. Set ALPHA_HOSTED_URL_CHECK=true to verify NEXT_PUBLIC_APP_URL/healthcheck.',
        );
      }
    } catch {
      record('env:app-url', 'fail', 'NEXT_PUBLIC_APP_URL is not a valid URL.');
    }
  }

  const hubRootDomain = optionalEnv('NEXT_PUBLIC_HUB_ROOT_DOMAIN');
  if (hubRootDomain && appUrlRaw) {
    try {
      const appHost = new URL(appUrlRaw).hostname;
      if (hubRootDomain === 'creatorcanon.local') {
        record(
          'hosted:hub-domain',
          hostedUrlCheck ? 'fail' : 'warn',
          'NEXT_PUBLIC_HUB_ROOT_DOMAIN still uses local placeholder.',
        );
      } else if (hubRootDomain === appHost || appHost.endsWith(`.${hubRootDomain}`)) {
        record('hosted:hub-domain', 'pass', 'Hub root domain is compatible with the app host.');
      } else {
        record(
          'hosted:hub-domain',
          'warn',
          `Hub root domain ${hubRootDomain} differs from app host ${appHost}; verify intended hosted routing.`,
        );
      }
    } catch {
      record('hosted:hub-domain', 'warn', 'Could not compare hub root domain with app URL.');
    }
  }

  const bypassEnabled = process.env.DEV_AUTH_BYPASS_ENABLED === 'true';
  // Compute "prod URL" independently of strictAlphaMode — any non-localhost
  // NEXT_PUBLIC_APP_URL combined with bypass=true is a sign-in bypass
  // vulnerability and must fail unconditionally.
  let isProdAppUrl = false;
  if (appUrlRaw) {
    try {
      const host = new URL(appUrlRaw).hostname;
      isProdAppUrl = host !== 'localhost' && host !== '127.0.0.1';
    } catch {
      isProdAppUrl = false;
    }
  }

  if (isProdAppUrl && bypassEnabled) {
    record(
      'auth:dev-bypass-in-prod',
      'fail',
      'DEV_AUTH_BYPASS_ENABLED=true with a non-localhost NEXT_PUBLIC_APP_URL is a sign-in-bypass vulnerability. Unset DEV_AUTH_BYPASS_ENABLED in production before continuing.',
    );
  } else if (strictAlphaMode && bypassEnabled) {
    record('auth:dev-bypass', 'fail', 'DEV_AUTH_BYPASS_ENABLED must be false for strict hosted alpha readiness.');
  } else if (bypassEnabled) {
    record('auth:dev-bypass', 'warn', 'Dev auth bypass is enabled; do not deploy this to hosted alpha.');
  } else {
    record('auth:dev-bypass', 'pass', 'Dev auth bypass is disabled.');
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

  const dispatchMode = process.env.PIPELINE_DISPATCH_MODE ?? 'inprocess';
  const requiresTrigger = dispatchMode === 'trigger';
  if (process.env.TRIGGER_SECRET_KEY) {
    record('trigger:config', 'pass', 'Trigger secret key is present.');
  } else if (strictAlphaMode && requiresTrigger) {
    record('trigger:config', 'fail', 'Trigger secret key is missing while PIPELINE_DISPATCH_MODE=trigger.');
  } else {
    record('trigger:config', requiresTrigger ? 'warn' : 'pass', requiresTrigger
      ? 'Trigger secret key is missing; fallback execution would be required.'
      : 'Trigger secret key is optional in worker/inprocess dispatch mode.');
  }
  const triggerProjectId = process.env.TRIGGER_PROJECT_ID?.trim();
  if (triggerProjectId) {
    record('trigger:project-id', 'pass', 'Trigger project id is present.');
  } else if ((strictAlphaMode || hostedUrlCheck) && requiresTrigger) {
    record('trigger:project-id', 'fail', 'TRIGGER_PROJECT_ID is required for hosted Trigger dispatch readiness.');
  } else {
    record('trigger:project-id', requiresTrigger ? 'warn' : 'pass', requiresTrigger
      ? 'TRIGGER_PROJECT_ID is not set.'
      : 'TRIGGER_PROJECT_ID is optional in worker/inprocess dispatch mode.');
  }
  record('trigger:local-fallback', 'pass', 'Shared pipeline runner is available for local fallback.');

  const reviewSynth = process.env.PIPELINE_REVIEW_SYNTH ?? 'deterministic';
  const draftSynth = process.env.PIPELINE_DRAFT_SYNTH ?? 'deterministic';
  record(
    'pipeline:review-synth',
    'pass',
    `synthesize_v0_review is running in ${reviewSynth} mode.`,
  );
  record(
    'pipeline:draft-synth',
    'pass',
    `draft_pages_v0 is running in ${draftSynth} mode.`,
  );
  // Hosted + non-worker is a warn, not a fail. 'inprocess' is a deliberate
  // choice in this plan when no worker/Trigger.dev task runtime is deployed
  // (real-video extraction is unsupported in inprocess but audio-seeded
  // fixtures still work). The warn surfaces the limitation; strict alpha
  // mode upgrades it to fail when it matters.
  const isHostedNonWorker =
    (hostedUrlCheck || (!isLocalSmokeMode && !!appUrlRaw && !appUrlRaw.includes('localhost'))) &&
    dispatchMode !== 'worker';
  const hostedDispatchStatus: CheckStatus =
    strictAlphaMode && !isLocalSmokeMode && dispatchMode !== 'worker'
      ? 'fail'
      : isHostedNonWorker
        ? 'warn'
        : 'pass';
  record(
    'pipeline:dispatch-mode',
    hostedDispatchStatus,
    hostedDispatchStatus === 'fail'
      ? `Strict hosted alpha requires PIPELINE_DISPATCH_MODE=worker; current mode is ${dispatchMode}.`
      : hostedDispatchStatus === 'warn'
        ? `Hosted + dispatchMode=${dispatchMode} — works for audio-seeded fixtures only; real-video extraction requires mode=worker with a deployed poller or mode=trigger with Trigger.dev tasks deployed.`
        : `Stripe webhook dispatches in ${dispatchMode} mode.`,
  );
  for (const binaryCheck of [
    checkBinary(
      'audio-extraction:yt-dlp',
      process.env.AUDIO_EXTRACTION_YTDLP_BIN?.trim() || 'yt-dlp',
      ['--version'],
    ),
    checkBinary(
      'audio-extraction:ffmpeg',
      process.env.AUDIO_EXTRACTION_FFMPEG_BIN?.trim() || 'ffmpeg',
      ['-version'],
    ),
    checkBinary(
      'audio-extraction:challenge-runtime',
      process.env.AUDIO_EXTRACTION_CHALLENGE_RUNTIME_BIN?.trim() || 'deno',
      ['--version'],
    ),
  ]) {
    record(binaryCheck.name, binaryCheck.status, binaryCheck.message);
  }

  if (serverParsed.success) {
    try {
      const result = await withRetry(
        async () => {
          const db = getDb(serverParsed.data.DATABASE_URL);
          await db.execute(sql`select 1`);
        },
        { attempts: 3, baseDelayMs: 1000 },
      );
      record(
        'database:connectivity',
        'pass',
        result.attemptsUsed > 1
          ? `Database connection succeeded after ${result.attemptsUsed} attempts.`
          : 'Database connection succeeded.',
      );
    } catch (error) {
      record(
        'database:connectivity',
        'fail',
        formatError(error, 'Database connection failed.'),
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
        formatError(error, 'Artifact storage check failed.'),
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
          formatError(error, 'Stripe API check failed.'),
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
