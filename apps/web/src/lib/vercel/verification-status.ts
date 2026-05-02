export type VerificationStep =
  | 'pending'
  | 'verified'
  | 'ssl_provisioning'
  | 'deploying'
  | 'live'
  | 'failed';

export type DeploymentUiStatus = 'pending' | 'building' | 'live' | 'failed';

export interface VerificationStatusInput {
  domainVerified: boolean;
  sslReady: boolean;
  liveUrl: string | null;
  deploymentStatus?: DeploymentUiStatus;
  failed?: boolean;
}

const DNS_TIMEOUT_MS = 24 * 60 * 60 * 1000;

export function resolveVerificationStep(
  input: VerificationStatusInput,
): VerificationStep {
  if (input.failed || input.deploymentStatus === 'failed') return 'failed';
  if (
    input.domainVerified &&
    input.sslReady &&
    input.liveUrl &&
    input.deploymentStatus === 'live'
  ) {
    return 'live';
  }
  if (input.domainVerified && input.sslReady) return 'deploying';
  if (input.domainVerified && !input.sslReady) return 'ssl_provisioning';
  if (input.domainVerified) return 'verified';
  return 'pending';
}

export function isVerificationTimedOut(
  startedAtIso: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!startedAtIso) return false;
  const startedAt = new Date(startedAtIso).getTime();
  if (!Number.isFinite(startedAt)) return false;
  return now.getTime() - startedAt >= DNS_TIMEOUT_MS;
}
