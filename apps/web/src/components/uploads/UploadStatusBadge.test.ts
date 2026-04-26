import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveStatus } from './uploadStatusLogic';

describe('resolveStatus', () => {
  it('uploading → Uploading / info', () => {
    const r = resolveStatus({ uploadStatus: 'uploading', transcribeStatus: null });
    assert.equal(r.label, 'Uploading');
    assert.equal(r.tone, 'info');
  });

  it('uploadStatus=failed → Upload failed / danger', () => {
    const r = resolveStatus({ uploadStatus: 'failed', transcribeStatus: null });
    assert.equal(r.label, 'Upload failed');
    assert.equal(r.tone, 'danger');
  });

  it('transcribeStatus=transcribing → Transcribing / accent', () => {
    const r = resolveStatus({ uploadStatus: 'uploaded', transcribeStatus: 'transcribing' });
    assert.equal(r.label, 'Transcribing');
    assert.equal(r.tone, 'accent');
  });

  it('transcribeStatus=failed → Transcription failed / danger', () => {
    const r = resolveStatus({ uploadStatus: 'uploaded', transcribeStatus: 'failed' });
    assert.equal(r.label, 'Transcription failed');
    assert.equal(r.tone, 'danger');
  });

  it('transcribeStatus=ready → Ready / success', () => {
    const r = resolveStatus({ uploadStatus: 'uploaded', transcribeStatus: 'ready' });
    assert.equal(r.label, 'Ready');
    assert.equal(r.tone, 'success');
  });

  it('all null → Pending / neutral', () => {
    const r = resolveStatus({ uploadStatus: null, transcribeStatus: null });
    assert.equal(r.label, 'Pending');
    assert.equal(r.tone, 'neutral');
  });

  it('uploadStatus=uploaded + transcribeStatus=pending → Pending / neutral', () => {
    const r = resolveStatus({ uploadStatus: 'uploaded', transcribeStatus: 'pending' });
    assert.equal(r.label, 'Pending');
    assert.equal(r.tone, 'neutral');
  });

  it('uploadStatus priority: uploading beats transcribing', () => {
    // Edge case: status rows where uploadStatus is still 'uploading'
    // but transcribeStatus was somehow set — uploadStatus wins.
    const r = resolveStatus({ uploadStatus: 'uploading', transcribeStatus: 'transcribing' });
    assert.equal(r.label, 'Uploading');
  });
});
