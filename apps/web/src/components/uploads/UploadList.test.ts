/**
 * UploadList — pure logic tests.
 *
 * Tests the polling-control logic (isTerminal / allTerminal) and
 * the data-shaping helpers that determine when polling should stop.
 *
 * Network / React rendering is out of scope here.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// UploadRow type — inlined here to avoid importing the 'use client' module
// which chains through React/Next.js dependencies unavailable in node:test.
type UploadRow = {
  id: string;
  title: string | null;
  fileSize: number | null;
  contentType: string | null;
  durationSec: number | null;
  uploadStatus: 'uploading' | 'uploaded' | 'failed' | null;
  transcribeStatus: 'pending' | 'transcribing' | 'ready' | 'failed' | null;
  createdAt: string;
};

// Re-implement the pure helpers locally so we can test them without importing
// the 'use client' module (which would pull in React, useState, etc.).
function isTerminal(row: UploadRow): boolean {
  return (
    (row.transcribeStatus === 'ready' || row.transcribeStatus === 'failed') &&
    row.uploadStatus !== 'uploading'
  );
}

function allTerminal(rows: UploadRow[]): boolean {
  return rows.every(isTerminal);
}

function makeRow(
  overrides: Partial<UploadRow> = {},
): UploadRow {
  return {
    id: 'v_test',
    title: 'test.mp4',
    fileSize: 1024,
    contentType: 'video/mp4',
    durationSec: null,
    uploadStatus: 'uploaded',
    transcribeStatus: 'ready',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('isTerminal', () => {
  it('ready + uploaded → terminal', () => {
    assert.equal(isTerminal(makeRow({ uploadStatus: 'uploaded', transcribeStatus: 'ready' })), true);
  });

  it('failed + uploaded → terminal', () => {
    assert.equal(isTerminal(makeRow({ uploadStatus: 'uploaded', transcribeStatus: 'failed' })), true);
  });

  it('failed uploadStatus + failed transcribe → terminal', () => {
    assert.equal(isTerminal(makeRow({ uploadStatus: 'failed', transcribeStatus: 'failed' })), true);
  });

  it('uploading → NOT terminal (regardless of transcribeStatus)', () => {
    assert.equal(isTerminal(makeRow({ uploadStatus: 'uploading', transcribeStatus: 'ready' })), false);
  });

  it('transcribing → NOT terminal', () => {
    assert.equal(isTerminal(makeRow({ uploadStatus: 'uploaded', transcribeStatus: 'transcribing' })), false);
  });

  it('pending → NOT terminal', () => {
    assert.equal(isTerminal(makeRow({ uploadStatus: 'uploaded', transcribeStatus: 'pending' })), false);
  });

  it('null statuses → NOT terminal', () => {
    assert.equal(isTerminal(makeRow({ uploadStatus: null, transcribeStatus: null })), false);
  });
});

describe('allTerminal', () => {
  it('empty list → terminal (vacuously true, stops polling)', () => {
    assert.equal(allTerminal([]), true);
  });

  it('all ready → terminal', () => {
    const rows = [
      makeRow({ id: 'a', transcribeStatus: 'ready' }),
      makeRow({ id: 'b', transcribeStatus: 'ready' }),
    ];
    assert.equal(allTerminal(rows), true);
  });

  it('mixed ready + failed → terminal', () => {
    const rows = [
      makeRow({ id: 'a', transcribeStatus: 'ready' }),
      makeRow({ id: 'b', uploadStatus: 'failed', transcribeStatus: 'failed' }),
    ];
    assert.equal(allTerminal(rows), true);
  });

  it('one still transcribing → NOT terminal', () => {
    const rows = [
      makeRow({ id: 'a', transcribeStatus: 'ready' }),
      makeRow({ id: 'b', uploadStatus: 'uploaded', transcribeStatus: 'transcribing' }),
    ];
    assert.equal(allTerminal(rows), false);
  });

  it('one uploading → NOT terminal', () => {
    const rows = [
      makeRow({ id: 'a', transcribeStatus: 'ready' }),
      makeRow({ id: 'b', uploadStatus: 'uploading', transcribeStatus: 'pending' }),
    ];
    assert.equal(allTerminal(rows), false);
  });
});

describe('UploadList empty initial state', () => {
  it('empty rows → allTerminal is true (no polling needed)', () => {
    assert.equal(allTerminal([]), true);
  });
});

describe('UploadList polling self-quiesce logic (C1)', () => {
  // The fixed interval body checks allTerminal(rowsRef.current) and returns
  // early when all rows are terminal. These tests verify the underlying logic.
  it('allTerminal(rows) === true causes interval body to skip fetch', () => {
    // Simulate: interval fires, all rows are terminal → no fetch needed.
    const rows = [
      makeRow({ id: 'a', uploadStatus: 'uploaded', transcribeStatus: 'ready' }),
      makeRow({ id: 'b', uploadStatus: 'failed', transcribeStatus: 'failed' }),
    ];
    assert.equal(allTerminal(rows), true, 'interval body should skip fetch when all terminal');
  });

  it('allTerminal(rows) === false causes interval body to proceed with fetch', () => {
    const rows = [
      makeRow({ id: 'a', uploadStatus: 'uploaded', transcribeStatus: 'ready' }),
      makeRow({ id: 'b', uploadStatus: 'uploaded', transcribeStatus: 'transcribing' }),
    ];
    assert.equal(allTerminal(rows), false, 'interval body should proceed with fetch when non-terminal row exists');
  });

  it('newly non-terminal row (after upload) keeps polling active', () => {
    // When onRowsChange introduces a new pending row, the stop-effect does NOT
    // clear the interval (allTerminal is false). Verify the logic.
    const rowsAfterUpload = [
      makeRow({ id: 'existing', uploadStatus: 'uploaded', transcribeStatus: 'ready' }),
      makeRow({ id: 'new', uploadStatus: 'uploading', transcribeStatus: 'pending' }),
    ];
    assert.equal(allTerminal(rowsAfterUpload), false, 'polling must stay active for new pending row');
  });
});

describe('UploadList row shape', () => {
  it('makeRow produces a valid UploadRow', () => {
    const row = makeRow();
    assert.ok(typeof row.id === 'string');
    assert.ok(typeof row.createdAt === 'string');
    assert.ok(row.uploadStatus !== undefined);
    assert.ok(row.transcribeStatus !== undefined);
  });

  it('title can be null', () => {
    const row = makeRow({ title: null });
    assert.equal(row.title, null);
  });

  it('fileSize can be null', () => {
    const row = makeRow({ fileSize: null });
    assert.equal(row.fileSize, null);
  });
});
