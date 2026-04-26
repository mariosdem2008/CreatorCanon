import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isAllowedContentType,
  isAllowedFileSize,
  MAX_FILE_BYTES,
  ALLOWED_CONTENT_TYPES,
  fileExtFromContentType,
  isVideoContentType,
} from './contentTypes';

describe('content type allowlist', () => {
  it('allows mp4', () => assert.equal(isAllowedContentType('video/mp4'), true));
  it('allows mp3', () => assert.equal(isAllowedContentType('audio/mpeg'), true));
  it('allows m4a', () => assert.equal(isAllowedContentType('audio/mp4'), true));
  it('allows webm video', () => assert.equal(isAllowedContentType('video/webm'), true));
  it('rejects pdf', () => assert.equal(isAllowedContentType('application/pdf'), false));
  it('rejects empty', () => assert.equal(isAllowedContentType(''), false));
  it('rejects octet-stream', () => assert.equal(isAllowedContentType('application/octet-stream'), false));
  it('exposes the canonical set size', () => assert.equal(ALLOWED_CONTENT_TYPES.size, 7));
});

describe('file size cap', () => {
  it('allows 1 byte', () => assert.equal(isAllowedFileSize(1), true));
  it('allows 2GB exactly', () => assert.equal(isAllowedFileSize(MAX_FILE_BYTES), true));
  it('rejects above 2GB', () => assert.equal(isAllowedFileSize(MAX_FILE_BYTES + 1), false));
  it('rejects 0', () => assert.equal(isAllowedFileSize(0), false));
  it('rejects negative', () => assert.equal(isAllowedFileSize(-1), false));
});

describe('file extension mapping', () => {
  it('maps mp4 → mp4', () => assert.equal(fileExtFromContentType('video/mp4'), 'mp4'));
  it('maps audio/mpeg → mp3', () => assert.equal(fileExtFromContentType('audio/mpeg'), 'mp3'));
  it('maps audio/mp4 → m4a', () => assert.equal(fileExtFromContentType('audio/mp4'), 'm4a'));
  it('maps unknown → bin', () => assert.equal(fileExtFromContentType('application/foo'), 'bin'));
});

describe('isVideoContentType', () => {
  it('true for video/mp4', () => assert.equal(isVideoContentType('video/mp4'), true));
  it('false for audio/mpeg', () => assert.equal(isVideoContentType('audio/mpeg'), false));
  it('false for empty', () => assert.equal(isVideoContentType(''), false));
});
