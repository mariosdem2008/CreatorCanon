import { NextResponse } from 'next/server';
import { auth } from '@creatorcanon/auth';
import { getDb } from '@creatorcanon/db';

import { createVercelClientFromEnv } from '@/lib/vercel/client';
import {
  DeploymentNotReadyError,
  MissingDeploymentSourceError,
  createDeployTriggerRepository,
  readDeploymentTriggerEnv,
  triggerHubDeployment,
} from '@/lib/vercel/deploy-trigger';
import { getHubForDeploymentAccess } from '@/lib/vercel/hub-access';
import {
  toVercelRouteError,
  unwrapVercelRouteError,
} from '@/lib/vercel/route-errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
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

  try {
    const result = await triggerHubDeployment({
      hubId: hubRow.id,
      repository: createDeployTriggerRepository(db),
      vercel: createVercelClientFromEnv(),
      env: readDeploymentTriggerEnv(process.env),
    }).catch((error) => {
      throw toVercelRouteError(error);
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof DeploymentNotReadyError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof MissingDeploymentSourceError) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return unwrapVercelRouteError(error);
  }
}
