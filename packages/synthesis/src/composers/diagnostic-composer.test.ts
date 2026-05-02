/**
 * Tests for diagnostic-composer.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  composeDiagnostic,
  buildScoringRubric,
  extractAudienceJobs,
} from './diagnostic-composer';
import type { CanonRef, CodexClient, ComposeInput } from '../types';

describe('extractAudienceJobs', () => {
  test('reads _index_audience_jobs from channel profile', () => {
    const jobs = extractAudienceJobs({
      _index_audience_jobs: [
        { id: 'acquire', label: 'Acquire customers', tags: ['sales', 'marketing'] },
        { id: 'retain', label: 'Improve retention', tags: ['retention'] },
      ],
    });
    assert.equal(jobs.length, 2);
    assert.equal(jobs[0]!.id, 'acquire');
  });

  test('returns empty array when audience_jobs missing', () => {
    const jobs = extractAudienceJobs({});
    assert.deepEqual(jobs, []);
  });

  test('skips malformed entries', () => {
    const jobs = extractAudienceJobs({
      _index_audience_jobs: [
        { id: 'good', label: 'Good label' },
        // Intentionally malformed entry — extractor must tolerate.
        { malformed: true } as unknown as { id: string; label: string },
      ],
    });
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0]!.id, 'good');
  });
});

describe('buildScoringRubric', () => {
  test('maps each job to outcome with matching canon ids via tag overlap', () => {
    const jobs = [
      { id: 'acquire', label: 'Acquire customers', tags: ['acquisition'] },
      { id: 'retain', label: 'Improve retention', tags: ['retention'] },
    ];
    const canons: CanonRef[] = [
      {
        id: 'c_acq',
        payload: {
          type: 'framework',
          title: 'Cold outreach',
          _index_audience_job_tags: ['acquisition'],
        },
      },
      {
        id: 'c_ret',
        payload: {
          type: 'framework',
          title: 'Retention loops',
          _index_audience_job_tags: ['retention'],
        },
      },
    ];
    const rubric = buildScoringRubric(jobs, canons);
    assert.ok(rubric['acquire']);
    assert.ok(rubric['acquire']!.routeToCanonIds.includes('c_acq'));
    assert.ok(rubric['retain']);
    assert.ok(rubric['retain']!.routeToCanonIds.includes('c_ret'));
  });

  test('falls back to empty canon-id list when no tags overlap', () => {
    const jobs = [{ id: 'unknown', label: 'X', tags: ['xyz_no_match'] }];
    const canons: CanonRef[] = [
      { id: 'c1', payload: { type: 'framework', _index_audience_job_tags: ['other'] } },
    ];
    const rubric = buildScoringRubric(jobs, canons);
    assert.deepEqual(rubric['unknown']!.routeToCanonIds, []);
  });
});

describe('composeDiagnostic (with mocked Codex)', () => {
  function makeMockCodex(): CodexClient {
    return {
      run: async (_prompt: string) => {
        if (_prompt.includes('intro')) {
          return JSON.stringify({ text: 'Three quick questions to find your next move.' });
        }
        return JSON.stringify({
          questions: [
            {
              id: 'q1',
              text: 'Where are you stuck?',
              options: [
                { label: 'Getting customers', value: 'acquire', weight: 1 },
                { label: 'Keeping them', value: 'retain', weight: 1 },
              ],
            },
            {
              id: 'q2',
              text: 'How long have you been at this?',
              options: [
                { label: 'Days', value: 'acquire', weight: 0.5 },
                { label: 'Months', value: 'retain', weight: 0.5 },
              ],
            },
          ],
        });
      },
    };
  }

  test('produces a diagnostic with questions + scoring rubric', async () => {
    const input: ComposeInput = {
      runId: 'r1',
      canons: [
        {
          id: 'c1',
          payload: {
            type: 'framework',
            title: 'Cold outreach',
            _index_audience_job_tags: ['acquisition'],
          },
        },
      ],
      channelProfile: {
        creatorName: 'Test',
        _index_audience_jobs: [
          { id: 'acquire', label: 'Acquire customers', tags: ['acquisition'] },
        ],
      },
      voiceMode: 'first_person',
      creatorName: 'Test',
    };
    const result = await composeDiagnostic(input, { codex: makeMockCodex() });
    assert.ok(result.questions.length >= 1);
    assert.ok(result.intro.length > 0);
    assert.ok(Object.keys(result.scoring).length > 0);
  });
});
