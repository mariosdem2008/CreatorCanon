import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractJsonFromCodexOutput, CodexJsonExtractError } from '../codex-extract-json';

describe('extractJsonFromCodexOutput', () => {
  it('extracts JSON from a ```json fenced block', () => {
    const raw = 'Sure! Here is your output:\n\n```json\n{"kind":"cited_prose","paragraphs":[]}\n```\n\nLet me know if you need anything else.';
    const out = extractJsonFromCodexOutput(raw);
    assert.equal(out, '{"kind":"cited_prose","paragraphs":[]}');
  });

  it('extracts JSON from a generic ``` fenced block', () => {
    const raw = '```\n{"kind":"diagram","mermaidSrc":"flowchart TD\\n A --> B"}\n```';
    const out = extractJsonFromCodexOutput(raw);
    assert.equal(out, '{"kind":"diagram","mermaidSrc":"flowchart TD\\n A --> B"}');
  });

  it('extracts bare JSON with no fence', () => {
    const raw = '{"kind":"roadmap","steps":[]}';
    const out = extractJsonFromCodexOutput(raw);
    assert.equal(out, '{"kind":"roadmap","steps":[]}');
  });

  it('extracts JSON when wrapped in narrative preamble', () => {
    const raw = 'Here is the page plan you requested:\n\n{"pageId":"pb_x","artifacts":[{"kind":"cited_prose"}]}\n\nThat covers the build path.';
    const out = extractJsonFromCodexOutput(raw);
    assert.equal(out, '{"pageId":"pb_x","artifacts":[{"kind":"cited_prose"}]}');
  });

  it('handles nested braces correctly', () => {
    const raw = 'Output:\n{"outer":{"inner":{"deep":1}},"sibling":2}';
    const out = extractJsonFromCodexOutput(raw);
    const parsed = JSON.parse(out);
    assert.deepEqual(parsed, { outer: { inner: { deep: 1 } }, sibling: 2 });
  });

  it('prefers fenced block over later bare JSON when both are present', () => {
    const raw = '```json\n{"correct":true}\n```\n\nLater I might mention {"wrong":true} in passing.';
    const out = extractJsonFromCodexOutput(raw);
    assert.equal(out, '{"correct":true}');
  });

  it('handles strings containing braces inside the JSON', () => {
    // The brace counter must not be fooled by braces inside string values.
    const raw = '{"label":"contains {nested} brace","value":42}';
    const out = extractJsonFromCodexOutput(raw);
    const parsed = JSON.parse(out);
    assert.deepEqual(parsed, { label: 'contains {nested} brace', value: 42 });
  });

  it('handles escaped quotes inside strings', () => {
    const raw = '{"quote":"She said \\"hi\\" to me"}';
    const out = extractJsonFromCodexOutput(raw);
    const parsed = JSON.parse(out);
    assert.equal(parsed.quote, 'She said "hi" to me');
  });

  it('throws CodexJsonExtractError when no JSON is present', () => {
    const raw = 'Sorry, I cannot help with that.';
    assert.throws(() => extractJsonFromCodexOutput(raw), CodexJsonExtractError);
  });

  it('throws CodexJsonExtractError on malformed JSON', () => {
    const raw = 'Output: { this is not valid json }';
    assert.throws(() => extractJsonFromCodexOutput(raw), CodexJsonExtractError);
  });

  it('throws on empty input', () => {
    assert.throws(() => extractJsonFromCodexOutput(''), CodexJsonExtractError);
  });

  it('throws on whitespace-only input', () => {
    assert.throws(() => extractJsonFromCodexOutput('   \n\n  '), CodexJsonExtractError);
  });
});
