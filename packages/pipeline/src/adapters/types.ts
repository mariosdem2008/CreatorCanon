import type { CreatorManualManifest } from './creator-manual/manifest-types';

export interface AdapterInput {
  runId: string;
  hubId: string;
  releaseId: string;
}

export type AdapterFn = (input: AdapterInput) => Promise<CreatorManualManifest>;
