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
      className="inline-flex h-10 items-center gap-2 rounded-lg bg-ink px-5 text-body-sm font-medium text-paper transition hover:opacity-90 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber focus-visible:ring-offset-2"
    >
      {pending ? (
        <>
          <span className="h-3.5 w-3.5 rounded-full border-2 border-paper/40 border-t-paper animate-spin" aria-hidden="true" />
          Connecting…
        </>
      ) : (
        'Connect YouTube Channel'
      )}
    </button>
  );
}

export function ConnectChannelForm() {
  const [state, formAction] = useFormState(connectYouTubeChannel, initialState);

  return (
    <form action={formAction}>
      {state.error && (
        <p className="mb-4 rounded-lg border border-rose/30 bg-rose/10 px-4 py-3 text-body-sm text-rose" role="alert">
          {state.error}
        </p>
      )}
      <SubmitButton />
    </form>
  );
}
