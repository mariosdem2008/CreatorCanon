'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { StatusPill } from '@/components/cc';
import {
  type DeploymentUiStatus,
  isVerificationTimedOut,
  resolveVerificationStep,
  type VerificationStep,
} from '@/lib/vercel/verification-status';

type StatusChange = {
  domainVerified: boolean;
  sslReady: boolean;
  deploymentStatus: DeploymentUiStatus;
  liveUrl: string | null;
};

interface VerificationStatusProps {
  hubId: string;
  initialDomainVerified?: boolean;
  initialSslReady?: boolean;
  initialLiveUrl?: string | null;
  initialDeploymentStatus?: DeploymentUiStatus;
  initialDeploymentError?: string | null;
  startedAtIso?: string | null;
  pollIntervalMs?: number;
  onStatusChange?: (status: StatusChange) => void;
}

interface VerifyResponse {
  domainVerified: boolean;
  timedOut: boolean;
  error?: string;
  code?: string;
}

interface SslResponse {
  sslReady: boolean;
  misconfigured: boolean;
  error?: string;
  code?: string;
}

interface DeployResponse {
  status: DeploymentUiStatus;
  liveUrl: string | null;
  lastError: string | null;
  error?: string;
}

export function VerificationStatus({
  hubId,
  initialDomainVerified = false,
  initialSslReady = false,
  initialLiveUrl = null,
  initialDeploymentStatus = initialLiveUrl ? 'live' : 'pending',
  initialDeploymentError = null,
  startedAtIso,
  pollIntervalMs = 10_000,
  onStatusChange,
}: VerificationStatusProps) {
  const [domainVerified, setDomainVerified] = useState(initialDomainVerified);
  const [sslReady, setSslReady] = useState(initialSslReady);
  const [deploymentStatus, setDeploymentStatus] =
    useState<DeploymentUiStatus>(initialDeploymentStatus);
  const [liveUrl, setLiveUrl] = useState(initialLiveUrl);
  const [timedOut, setTimedOut] = useState(() =>
    isVerificationTimedOut(startedAtIso),
  );
  const [error, setError] = useState<string | null>(null);
  const [deployError, setDeployError] = useState<string | null>(
    initialDeploymentError,
  );
  const deployPollInFlight = useRef(false);

  const step = useMemo<VerificationStep>(
    () =>
      resolveVerificationStep({
        domainVerified,
        sslReady,
        liveUrl,
        deploymentStatus,
        failed: Boolean(error || deployError),
      }),
    [deployError, deploymentStatus, domainVerified, error, liveUrl, sslReady],
  );

  useEffect(() => {
    onStatusChange?.({ domainVerified, sslReady, deploymentStatus, liveUrl });
  }, [deploymentStatus, domainVerified, liveUrl, onStatusChange, sslReady]);

  useEffect(() => {
    if ((domainVerified && sslReady) || timedOut) return;

    let cancelled = false;
    async function poll() {
      try {
        if (!domainVerified) {
          const response = await fetch(`/api/domains/verify/${hubId}`);
          const body = (await response.json()) as VerifyResponse;
          if (!response.ok) {
            throw new Error(body.error ?? 'Verification check failed');
          }
          if (!cancelled) {
            setDomainVerified(body.domainVerified);
            setTimedOut(body.timedOut);
            setError(null);
          }
          return;
        }

        if (!sslReady) {
          const response = await fetch(`/api/domains/ssl-status/${hubId}`);
          const body = (await response.json()) as SslResponse;
          if (!response.ok) {
            throw new Error(body.error ?? 'SSL check failed');
          }
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

  useEffect(() => {
    if (!domainVerified || !sslReady || timedOut) return;
    if ((deploymentStatus === 'live' && liveUrl) || deploymentStatus === 'failed') {
      return;
    }

    let cancelled = false;
    async function pollDeploy() {
      if (deployPollInFlight.current) return;
      deployPollInFlight.current = true;
      try {
        const response = await fetch(`/api/deploy/trigger/${hubId}`, {
          method: 'POST',
        });
        const body = (await response.json()) as DeployResponse;
        if (!response.ok) {
          throw new Error(body.error ?? 'Deployment trigger failed');
        }
        if (!cancelled) {
          setDeploymentStatus(body.status);
          setLiveUrl(body.liveUrl);
          setDeployError(body.lastError);
        }
      } catch (cause) {
        if (!cancelled) {
          setDeployError(
            cause instanceof Error ? cause.message : 'Deployment trigger failed',
          );
        }
      } finally {
        deployPollInFlight.current = false;
      }
    }

    void pollDeploy();
    const timer = window.setInterval(() => void pollDeploy(), pollIntervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [
    deploymentStatus,
    domainVerified,
    hubId,
    liveUrl,
    pollIntervalMs,
    sslReady,
    timedOut,
  ]);

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
      {timedOut ? (
        <div className="mt-2 grid gap-2 text-[12px] leading-[1.6] text-[var(--cc-ink-3)]">
          <p>
            DNS has been pending for 24 hours. Check the record values at your
            registrar, then contact support with this hub ID if the values match.
          </p>
          <a
            className="font-semibold text-[var(--cc-accent)] underline-offset-4 hover:underline"
            href={`mailto:hello@creatorcanon.com?subject=Domain%20verification%20help&body=Hub%20ID:%20${encodeURIComponent(
              hubId,
            )}`}
          >
            Contact support
          </a>
        </div>
      ) : (
        <p className="mt-2 text-[12px] leading-[1.6] text-[var(--cc-ink-3)]">
          {messageForStep(step, error ?? deployError)}
        </p>
      )}
    </div>
  );
}

function labelForStep(step: VerificationStep, timedOut: boolean): string {
  if (timedOut) return 'Needs help';
  if (step === 'pending') return 'Pending';
  if (step === 'ssl_provisioning') return 'SSL provisioning';
  if (step === 'deploying') return 'Deploying';
  if (step === 'live') return 'Live';
  if (step === 'failed') return 'Check failed';
  return 'Verified';
}

function messageForStep(
  step: VerificationStep,
  error: string | null,
): string {
  if (error) return error;
  if (step === 'pending') {
    return 'Waiting for DNS propagation. This usually refreshes within a few minutes.';
  }
  if (step === 'ssl_provisioning') {
    return 'Domain ownership is verified. Vercel is issuing the SSL certificate.';
  }
  if (step === 'deploying') {
    return 'Domain and SSL are ready. Vercel is building the hub for this domain.';
  }
  if (step === 'live') return 'Domain and SSL are ready.';
  return 'Domain ownership is verified.';
}
