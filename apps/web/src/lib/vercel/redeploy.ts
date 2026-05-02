import type { DeploymentStatus } from '@creatorcanon/db/schema';

import type { VercelClient } from './client';
import {
  DeploymentNotReadyError,
  MissingDeploymentSourceError,
  triggerHubDeployment,
  type DeploymentTriggerEnv,
  type DeploymentTriggerRepository,
} from './deploy-trigger';

export interface RedeployAfterPublishResult {
  triggered: boolean;
  status?: DeploymentStatus;
  liveUrl?: string | null;
  vercelDeploymentId?: string | null;
  reason?: string;
}

export async function triggerRedeployAfterPublish(options: {
  hubId: string;
  repository: DeploymentTriggerRepository;
  vercel: Pick<
    VercelClient,
    'createDeployment' | 'getDeployment' | 'addProjectDomain' | 'getProjectDomain'
  >;
  env: DeploymentTriggerEnv;
}): Promise<RedeployAfterPublishResult> {
  try {
    const result = await triggerHubDeployment({
      hubId: options.hubId,
      repository: options.repository,
      vercel: options.vercel,
      env: options.env,
      force: true,
    });

    return {
      triggered: result.status === 'building' || result.status === 'live',
      status: result.status,
      liveUrl: result.liveUrl,
      vercelDeploymentId: result.vercelDeploymentId,
      reason: result.lastError ?? undefined,
    };
  } catch (error) {
    if (
      error instanceof DeploymentNotReadyError ||
      error instanceof MissingDeploymentSourceError ||
      error instanceof Error
    ) {
      return { triggered: false, reason: error.message };
    }

    return { triggered: false, reason: 'Redeploy trigger failed.' };
  }
}
