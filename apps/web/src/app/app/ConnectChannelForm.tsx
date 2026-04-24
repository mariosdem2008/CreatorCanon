'use client';

import { useFormState, useFormStatus } from 'react-dom';

import { connectYouTubeChannel } from './actions';

const initialState: { error?: string } = {};

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-ink px-5 text-body-sm font-medium text-paper shadow-1 transition hover:opacity-90 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber focus-visible:ring-offset-2 sm:w-auto"
    >
      {pending ? (
        <>
          <span
            className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-paper/40 border-t-paper"
            aria-hidden="true"
          />
          Connecting...
        </>
      ) : (
        'Connect YouTube channel'
      )}
    </button>
  );
}

export function ConnectChannelForm() {
  const [state, formAction] = useFormState(connectYouTubeChannel, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <div className="rounded-2xl border border-rule bg-paper-2 p-4 sm:p-5">
        <p className="text-eyebrow uppercase tracking-widest text-ink-4">Channel import</p>
        <p className="mt-2 text-body-sm leading-6 text-ink-3">
          We use your Google session to verify the YouTube channel tied to this workspace, then
          import channel metadata and the available video catalog.
        </p>
      </div>

      {state.error ? (
        <p
          className="rounded-lg border border-rose/30 bg-rose/10 px-4 py-3 text-body-sm text-rose"
          role="alert"
        >
          {state.error}
        </p>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-caption leading-5 text-ink-4">
          Uses the Google account already authenticated in CreatorCanon.
        </div>
        <SubmitButton />
      </div>
    </form>
  );
}
