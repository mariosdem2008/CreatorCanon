import Link from 'next/link';
import { redirect } from 'next/navigation';

import { and, eq, getDb } from '@creatorcanon/db';
import { deployment, hub, project } from '@creatorcanon/db/schema';

import { PageHeader, StatusPill } from '@/components/cc';
import { DomainConnector } from '@/components/onboarding/DomainConnector';
import { buildHubSubdomainUrl } from '@/lib/hub/public-url';
import { requireWorkspace } from '@/lib/workspace';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Domain' };

export default async function ProjectDomainPage({
  params,
}: {
  params: { id: string };
}) {
  const { workspaceId } = await requireWorkspace();
  const db = getDb();

  const projects = await db
    .select({
      id: project.id,
      title: project.title,
      workspaceId: project.workspaceId,
      publishedHubId: project.publishedHubId,
    })
    .from(project)
    .where(eq(project.id, params.id))
    .limit(1);
  const proj = projects[0];
  if (!proj || proj.workspaceId !== workspaceId) redirect('/app/projects');
  if (!proj.publishedHubId) redirect(`/app/projects/${params.id}`);

  const hubRows = await db
    .select({
      id: hub.id,
      subdomain: hub.subdomain,
      customDomain: hub.customDomain,
      domainVerified: deployment.domainVerified,
      sslReady: deployment.sslReady,
      liveUrl: deployment.liveUrl,
      deploymentStatus: deployment.status,
      lastError: deployment.lastError,
      domainAttachedAt: deployment.domainAttachedAt,
    })
    .from(hub)
    .leftJoin(deployment, eq(deployment.hubId, hub.id))
    .where(and(eq(hub.id, proj.publishedHubId), eq(hub.workspaceId, workspaceId)))
    .limit(1);
  const hubRow = hubRows[0];
  if (!hubRow) redirect(`/app/projects/${params.id}`);
  const fallbackUrl = buildHubSubdomainUrl(hubRow.subdomain);

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow={
          <Link href={`/app/projects/${params.id}`} className="hover:text-[var(--cc-ink)]">
            {proj.title}
          </Link>
        }
        title="Domain"
        body="Connect the public hub to a domain you control. DNS propagation can take a few minutes or, in rare cases, up to 24 hours."
        actions={
          hubRow.liveUrl ? (
            <StatusPill tone="success">Live</StatusPill>
          ) : hubRow.sslReady ? (
            <StatusPill tone="success">SSL ready</StatusPill>
          ) : hubRow.domainVerified ? (
            <StatusPill tone="info">SSL provisioning</StatusPill>
          ) : (
            <StatusPill tone="neutral">DNS setup</StatusPill>
          )
        }
      />

      <DomainConnector
        hubId={hubRow.id}
        initialDomain={hubRow.customDomain}
        initialDomainVerified={hubRow.domainVerified ?? false}
        initialSslReady={hubRow.sslReady ?? false}
        initialLiveUrl={hubRow.liveUrl}
        initialDeploymentStatus={hubRow.deploymentStatus ?? 'pending'}
        initialDeploymentError={hubRow.lastError}
        statusStartedAtIso={hubRow.domainAttachedAt?.toISOString() ?? null}
        fallbackUrl={fallbackUrl}
      />
    </div>
  );
}
