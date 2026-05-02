import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createVercelClient,
  VercelApiError,
  type VercelFetch,
} from './client';

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

function createFetchStub(response: Response) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchStub: VercelFetch = async (input, init) => {
    calls.push({ url: String(input), init: init ?? {} });
    return response.clone();
  };

  return { calls, fetchStub };
}

describe('createVercelClient', () => {
  it('sends bearer auth and team query params on project creation', async () => {
    const { calls, fetchStub } = createFetchStub(
      jsonResponse({ id: 'prj_123', name: 'creator-canon-demo' }),
    );
    const client = createVercelClient({
      token: 'vc_test',
      teamId: 'team_123',
      teamSlug: 'creatorcanon',
      fetch: fetchStub,
    });

    const result = await client.createProject({
      name: 'creator-canon-demo',
      framework: 'nextjs',
      rootDirectory: 'apps/web',
    });

    assert.equal(result.id, 'prj_123');
    const call = calls[0];
    assert.ok(call);
    assert.equal(
      call.url,
      'https://api.vercel.com/v9/projects?teamId=team_123&slug=creatorcanon',
    );
    assert.equal(call.init.method, 'POST');
    assert.equal(
      (call.init.headers as Record<string, string>).Authorization,
      'Bearer vc_test',
    );
    assert.deepEqual(JSON.parse(String(call.init.body)), {
      name: 'creator-canon-demo',
      framework: 'nextjs',
      rootDirectory: 'apps/web',
    });
  });

  it('attaches a domain to a project with Vercel project domain endpoint', async () => {
    const { calls, fetchStub } = createFetchStub(
      jsonResponse({
        name: 'learn.example.com',
        apexName: 'example.com',
        projectId: 'prj_123',
        verified: false,
        verification: [{ type: 'TXT', domain: '_vercel.example.com', value: 'vc-domain-verify' }],
      }),
    );
    const client = createVercelClient({ token: 'vc_test', fetch: fetchStub });

    const result = await client.addProjectDomain('prj_123', 'learn.example.com');

    assert.equal(result.verified, false);
    const call = calls[0];
    assert.ok(call);
    assert.equal(
      call.url,
      'https://api.vercel.com/v10/projects/prj_123/domains',
    );
    assert.equal(call.init.method, 'POST');
    assert.deepEqual(JSON.parse(String(call.init.body)), {
      name: 'learn.example.com',
    });
  });

  it('retrieves a project by id or deterministic name', async () => {
    const { calls, fetchStub } = createFetchStub(
      jsonResponse({
        id: 'prj_123',
        name: 'creator-canon-demo',
        framework: 'nextjs',
        rootDirectory: 'apps/web',
      }),
    );
    const client = createVercelClient({ token: 'vc_test', fetch: fetchStub });

    const result = await client.getProject('creator-canon-demo');

    assert.equal(result.id, 'prj_123');
    const call = calls[0];
    assert.ok(call);
    assert.equal(call.url, 'https://api.vercel.com/v9/projects/creator-canon-demo');
    assert.equal(call.init.method, 'GET');
  });


  it('reads and verifies a project domain', async () => {
    const { calls, fetchStub } = createFetchStub(
      jsonResponse({ name: 'learn.example.com', projectId: 'prj_123', verified: true }),
    );
    const client = createVercelClient({ token: 'vc_test', fetch: fetchStub });

    await client.getProjectDomain('prj_123', 'learn.example.com');
    await client.verifyProjectDomain('prj_123', 'learn.example.com');

    const readCall = calls[0];
    const verifyCall = calls[1];
    assert.ok(readCall);
    assert.ok(verifyCall);
    assert.equal(
      readCall.url,
      'https://api.vercel.com/v9/projects/prj_123/domains/learn.example.com',
    );
    assert.equal(readCall.init.method, 'GET');
    assert.equal(
      verifyCall.url,
      'https://api.vercel.com/v9/projects/prj_123/domains/learn.example.com/verify',
    );
    assert.equal(verifyCall.init.method, 'POST');
  });

  it('lists project domains with verification challenges', async () => {
    const { calls, fetchStub } = createFetchStub(
      jsonResponse({
        domains: [
          {
            name: 'learn.example.com',
            projectId: 'prj_123',
            verified: false,
            verification: [
              {
                type: 'TXT',
                domain: '_vercel.learn.example.com',
                value: 'vc-domain-verify=learn.example.com,token',
              },
            ],
          },
        ],
      }),
    );
    const client = createVercelClient({ token: 'vc_test', fetch: fetchStub });

    const result = await client.getProjectDomains('prj_123');

    assert.equal(result.domains.length, 1);
    assert.equal(result.domains[0]?.verification?.[0]?.type, 'TXT');
    const call = calls[0];
    assert.ok(call);
    assert.equal(call.url, 'https://api.vercel.com/v9/projects/prj_123/domains');
    assert.equal(call.init.method, 'GET');
  });

  it('checks domain configuration for DNS and SSL readiness', async () => {
    const { calls, fetchStub } = createFetchStub(
      jsonResponse({
        configuredBy: 'CNAME',
        acceptedChallenges: ['http-01'],
        recommendedIPv4: [],
        recommendedCNAME: [{ rank: 1, value: 'cname.vercel-dns.com' }],
        misconfigured: false,
      }),
    );
    const client = createVercelClient({ token: 'vc_test', fetch: fetchStub });

    const result = await client.getDomainConfig('learn.example.com', {
      projectIdOrName: 'prj_123',
    });

    assert.equal(result.misconfigured, false);
    const call = calls[0];
    assert.ok(call);
    assert.equal(
      call.url,
      'https://api.vercel.com/v6/domains/learn.example.com/config?projectIdOrName=prj_123',
    );
  });

  it('issues and reads managed certificates', async () => {
    const responses = [
      jsonResponse({
        id: 'cert_123',
        createdAt: 1777718400000,
        expiresAt: 1785494400000,
        autoRenew: true,
        cns: ['learn.example.com'],
      }),
      jsonResponse({
        id: 'cert_123',
        createdAt: 1777718400000,
        expiresAt: 1785494400000,
        autoRenew: true,
        cns: ['learn.example.com'],
      }),
    ];
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchStub: VercelFetch = async (input, init) => {
      calls.push({ url: String(input), init: init ?? {} });
      return responses.shift()?.clone() ?? new Response(null, { status: 500 });
    };
    const client = createVercelClient({ token: 'vc_test', fetch: fetchStub });

    const issued = await client.issueCert(['learn.example.com']);
    const cert = await client.getCertById(issued.id);

    assert.equal(cert.id, 'cert_123');
    assert.equal(calls[0]?.url, 'https://api.vercel.com/v8/certs');
    assert.equal(calls[0]?.init.method, 'POST');
    assert.deepEqual(JSON.parse(String(calls[0]?.init.body)), {
      cns: ['learn.example.com'],
    });
    assert.equal(calls[1]?.url, 'https://api.vercel.com/v8/certs/cert_123');
    assert.equal(calls[1]?.init.method, 'GET');
  });

  it('creates a production deployment for a project', async () => {
    const { calls, fetchStub } = createFetchStub(
      jsonResponse({ id: 'dpl_123', url: 'creator-canon-demo.vercel.app', readyState: 'QUEUED' }),
    );
    const client = createVercelClient({ token: 'vc_test', fetch: fetchStub });

    const result = await client.createDeployment({
      name: 'creator-canon-demo',
      project: 'creator-canon-demo',
      target: 'production',
      meta: { hubId: 'hub_123' },
    });

    assert.equal(result.id, 'dpl_123');
    const call = calls[0];
    assert.ok(call);
    assert.equal(call.url, 'https://api.vercel.com/v13/deployments');
    assert.equal(call.init.method, 'POST');
    assert.deepEqual(JSON.parse(String(call.init.body)), {
      name: 'creator-canon-demo',
      project: 'creator-canon-demo',
      target: 'production',
      meta: { hubId: 'hub_123' },
    });
  });

  it('allows custom environment deployment targets', async () => {
    const { calls, fetchStub } = createFetchStub(jsonResponse({ id: 'dpl_123' }));
    const client = createVercelClient({ token: 'vc_test', fetch: fetchStub });

    await client.createDeployment({
      name: 'creator-canon-demo',
      project: 'creator-canon-demo',
      target: 'env_custom123',
    });

    const call = calls[0];
    assert.ok(call);
    assert.equal(JSON.parse(String(call.init.body)).target, 'env_custom123');
  });

  it('retrieves a deployment by id for status refreshes', async () => {
    const { calls, fetchStub } = createFetchStub(
      jsonResponse({ id: 'dpl_123', url: 'creator-canon-demo.vercel.app', readyState: 'READY' }),
    );
    const client = createVercelClient({ token: 'vc_test', fetch: fetchStub });

    const result = await client.getDeployment('dpl_123', { withGitRepoInfo: true });

    assert.equal(result.readyState, 'READY');
    const call = calls[0];
    assert.ok(call);
    assert.equal(
      call.url,
      'https://api.vercel.com/v13/deployments/dpl_123?withGitRepoInfo=true',
    );
    assert.equal(call.init.method, 'GET');
  });

  it('throws a typed error when Vercel returns a non-2xx response', async () => {
    const { fetchStub } = createFetchStub(
      jsonResponse(
        { error: { code: 'bad_request', message: 'Domain already exists' } },
        { status: 400 },
      ),
    );
    const client = createVercelClient({ token: 'vc_test', fetch: fetchStub });

    await assert.rejects(
      () => client.addProjectDomain('prj_123', 'learn.example.com'),
      (error) => {
        assert.equal(error instanceof VercelApiError, true);
        assert.equal((error as VercelApiError).status, 400);
        assert.equal((error as VercelApiError).code, 'bad_request');
        assert.equal((error as VercelApiError).message, 'Domain already exists');
        return true;
      },
    );
  });

  it('throws a typed error when Vercel returns an empty error body', async () => {
    const { fetchStub } = createFetchStub(new Response(null, { status: 500 }));
    const client = createVercelClient({ token: 'vc_test', fetch: fetchStub });

    await assert.rejects(
      () => client.createProject({ name: 'creator-canon-demo' }),
      (error) => {
        assert.equal(error instanceof VercelApiError, true);
        assert.equal((error as VercelApiError).status, 500);
        assert.equal(
          (error as VercelApiError).message,
          'Vercel API request failed with status 500',
        );
        return true;
      },
    );
  });
});
