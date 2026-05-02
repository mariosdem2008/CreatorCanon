'use client';

import { useMemo, useState, type FormEvent } from 'react';

import { Button, Panel, PanelHeader, StatusPill } from '@/components/cc';
import {
  getDnsRecordsForDomain,
  normalizeDomainInput,
  validateCustomDomain,
} from '@/lib/vercel/domain-utils';
import { DnsRecordCard } from './DnsRecordCard';
import { VerificationStatus } from './VerificationStatus';

interface DomainConnectorProps {
  hubId: string;
  initialDomain?: string | null;
  initialDomainVerified?: boolean;
  initialSslReady?: boolean;
  initialLiveUrl?: string | null;
  statusStartedAtIso?: string | null;
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

export function DomainConnector({
  hubId,
  initialDomain,
  initialDomainVerified = false,
  initialSslReady = false,
  initialLiveUrl = null,
  statusStartedAtIso = null,
}: DomainConnectorProps) {
  const [domain, setDomain] = useState(initialDomain ?? '');
  const [attachedDomain, setAttachedDomain] = useState(initialDomain ?? '');
  const [domainVerified, setDomainVerified] = useState(initialDomainVerified);
  const [sslReady, setSslReady] = useState(initialSslReady);
  const [state, setState] = useState<SubmitState>('idle');
  const [message, setMessage] = useState<string | null>(null);

  const validation = useMemo(() => validateCustomDomain(domain), [domain]);
  const records = attachedDomain ? getDnsRecordsForDomain(attachedDomain) : [];
  const connectionPill = attachedDomain ? (
    sslReady ? (
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
    setState('attached');
    setMessage(
      body.domain?.verified
        ? 'Domain is already verified.'
        : 'Domain attached. Add the DNS record below, then wait for verification.',
    );
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
            hubId={hubId}
            initialDomainVerified={domainVerified}
            initialSslReady={sslReady}
            initialLiveUrl={initialLiveUrl}
            startedAtIso={statusStartedAtIso}
          />
        ) : null}
      </div>
    </Panel>
  );
}
