import { cache } from 'react';
import { notFound, permanentRedirect } from 'next/navigation';

import { createR2Client } from '@creatorcanon/adapters';
import { eq, getDb } from '@creatorcanon/db';
import { hub, release } from '@creatorcanon/db/schema';
import { parseServerEnv } from '@creatorcanon/core';
import { sampleCreatorManualManifest } from '@/lib/hub/creator-manual/sampleManifest';
import {
  hubManifestSchema,
  isCreatorManualManifest,
  isEditorialAtlasManifest,
  type CreatorManualManifest,
  type EditorialAtlasManifest,
  type HubManifest as ParsedHubManifest,
} from '@/lib/hub/manifest/schema';
import { getPageRoute } from '@/lib/hub/routes';

type HubRow = {
  id: string;
  subdomain: string;
  theme: string | null;
  liveReleaseId: string | null;
  deletedAt: Date | null;
};

type ReleaseRow = {
  id: string;
  status: string;
  manifestR2Key: string | null;
  liveAt: Date | string | null;
};

export type LoadedHubManifest<TManifest extends ParsedHubManifest = ParsedHubManifest> = {
  hub: HubRow;
  release: ReleaseRow;
  manifest: TManifest;
};

export type HubManifest = LoadedHubManifest;

const CREATOR_MANUAL_PREVIEW_SLUG = 'creator-manual-preview';

function canServeCreatorManualPreview() {
  return process.env.NODE_ENV !== 'production' || process.env.CREATOR_MANUAL_PREVIEW_ENABLED === 'true';
}

function creatorManualPreviewResponse(hubSlug: string): LoadedHubManifest<CreatorManualManifest> {
  return {
    hub: {
      id: 'hub_creator_manual_preview',
      subdomain: hubSlug,
      theme: null,
      liveReleaseId: sampleCreatorManualManifest.releaseId,
      deletedAt: null,
    },
    release: {
      id: sampleCreatorManualManifest.releaseId,
      status: 'live',
      manifestR2Key: null,
      liveAt: sampleCreatorManualManifest.generatedAt,
    },
    manifest: sampleCreatorManualManifest,
  };
}

// React.cache dedupes within a single request — generateMetadata and the page
// render both call loadHubManifest, but only one DB+R2 round-trip happens.
export const loadHubManifest = cache(async (hubSlug: string): Promise<LoadedHubManifest> => {
  if (hubSlug === CREATOR_MANUAL_PREVIEW_SLUG && canServeCreatorManualPreview()) {
    return creatorManualPreviewResponse(hubSlug);
  }

  const db = getDb();
  const hubs = await db
    .select({
      id: hub.id,
      subdomain: hub.subdomain,
      theme: hub.theme,
      liveReleaseId: hub.liveReleaseId,
      deletedAt: hub.deletedAt,
    })
    .from(hub)
    .where(eq(hub.subdomain, hubSlug))
    .limit(1);

  const hubRow = hubs[0];
  if (!hubRow || hubRow.deletedAt || !hubRow.liveReleaseId) notFound();

  const releases = await db
    .select({
      id: release.id,
      status: release.status,
      manifestR2Key: release.manifestR2Key,
      liveAt: release.liveAt,
    })
    .from(release)
    .where(eq(release.id, hubRow.liveReleaseId))
    .limit(1);

  const releaseRow = releases[0];
  if (!releaseRow || releaseRow.status !== 'live' || !releaseRow.manifestR2Key) {
    throw new Error('This hub is published, but its live release manifest is unavailable.');
  }

  const r2 = createR2Client(parseServerEnv(process.env));
  const object = await r2.getObject(releaseRow.manifestR2Key);
  const decoded = new TextDecoder().decode(object.body);
  const manifest = hubManifestSchema.parse(JSON.parse(decoded));

  return {
    hub: hubRow,
    release: releaseRow,
    manifest,
  };
});

export const loadEditorialAtlasManifest = cache(async (hubSlug: string): Promise<LoadedHubManifest<EditorialAtlasManifest>> => {
  const loaded = await loadHubManifest(hubSlug);
  if (!isEditorialAtlasManifest(loaded.manifest)) notFound();
  return { ...loaded, manifest: loaded.manifest };
});

export const loadCreatorManualManifest = cache(async (hubSlug: string): Promise<LoadedHubManifest<CreatorManualManifest>> => {
  const loaded = await loadHubManifest(hubSlug);
  if (!isCreatorManualManifest(loaded.manifest)) notFound();
  return { ...loaded, manifest: loaded.manifest };
});

export const loadCreatorManualManifestOrLegacyRedirect = cache(async (
  hubSlug: string,
  legacySlug: string,
): Promise<LoadedHubManifest<CreatorManualManifest>> => {
  const loaded = await loadHubManifest(hubSlug);
  if (isCreatorManualManifest(loaded.manifest)) return { ...loaded, manifest: loaded.manifest };
  permanentRedirect(getPageRoute(hubSlug, legacySlug));
});
