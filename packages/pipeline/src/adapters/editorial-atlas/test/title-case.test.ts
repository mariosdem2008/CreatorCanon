import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { titleCase } from '../title-case';

describe('titleCase', () => {
  it('capitalizes the first letter of each word', () => {
    assert.equal(titleCase('automatic email responder'), 'Automatic Email Responder');
  });
  it('preserves common acronyms', () => {
    assert.equal(titleCase('ai-powered crm system'), 'AI-Powered CRM System');
  });
  it('keeps short connecting words lowercase except the first word', () => {
    assert.equal(titleCase('the art of the deal'), 'The Art of the Deal');
  });
  it('handles empty + single word inputs', () => {
    assert.equal(titleCase(''), '');
    assert.equal(titleCase('hello'), 'Hello');
  });
});
