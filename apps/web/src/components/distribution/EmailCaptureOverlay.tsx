'use client';

import { useState, type FormEvent } from 'react';

import { Button } from '@/components/cc';
import type { DistributionProfileDraft } from '@/lib/distribution/profiles';

interface EmailCaptureOverlayProps {
  profile: DistributionProfileDraft;
  hubTitle: string;
  privacyHref?: string;
  actionEndpoint?: string;
  initiallyUnlocked?: boolean;
}

type SubmitState = 'idle' | 'submitting' | 'success' | 'error';

export function EmailCaptureOverlay({
  profile,
  hubTitle,
  privacyHref = '/privacy',
  actionEndpoint = '/api/distribution/email-capture',
  initiallyUnlocked = false,
}: EmailCaptureOverlayProps) {
  const [state, setState] = useState<SubmitState>(
    initiallyUnlocked ? 'success' : 'idle',
  );
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') ?? '').trim();
    const consent = form.get('consent') === 'on';

    if (!email || !consent) {
      setState('error');
      setMessage('Enter an email and confirm consent to continue.');
      return;
    }

    setState('submitting');
    setMessage(null);

    const response = await fetch(actionEndpoint, {
      method: 'POST',
      body: JSON.stringify({
        email,
        profileType: profile.type,
        analyticsTags: profile.analyticsTags,
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      setState('error');
      setMessage('Email capture is not available yet. Try again shortly.');
      return;
    }

    document.cookie = `cc_distribution_email=${encodeURIComponent(
      email,
    )}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    setState('success');
    setMessage(profile.funnel.thankYou.body);
  }

  if (state === 'success') {
    return (
      <div className="rounded-[8px] border border-[var(--cc-success)]/40 bg-[var(--cc-success-wash)]/45 px-4 py-3">
        <p className="text-[13px] font-semibold text-[var(--cc-ink)]">
          {profile.funnel.thankYou.headline}
        </p>
        <p className="mt-1 text-[12px] leading-[1.55] text-[var(--cc-ink-3)]">
          {message ?? profile.funnel.thankYou.body}
        </p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[rgba(20,23,28,0.56)] px-4 backdrop-blur-sm">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-[460px] rounded-[12px] border border-white/20 bg-[var(--cc-surface)] p-5 shadow-[0_28px_80px_rgba(15,23,42,0.28)]"
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--cc-ink-4)]">
          {hubTitle}
        </p>
        <h2 className="mt-2 text-[24px] font-semibold leading-tight text-[var(--cc-ink)]">
          {profile.funnel.emailCapture.headline}
        </h2>
        <p className="mt-2 text-[13px] leading-[1.6] text-[var(--cc-ink-3)]">
          {profile.funnel.emailCapture.body}
        </p>

        <label className="mt-4 grid gap-1.5">
          <span className="text-[12px] font-semibold text-[var(--cc-ink-2)]">
            Email
          </span>
          <input
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            className="h-10 rounded-[8px] border border-[var(--cc-rule)] bg-white px-3 text-[14px] text-[var(--cc-ink)] outline-none transition focus:border-[var(--cc-accent)] focus:ring-2 focus:ring-[var(--cc-accent-wash)]"
          />
        </label>

        <label className="mt-3 flex items-start gap-2 text-[12px] leading-[1.5] text-[var(--cc-ink-3)]">
          <input
            name="consent"
            type="checkbox"
            className="mt-0.5 size-4 rounded border-[var(--cc-rule)]"
          />
          <span>
            I agree to receive this creator&apos;s resources and understand I can
            unsubscribe. See the{' '}
            <a href={privacyHref} className="font-semibold text-[var(--cc-accent)]">
              privacy policy
            </a>
            .
          </span>
        </label>

        <div aria-live="polite" className="mt-3 min-h-5 text-[12px] text-[var(--cc-danger)]">
          {state === 'error' ? message : null}
        </div>

        <Button className="mt-2 w-full" disabled={state === 'submitting'} type="submit">
          {state === 'submitting' ? 'Unlocking...' : profile.funnel.emailCapture.cta}
        </Button>
      </form>
    </div>
  );
}
