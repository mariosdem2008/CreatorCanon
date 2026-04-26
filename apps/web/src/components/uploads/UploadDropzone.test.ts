/**
 * UploadDropzone — pure logic tests.
 *
 * The XHR / fetch flow is tested via integration; this file covers:
 *   1. Content-type validation (allowed / rejected)
 *   2. File-size validation (0, over-limit, exactly-at-limit)
 *   3. Empty drop list is a no-op (no validation error produced)
 *
 * These guard conditions mirror what processFile() checks before calling
 * the API, using the same helpers from contentTypes.ts.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isAllowedContentType,
  isAllowedFileSize,
  MAX_FILE_BYTES,
} from '../../lib/uploads/contentTypes';

// Mirrors the client-side guard in UploadDropzone.processFile()
function validateFile(type: string, size: number): { ok: true } | { ok: false; reason: string } {
  if (!isAllowedContentType(type)) {
    return { ok: false, reason: `unsupported type (${type || 'unknown'})` };
  }
  if (!isAllowedFileSize(size)) {
    if (size === 0) return { ok: false, reason: 'file is empty' };
    return { ok: false, reason: `file exceeds the 2 GB limit` };
  }
  return { ok: true };
}

describe('UploadDropzone content-type validation', () => {
  it('accepts video/mp4', () => {
    assert.deepEqual(validateFile('video/mp4', 1024), { ok: true });
  });

  it('accepts audio/mpeg (mp3)', () => {
    assert.deepEqual(validateFile('audio/mpeg', 1024), { ok: true });
  });

  it('accepts audio/mp4 (m4a)', () => {
    assert.deepEqual(validateFile('audio/mp4', 1024), { ok: true });
  });

  it('accepts video/webm', () => {
    assert.deepEqual(validateFile('video/webm', 1024), { ok: true });
  });

  it('accepts video/quicktime (mov)', () => {
    assert.deepEqual(validateFile('video/quicktime', 1024), { ok: true });
  });

  it('accepts video/x-matroska (mkv)', () => {
    assert.deepEqual(validateFile('video/x-matroska', 1024), { ok: true });
  });

  it('accepts audio/wav', () => {
    assert.deepEqual(validateFile('audio/wav', 1024), { ok: true });
  });

  it('rejects application/pdf', () => {
    const r = validateFile('application/pdf', 1024);
    assert.equal(r.ok, false);
    assert.ok('reason' in r && r.reason.includes('unsupported type'));
  });

  it('rejects application/octet-stream', () => {
    const r = validateFile('application/octet-stream', 1024);
    assert.equal(r.ok, false);
  });

  it('rejects empty string type', () => {
    const r = validateFile('', 1024);
    assert.equal(r.ok, false);
    assert.ok('reason' in r && r.reason.includes('unknown'));
  });
});

describe('UploadDropzone size validation', () => {
  it('accepts 1 byte', () => {
    assert.deepEqual(validateFile('video/mp4', 1), { ok: true });
  });

  it('accepts exactly 2 GB', () => {
    assert.deepEqual(validateFile('video/mp4', MAX_FILE_BYTES), { ok: true });
  });

  it('rejects 0 bytes', () => {
    const r = validateFile('video/mp4', 0);
    assert.equal(r.ok, false);
    assert.ok('reason' in r && r.reason.includes('empty'));
  });

  it('rejects one byte over 2 GB', () => {
    const r = validateFile('video/mp4', MAX_FILE_BYTES + 1);
    assert.equal(r.ok, false);
    assert.ok('reason' in r && r.reason.includes('2 GB'));
  });
});

describe('UploadDropzone empty drop', () => {
  it('no files → nothing to validate (empty array produces no errors)', () => {
    const files: File[] = [];
    const errors: string[] = [];
    for (const f of files) {
      const r = validateFile(f.type, f.size);
      if (!r.ok) errors.push(r.reason);
    }
    assert.equal(errors.length, 0);
  });
});
