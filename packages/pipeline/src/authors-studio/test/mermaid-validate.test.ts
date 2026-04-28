import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateMermaid } from '../mermaid-validate';

describe('validateMermaid', () => {
  it('accepts a valid flowchart', async () => {
    const result = await validateMermaid('flowchart TD\n  A[Start] --> B[End]');
    assert.equal(result.ok, true);
  });

  it('rejects empty source', async () => {
    const result = await validateMermaid('');
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /empty|min/i);
  });

  it('rejects malformed flowchart with unclosed bracket', async () => {
    const result = await validateMermaid('flowchart TD\n  A[Start --> B[End]');
    assert.equal(result.ok, false);
  });

  it('accepts a valid sequence diagram', async () => {
    const result = await validateMermaid('sequenceDiagram\n  Alice->>Bob: Hello\n  Bob-->>Alice: Hi');
    assert.equal(result.ok, true);
  });
});
