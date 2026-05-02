export type HubPublicUrlEnv = Partial<
  Record<'NEXT_PUBLIC_APP_URL' | 'NEXT_PUBLIC_HUB_ROOT_DOMAIN', string | null>
>;

export interface HubPublicUrlInput {
  subdomain: string;
  customDomain?: string | null;
}

const FALLBACK_APP_URL = 'http://localhost:3000';
const RESERVED_WILDCARD_HOSTS = new Set([
  'admin',
  'api',
  'app',
  'auth',
  'docs',
  'mail',
  'monitoring',
  'status',
  'support',
  'www',
]);
const HUB_PUBLIC_ROUTE_PREFIXES = [
  '/claims',
  '/glossary',
  '/library',
  '/pillars',
  '/search',
  '/segments',
  '/sources',
  '/themes',
  '/workshop',
];
const SUBDOMAIN_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const PER_PROJECT_HUB_ROUTE_SLUG = 'hub';

export function buildHubPublicUrl(
  input: HubPublicUrlInput,
  env: HubPublicUrlEnv = getRuntimeHubPublicUrlEnv(),
): string {
  const customDomain = normalizeHostname(input.customDomain);
  if (customDomain) {
    return `https://${customDomain}`;
  }
  return buildHubSubdomainUrl(input.subdomain, env);
}

export function buildHubSubdomainUrl(
  subdomain: string,
  env: HubPublicUrlEnv = getRuntimeHubPublicUrlEnv(),
): string {
  const hostname = buildHubSubdomainHostname(subdomain, env);
  if (hostname) {
    return `https://${hostname}`;
  }

  const normalizedSubdomain = normalizeSubdomain(subdomain);
  return `${normalizeAppOrigin(env.NEXT_PUBLIC_APP_URL)}/h/${normalizedSubdomain}`;
}

export function buildHubSubdomainHostname(
  subdomain: string,
  env: HubPublicUrlEnv = getRuntimeHubPublicUrlEnv(),
): string | null {
  const rootDomain = normalizeHostname(env.NEXT_PUBLIC_HUB_ROOT_DOMAIN);
  if (!rootDomain) return null;
  return `${normalizeSubdomain(subdomain)}.${rootDomain}`;
}

export function getHubSubdomainFromHost(
  host: string | null | undefined,
  rootDomain: string | null | undefined,
): string | null {
  const hostname = normalizeHostname(host);
  const normalizedRootDomain = normalizeHostname(rootDomain);
  if (!hostname || !normalizedRootDomain) return null;
  if (hostname === normalizedRootDomain) return null;
  if (!hostname.endsWith(`.${normalizedRootDomain}`)) return null;

  const prefix = hostname.slice(0, -normalizedRootDomain.length - 1);
  if (!SUBDOMAIN_RE.test(prefix)) return null;
  if (RESERVED_WILDCARD_HOSTS.has(prefix)) return null;
  return prefix;
}

export function buildHubRoutePath(hubSlug: string, pathname: string): string {
  const normalizedHubSlug = normalizeSubdomain(hubSlug);
  const normalizedPathname = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return `/h/${normalizedHubSlug}${normalizedPathname === '/' ? '' : normalizedPathname}`;
}

export function buildPerProjectHubRoutePath(
  hubId: string | null | undefined,
  pathname: string,
): string | null {
  if (!hubId?.trim() || pathname === '/' || !isHubPublicRoute(pathname)) {
    return null;
  }
  return buildHubRoutePath(PER_PROJECT_HUB_ROUTE_SLUG, pathname);
}

export function isHubPublicRoute(pathname: string): boolean {
  return (
    pathname === '/' ||
    HUB_PUBLIC_ROUTE_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    )
  );
}

function normalizeSubdomain(subdomain: string): string {
  const normalized = subdomain.trim().toLowerCase();
  if (!SUBDOMAIN_RE.test(normalized) || RESERVED_WILDCARD_HOSTS.has(normalized)) {
    throw new Error(`Invalid hub subdomain: ${subdomain}`);
  }
  return normalized;
}

function normalizeAppOrigin(value: string | null | undefined): string {
  const candidate = value?.trim() || FALLBACK_APP_URL;
  try {
    const parsed = new URL(candidate);
    return parsed.origin.replace(/\/$/, '');
  } catch {
    return FALLBACK_APP_URL;
  }
}

function normalizeHostname(value: string | null | undefined): string | null {
  const trimmed = value?.trim().toLowerCase();
  if (!trimmed) return null;

  const withoutProtocol = trimmed.replace(/^https?:\/\//, '');
  const hostWithMaybePort = withoutProtocol.split(/[/?#]/)[0]?.replace(/\.$/, '');
  if (!hostWithMaybePort) return null;

  if (hostWithMaybePort.startsWith('[')) {
    return null;
  }

  const host = hostWithMaybePort.split(':')[0]?.replace(/\.$/, '');
  return host || null;
}

function getRuntimeHubPublicUrlEnv(): HubPublicUrlEnv {
  return {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_HUB_ROOT_DOMAIN: process.env.NEXT_PUBLIC_HUB_ROOT_DOMAIN,
  };
}
