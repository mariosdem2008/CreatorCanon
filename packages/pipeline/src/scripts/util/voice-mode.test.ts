import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { defaultVoiceMode, hasFirstPersonMarkers, hasThirdPersonAttribution } from './voice-mode';

describe('defaultVoiceMode', () => {
  test('operator-coach defaults to first_person', () => {
    assert.equal(defaultVoiceMode('operator-coach'), 'first_person');
  });

  test('instructional-craft defaults to first_person', () => {
    assert.equal(defaultVoiceMode('instructional-craft'), 'first_person');
  });

  test('science-explainer defaults to third_person_editorial', () => {
    assert.equal(defaultVoiceMode('science-explainer'), 'third_person_editorial');
  });

  test('contemplative-thinker defaults to hybrid', () => {
    assert.equal(defaultVoiceMode('contemplative-thinker'), 'hybrid');
  });

  test('_DEFAULT falls back to first_person', () => {
    assert.equal(defaultVoiceMode('_DEFAULT'), 'first_person');
  });
});

describe('hasFirstPersonMarkers', () => {
  test('matches I / my as standalone words (only personal first-person)', () => {
    assert.equal(hasFirstPersonMarkers('I prospect daily'), true);
    assert.equal(hasFirstPersonMarkers('my system is built on'), true);
    assert.equal(hasFirstPersonMarkers('the path I took'), true);
  });

  test('does not match inside other words', () => {
    assert.equal(hasFirstPersonMarkers('iridescent'), false);
    assert.equal(hasFirstPersonMarkers('myth myriad mystic'), false);
  });

  test('does not flag editorial we/our/us (those are intentionally allowed)', () => {
    // Editorial third-person legitimately uses "we as a field" / "our
    // understanding has improved" — these are NOT first-person markers.
    assert.equal(hasFirstPersonMarkers('we as a field'), false);
    assert.equal(hasFirstPersonMarkers('our understanding of sleep'), false);
    assert.equal(hasFirstPersonMarkers('the topic helps us see'), false);
  });

  test('handles empty input', () => {
    assert.equal(hasFirstPersonMarkers(''), false);
  });
});

describe('hasThirdPersonAttribution', () => {
  test('matches "the creator says"', () => {
    assert.equal(hasThirdPersonAttribution('the creator says X', 'Jordan'), true);
  });

  test('matches "<creatorName> says/argues"', () => {
    assert.equal(hasThirdPersonAttribution('Jordan says X', 'Jordan'), true);
    assert.equal(hasThirdPersonAttribution('Walker argues that', 'Walker'), true);
  });

  test('matches "she says" / "he says"', () => {
    assert.equal(hasThirdPersonAttribution('she says X', 'Jordan'), true);
    assert.equal(hasThirdPersonAttribution('he explains Y', 'Jordan'), true);
  });

  test('does not match plain editorial third-person', () => {
    assert.equal(hasThirdPersonAttribution('Sleep is structured', 'Walker'), false);
    assert.equal(hasThirdPersonAttribution('REM activates threat-detection circuits', 'Walker'), false);
  });
});
