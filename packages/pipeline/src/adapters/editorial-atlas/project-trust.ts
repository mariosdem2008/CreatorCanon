import { DEFAULT_TRUST_BLOCK } from './constants';
import type { HubMetadata } from '@creatorcanon/db/schema';

export function projectTrust({ hubMetadata }: { hubMetadata: HubMetadata | null | undefined }) {
  const overrides = hubMetadata?.trust;
  return {
    methodologySummary: overrides?.methodologySummary ?? DEFAULT_TRUST_BLOCK.methodologySummary,
    qualityPrinciples: overrides?.qualityPrinciples ?? DEFAULT_TRUST_BLOCK.qualityPrinciples,
    creationProcess: overrides?.creationProcess ?? DEFAULT_TRUST_BLOCK.creationProcess,
    faq: overrides?.faq ?? DEFAULT_TRUST_BLOCK.faq,
  };
}
