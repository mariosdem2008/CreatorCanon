/**
 * Unit tests for withRetryOnConnection — the pure retry helper that powers
 * ensureDbHealthy. Uses a stub function instead of a real DB.
 */
import { describe, test } from 'node:test';
import { strict as assert } from 'node:assert';
import { withRetryOnConnection } from './client';

// Zero-delay backoffs so tests run instantly.
const NO_DELAY = [0, 0, 0];

function makeConnectionError(code: string): Error {
  const err = new Error(`Connection failed: ${code}`);
  (err as NodeJS.ErrnoException).code = code;
  return err;
}

function makeNonConnectionError(): Error {
  return new Error('syntax error at position 42');
}

describe('withRetryOnConnection', () => {
  test('succeeds immediately when the fn resolves on first call', async () => {
    let calls = 0;
    const result = await withRetryOnConnection(async () => {
      calls += 1;
      return 'ok';
    }, { backoffsMs: NO_DELAY });

    assert.equal(result, 'ok');
    assert.equal(calls, 1);
  });

  test('retries on ECONNRESET and eventually succeeds', async () => {
    let calls = 0;
    const result = await withRetryOnConnection(async () => {
      calls += 1;
      if (calls < 3) throw makeConnectionError('ECONNRESET');
      return 'recovered';
    }, { maxAttempts: 4, backoffsMs: NO_DELAY });

    assert.equal(result, 'recovered');
    assert.equal(calls, 3);
  });

  test('throws after all attempts fail on connection error', async () => {
    let calls = 0;
    const err = makeConnectionError('ETIMEDOUT');
    await assert.rejects(
      () =>
        withRetryOnConnection(
          async () => {
            calls += 1;
            throw err;
          },
          { maxAttempts: 3, backoffsMs: NO_DELAY },
        ),
      (thrown: unknown) => thrown === err,
    );
    assert.equal(calls, 3);
  });

  test('does NOT retry on non-connection errors (throws immediately)', async () => {
    let calls = 0;
    const nonConnErr = makeNonConnectionError();
    await assert.rejects(
      () =>
        withRetryOnConnection(
          async () => {
            calls += 1;
            throw nonConnErr;
          },
          { maxAttempts: 4, backoffsMs: NO_DELAY },
        ),
      (thrown: unknown) => thrown === nonConnErr,
    );
    // Must not retry — only 1 call expected.
    assert.equal(calls, 1);
  });
});
