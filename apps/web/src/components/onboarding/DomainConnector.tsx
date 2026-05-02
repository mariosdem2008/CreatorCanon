'use client';

import { useCallback, useMemo, useState, type FormEvent } from 'react';

import { Button, Panel, PanelHeader, StatusPill } from '@/components/cc';
import {
  getDnsRecordsForDomain,
  normalizeDomainInput,
  validateCustomDomain,
} from '@/lib/vercel/domain-utils';
import type { DeploymentUiStatus } from '@/lib/vercel/verification-status';
import { DnsRecordCard } from './DnsRecordCard';
import { VerificationStatus } from './VerificationStatus';

interface DomainConnectorProps {
  hubId: string;
  initialDomain?: string | null;
  initialDomainVerified?: boolean;
  initialSslReady?: boolean;
  initialLiveUrl?: string | null;
  initialDeploymentStatus?: DeploymentUiStatus;
  initialDeploymentError?: string | null;
  statusStartedAtIso?: string | null;
  fallbackUrl?: string | null;
}

interface AttachDomainResponse {
  vercelProjectId: string;
  reusedExistingProject: boolean;
  domain: {
    name: string;
    verified: boolean;
    verification?: Array<{ type: string; domain: string; value: string }>;
  } | null;
}

type SubmitState = 'idle' | 'submitting' | 'attached' | 'error';
type FallbackState = 'idle' | 'submitting' | 'deploying' | 'error';

const FALLBACK_POLL_INTERVAL_MS = 10000;
const FALLBACK_MAX_POLLS = 30;

export function DomainConnector({
  hubId,
  initialDomain,
  initialDomainVerified = false,
  initialSslReady = false,
  initialLiveUrl = null,
  initialDeploymentStatus = initialLiveUrl ? 'live' : 'pending',
  initialDeploymentError = null,
  statusStartedAtIso = null,
  fallbackUrl = null,
}: DomainConnectorProps) {
  const [domain, setDomain] = useState(initialDomain ?? '');
  const [attachedDomain, setAttachedDomain] = useState(initialDomain ?? '');
  const [domainVerified, setDomainVerified] = useState(initialDomainVerified);
  const [sslReady, setSslReady] = useState(initialSslReady);
  const [liveUrl, setLiveUrl] = useState(initialLiveUrl);
  const [deploymentStatus, setDeploymentStatus] =
    useState<DeploymentUiStatus>(initialDeploymentStatus);
  const [state, setState] = useState<SubmitState>('idle');
  const [fallbackState, setFallbackState] = useState<FallbackState>('idle');
  const [message, setMessage] = useState<string | null>(null);

  const validation = useMemo(() => validateCustomDomain(domain), [domain]);
  const records = attachedDomain ? getDnsRecordsForDomain(attachedDomain) : [];
  const handleStatusChange = useCallback(
    (status: {
      domainVerified: boolean;
      sslReady: boolean;
      deploymentStatus: DeploymentUiStatus;
      liveUrl: string | null;
    }) => {
      setDomainVerified(status.domainVerified);
      setSslReady(status.sslReady);
      setDeploymentStatus(status.deploymentStatus);
      setLiveUrl(status.liveUrl);
    },
    [],
  );
  const connectionPill = attachedDomain ? (
    deploymentStatus === 'live' && liveUrl ? (
      <StatusPill tone="success">Live</StatusPill>
    ) : deploymentStatus === 'building' ? (
      <StatusPill tone="info">Deploying</StatusPill>
    ) : deploymentStatus === 'failed' ? (
      <StatusPill tone="danger">Deploy failed</StatusPill>
    ) : sslReady ? (
      <StatusPill tone="success">SSL ready</StatusPill>
    ) : domainVerified ? (
      <StatusPill tone="info">SSL provisioning</StatusPill>
    ) : (
      <StatusPill tone="info">DNS pending</StatusPill>
    )
  ) : (
    <StatusPill tone="neutral">Not connected</StatusPill>
  );

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = validateCustomDomain(domain);
    if (!next.valid) {
      setState('error');
      setMessage(next.message ?? 'Enter a valid domain.');
      return;
    }

    setState('submitting');
    setMessage(null);

    const response = await fetch('/api/domains/attach', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hubId, domain: next.domain }),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      setState('error');
      setMessage(body?.error ?? 'Domain attachment failed.');
      return;
    }

    const body = (await response.json()) as AttachDomainResponse;
    const finalDomain = body.domain?.name ?? next.domain;
    setDomain(finalDomain);
    setAttachedDomain(finalDomain);
    setDomainVerified(Boolean(body.domain?.verified));
    setSslReady(false);
    setLiveUrl(null);
    setDeploymentStatus('pending');
    setState('attached');
    setMessage(
      body.domain?.verified
        ? 'Domain is already verified.'
        : 'Domain attached. Add the DNS record below, then wait for verification.',
    );
  }

  async function onUseFallback() {
    setFallbackState('submitting');
    setMessage(null);

    const attachResponse = await fetch('/api/domains/attach', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hubId }),
    });
    if (!attachResponse.ok) {
      const body = (await attachResponse.json().catch(() => null)) as
        | { error?: string }
        | null;
      setFallbackState('error');
      setMessage(body?.error ?? 'Could not prepare the free subdomain.');
      return;
    }

    let result: {
      status: DeploymentUiStatus;
      liveUrl: string | null;
      lastError?: string | null;
    };
    try {
      result = await triggerFallbackDeployment();
    } catch (error) {
      setFallbackState('error');
      setMessage(
        error instanceof Error
          ? error.message
          : 'Could not start the free subdomain deployment.',
      );
      return;
    }
    setDeploymentStatus(result.status);
    setLiveUrl(result.liveUrl ?? fallbackUrl);
    if (result.status === 'failed') {
      setFallbackState('error');
      setMessage(result.lastError ?? 'Free subdomain deployment failed.');
      return;
    }
    setFallbackState(result.status === 'building' ? 'deploying' : 'idle');
    setMessage(
      result.status === 'live'
        ? 'Free subdomain is live.'
        : 'Free subdomain deployment started. It usually goes live in one to two minutes.',
    );
    if (result.status === 'building') {
      void pollFallbackDeployment();
    }
  }

  async function triggerFallbackDeployment() {
    setFallbackState('deploying');
    const deployResponse = await fetch(`/api/deploy/trigger/${hubId}`, {
      method: 'POST',
    });
    if (!deployResponse.ok) {
      const body = (await deployResponse.json().catch(() => null)) as
        | { error?: string }
        | null;
      throw new Error(body?.error ?? 'Could not start the free subdomain deployment.');
    }

    return (await deployResponse.json()) as {
      status: DeploymentUiStatus;
      liveUrl: string | null;
      lastError?: string | null;
    };
  }

  async function pollFallbackDeployment() {
    for (let attempt = 0; attempt < FALLBACK_MAX_POLLS; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, FALLBACK_POLL_INTERVAL_MS));
      try {
        const result = await triggerFallbackDeployment();
        setDeploymentStatus(result.status);
        setLiveUrl(result.liveUrl ?? fallbackUrl);
        if (result.status === 'live') {
          setFallbackState('idle');
          setMessage('Free subdomain is live.');
          return;
        }
        if (result.status === 'failed') {
          setFallbackState('error');
          setMessage(result.lastError ?? 'Free subdomain deployment failed.');
          return;
        }
      } catch (error) {
        setFallbackState('error');
        setMessage(error instanceof Error ? error.message : 'Free subdomain polling failed.');
        return;
      }
    }
    setFallbackState('error');
    setMessage('Free subdomain deployment is still running. Refresh this page to check again.');
  }

  return (
    <Panel>
      <PanelHeader
        title="Custom domain"
        meta={connectionPill}
      />
      <div className="grid gap-4 p-4">
        <form className="grid gap-3 sm:grid-cols-[1fr_auto]" onSubmit={onSubmit}>
          <label className="grid gap-1.5">
            <span className="text-[12px] font-semibold text-[var(--cc-ink-2)]">
              Domain
            </span>
            <input
              value={domain}
              onChange={(event) => {
                setDomain(normalizeDomainInput(event.target.value));
                if (state === 'error') {
                  setState('idle');
                  setMessage(null);
                }
              }}
              placeholder="learn.example.com"
              className="h-10 rounded-[8px] border border-[var(--cc-rule)] bg-white px-3 text-[14px] text-[var(--cc-ink)] outline-none transition focus:border-[var(--cc-accent)] focus:ring-2 focus:ring-[var(--cc-accent-wash)]"
              aria-invalid={domain ? !validation.valid : undefined}
            />
          </label>
          <Button
            className="self-end"
            disabled={state === 'submitting'}
            type="submit"
          >
            {state === 'submitting' ? 'Connecting...' : 'Connect'}
          </Button>
        </form>

        <div aria-live="polite" className="min-h-5 text-[12px] text-[var(--cc-ink-3)]">
          {message}
        </div>

        {fallbackUrl && !attachedDomain ? (
          <div className="grid gap-3 border-y border-[var(--cc-rule)] bg-[var(--cc-surface-2)]/55 px-4 py-4 sm:grid-cols-[1fr_auto] sm:items-center">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[13px] font-semibold text-[var(--cc-ink)]">
                  CreatorCanon subdomain
                </p>
                {deploymentStatus === 'live' && liveUrl ? (
                  <StatusPill tone="success">Live</StatusPill>
                ) : deploymentStatus === 'building' || fallbackState === 'deploying' ? (
                  <StatusPill tone="info">Deploying</StatusPill>
                ) : (
                  <StatusPill tone="neutral">Included</StatusPill>
                )}
              </div>
              <a
                className="mt-1 block truncate text-[12px] font-semibold text-[var(--cc-accent)] hover:underline"
                href={liveUrl ?? fallbackUrl}
                target="_blank"
                rel="noreferrer"
              >
                {liveUrl ?? fallbackUrl}
              </a>
              <p className="mt-1 text-[12px] leading-[1.55] text-[var(--cc-ink-3)]">
                Use this now and add a custom domain later without changing your hub.
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              disabled={
                fallbackState === 'submitting' ||
                fallbackState === 'deploying' ||
                (deploymentStatus === 'live' && Boolean(liveUrl))
              }
              onClick={onUseFallback}
            >
              {deploymentStatus === 'live' && liveUrl
                ? 'Fallback live'
                : fallbackState === 'submitting'
                ? 'Preparing...'
                : fallbackState === 'deploying'
                  ? 'Deploying...'
                  : 'Use fallback for now'}
            </Button>
          </div>
        ) : null}

        {records.length > 0 ? (
          <div className="grid gap-2">
            <div className="text-[12px] font-semibold text-[var(--cc-ink-2)]">
              DNS records
            </div>
            {records.map((record) => (
              <DnsRecordCard key={`${record.type}:${record.name}`} record={record} />
            ))}
          </div>
        ) : null}

        {attachedDomain ? (
          <VerificationStatus
            key={attachedDomain}
            hubId={hubId}
            initialDomainVerified={domainVerified}
            initialSslReady={sslReady}
            initialLiveUrl={liveUrl}
            initialDeploymentStatus={deploymentStatus}
            initialDeploymentError={initialDeploymentError}
            startedAtIso={statusStartedAtIso}
            onStatusChange={handleStatusChange}
          />
        ) : null}
      </div>
    </Panel>
  );
}
