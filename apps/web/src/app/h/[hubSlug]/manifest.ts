import { cache } from 'react';
import { notFound } from 'next/navigation';

import { createR2Client } from '@creatorcanon/adapters';
import { eq, getDb } from '@creatorcanon/db';
import { hub, release } from '@creatorcanon/db/schema';
import { parseServerEnv } from '@creatorcanon/core';
import { editorialAtlasManifestSchema, type EditorialAtlasManifest } from '@/lib/hub/manifest/schema';

export type HubManifest = Awaited<ReturnType<typeof loadHubManifest>>;

// React.cache dedupes within a single request — generateMetadata and the page
// render both call loadHubManifest, but only one DB+R2 round-trip happens.
export const loadHubManifest = cache(async (hubSlug: string) => {
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
  const manifest: EditorialAtlasManifest = editorialAtlasManifestSchema.parse(JSON.parse(decoded));

  return {
    hub: hubRow,
    release: releaseRow,
    manifest,
  };
});
