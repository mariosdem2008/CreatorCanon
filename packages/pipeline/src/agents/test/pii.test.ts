import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { stripPiiText } from '../harness';

describe('stripPiiText', () => {
  it('redacts email in plain content string', () => {
    const result = stripPiiText('Contact me at user@example.com please');
    assert.equal(result, 'Contact me at <email> please');
  });

  it('redacts email inside serialized toolCall.arguments (the PII bug)', () => {
    const transcript = JSON.stringify([
      {
        role: 'assistant',
        content: '',
        toolCalls: [
          {
            id: 'tc_1',
            name: 'proposeQuote',
            arguments: { text: 'Contact me at sneaky@corp.io for details' },
          },
        ],
      },
    ]);
    const result = stripPiiText(transcript);
    assert.ok(!result.includes('sneaky@corp.io'), 'email in toolCall.arguments must be redacted');
    assert.ok(result.includes('<email>'), 'placeholder must be present');
  });

  it('redacts SSN-style pattern', () => {
    const result = stripPiiText('SSN is 123-45-6789 in the record');
    assert.equal(result, 'SSN is <id> in the record');
  });

  it('does NOT catch a URL like https://api.example.com/v1 as an email', () => {
    const url = 'https://api.example.com/v1';
    const result = stripPiiText(url);
    assert.equal(result, url, 'URL must not be mistaken for an email address');
  });

  it('redacts multiple emails in the same string', () => {
    const result = stripPiiText('From: alice@foo.com to bob@bar.org cc: charlie@baz.net');
    assert.equal(result, 'From: <email> to <email> cc: <email>');
  });
});
