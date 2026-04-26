import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { dedupeLessonFramework } from '../dedup';

describe('dedupeLessonFramework', () => {
  it('drops lesson when framework + lesson share ≥50% evidence and similar titles', () => {
    const result = dedupeLessonFramework([
      { id: 'fw_1', type: 'framework', evidenceSegmentIds: ['s1','s2','s3','s4'], payload: { title: 'Pomodoro Technique' } } as any,
      { id: 'le_1', type: 'lesson',    evidenceSegmentIds: ['s1','s2','s5'],         payload: { title: 'The Pomodoro method' } } as any,
    ]);
    assert.deepEqual(result.dropFindingIds, ['le_1']);
    assert.equal(result.relationsToInsert[0]?.fromFindingId, 'le_1');
    assert.equal(result.relationsToInsert[0]?.toFindingId, 'fw_1');
    assert.equal(result.relationsToInsert[0]?.type, 'supports');
  });

  it('keeps both when titles dissimilar even if evidence overlaps', () => {
    const result = dedupeLessonFramework([
      { id: 'fw_1', type: 'framework', evidenceSegmentIds: ['s1','s2'], payload: { title: 'Eisenhower Matrix' } } as any,
      { id: 'le_1', type: 'lesson',    evidenceSegmentIds: ['s1','s2'], payload: { title: 'On urgency vs importance' } } as any,
    ]);
    assert.deepEqual(result.dropFindingIds, []);
  });

  it('keeps both when evidence overlap is below 50%', () => {
    const result = dedupeLessonFramework([
      { id: 'fw_1', type: 'framework', evidenceSegmentIds: ['s1','s2','s3','s4'], payload: { title: 'Pomodoro' } } as any,
      { id: 'le_1', type: 'lesson',    evidenceSegmentIds: ['s5','s6','s1'],          payload: { title: 'Pomodoro flow' } } as any,
    ]);
    // overlap = 1, min size = 3, ratio = 0.33 — below threshold.
    assert.deepEqual(result.dropFindingIds, []);
  });
});
