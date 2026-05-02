'use client';

import { useFormStatus } from 'react-dom';

import { Icon } from '@creatorcanon/ui';

import type { ArchiveAuditActionState } from '@/app/(marketing)/archive-audit/actions';
import { Button } from '@/components/ui/button';
import { AuditProgress } from './AuditProgress';

interface AuditUrlFormProps {
  action: (formData: FormData) => void;
  state: ArchiveAuditActionState;
}

export function AuditUrlForm({ action, state }: AuditUrlFormProps) {
  return (
    <form action={action} className="mt-8 max-w-[640px]">
      <label htmlFor="channelUrl" className="text-caption font-medium uppercase text-ink-4">
        YouTube channel URL
      </label>
      <div className="mt-2 flex flex-col gap-3 sm:flex-row">
        <input
          id="channelUrl"
          name="channelUrl"
          type="text"
          required
          minLength={3}
          maxLength={300}
          placeholder="https://www.youtube.com/@yourchannel"
          className="focus:ring-amber/20 min-h-11 flex-1 rounded-[var(--r-sm)] border border-rule-strong bg-paper px-4 text-body-sm text-ink shadow-1 outline-none transition focus:border-amber focus:ring-2"
        />
        <SubmitButton />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-caption text-ink-4">
        <span className="inline-flex items-center gap-1.5">
          <Icon name="lock" size={13} />
          No login required
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Icon name="globe" size={13} />
          Public data only
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Icon name="clock" size={13} />
          Usually under a minute
        </span>
      </div>
      {state.status === 'error' ? (
        <p className="border-rose/25 bg-rose/10 mt-4 rounded-[var(--r-sm)] border px-3 py-2 text-body-sm text-rose">
          {state.message}
        </p>
      ) : null}
      <AuditProgress />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant="accent" size="lg" disabled={pending} className="min-w-[156px]">
      {pending ? (
        <>
          <Icon name="refresh" size={14} className="animate-spin" />
          Auditing
        </>
      ) : (
        <>
          Audit my archive
          <Icon name="arrowRight" size={14} />
        </>
      )}
    </Button>
  );
}
