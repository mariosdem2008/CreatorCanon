import { and, eq, inArray, isNull, type AtlasDb } from '@creatorcanon/db';
import { hub, workspaceMember } from '@creatorcanon/db/schema';

export interface HubDeploymentAccess {
  id: string;
  workspaceId: string;
  subdomain: string;
  customDomain: string | null;
}

export async function getHubForDeploymentAccess(
  db: AtlasDb,
  hubId: string,
  userId: string,
): Promise<HubDeploymentAccess | null> {
  const rows = await db
    .select({
      id: hub.id,
      workspaceId: hub.workspaceId,
      subdomain: hub.subdomain,
      customDomain: hub.customDomain,
    })
    .from(hub)
    .innerJoin(
      workspaceMember,
      and(
        eq(workspaceMember.workspaceId, hub.workspaceId),
        eq(workspaceMember.userId, userId),
      ),
    )
    .where(
      and(
        eq(hub.id, hubId),
        isNull(hub.deletedAt),
        inArray(workspaceMember.role, ['owner', 'editor']),
      ),
    )
    .limit(1);

  return rows[0] ?? null;
}
