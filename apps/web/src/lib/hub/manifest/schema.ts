import {
  creatorManualManifestSchema,
  type CreatorManualManifest,
} from '../creator-manual/schema';

export const hubManifestSchema = creatorManualManifestSchema;
export type HubManifest = CreatorManualManifest;
export type { CreatorManualManifest };

export function isCreatorManualManifest(manifest: HubManifest): manifest is CreatorManualManifest {
  return manifest.schemaVersion === 'creator_manual_v1';
}
