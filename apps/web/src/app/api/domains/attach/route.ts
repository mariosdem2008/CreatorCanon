import { NextResponse } from 'next/server';
import { auth } from '@creatorcanon/auth';
import { getDb } from '@creatorcanon/db';
import { z } from 'zod';

import {
  attachDomainToVercelProject,
  createDomainAttachmentRepository,
} from '@/lib/vercel/domain-attach';
import {
  createDeploymentRepository,
  createHubVercelProject,
} from '@/lib/vercel/project-create';
import { createVercelClientFromEnv } from '@/lib/vercel/client';
import { getHubForDeploymentAccess } from '@/lib/vercel/hub-access';
import { validateCustomDomain } from '@/lib/vercel/domain-utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const attachDomainBody = z.object({
  hubId: z.string().min(1),
  domain: z.string().min(1).optional(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const parsed = attachDomainBody.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const db = getDb();
  const hubRow = await getHubForDeploymentAccess(
    db,
    parsed.data.hubId,
    session.user.id,
  );
  if (!hubRow) {
    return NextResponse.json({ error: 'Hub not found' }, { status: 404 });
  }

  const requestedDomain = parsed.data.domain
    ? validateCustomDomain(parsed.data.domain)
    : null;
  if (requestedDomain && !requestedDomain.valid) {
    return NextResponse.json(
      { error: requestedDomain.message ?? 'Invalid domain' },
      { status: 400 },
    );
  }

  const customDomain = requestedDomain?.domain ?? hubRow.customDomain;
  const vercel = createVercelClientFromEnv();
  const deploymentRepository = createDeploymentRepository(db);
  const result = await createHubVercelProject({
    hub: {
      hubId: hubRow.id,
      hubSlug: hubRow.subdomain,
    },
    vercel,
    repository: deploymentRepository,
    env: {
      DATABASE_URL: process.env.DATABASE_URL,
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
      NEXT_PUBLIC_HUB_ROOT_DOMAIN: process.env.NEXT_PUBLIC_HUB_ROOT_DOMAIN,
    },
  });
  const domainAttachment = customDomain
    ? await attachDomainToVercelProject({
        hubId: hubRow.id,
        vercelProjectId: result.vercelProjectId,
        domain: customDomain,
        vercel,
        repository: createDomainAttachmentRepository(db),
      })
    : null;

  return NextResponse.json({
    deploymentId: result.deploymentId,
    hubId: result.hubId,
    vercelProjectId: result.vercelProjectId,
    reusedExistingProject: result.reusedExistingProject,
    domain: domainAttachment,
  });
}
