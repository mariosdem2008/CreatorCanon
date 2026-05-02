export type HubManifestSelector =
  | { column: 'id'; value: string }
  | { column: 'subdomain'; value: string };

export function resolveHubManifestSelector(
  hubSlug: string | null | undefined,
  env: { HUB_ID?: string } = { HUB_ID: process.env.HUB_ID },
): HubManifestSelector {
  const hubId = env.HUB_ID?.trim();
  if (hubId) {
    return { column: 'id', value: hubId };
  }
  if (!hubSlug) {
    throw new Error('Hub slug is required when HUB_ID is not configured.');
  }
  return { column: 'subdomain', value: hubSlug };
}
