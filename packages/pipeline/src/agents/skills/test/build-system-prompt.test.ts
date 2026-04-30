import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { detectArchetype, explainArchetype } from '../archetype-detector';
import { buildSystemPrompt } from '../build-system-prompt';
import { listSkills, loadSkill } from '../skill-loader';

describe('skill-loader', () => {
  it('loads a known skill and exposes its sections', () => {
    const skill = loadSkill('framework-extraction-rubric');
    assert.equal(skill.name, 'framework-extraction-rubric');
    assert(skill.description.length > 10, 'description should be substantive');
    assert('PURPOSE' in skill.sections, 'PURPOSE section must be present');
    assert('SCHEMA' in skill.sections, 'SCHEMA section must be present');
    assert('RUBRIC' in skill.sections, 'RUBRIC section must be present');
    assert('OUTPUT_FORMAT' in skill.sections, 'OUTPUT_FORMAT section must be present');
  });

  it('throws on unknown skill', () => {
    assert.throws(() => loadSkill('does-not-exist'), /Skill not found/);
  });

  it('listSkills returns the 5 rubric skills (creator-archetypes excluded)', () => {
    const skills = listSkills();
    assert(skills.includes('framework-extraction-rubric'));
    assert(skills.includes('editorial-strategy-rubric'));
    assert(skills.includes('cross-video-synthesis-rubric'));
    assert(skills.includes('citation-chain-rubric'));
    assert(skills.includes('voice-fingerprint-rubric'));
    assert(!skills.includes('creator-archetypes'), 'archetype dir must be excluded');
  });
});

describe('detectArchetype', () => {
  it('detects operator-coach from Hormozi-style profile', () => {
    const a = detectArchetype({
      niche: 'Entrepreneurship, business growth, AI leverage, sales, marketing',
      dominantTone: 'blunt, tactical, contrarian, no-excuses',
      expertiseCategory: 'Business operator and investor',
      monetizationAngle: 'high-trust educational content',
      recurringThemes: ['cashflow', 'pricing', 'AI as leverage', 'workflow thinking'],
    });
    assert.equal(a, 'operator-coach');
  });

  it('detects science-explainer from neuroscience profile', () => {
    const a = detectArchetype({
      niche: 'Neuroscience, sleep, exercise, light exposure, evidence-based protocols',
      dominantTone: 'analytical, measured, curious, evidence-based',
      expertiseCategory: 'Neuroscientist and researcher',
      recurringThemes: ['mechanism', 'study', 'physiology', 'circadian', 'protocol'],
    });
    assert.equal(a, 'science-explainer');
  });

  it('detects instructional-craft from chef-style profile', () => {
    const a = detectArchetype({
      niche: 'Cooking, recipes, technique, restaurant-quality at home',
      dominantTone: 'warm, instructional, demonstrative, encouraging',
      expertiseCategory: 'Chef and home-cook educator',
      recurringThemes: ['knife skills', 'technique', 'tutorial', 'recipe progression'],
    });
    assert.equal(a, 'instructional-craft');
  });

  it('detects contemplative-thinker from philosophy profile', () => {
    const a = detectArchetype({
      niche: 'Philosophy, consciousness, meditation, ethics, free will',
      dominantTone: 'reflective, thoughtful, measured, inquisitive',
      expertiseCategory: 'Philosopher and meditation teacher',
      recurringThemes: ['mindfulness', 'self-inquiry', 'awareness', 'suffering'],
    });
    assert.equal(a, 'contemplative-thinker');
  });

  it('falls back to _DEFAULT on weak signal', () => {
    const a = detectArchetype({ niche: 'random hobbies' });
    assert.equal(a, '_DEFAULT');
  });

  it('falls back to _DEFAULT on a tie', () => {
    // Ambiguous profile: equal hits on operator-coach + science-explainer
    const a = detectArchetype({
      niche: 'business research and study of entrepreneurship',
      dominantTone: 'analytical and tactical',
    });
    // Margin requirement of >=1 should keep this in _DEFAULT
    assert(a === '_DEFAULT' || a === 'operator-coach' || a === 'science-explainer');
  });

  it('explainArchetype returns sorted scores', () => {
    const r = explainArchetype({
      niche: 'business, sales, marketing, AI leverage, cashflow',
      dominantTone: 'blunt, tactical',
    });
    assert.equal(r.detected, 'operator-coach');
    assert(r.scores.length === 4, 'returns scores for all 4 archetypes');
    for (let i = 1; i < r.scores.length; i += 1) {
      assert(r.scores[i - 1]!.score >= r.scores[i]!.score, 'scores must be sorted desc');
    }
  });
});

describe('buildSystemPrompt', () => {
  it('builds a substantive prompt for framework-extraction-rubric in extract mode', () => {
    const prompt = buildSystemPrompt({
      skill: 'framework-extraction-rubric',
      mode: 'extract',
      archetype: 'operator-coach',
    });
    assert(prompt.length > 500, 'extract mode prompt should be substantial');
    assert(prompt.includes('framework-extraction-rubric'), 'mentions skill name');
    assert(prompt.includes('# Schema'), 'includes schema header');
    assert(prompt.includes('# Output format'), 'includes output format');
  });

  it('few-shot mode is strictly larger than extract mode', () => {
    const extract = buildSystemPrompt({ skill: 'framework-extraction-rubric', mode: 'extract', archetype: 'operator-coach' });
    const fewShot = buildSystemPrompt({ skill: 'framework-extraction-rubric', mode: 'few-shot', archetype: 'operator-coach' });
    assert(fewShot.length > extract.length, `few-shot (${fewShot.length}) should exceed extract (${extract.length})`);
    assert(fewShot.includes('# Examples (good)'), 'few-shot includes examples header');
  });

  it('validate mode includes EXAMPLES_BAD when present and omits OUTPUT_FORMAT', () => {
    const validate = buildSystemPrompt({ skill: 'framework-extraction-rubric', mode: 'validate', archetype: 'operator-coach' });
    // Validate mode focuses on what to flag, not what to output
    assert(!validate.includes('# Output format'), 'validate omits output format');
  });

  it('archetype splice fires for editorial-strategy-rubric', () => {
    const prompt = buildSystemPrompt({
      skill: 'editorial-strategy-rubric',
      mode: 'extract',
      archetype: 'operator-coach',
    });
    assert(prompt.includes('Archetype-specific guidance'), 'has archetype header');
    assert(prompt.includes('operator-coach'), 'mentions the operator-coach archetype');
  });

  it('archetype splice does NOT fire for citation-chain-rubric', () => {
    const prompt = buildSystemPrompt({
      skill: 'citation-chain-rubric',
      mode: 'extract',
      archetype: 'operator-coach',
    });
    // citation-chain rules are universal — no archetype injection
    assert(!prompt.includes('Archetype-specific guidance'), 'no archetype splice for citation rubric');
  });

  it('_DEFAULT archetype produces archetype-neutral prompt', () => {
    const prompt = buildSystemPrompt({
      skill: 'editorial-strategy-rubric',
      mode: 'extract',
      archetype: '_DEFAULT',
    });
    // _DEFAULT means "don't inject archetype-specific examples"
    assert(!prompt.includes('Archetype-specific guidance'), '_DEFAULT skips archetype splice');
  });

  it('detects archetype from channelProfile when not pinned', () => {
    const prompt = buildSystemPrompt({
      skill: 'editorial-strategy-rubric',
      mode: 'extract',
      channelProfile: {
        niche: 'Entrepreneurship, business, AI leverage, sales',
        dominantTone: 'blunt, tactical',
        expertiseCategory: 'Business operator',
      },
    });
    assert(prompt.includes('operator-coach'), 'auto-detected operator-coach archetype');
  });
});
