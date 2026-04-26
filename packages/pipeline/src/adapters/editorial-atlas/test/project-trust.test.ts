import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { projectTrust } from '../project-trust';
import { DEFAULT_TRUST_BLOCK } from '../constants';

describe('projectTrust', () => {
  it('returns defaults when hubMetadata is undefined or empty', () => {
    const out = projectTrust({ hubMetadata: undefined });
    assert.deepEqual(out, DEFAULT_TRUST_BLOCK);
    const out2 = projectTrust({ hubMetadata: {} });
    assert.deepEqual(out2, DEFAULT_TRUST_BLOCK);
  });

  it('shallow-merges per top-level key', () => {
    const out = projectTrust({
      hubMetadata: { trust: { faq: [{ question: 'q', answer: 'a' }] } },
    });
    assert.equal(out.faq.length, 1);
    assert.deepEqual(out.qualityPrinciples, DEFAULT_TRUST_BLOCK.qualityPrinciples);
    assert.deepEqual(out.creationProcess, DEFAULT_TRUST_BLOCK.creationProcess);
    assert.equal(out.methodologySummary, DEFAULT_TRUST_BLOCK.methodologySummary);
  });
});
