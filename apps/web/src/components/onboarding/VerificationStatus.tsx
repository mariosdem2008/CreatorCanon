'use client';

import { useEffect, useMemo, useState } from 'react';

import { StatusPill } from '@/components/cc';
import {
  isVerificationTimedOut,
  resolveVerificationStep,
  type VerificationStep,
} from '@/lib/vercel/verification-status';

interface VerificationStatusProps {
  hubId: string;
  initialDomainVerified?: boolean;
  initialSslReady?: boolean;
  initialLiveUrl?: string | null;
  startedAtIso?: string | null;
  pollIntervalMs?: number;
}

interface VerifyResponse {
  domainVerified: boolean;
  timedOut: boolean;
}

interface SslResponse {
  sslReady: boolean;
  misconfigured: boolean;
}

export function VerificationStatus({
  hubId,
  initialDomainVerified = false,
  initialSslReady = false,
  initialLiveUrl = null,
  startedAtIso,
  pollIntervalMs = 10_000,
}: VerificationStatusProps) {
  const [domainVerified, setDomainVerified] = useState(initialDomainVerified);
  const [sslReady, setSslReady] = useState(initialSslReady);
  const [liveUrl] = useState(initialLiveUrl);
  const [timedOut, setTimedOut] = useState(() =>
    isVerificationTimedOut(startedAtIso),
  );
  const [error, setError] = useState<string | null>(null);

  const step = useMemo<VerificationStep>(
    () =>
      resolveVerificationStep({
        domainVerified,
        sslReady,
        liveUrl,
        failed: Boolean(error),
      }),
    [domainVerified, error, liveUrl, sslReady],
  );

  useEffect(() => {
    if ((domainVerified && sslReady) || timedOut) return;

    let cancelled = false;
    async function poll() {
      try {
        if (!domainVerified) {
          const response = await fetch(`/api/domains/verify/${hubId}`);
          if (!response.ok) throw new Error('Verification check failed');
          const body = (await response.json()) as VerifyResponse;
          if (!cancelled) {
            setDomainVerified(body.domainVerified);
            setTimedOut(body.timedOut);
            setError(null);
          }
          return;
        }

        if (!sslReady) {
          const response = await fetch(`/api/domains/ssl-status/${hubId}`);
          if (!response.ok) throw new Error('SSL check failed');
          const body = (await response.json()) as SslResponse;
          if (!cancelled) {
            setSslReady(body.sslReady);
            setError(body.misconfigured ? 'DNS is still misconfigured.' : null);
          }
        }
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'Status check failed');
        }
      }
    }

    void poll();
    const timer = window.setInterval(() => void poll(), pollIntervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [domainVerified, hubId, pollIntervalMs, sslReady, timedOut]);

  const tone =
    step === 'live'
      ? 'success'
      : step === 'failed'
        ? 'danger'
        : timedOut
          ? 'warn'
          : 'info';

  return (
    <div className="rounded-[8px] border border-[var(--cc-rule)] bg-[var(--cc-surface-2)] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] font-semibold text-[var(--cc-ink)]">
          Verification status
        </p>
        <StatusPill tone={tone}>{labelForStep(step, timedOut)}</StatusPill>
      </div>
      <p className="mt-2 text-[12px] leading-[1.6] text-[var(--cc-ink-3)]">
        {messageForStep(step, timedOut, error)}
      </p>
    </div>
  );
}

function labelForStep(step: VerificationStep, timedOut: boolean): string {
  if (timedOut) return 'Needs help';
  if (step === 'pending') return 'Pending';
  if (step === 'ssl_provisioning') return 'SSL provisioning';
  if (step === 'live') return 'Live';
  if (step === 'failed') return 'Check failed';
  return 'Verified';
}

function messageForStep(
  step: VerificationStep,
  timedOut: boolean,
  error: string | null,
): string {
  if (timedOut) {
    return 'DNS has been pending for 24 hours. Check the record values at your registrar or contact support.';
  }
  if (error) return error;
  if (step === 'pending') {
    return 'Waiting for DNS propagation. This usually refreshes within a few minutes.';
  }
  if (step === 'ssl_provisioning') {
    return 'Domain ownership is verified. Vercel is issuing the SSL certificate.';
  }
  if (step === 'live') return 'Domain and SSL are ready.';
  return 'Domain ownership is verified.';
}
