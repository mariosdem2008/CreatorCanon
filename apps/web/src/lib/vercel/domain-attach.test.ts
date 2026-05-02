import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { VercelApiError, type VercelClient } from './client';
import {
  attachDomainToVercelProject,
  refreshDomainVerificationStatus,
  refreshSslStatus,
  type DomainAttachmentRepository,
  type DomainStatusRepository,
} from './domain-attach';

function createRepository() {
  const updates: Array<Parameters<DomainAttachmentRepository['updateDomainState']>[0]> = [];
  const repository: DomainAttachmentRepository = {
    async updateDomainState(input) {
      updates.push(input);
    },
  };
  return { repository, updates };
}

function createClient(options?: { attachError?: unknown }) {
  const calls: string[] = [];
  const client: Pick<VercelClient, 'addProjectDomain' | 'getProjectDomain'> = {
    async addProjectDomain(projectId, domain) {
      calls.push(`add:${projectId}:${domain}`);
      if (options?.attachError) throw options.attachError;
      return {
        name: domain,
        projectId,
        verified: false,
        verification: [{ type: 'TXT', domain: `_vercel.${domain}`, value: 'token' }],
      };
    },
    async getProjectDomain(projectId, domain) {
      calls.push(`get:${projectId}:${domain}`);
      return {
        name: domain,
        projectId,
        verified: true,
      };
    },
  };

  return { calls, client };
}

describe('attachDomainToVercelProject', () => {
  it('attaches a domain and persists verification state', async () => {
    const { repository, updates } = createRepository();
    const { calls, client } = createClient();

    const result = await attachDomainToVercelProject({
      hubId: 'hub_123',
      vercelProjectId: 'prj_123',
      domain: 'learn.example.com',
      vercel: client,
      repository,
    });

    assert.equal(result.verified, false);
    assert.deepEqual(calls, ['add:prj_123:learn.example.com']);
    assert.equal(updates[0]?.hubId, 'hub_123');
    assert.equal(updates[0]?.customDomain, 'learn.example.com');
    assert.equal(updates[0]?.domainVerified, false);
  });

  it('reuses existing project domain when Vercel reports an idempotent conflict', async () => {
    const { repository, updates } = createRepository();
    const { calls, client } = createClient({
      attachError: new VercelApiError({
        status: 409,
        code: 'domain_already_exists',
        message: 'Domain already exists',
        responseBody: {},
      }),
    });

    const result = await attachDomainToVercelProject({
      hubId: 'hub_123',
      vercelProjectId: 'prj_123',
      domain: 'learn.example.com',
      vercel: client,
      repository,
    });

    assert.equal(result.verified, true);
    assert.deepEqual(calls, [
      'add:prj_123:learn.example.com',
      'get:prj_123:learn.example.com',
    ]);
    assert.equal(updates[0]?.domainVerified, true);
  });

  it('does not treat domain-in-use elsewhere as idempotent', async () => {
    const { repository, updates } = createRepository();
    const { calls, client } = createClient({
      attachError: new VercelApiError({
        status: 409,
        code: 'domain_already_in_use',
        message: 'Domain belongs to another project',
        responseBody: {},
      }),
    });

    await assert.rejects(
      () =>
        attachDomainToVercelProject({
          hubId: 'hub_123',
          vercelProjectId: 'prj_123',
          domain: 'learn.example.com',
          vercel: client,
          repository,
        }),
      VercelApiError,
    );

    assert.deepEqual(calls, ['add:prj_123:learn.example.com']);
    assert.equal(updates.length, 0);
  });
});

describe('domain verification refresh', () => {
  it('updates persisted verification state from Vercel project domain', async () => {
    const updates: boolean[] = [];
    const repository: DomainStatusRepository = {
      async findDomainStatusByHubId() {
        return {
          hubId: 'hub_123',
          vercelProjectId: 'prj_123',
          customDomain: 'learn.example.com',
          domainVerified: false,
          sslReady: false,
          vercelCertId: null,
          liveUrl: null,
          status: 'pending',
          domainAttachedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      },
      async updateDomainVerification(input) {
        updates.push(input.domainVerified);
      },
      async updateSslStatus() {},
    };
    const calls: string[] = [];
    const vercel: Pick<VercelClient, 'getProjectDomain' | 'verifyProjectDomain'> = {
      async getProjectDomain() {
        calls.push('get');
        return {
          name: 'learn.example.com',
          projectId: 'prj_123',
          verified: false,
        };
      },
      async verifyProjectDomain() {
        calls.push('verify');
        return {
          name: 'learn.example.com',
          projectId: 'prj_123',
          verified: true,
        };
      },
    };

    const result = await refreshDomainVerificationStatus({
      hubId: 'hub_123',
      vercel,
      repository,
    });

    assert.equal(result.domainVerified, true);
    assert.deepEqual(calls, ['get', 'verify']);
    assert.deepEqual(updates, [true]);
  });

  it('keeps verification pending when Vercel challenge is not ready yet', async () => {
    const updates: boolean[] = [];
    const repository: DomainStatusRepository = {
      async findDomainStatusByHubId() {
        return {
          hubId: 'hub_123',
          vercelProjectId: 'prj_123',
          customDomain: 'learn.example.com',
          domainVerified: false,
          sslReady: false,
          vercelCertId: null,
          liveUrl: null,
          status: 'pending',
          domainAttachedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      },
      async updateDomainVerification(input) {
        updates.push(input.domainVerified);
      },
      async updateSslStatus() {},
    };
    const vercel: Pick<VercelClient, 'getProjectDomain' | 'verifyProjectDomain'> = {
      async getProjectDomain() {
        return {
          name: 'learn.example.com',
          projectId: 'prj_123',
          verified: false,
          verification: [{ type: 'TXT', domain: '_vercel.learn.example.com', value: 'token' }],
        };
      },
      async verifyProjectDomain() {
        throw new VercelApiError({
          status: 400,
          code: 'domain_verification_failed',
          message: 'Domain verification failed',
          responseBody: {},
        });
      },
    };

    const result = await refreshDomainVerificationStatus({
      hubId: 'hub_123',
      vercel,
      repository,
    });

    assert.equal(result.domainVerified, false);
    assert.equal(result.verification?.[0]?.type, 'TXT');
    assert.deepEqual(updates, []);
  });

  it('marks ssl ready when the verified Vercel domain config is not misconfigured', async () => {
    const updates: Array<{ sslReady: boolean; vercelCertId?: string | null }> = [];
    const repository: DomainStatusRepository = {
      async findDomainStatusByHubId() {
        return {
          hubId: 'hub_123',
          vercelProjectId: 'prj_123',
          customDomain: 'learn.example.com',
          domainVerified: true,
          sslReady: false,
          vercelCertId: null,
          liveUrl: null,
          status: 'pending',
          domainAttachedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      },
      async updateDomainVerification() {},
      async updateSslStatus(input) {
        updates.push(input);
      },
    };
    const calls: string[] = [];
    const vercel: Pick<VercelClient, 'getDomainConfig' | 'issueCert' | 'getCertById'> = {
      async getDomainConfig() {
        calls.push('config');
        return {
          configuredBy: 'CNAME',
          acceptedChallenges: ['http-01'],
          recommendedIPv4: [],
          recommendedCNAME: [],
          misconfigured: false,
        };
      },
      async issueCert(commonNames) {
        calls.push(`issue:${commonNames.join(',')}`);
        return {
          id: 'cert_123',
          createdAt: Date.now(),
          expiresAt: Date.now() + 90 * 24 * 60 * 60 * 1000,
          autoRenew: true,
          cns: ['learn.example.com'],
        };
      },
      async getCertById() {
        throw new Error('unexpected cert read');
      },
    };

    const result = await refreshSslStatus({
      hubId: 'hub_123',
      vercel,
      repository,
    });

    assert.equal(result.sslReady, true);
    assert.equal(result.vercelCertId, 'cert_123');
    assert.deepEqual(calls, ['config', 'issue:learn.example.com']);
    assert.deepEqual(updates, [{ hubId: 'hub_123', sslReady: true, vercelCertId: 'cert_123' }]);
  });

  it('keeps ssl pending while DNS config cannot generate TLS', async () => {
    const updates: Array<{ sslReady: boolean; vercelCertId?: string | null }> = [];
    const repository: DomainStatusRepository = {
      async findDomainStatusByHubId() {
        return {
          hubId: 'hub_123',
          vercelProjectId: 'prj_123',
          customDomain: 'learn.example.com',
          domainVerified: true,
          sslReady: true,
          vercelCertId: 'cert_123',
          liveUrl: null,
          status: 'pending',
          domainAttachedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      },
      async updateDomainVerification() {},
      async updateSslStatus(input) {
        updates.push(input);
      },
    };
    const vercel: Pick<VercelClient, 'getDomainConfig' | 'issueCert' | 'getCertById'> = {
      async getDomainConfig() {
        return {
          configuredBy: null,
          acceptedChallenges: [],
          recommendedIPv4: [],
          recommendedCNAME: [],
          misconfigured: true,
        };
      },
      async issueCert() {
        throw new Error('unexpected cert issue');
      },
      async getCertById() {
        throw new Error('unexpected cert read');
      },
    };

    const result = await refreshSslStatus({
      hubId: 'hub_123',
      vercel,
      repository,
    });

    assert.equal(result.sslReady, false);
    assert.equal(result.cert, null);
    assert.deepEqual(updates, [{ hubId: 'hub_123', sslReady: false, vercelCertId: null }]);
  });
});
