'use client';

import { useState, type FormEvent } from 'react';

import { Button, LinkButton, Panel, PanelHeader } from '@/components/cc';

interface MagicLinkLoginPageProps {
  hubTitle: string;
  requestEndpoint?: string;
  backHref?: string;
}

export function MagicLinkLoginPage({
  hubTitle,
  requestEndpoint = '/api/distribution/magic-link/request',
  backHref = '/',
}: MagicLinkLoginPageProps) {
  const [state, setState] = useState<'idle' | 'submitting' | 'sent' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') ?? '').trim();
    if (!email) {
      setState('error');
      setMessage('Enter the email used at checkout.');
      return;
    }

    setState('submitting');
    setMessage(null);
    const response = await fetch(requestEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });

    if (!response.ok) {
      setState('error');
      setMessage('Magic links are not available yet.');
      return;
    }

    setState('sent');
    setMessage('Check your inbox for the access link.');
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[var(--cc-canvas)] px-4 py-10">
      <Panel className="w-full max-w-[440px]">
        <PanelHeader title="Access link" meta={hubTitle} />
        <form onSubmit={onSubmit} className="grid gap-4 p-5">
          <div>
            <h1 className="text-[24px] font-semibold leading-tight text-[var(--cc-ink)]">
              Open your paid hub
            </h1>
            <p className="mt-2 text-[13px] leading-[1.6] text-[var(--cc-ink-3)]">
              Enter the purchase email. The backend will send a one-time link once
              Phase E wiring is connected.
            </p>
          </div>
          <label className="grid gap-1.5">
            <span className="text-[12px] font-semibold text-[var(--cc-ink-2)]">
              Email
            </span>
            <input
              name="email"
              type="email"
              autoComplete="email"
              className="h-10 rounded-[8px] border border-[var(--cc-rule)] bg-white px-3 text-[14px] outline-none focus:border-[var(--cc-accent)] focus:ring-2 focus:ring-[var(--cc-accent-wash)]"
            />
          </label>
          <div aria-live="polite" className="min-h-5 text-[12px] text-[var(--cc-ink-3)]">
            {message}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button disabled={state === 'submitting'} type="submit">
              {state === 'submitting' ? 'Sending...' : 'Send link'}
            </Button>
            <LinkButton href={backHref} variant="secondary">
              Back
            </LinkButton>
          </div>
        </form>
      </Panel>
    </main>
  );
}
