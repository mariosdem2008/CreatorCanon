import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  getDnsRecordsForDomain,
  normalizeDomainInput,
  validateCustomDomain,
} from './domain-utils';

describe('domain utils', () => {
  it('normalizes pasted domains without protocol or path', () => {
    assert.equal(
      normalizeDomainInput('https://Learn.Example.com/path?q=1'),
      'learn.example.com',
    );
  });

  it('rejects malformed domains', () => {
    assert.equal(validateCustomDomain('localhost').valid, false);
    assert.equal(validateCustomDomain('bad_domain.example.com').valid, false);
    assert.equal(validateCustomDomain('-bad.example.com').valid, false);
  });

  it('uses a Vercel A record for apex domains', () => {
    assert.deepEqual(getDnsRecordsForDomain('example.com'), [
      { type: 'A', name: '@', value: '76.76.21.21' },
    ]);
  });

  it('uses apex guidance for common multi-label public suffix domains', () => {
    assert.deepEqual(getDnsRecordsForDomain('example.co.uk'), [
      { type: 'A', name: '@', value: '76.76.21.21' },
    ]);
  });

  it('uses a Vercel CNAME record for subdomains', () => {
    assert.deepEqual(getDnsRecordsForDomain('learn.example.com'), [
      { type: 'CNAME', name: 'learn', value: 'cname.vercel-dns.com' },
    ]);
  });
});
