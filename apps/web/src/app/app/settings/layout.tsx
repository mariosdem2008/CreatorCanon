import type { ReactNode } from 'react';

import { PageHeader } from '@/components/cc';

import { SettingsNav } from './SettingsNav';

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Settings"
        title="Workspace, source, billing."
        body="Workspace identity and connections. Owner-only mutations are gated; everything else is read-only."
      />
      <div className="grid gap-4 lg:grid-cols-[208px_minmax(0,1fr)]">
        <SettingsNav />
        <div className="min-w-0 space-y-4">{children}</div>
      </div>
    </div>
  );
}
