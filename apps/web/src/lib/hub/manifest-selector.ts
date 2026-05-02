export type HubManifestSelector =
  | { column: 'id'; value: string }
  | { column: 'subdomain'; value: string };

export function resolveHubManifestSelector(
  hubSlug: string,
  env: { HUB_ID?: string } = { HUB_ID: process.env.HUB_ID },
): HubManifestSelector {
  const hubId = env.HUB_ID?.trim();
  if (hubId) {
    return { column: 'id', value: hubId };
  }
  return { column: 'subdomain', value: hubSlug };
}
