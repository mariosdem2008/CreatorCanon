import { eq } from '@creatorcanon/db';
import { user, workspaceMember } from '@creatorcanon/db/schema';

import { requireWorkspace } from '@/lib/workspace';

import { SettingsNote, SettingsPanel, SettingsRow } from '../panels';
import { inviteByEmail } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Settings — Team' };

type MemberRow = {
  userId: string;
  role: string;
  joinedAt: Date | null;
  invitedAt: Date | null;
  name: string | null;
  email: string | null;
};

export default async function SettingsTeamPage() {
  const { db, workspaceId, role: viewerRole, userId } = await requireWorkspace();

  const rows: MemberRow[] = await db
    .select({
      userId: workspaceMember.userId,
      role: workspaceMember.role,
      joinedAt: workspaceMember.joinedAt,
      invitedAt: workspaceMember.invitedAt,
      name: user.name,
      email: user.email,
    })
    .from(workspaceMember)
    .leftJoin(user, eq(user.id, workspaceMember.userId))
    .where(eq(workspaceMember.workspaceId, workspaceId));

  const owners = rows.filter((m) => m.role === 'owner');
  const editors = rows.filter((m) => m.role === 'editor');
  const others = rows.filter((m) => m.role !== 'owner' && m.role !== 'editor');

  return (
    <>
      <SettingsPanel
        title="Members"
        description="Everyone with access to this workspace and the role they hold."
        meta={`${rows.length} total · ${owners.length} owner${owners.length === 1 ? '' : 's'}`}
      >
        {rows.length === 0 ? (
          <div className="px-5 py-8 text-center text-[13px] text-[var(--cc-ink-4)]">
            No members. (You should at least see yourself — if not, refresh.)
          </div>
        ) : (
          <div className="divide-y divide-[var(--cc-rule)]">
            {rows.map((member) => (
              <div
                key={member.userId}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold text-[var(--cc-ink)]">
                    {member.name ?? member.email ?? 'Workspace user'}
                    {member.userId === userId ? (
                      <span className="ml-2 rounded-full bg-[var(--cc-accent-wash)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--cc-accent)]">
                        you
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 truncate text-[12px] text-[var(--cc-ink-4)]">
                    {member.email ?? '—'}
                  </p>
                </div>
                <div className="text-right text-[12px]">
                  <p className="font-semibold text-[var(--cc-ink)]">{member.role}</p>
                  <p className="mt-0.5 text-[var(--cc-ink-4)]">
                    {member.joinedAt
                      ? `Joined ${formatDate(member.joinedAt)}`
                      : member.invitedAt
                        ? `Invited ${formatDate(member.invitedAt)}`
                        : '—'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </SettingsPanel>

      <SettingsPanel
        title="Roles"
        description="Capabilities each role currently has on the workspace."
      >
        <SettingsRow label="Owners" value={String(owners.length)} hint="Billing, source, publish." />
        <SettingsRow label="Editors" value={String(editors.length)} hint="Configure projects, edit drafts." />
        <SettingsRow label="Other" value={String(others.length)} hint="Read-only or pending invites." />
      </SettingsPanel>

      <SettingsPanel
        title="Invites"
        description="Allowlist a teammate's email so they can sign in with Google."
      >
        {viewerRole === 'owner' ? (
          <form
            action={inviteByEmail}
            className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-end"
          >
            <label htmlFor="invite-email" className="flex-1 min-w-0">
              <span className="block text-[12px] font-semibold text-[var(--cc-ink)]">
                Email to invite
              </span>
              <input
                id="invite-email"
                name="email"
                type="email"
                required
                placeholder="teammate@example.com"
                autoComplete="email"
                className="mt-2 h-10 w-full rounded-[8px] border border-[var(--cc-rule)] bg-white px-3 text-[13px] text-[var(--cc-ink)] outline-none focus:border-[var(--cc-accent)] focus:ring-2 focus:ring-[var(--cc-accent-wash)]"
              />
            </label>
            <button
              type="submit"
              className="inline-flex h-10 items-center rounded-[8px] bg-[var(--cc-accent)] px-4 text-[12px] font-semibold text-white shadow-[0_1px_2px_rgba(88,86,246,0.18)] transition hover:bg-[var(--cc-accent-strong)]"
            >
              Send invite
            </button>
          </form>
        ) : (
          <SettingsNote tone="pending">
            Only workspace owners can invite teammates.
          </SettingsNote>
        )}
        <SettingsNote>
          Allowlisting an email lets that person complete Google sign-in. Workspace
          membership is created automatically on their first sign-in event.
        </SettingsNote>
      </SettingsPanel>

      {viewerRole !== 'owner' ? (
        <SettingsNote tone="info">
          You&apos;re viewing this as a {viewerRole}. Owner-only actions stay hidden.
        </SettingsNote>
      ) : null}
    </>
  );
}

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(value);
}
