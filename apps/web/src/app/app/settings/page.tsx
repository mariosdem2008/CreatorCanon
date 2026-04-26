import Link from 'next/link';

import { eq } from '@creatorcanon/db';
import { channel, customer, workspace, workspaceMember } from '@creatorcanon/db/schema';

import { requireWorkspace } from '@/lib/workspace';

import { SettingsPanel, SettingsRow } from './panels';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Settings — Overview' };

export default async function SettingsOverviewPage() {
  const { db, session, workspaceId, role } = await requireWorkspace();

  const [workspaceRows, channels, members, customers] = await Promise.all([
    db.select().from(workspace).where(eq(workspace.id, workspaceId)).limit(1),
    db.select().from(channel).where(eq(channel.workspaceId, workspaceId)).limit(1),
    db.select().from(workspaceMember).where(eq(workspaceMember.workspaceId, workspaceId)),
    db.select().from(customer).where(eq(customer.workspaceId, workspaceId)).limit(1),
  ]);

  const ws = workspaceRows[0];
  const ch = channels[0];
  const billing = customers[0];

  return (
    <>
      <SettingsPanel
        title="Workspace"
        description="Identifiers and ownership state."
      >
        <SettingsRow label="Workspace ID" value={workspaceId} mono />
        <SettingsRow label="Slug" value={ws?.slug ?? 'Not set'} />
        <SettingsRow label="Your role" value={role} />
        <SettingsRow label="Members" value={String(members.length)} />
      </SettingsPanel>

      <SettingsPanel
        title="Profile"
        description="Authentication identity backing this session."
      >
        <SettingsRow label="Name" value={session.user.name ?? 'Not set'} />
        <SettingsRow label="Email" value={session.user.email ?? 'Not set'} />
        <SettingsRow label="Admin" value={session.user.isAdmin ? 'Yes' : 'No'} />
      </SettingsPanel>

      <SettingsPanel
        title="At a glance"
        description="Quick links into focused settings sections."
      >
        <SettingsRow
          label="Source"
          value={
            <Link
              href="/app/settings/source"
              className="font-semibold text-[var(--cc-accent)] hover:underline"
            >
              {ch?.title ?? 'Connect channel'} →
            </Link>
          }
        />
        <SettingsRow
          label="Billing"
          value={
            <Link
              href="/app/settings/billing"
              className="font-semibold text-[var(--cc-accent)] hover:underline"
            >
              {billing?.stripeCustomerId ? 'View ledger' : 'Not yet billed'} →
            </Link>
          }
        />
        <SettingsRow
          label="Team"
          value={
            <Link
              href="/app/settings/team"
              className="font-semibold text-[var(--cc-accent)] hover:underline"
            >
              {members.length} member{members.length === 1 ? '' : 's'} →
            </Link>
          }
        />
      </SettingsPanel>
    </>
  );
}
