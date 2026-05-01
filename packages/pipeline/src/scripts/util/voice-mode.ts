import type { ArchetypeSlug } from '../../agents/skills/archetype-detector';

export type VoiceMode = 'first_person' | 'third_person_editorial' | 'hybrid';

/** Type guard: is the input a valid VoiceMode? Used when reading from
 *  untrusted sources (DB JSONB payloads, CLI flags, hand-edited profiles). */
export function isVoiceMode(v: unknown): v is VoiceMode {
  return v === 'first_person' || v === 'third_person_editorial' || v === 'hybrid';
}

/** Archetype → voice mode default. Operator can override via --voice-mode flag. */
export function defaultVoiceMode(archetype: ArchetypeSlug | string): VoiceMode {
  switch (archetype) {
    case 'operator-coach':
    case 'instructional-craft':
      return 'first_person';
    case 'science-explainer':
      return 'third_person_editorial';
    case 'contemplative-thinker':
      return 'hybrid';
    default:
      return 'first_person';
  }
}

/** Personal first-person markers that should NOT appear in third_person_editorial
 *  bodies. INTENTIONALLY narrow: only "I" and "my" — NOT "we"/"us"/"our" because
 *  editorial third-person legitimately uses "we" / "our" in the sense of "we as
 *  a field" or "our understanding." Walker's third-person body could say "our
 *  understanding of REM sleep has improved" without that being a violation. */
const FIRST_PERSON_RE = /\b(I|my)\b/;

export function hasFirstPersonMarkers(text: string | undefined | null): boolean {
  if (!text) return false;
  return FIRST_PERSON_RE.test(text);
}

/** Third-person attribution markers that should NOT appear in first_person bodies. */
const PRONOUN_ATTRIBUTION_RE = /\b(she|he|they) (says|argues|explains|notes|claims|believes|recommends|suggests)\b/i;
const GENERIC_ATTRIBUTION_RE = /\bthe (creator|speaker|host|author|narrator) (says|argues|explains|notes|claims|believes)\b/i;

export function hasThirdPersonAttribution(
  text: string | undefined | null,
  creatorName: string,
): boolean {
  if (!text) return false;
  if (PRONOUN_ATTRIBUTION_RE.test(text)) return true;
  if (GENERIC_ATTRIBUTION_RE.test(text)) return true;
  if (text.toLowerCase().includes('the creator')) return true;
  if (creatorName && creatorName.length > 0) {
    const escaped = creatorName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const creatorRe = new RegExp(
      `\\b${escaped}\\s+(says|argues|explains|notes|claims|believes|recommends|suggests|describes)\\b`,
      'i',
    );
    if (creatorRe.test(text)) return true;
  }
  return false;
}

/** Render a 1-paragraph voice-rules block for body writer prompts.
 *  Used by all 4 body writers — single source of truth for voice rules. */
export function voiceRulesPrompt(voiceMode: VoiceMode, creatorName: string): string {
  switch (voiceMode) {
    case 'first_person':
      return [
        '# Voice rules (HARD-FAIL otherwise)',
        '- First-person only. NEVER "the creator", "${creatorName}", "she/he says", "in this video"',
        '- Subject of every sentence is "I" or "you" — never the creator-as-third-person',
        '- Verbatim preserveTerms; no rephrasing of named concepts',
        '- Markdown allowed: ## subheadings, **bold**, lists, blockquotes',
      ].join('\n').replace('${creatorName}', creatorName);
    case 'third_person_editorial':
      return [
        '# Voice rules (HARD-FAIL otherwise)',
        '- Third-person editorial. Subject of every sentence is the TOPIC, not the creator',
        `- ${creatorName}'s claims are EVIDENCE, not voice. Quote ${creatorName} directly when needed: As ${creatorName} notes, "..."`,
        '- NEVER "I", "my", "we", "our" except inside a directly quoted block from the source',
        '- Editorial register: the body should read like a definitive reference page, not a personal blog post',
        '- Verbatim preserveTerms; no rephrasing of named concepts',
        '- Markdown allowed: ## subheadings, **bold**, lists, blockquotes',
      ].join('\n');
    case 'hybrid':
      return [
        '# Voice rules (HARD-FAIL otherwise)',
        '- Mixed register: third-person editorial framing + first-person aphoristic insertions',
        `- Default register is third-person editorial — claims/mechanisms/structure are "the topic does X"`,
        `- Insert 1-3 first-person aphorism slots as direct quotes from ${creatorName}: "I do X" or "my rule is Y"`,
        '- Aphorisms set off with blockquote markdown (>)',
        '- Markdown allowed: ## subheadings, **bold**, lists, blockquotes',
        '',
        '# Hybrid mode example structure (use this shape for body):',
        '',
        '## [Concept name]',
        '',
        '[Third-person editorial framing of the concept — 50-100 words. Defines the topic, names the mechanism.]',
        '',
        `> [First-person aphorism from ${creatorName} — 1-3 sentences in their voice. e.g. "I do not think wealth is about money. It\'s about not having to think about money."]`,
        '',
        '[Third-person editorial unfold — 100-200 words explaining the mechanism, citing evidence with [<segmentId>] tokens.]',
        '',
        `> [Second first-person aphorism — sharp, memorable. e.g. "I want to play games where the time horizon is years, not minutes."]`,
        '',
        '[Third-person tie-back — 80-150 words on what the reader should do, in editorial register.]',
        '',
        '✓ The blockquoted aphorisms are the ONLY first-person sentences in the body.',
        '✗ DO NOT put first-person voice in the editorial framing paragraphs. Those stay third-person.',
      ].join('\n');
    default: {
      // Defensive: should never reach here because callers validate via isVoiceMode.
      // If we do, render the safest mode (first_person) rather than returning undefined
      // (which would inject literal "undefined" into the prompt).
      console.warn(`[voice-mode] voiceRulesPrompt got unknown mode "${voiceMode as string}"; using first_person`);
      return voiceRulesPrompt('first_person', creatorName);
    }
  }
}
