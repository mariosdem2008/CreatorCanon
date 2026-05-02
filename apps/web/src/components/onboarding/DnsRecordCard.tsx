import type { DnsRecord } from '@/lib/vercel/domain-utils';

export function DnsRecordCard({ record }: { record: DnsRecord }) {
  return (
    <div className="grid gap-3 rounded-[8px] border border-[var(--cc-rule)] bg-white p-3 text-[12px] sm:grid-cols-[88px_1fr_1.6fr] sm:items-center">
      <div>
        <div className="text-[10px] font-semibold uppercase text-[var(--cc-ink-4)]">
          Type
        </div>
        <div className="mt-1 font-semibold text-[var(--cc-ink)]">{record.type}</div>
      </div>
      <div>
        <div className="text-[10px] font-semibold uppercase text-[var(--cc-ink-4)]">
          Name
        </div>
        <code className="mt-1 block break-all rounded-[6px] bg-[var(--cc-surface-2)] px-2 py-1 font-mono text-[12px] text-[var(--cc-ink)]">
          {record.name}
        </code>
      </div>
      <div>
        <div className="text-[10px] font-semibold uppercase text-[var(--cc-ink-4)]">
          Value
        </div>
        <code className="mt-1 block break-all rounded-[6px] bg-[var(--cc-surface-2)] px-2 py-1 font-mono text-[12px] text-[var(--cc-ink)]">
          {record.value}
        </code>
      </div>
    </div>
  );
}
