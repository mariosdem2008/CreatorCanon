---
name: voice-fingerprint-rubric
description: Use when generating prose for hub pages, briefs, or any creator-facing output that must sound like the creator. Defines the voiceFingerprint block, the four tone presets, and the preserve/match/respect rules for compression and expansion.
---

# Voice Fingerprint Rubric

## PURPOSE
Each creator has a distinctive voice — vocabulary, rhythm, profanity rules, named terms — and generated prose that sanitizes the voice loses the reader. This rubric defines the `voiceFingerprint` block that travels with every brief and the hard rules for preserving creator voice during compression, expansion, and rephrasing. Consumed by every prose-generating step downstream of `page_brief_planner`.

## SCHEMA

```json
{
  "voiceFingerprint": {
    "profanityAllowed": false,
    "tonePreset": "blunt-tactical | warm-coaching | analytical-detached | reflective-thoughtful",
    "preserveTerms": ["1-1-1 rule", "BYOA", "..."]
  }
}
```

## RUBRIC

- **`profanityAllowed`** (boolean): respect this per-archetype. Default mappings:
  - operator-coach (Hormozi-style) → typically `true`
  - science-explainer (Huberman-style) → `false`
  - learning-creator (Ali Abdaal-style) → `false`
  - mindset-coach → context-dependent
  - When `false`, prose must not contain profanity even if the source transcripts do — sanitize at the word level, not the idea level.
- **`tonePreset`** (one of four):
  - `blunt-tactical` — short sentences, imperative commands, contrarian framings, occasional swearing if `profanityAllowed`. Hormozi default. Example: "Cash before scale. Stop optimizing a business that's running out of money."
  - `warm-coaching` — second-person, encouraging, calibrated hedges, personal anecdotes. Example: "Here's what worked for me, and I think it could work for you too."
  - `analytical-detached` — third-person, hedged claims, mechanism-first, evidence citations, rare imperatives. Huberman default. Example: "The data suggest that, in most operators, the bottleneck is judgment rather than tooling."
  - `reflective-thoughtful` — first-person plural, slow rhythm, qualifications, philosophical asides. Example: "We tend to confuse the workflow with the title; it takes time to see why that's a costly mistake."
- **`preserveTerms[]`**: creator's verbatim phrases that must appear UNCHANGED in generated prose. Includes named frameworks, signature mantras, idiosyncratic vocabulary. Generation rules:
  - PRESERVE the creator's named concepts verbatim — do NOT rephrase ("workflow-based thinking" stays "workflow-based thinking", not "task-oriented planning").
  - PRESERVE casing and punctuation as the creator uses them ("BYOA" not "byoa"; "First $100K Roadmap" not "first 100k roadmap").
  - PRESERVE numerals when the creator uses numerals ("$100K" not "one hundred thousand dollars").
- **MATCH the tone preset** when generating prose:
  - blunt-tactical → blunt commands, short sentences, contrarian framing
  - warm-coaching → second-person, encouraging
  - analytical-detached → hedged claims, mechanism-first, evidence citations
  - reflective-thoughtful → first-person plural, qualifications
- **RESPECT profanity rule per archetype** — if `profanityAllowed: false`, NO profanity in generated output regardless of source.
- **When compressing**: drop adjectives before nouns; trim hedges before claims. Compression preserves the load-bearing words (verbs, named terms, numbers) and discards the connective tissue.
- **When expanding**: keep creator's named terms verbatim; add concrete examples in their style — not in your style. If the creator gives examples in dollar amounts, expand with dollar amounts; if they give examples in stories, expand with stories.

## EXAMPLES_GOOD

1. **Hormozi blunt-tactical preservation**
   - Source quote: "If you can't sell it one-on-one for $5K, you can't sell it at $500 to a hundred people. Cash before scale."
   - GOOD compression: "Cash before scale. Sell 1-on-1 at $5K before you sell at $500 to 100."
   - Why it works: keeps "Cash before scale" verbatim, keeps numerals, short sentences, imperative.
2. **Hormozi expansion with preserved term**
   - voiceFingerprint.preserveTerms: `["workflow-based thinking", "the unit of work", "BYOA"]`
   - GOOD expansion: "Workflow-based thinking starts with one question: what's the unit of work? Not the title. Not the headcount. The workflow."
   - Why it works: preserves "workflow-based thinking" and "the unit of work" verbatim; uses short, blunt rhythm.
3. **Huberman analytical-detached**
   - Source quote: "The literature is reasonably consistent that morning sunlight, around two to ten minutes, advances circadian phase."
   - GOOD compression: "Morning sunlight (2-10 min) advances circadian phase; the literature is consistent on this."
   - Why it works: keeps the hedge ("the literature is consistent"), keeps the mechanism, keeps numerals.
4. **Warm-coaching expansion**
   - tonePreset: `warm-coaching`, profanityAllowed: false
   - GOOD: "I know this feels uncomfortable — most operators I've worked with hit this exact wall. Here's what helped them get through it."
   - Why it works: second-person, encouraging, personal-anecdote framing.

## EXAMPLES_BAD

1. **Sanitization that loses the bite**
   - Source: "Stop being a coward about pricing. Charge what it's worth."
   - BAD: "Try to feel more confident in your pricing decisions; price your offer at a level that reflects its value."
   - Why it's bad: blunt-tactical creator turned into corporate-coach mush; loses the imperative, loses the contrarian frame.
2. **Term paraphrase**
   - preserveTerms includes "BYOA"
   - BAD: "Operators who bring their own agentic systems..."
   - Why it's bad: "BYOA" is a named term — must stay "BYOA".
3. **Profanity leak**
   - profanityAllowed: false
   - BAD: "Most operators are too damn comfortable to do the work."
   - Why it's bad: violates the archetype's profanity rule.
4. **Tone mismatch on expansion**
   - tonePreset: `blunt-tactical`
   - BAD: "It might be worth considering whether, at some point, you may want to think about prioritizing cash flow before pursuing scale strategies."
   - Why it's bad: that's analytical-detached hedging applied to a blunt-tactical creator.
5. **Adjective bloat in compression**
   - Source: "Sell premium 1-on-1 first."
   - BAD compression: "Strategically sell highly premium one-on-one services first as part of your initial growth approach."
   - Why it's bad: compression should drop adjectives, not add them.
6. **Style-translation expansion**
   - Source uses dollar examples ("a $5K offer"); expansion uses metaphor ("a meaningful price point")
   - Why it's bad: expand in the creator's style, not yours.

## ANTI_PATTERNS

- **Sanitize-by-default**: defaulting to neutral corporate prose because it's "safer". A neutral Hormozi page is a broken Hormozi page.
- **PreserveTerms as decoration**: listing terms in `preserveTerms[]` but then paraphrasing them anyway. The list is a hard constraint, not a suggestion.
- **Tone-drift mid-page**: starting blunt-tactical and drifting into warm-coaching by the end. Pick the preset and hold it.
- **Hedges in blunt-tactical**: "It might be the case that, in some situations, you may want to..." — none of those qualifiers belong in blunt-tactical prose. Either claim or cut.
- **Imperatives in analytical-detached**: "You MUST do this." — the science-explainer archetype hedges; converting hedges to imperatives misrepresents the creator.
- **Reading-age inflation**: using SAT vocabulary in prose for a creator who uses simple words. Match the creator's lexical density.
- **Numeric translation**: rewriting "$100K" as "one hundred thousand dollars" or vice versa. Match the creator's numeric format.
- **Lost named terms in compression**: dropping `preserveTerms` items because they "took up space". Compression keeps the load-bearing nouns; named terms ARE the load-bearing nouns.

## OUTPUT_FORMAT

```
# VOICE FINGERPRINT RULES
The brief includes a voiceFingerprint block:
- profanityAllowed (bool): if false, no profanity in output regardless of source.
- tonePreset: one of blunt-tactical | warm-coaching | analytical-detached | reflective-thoughtful.
- preserveTerms[]: creator's verbatim phrases — these MUST appear unchanged in your output.

When generating prose:
1. PRESERVE creator's named concepts verbatim. Do not rephrase preserveTerms.
2. MATCH the tonePreset:
   - blunt-tactical: short sentences, imperative commands, contrarian framing.
   - warm-coaching: second-person, encouraging, calibrated hedges.
   - analytical-detached: hedged claims, mechanism-first, evidence citations.
   - reflective-thoughtful: first-person plural, slow rhythm, qualifications.
3. RESPECT the profanity rule.
4. When compressing: drop adjectives before nouns; trim hedges before claims.
5. When expanding: keep named terms verbatim; add concrete examples in the creator's style (dollars if they use dollars, stories if they use stories).

Do not sanitize. A neutral page in a blunt creator's voice is a broken page.
```
