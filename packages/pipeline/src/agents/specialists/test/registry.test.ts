import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SPECIALISTS } from '..';

const EXPECTED_AGENTS = [
  'topic_spotter','framework_extractor','lesson_extractor','playbook_extractor',
  'source_ranker','quote_finder','aha_moment_detector','citation_grounder',
] as const;

describe('SPECIALISTS registry', () => {
  it('registers at least the 8 originally-expected specialists', () => {
    // The registry has grown beyond the original 8 (currently ~20). The
    // EXPECTED_AGENTS list below is the v1 baseline that must still be
    // present; newer specialists added on top are exercised by their own
    // tests.
    assert.ok(
      Object.keys(SPECIALISTS).length >= EXPECTED_AGENTS.length,
      `expected at least ${EXPECTED_AGENTS.length} specialists, got ${Object.keys(SPECIALISTS).length}`,
    );
  });

  it('every expected agent is registered with non-empty prompt + tools', () => {
    for (const name of EXPECTED_AGENTS) {
      const cfg = (SPECIALISTS as any)[name];
      assert.ok(cfg, `missing specialist: ${name}`);
      assert.equal(cfg.agent, name);
      assert.ok(cfg.systemPrompt.length > 100, `${name} prompt should be substantive`);
      assert.ok(cfg.allowedTools.length > 0, `${name} should have at least one tool`);
    }
  });

  it('citation_grounder is the only one with markFindingEvidence', () => {
    for (const name of EXPECTED_AGENTS) {
      const cfg = (SPECIALISTS as any)[name];
      const has = cfg.allowedTools.includes('markFindingEvidence');
      assert.equal(has, name === 'citation_grounder', `${name}.allowedTools must${name === 'citation_grounder' ? '' : ' not'} include markFindingEvidence`);
    }
  });

  it('every propose* tool is owned by exactly one specialist (no duplicate ownership)', () => {
    const proposeTools = ['proposeTopic','proposeFramework','proposeLesson','proposePlaybook','proposeQuote','proposeAhaMoment','proposeSourceRanking'];
    for (const tool of proposeTools) {
      const owners = EXPECTED_AGENTS.filter((name) => (SPECIALISTS as any)[name].allowedTools.includes(tool));
      assert.equal(owners.length, 1, `${tool} should be owned by exactly one specialist (got: ${owners.join(', ')})`);
    }
  });
});
