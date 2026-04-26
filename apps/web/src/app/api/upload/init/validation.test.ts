import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { initBody } from './validation';
import { MAX_FILE_BYTES } from '../../../../lib/uploads/contentTypes';

describe('initBody schema', () => {
  const validBase = {
    filename: 'talk.mp4',
    fileSize: 1024 * 1024,
    contentType: 'video/mp4',
  };

  it('accepts a minimal valid body', () => {
    const result = initBody.safeParse(validBase);
    assert.equal(result.success, true);
  });

  it('accepts optional durationSec = 0', () => {
    const result = initBody.safeParse({ ...validBase, durationSec: 0 });
    assert.equal(result.success, true);
  });

  it('accepts optional durationSec positive', () => {
    const result = initBody.safeParse({ ...validBase, durationSec: 3600 });
    assert.equal(result.success, true);
  });

  it('accepts optional workspaceId', () => {
    const result = initBody.safeParse({ ...validBase, workspaceId: 'ws_abc' });
    assert.equal(result.success, true);
  });

  it('rejects empty filename', () => {
    const result = initBody.safeParse({ ...validBase, filename: '' });
    assert.equal(result.success, false);
  });

  it('rejects filename > 256 chars', () => {
    const result = initBody.safeParse({ ...validBase, filename: 'a'.repeat(257) });
    assert.equal(result.success, false);
  });

  it('rejects fileSize = 0', () => {
    const result = initBody.safeParse({ ...validBase, fileSize: 0 });
    assert.equal(result.success, false);
  });

  it('rejects negative fileSize', () => {
    const result = initBody.safeParse({ ...validBase, fileSize: -1 });
    assert.equal(result.success, false);
  });

  it('rejects fileSize above MAX_FILE_BYTES', () => {
    const result = initBody.safeParse({ ...validBase, fileSize: MAX_FILE_BYTES + 1 });
    assert.equal(result.success, false);
  });

  it('accepts fileSize exactly at MAX_FILE_BYTES', () => {
    const result = initBody.safeParse({ ...validBase, fileSize: MAX_FILE_BYTES });
    assert.equal(result.success, true);
  });

  it('rejects non-integer fileSize', () => {
    const result = initBody.safeParse({ ...validBase, fileSize: 1024.5 });
    assert.equal(result.success, false);
  });

  it('rejects unsupported content type', () => {
    const result = initBody.safeParse({ ...validBase, contentType: 'application/pdf' });
    assert.equal(result.success, false);
  });

  it('accepts all allowed content types', () => {
    const types = [
      'video/mp4',
      'video/webm',
      'video/quicktime',
      'video/x-matroska',
      'audio/mpeg',
      'audio/wav',
      'audio/mp4',
    ];
    for (const ct of types) {
      const result = initBody.safeParse({ ...validBase, contentType: ct });
      assert.equal(result.success, true, `Expected ${ct} to be accepted`);
    }
  });

  it('rejects negative durationSec', () => {
    const result = initBody.safeParse({ ...validBase, durationSec: -1 });
    assert.equal(result.success, false);
  });

  it('rejects non-integer durationSec', () => {
    const result = initBody.safeParse({ ...validBase, durationSec: 1.5 });
    assert.equal(result.success, false);
  });

  it('rejects missing required fields', () => {
    const result = initBody.safeParse({ filename: 'a.mp4' });
    assert.equal(result.success, false);
  });
});
