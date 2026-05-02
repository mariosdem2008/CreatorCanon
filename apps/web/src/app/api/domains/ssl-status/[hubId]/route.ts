import { NextResponse } from 'next/server';
import { auth } from '@creatorcanon/auth';
import { getDb } from '@creatorcanon/db';

import {
  createDomainAttachmentRepository,
  refreshSslStatus,
} from '@/lib/vercel/domain-attach';
import { createVercelClientFromEnv } from '@/lib/vercel/client';
import {
  toVercelRouteError,
  unwrapVercelRouteError,
} from '@/lib/vercel/route-errors';
import { getHubForDeploymentAccess } from '@/lib/vercel/hub-access';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: { hubId: string } },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getDb();
  const hubRow = await getHubForDeploymentAccess(db, params.hubId, session.user.id);
  if (!hubRow) {
    return NextResponse.json({ error: 'Hub not found' }, { status: 404 });
  }

  const repository = createDomainAttachmentRepository(db);
  const current = await repository.findDomainStatusByHubId(hubRow.id);
  if (!current?.vercelProjectId || !current.customDomain) {
    return NextResponse.json(
      { error: 'No custom domain is attached for this hub.' },
      { status: 409 },
    );
  }

  try {
    const status = await refreshSslStatus({
      hubId: hubRow.id,
      vercel: createVercelClientFromEnv(),
      repository,
    }).catch((error) => {
      throw toVercelRouteError(error);
    });

    return NextResponse.json({
      hubId: status.hubId,
      customDomain: status.customDomain,
      sslReady: status.sslReady,
      misconfigured: status.misconfigured,
    });
  } catch (error) {
    return unwrapVercelRouteError(error);
  }
}
