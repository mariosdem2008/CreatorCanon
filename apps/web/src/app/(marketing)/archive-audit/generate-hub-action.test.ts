import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { shouldDispatchAuditRun } from './generate-hub-dispatch';

describe('generate hub action dispatch guard', () => {
  it('dispatches only when startAuditHubGeneration queued the run in this call', () => {
    assert.equal(shouldDispatchAuditRun({ queuedForDispatch: true }), true);
    assert.equal(shouldDispatchAuditRun({ queuedForDispatch: false }), false);
  });

  it('does not export privileged helper functions from the server action file', async () => {
    const source = await readFile(new URL('./generate-hub-action.ts', import.meta.url), 'utf8');

    assert.doesNotMatch(source, /export\s+async\s+function\s+dispatchAuditRun\b/);
    assert.doesNotMatch(source, /export\s+async\s+function\s+resolveUserWorkspaceId\b/);
  });
});
