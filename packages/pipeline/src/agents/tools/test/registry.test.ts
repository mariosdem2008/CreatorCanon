import { before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { _resetRegistryForTests, registerAllTools, listTools, getTool } from '../registry';

describe('registry composition', () => {
  beforeEach(() => {
    _resetRegistryForTests();
  });

  it('registerAllTools registers every tool by name', () => {
    registerAllTools();
    const all = listTools([
      'listVideos','getVideoSummary','searchSegments','listSegmentsForVideo','getSegment',
      'listFindings',
      'proposeTopic','proposeFramework','proposeLesson','proposePlaybook',
      'proposeQuote','proposeAhaMoment','proposeSourceRanking','proposeRelation',
      'markFindingEvidence',
    ]);
    assert.equal(all.length, 15);
  });

  it('registerAllTools is idempotent only via _resetRegistryForTests; double-call without reset throws', () => {
    registerAllTools();
    assert.throws(() => registerAllTools(), /already registered/);
  });

  it('getTool returns undefined for unknown name', () => {
    registerAllTools();
    assert.equal(getTool('nonexistentTool'), undefined);
  });

  it('listTools throws if any name is unknown', () => {
    registerAllTools();
    assert.throws(() => listTools(['listVideos', 'bogus']), /Tool 'bogus' not registered/);
  });
});
