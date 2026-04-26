import type { EditorialAtlasManifest } from '../../../../apps/web/src/lib/hub/manifest/schema';

export interface AdapterInput {
  runId: string;
  hubId: string;
  releaseId: string;
}

export type AdapterFn = (input: AdapterInput) => Promise<EditorialAtlasManifest>;
