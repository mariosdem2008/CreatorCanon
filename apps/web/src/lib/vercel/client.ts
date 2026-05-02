export type VercelFetch = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

export interface VercelClientOptions {
  token: string;
  teamId?: string;
  teamSlug?: string;
  baseUrl?: string;
  fetch?: VercelFetch;
}

export interface VercelProject {
  id: string;
  name: string;
  framework?: string | null;
  rootDirectory?: string | null;
}

export interface VercelCreateProjectRequest {
  name: string;
  framework?: 'nextjs' | string;
  rootDirectory?: string;
  buildCommand?: string | null;
  devCommand?: string | null;
  installCommand?: string | null;
  outputDirectory?: string | null;
  publicSource?: boolean;
  environmentVariables?: VercelProjectEnvironmentVariable[];
}

export interface VercelProjectEnvironmentVariable {
  key: string;
  value: string;
  target: Array<'production' | 'preview' | 'development'>;
  type?: 'encrypted' | 'plain' | 'sensitive';
}

export interface VercelVerificationRecord {
  type: string;
  domain: string;
  value: string;
  reason?: string;
}

export interface VercelProjectDomain {
  name: string;
  apexName?: string;
  projectId: string;
  verified: boolean;
  redirect?: string | null;
  redirectStatusCode?: 301 | 302 | 307 | 308 | null;
  gitBranch?: string | null;
  customEnvironmentId?: string | null;
  updatedAt?: number;
  createdAt?: number;
  verification?: VercelVerificationRecord[];
}

export interface VercelProjectDomainsResponse {
  domains: VercelProjectDomain[];
  pagination?: {
    count: number;
    next?: number | null;
    prev?: number | null;
  };
}

export interface VercelDomainConfig {
  configuredBy: 'A' | 'CNAME' | 'http' | 'dns-01' | null;
  acceptedChallenges: Array<'dns-01' | 'http-01' | string>;
  recommendedIPv4: Array<{ rank: number; value: string[] }>;
  recommendedCNAME: Array<{ rank: number; value: string }>;
  misconfigured: boolean;
}

export interface VercelCert {
  id: string;
  createdAt: number;
  expiresAt: number;
  autoRenew: boolean;
  cns: string[];
}

export interface VercelCreateDeploymentRequest {
  name: string;
  project: string;
  target?: 'production' | 'staging' | (string & {}) | null;
  meta?: Record<string, string>;
  gitSource?: {
    type: 'github';
    repoId: string | number;
    ref?: string | null;
    sha?: string;
    prId?: number | null;
  };
  projectSettings?: {
    buildCommand?: string | null;
    installCommand?: string | null;
    framework?: string | null;
    rootDirectory?: string | null;
  };
}

export interface VercelDeployment {
  id: string;
  url?: string;
  readyState?: string;
  errorCode?: string;
  errorMessage?: string;
  project?: {
    id: string;
    name: string;
    framework?: string | null;
  };
}

interface VercelErrorResponse {
  error?: {
    code?: string;
    message?: string;
  };
  message?: string;
}

export class VercelApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly responseBody: unknown;

  constructor(opts: {
    status: number;
    message: string;
    code?: string;
    responseBody: unknown;
  }) {
    super(opts.message);
    this.name = 'VercelApiError';
    this.status = opts.status;
    this.code = opts.code;
    this.responseBody = opts.responseBody;
  }
}

export class MissingVercelTokenError extends Error {
  constructor() {
    super('VERCEL_TOKEN is required for Vercel API requests');
    this.name = 'MissingVercelTokenError';
  }
}

export interface VercelClient {
  getProject(idOrName: string): Promise<VercelProject>;
  createProject(requestBody: VercelCreateProjectRequest): Promise<VercelProject>;
  addProjectDomain(
    idOrName: string,
    domain: string,
  ): Promise<VercelProjectDomain>;
  getProjectDomain(
    idOrName: string,
    domain: string,
  ): Promise<VercelProjectDomain>;
  getProjectDomains(idOrName: string): Promise<VercelProjectDomainsResponse>;
  verifyProjectDomain(
    idOrName: string,
    domain: string,
  ): Promise<VercelProjectDomain>;
  getDomainConfig(
    domain: string,
    options?: { projectIdOrName?: string; strict?: boolean },
  ): Promise<VercelDomainConfig>;
  issueCert(commonNames: string[]): Promise<VercelCert>;
  getCertById(id: string): Promise<VercelCert>;
  createDeployment(
    requestBody: VercelCreateDeploymentRequest,
  ): Promise<VercelDeployment>;
  getDeployment(
    idOrUrl: string,
    options?: { withGitRepoInfo?: boolean },
  ): Promise<VercelDeployment>;
}

export function createVercelClient(options: VercelClientOptions): VercelClient {
  if (!options.token) {
    throw new MissingVercelTokenError();
  }

  const fetchImpl = options.fetch ?? fetch;
  const baseUrl = options.baseUrl ?? 'https://api.vercel.com';

  const request = async <T>(
    path: string,
    init: RequestInit & { query?: Record<string, string | boolean | undefined> },
  ): Promise<T> => {
    const { query: requestQuery, ...requestInit } = init;
    const url = new URL(path, baseUrl);
    const query = {
      teamId: options.teamId,
      slug: options.teamSlug,
      ...requestQuery,
    };

    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${options.token}`,
      Accept: 'application/json',
      ...(requestInit.body ? { 'Content-Type': 'application/json' } : {}),
      ...(requestInit.headers as Record<string, string> | undefined),
    };

    const response = await fetchImpl(url.toString(), {
      ...requestInit,
      headers,
    });
    const body = await readJsonBody(response);

    if (!response.ok) {
      const errorBody =
        body && typeof body === 'object' ? (body as VercelErrorResponse) : {};
      throw new VercelApiError({
        status: response.status,
        code: errorBody.error?.code,
        message:
          errorBody.error?.message ??
          errorBody.message ??
          `Vercel API request failed with status ${response.status}`,
        responseBody: body,
      });
    }

    return body as T;
  };

  return {
    getProject(idOrName) {
      return request<VercelProject>(
        `/v9/projects/${encodeURIComponent(idOrName)}`,
        { method: 'GET' },
      );
    },

    createProject(requestBody) {
      return request<VercelProject>('/v9/projects', {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });
    },

    addProjectDomain(idOrName, domain) {
      return request<VercelProjectDomain>(
        `/v10/projects/${encodeURIComponent(idOrName)}/domains`,
        {
          method: 'POST',
          body: JSON.stringify({ name: domain }),
        },
      );
    },

    getProjectDomain(idOrName, domain) {
      return request<VercelProjectDomain>(
        `/v9/projects/${encodeURIComponent(idOrName)}/domains/${encodeURIComponent(
          domain,
        )}`,
        { method: 'GET' },
      );
    },

    getProjectDomains(idOrName) {
      return request<VercelProjectDomainsResponse>(
        `/v9/projects/${encodeURIComponent(idOrName)}/domains`,
        { method: 'GET' },
      );
    },

    verifyProjectDomain(idOrName, domain) {
      return request<VercelProjectDomain>(
        `/v9/projects/${encodeURIComponent(idOrName)}/domains/${encodeURIComponent(
          domain,
        )}/verify`,
        { method: 'POST' },
      );
    },

    getDomainConfig(domain, configOptions = {}) {
      return request<VercelDomainConfig>(
        `/v6/domains/${encodeURIComponent(domain)}/config`,
        {
          method: 'GET',
          query: {
            projectIdOrName: configOptions.projectIdOrName,
            strict: configOptions.strict,
          },
        },
      );
    },

    issueCert(commonNames) {
      return request<VercelCert>('/v8/certs', {
        method: 'POST',
        body: JSON.stringify({ cns: commonNames }),
      });
    },

    getCertById(id) {
      return request<VercelCert>(`/v8/certs/${encodeURIComponent(id)}`, {
        method: 'GET',
      });
    },

    createDeployment(requestBody) {
      return request<VercelDeployment>('/v13/deployments', {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });
    },

    getDeployment(idOrUrl, deploymentOptions = {}) {
      return request<VercelDeployment>(
        `/v13/deployments/${encodeURIComponent(idOrUrl)}`,
        {
          method: 'GET',
          query: {
            withGitRepoInfo: deploymentOptions.withGitRepoInfo,
          },
        },
      );
    },
  };
}

export function createVercelClientFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl?: VercelFetch,
): VercelClient {
  return createVercelClient({
    token: env.VERCEL_TOKEN ?? '',
    teamId: env.VERCEL_TEAM_ID,
    teamSlug: env.VERCEL_TEAM_SLUG,
    fetch: fetchImpl,
  });
}

async function readJsonBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}
