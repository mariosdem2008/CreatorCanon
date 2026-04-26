import type { EditorialAtlasManifest } from './editorial-atlas/manifest-types';

export interface AdapterInput {
  runId: string;
  hubId: string;
  releaseId: string;
}

export type AdapterFn = (input: AdapterInput) => Promise<EditorialAtlasManifest>;
