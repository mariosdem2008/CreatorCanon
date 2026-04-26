// apps/web/src/components/hub/EditorialAtlas/ask/AskHubInput.tsx
'use client';

import { useState, type FormEvent } from 'react';

type Props = {
  initial?: string;
  placeholder?: string;
  pending?: boolean;
  onSubmit: (question: string) => void;
};

export function AskHubInput({ initial = '', placeholder = 'Ask about productivity, learning, systems, focus, or anything covered in this hub…', pending, onSubmit }: Props) {
  const [value, setValue] = useState(initial);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!value.trim() || pending) return;
    onSubmit(value.trim());
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-[14px] border border-[#E5DECF] bg-white p-3">
      <textarea
        value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder}
        rows={2}
        className="w-full resize-none bg-transparent px-2 py-1 text-[14px] leading-[1.55] text-[#1A1612] placeholder:text-[#9A8E7C] focus:outline-none"
      />
      <div className="mt-2 flex items-center justify-end gap-2">
        <button type="submit" disabled={pending || !value.trim()}
          className="inline-flex h-9 items-center rounded-[8px] bg-[#1A1612] px-4 text-[12px] font-semibold text-[#F8F4EC] disabled:opacity-50 hover:opacity-90">
          {pending ? 'Asking…' : 'Ask this hub →'}
        </button>
      </div>
    </form>
  );
}
