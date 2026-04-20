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
      className="h-10 rounded-md bg-ink px-4 text-body-sm font-medium text-paper transition hover:opacity-90 disabled:opacity-50"
    >
      {pending ? 'Connecting…' : 'Connect YouTube Channel'}
    </button>
  );
}

export function ConnectChannelForm() {
  const [state, formAction] = useFormState(connectYouTubeChannel, initialState);

  return (
    <form action={formAction}>
      {state.error && (
        <p className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-body-sm text-red-700">
          {state.error}
        </p>
      )}
      <SubmitButton />
    </form>
  );
}
