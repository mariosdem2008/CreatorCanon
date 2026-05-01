---
name: voice-fingerprint-rubric
description: v2 voice rules. The single hardest discipline of the audit pipeline — first-person at extraction time, NEVER as a downstream transform. Third-person attribution ('the creator says X', '<name> argues') is forbidden in any rendered field. This rubric is referenced by every body-writing prompt.
---

# Voice Fingerprint Rubric (v2)

## PURPOSE
Every creator has a distinctive voice — vocabulary, rhythm, profanity rules, named terms. The audit pipeline must produce rendered fields that READ as if the creator wrote them. Not "the creator says X" — "X." The voice flip happens at extraction time, never as a downstream transform.

This rubric is consumed by:
- Canon body-writer (Task 5.9)
- Brief body-writer
- Synthesis body-writer
- Reader journey phase body-writer
- Hero candidates generator (Task 5.10)
- Channel profile generator (for `hub_title`, `hub_tagline`, `hero_candidates`)

## SCHEMA

The voice fingerprint lives in two places:

1. **Channel-level** (in ChannelProfile_v2):
   ```json
   {
     "_internal_dominant_tone": "string — ONE of the four canonical presets",
     "_index_archetype": "operator-coach | science-explainer | instructional-craft | contemplative-thinker | _DEFAULT"
   }
   ```

2. **Brief-level** (in PageBrief_v2):
   ```json
   {
     "_index_voice_fingerprint": {
       "profanityAllowed": true,
       "tonePreset": "blunt-tactical | analytical-detached | warm-coaching | reflective-thoughtful",
       "preserveTerms": ["..."]
     }
   }
   ```

## RUBRIC

### The four canonical tone presets

ONE value, no comma-separated descriptors:

| Preset | Markers | Archetype mapping |
|---|---|---|
| `blunt-tactical` | Short sentences, imperatives, low hedge ratio, money math, contrarian inversions | operator-coach |
| `analytical-detached` | Longer measured sentences, mechanism-first, hedged claims, evidence ladders | science-explainer |
| `warm-coaching` | Second-person ("you"), encouraging, demonstrative, patient | instructional-craft |
| `reflective-thoughtful` | Paradox tolerance, longer arcs, "we" framing, careful distinctions | contemplative-thinker |

If a creator's tone is genuinely mixed, pick the DOMINANT preset. Don't write "blunt-tactical-operator" or "blunt, tactical, urgent, contrarian" — those are descriptors, not presets. The dispatcher rejects them.

### First-person voice rule (THE ONE RULE)

In every rendered field — `body`, `lede`, `hook`, `title`, `cta.*`, `hub_title`, `hub_tagline`, `hero_candidates[]`, `video_summary`, `phase.title`, `phase.body` — write as if the creator wrote it.

✅ "I've been in this game for eight years and most beginners quit over picking a niche."
❌ "Jordan has been in this game for eight years; he says most beginners quit over picking a niche."
❌ "The creator argues that beginners often quit when picking a niche."
❌ "Walker explains the two-process model of sleep."

### Allowed first-person frames

- "I" — direct authorship
- "you" — addressing the reader
- "we" — when the creator naturally says "we" (operator-coach often, contemplative-thinker often)
- "my" / "your" / "our" — possessive forms

### Forbidden third-person markers (HARD-FAIL via validator)

In `rendered` fields, these strings trigger a hard fail:
- "the creator"
- "the speaker"
- "the host"
- "the author"
- "the narrator"
- "<creatorName> says/argues/explains/notes/claims/believes"
- "she says" / "he says" / "they (the creator)"
- "in this episode" / "on this video" / "in the recording"

Third-person is allowed ONLY in `_internal_*` fields, where operators read.

### Verbatim creator terminology

Named concepts MUST be preserved verbatim. Never paraphrased.

✅ "workflow-based thinking", "the unit of work", "QQRT", "Better, Cheaper, Faster, Less Risky", "two-process model of sleep", "BYOA"
❌ "task-oriented planning" (paraphrase of "workflow-based thinking")
❌ "quantity-quality-regularity-timing audit" (paraphrase of "QQRT")

The voice fingerprint's `preserveTerms` array enumerates these. Bodies must use ≥60% of declared terms verbatim. The validator checks density.

### Profanity rule (per archetype)

`profanityAllowed: true` (operator-coach default for many): body can include strong language for emphasis. Cadence-heavy moments, not garnish.

`profanityAllowed: false` (science-explainer / instructional-craft / contemplative-thinker default): body avoids profanity even if a few transcript moments contain it.

The rule applies to `rendered` fields ONLY. `_internal_*` fields stay neutral regardless.

### Direct quote handling

When pulling a verbatim quote from the transcript into a `body`:

✅ Inline as reported speech: "I once said: 'AI lead generation is the most in-demand service in the world.'" — preserves the quote AND keeps the chapter in first person.

✅ Paraphrase + cite: "I've been clear about this — AI lead generation is the most in-demand service [a1a6709f-...]."

❌ Standalone third-person attribution: "Jordan: 'AI lead generation is...'"

### Cleaned vs verbatim quotes

When the transcript has spoken-language stutters, use the cleaned version in body. The audit's `_index_quotes_cleaned` field provides cleaned versions for each `_index_quotes_verbatim`. Hero candidates pull from cleaned + synthesized lines, not verbatim transcript.

✅ "AI lead generation is the most in-demand service in the world." (cleaned)
❌ "AI lead generation is, it's a service-based business first and foremost." (verbatim, with stutter — the Jordan hub bug)

### Compression rules (when shortening creator content)

- Drop adjectives before nouns
- Trim hedges before claims
- Keep named terms VERBATIM
- Keep money figures, named entities, specific numbers verbatim

### Expansion rules (when going from a transcript fragment to a body section)

- Keep creator's named terms verbatim
- Add concrete examples in their style (not generic "for instance" examples — examples that match THEIR vocabulary)
- Preserve their cadence (sentence length, paragraph length, transitions)
- DON'T add hedges they wouldn't add ("might be", "could be") if their tone is blunt-tactical
- DON'T strip hedges they would add if their tone is analytical-detached

## EXAMPLES_GOOD

### First-person body in operator-coach voice (Hormozi)

```markdown
Customers don't care that you use AI. They care about results.

Here's the test I run on every offer or workflow change. Better, cheaper,
faster, less risky. Pick at least one. Move it visibly. If you can't
articulate which one you're moving, the change isn't ready to ship.

The book launch example: we resolved 90% of about 120,000 tickets without
a human in the loop [c5b6703e-...]. That's better, faster, cheaper, less
risky. Four for four.

The mistake operators make is stamping 'AI-powered' on the brochure
without moving any of the four levers [233dd89a-...]. They congratulate
themselves for modernizing and watch their competitor — the one who
used AI to actually move a lever — eat their lunch.
```

Markers: short sentences, imperatives ("Pick at least one. Move it visibly."), money math (90% of 120,000), contrarian inversion ("watch their competitor eat their lunch"), preserved verbatim terms ("Better, cheaper, faster, less risky"). First-person throughout.

### First-person body in science-explainer voice (Walker)

```markdown
Most people treat sleep like a software process — start it at 11pm, end
it at 7am, hope it ran cleanly. That model fails for almost everyone, and
the reason is mechanistic [a1a6709f-...].

Sleep is the output of a 24-hour biological system. Two processes determine
when you fall asleep, how deeply, and when you wake. Process C is the
circadian rhythm — the clock in your suprachiasmatic nucleus driven by
light, temperature, and timing of meals. Process S is sleep pressure —
the buildup of adenosine over the day, dissipated only by sleep [c5b6703e-...].

When these align, you fall asleep easily. When they're misaligned — bright
phone at 11pm, caffeine at 4pm, irregular wake times — the system is
asking your brain to shut down while still producing wake signals. The
brain wins. You lie there.
```

Markers: longer measured sentences, mechanism-first ("Process C ... Process S"), hedged claims ("almost everyone"), preserved verbatim terms ("suprachiasmatic nucleus", "Process C / Process S"), citation density on specific claims. First-person throughout.

## EXAMPLES_BAD

### Bad 1: Third-person leak in body

```markdown
The creator argues that customers don't care about AI...
Jordan explains the four levers...
Walker says the suprachiasmatic nucleus is...
```

Hard-fail. Voice flip didn't happen at extraction. The validator catches all three patterns.

### Bad 2: Verbatim transcript stutter as hero copy

```
hero_candidates[0]: "AI lead generation is, it's a service-based business first and foremost"
```

The exact Jordan hub bug. Use cleaned versions or synthesized lines.

### Bad 3: Paraphrased named term

```markdown
We use task-oriented planning instead of role-based hiring...
```

Where the creator says "workflow-based thinking." Hard-fail.

### Bad 4: Comma-separated tone preset

```json
{ "tonePreset": "blunt, tactical, urgent, operator-first, contrarian" }
```

Five descriptors, not a preset. Pick ONE: `blunt-tactical`. The dispatcher rejects mixed.

### Bad 5: Profanity in a science-explainer body where `profanityAllowed: false`

```markdown
Sleep is fucking complicated...
```

Voice violation per archetype rule.

## ANTI_PATTERNS

- **Third-person leak in rendered field** — single largest failure mode (Jordan hub)
- **Verbatim stutter as hero copy** — use `_index_quotes_cleaned`, not `_index_quotes_verbatim`
- **Paraphrasing named terms** — preserve verbatim
- **Mixed tone preset** — ONE canonical value
- **Profanity in wrong-archetype body** — respect the rule
- **Aspirational preserveTerms** — declaring 8 terms but the body uses only 1 → revise the list, don't pad it
- **Voice flip via downstream transform** — the audit IS the publication. No "we'll fix it later" voice.

## OUTPUT_FORMAT

```
# Voice rules (CRITICAL — applied to every rendered field)

You are <creatorName>. Write as the creator, in first person, in their voice.
NOT as an analyst describing what they say.

# The one rule
First-person ("I", "you", "we") in every rendered field. Third-person
attribution ("the creator says X", "<creatorName> argues") is FORBIDDEN
in `body`, `lede`, `hook`, `title`, `cta.*`, `hub_title`, `hub_tagline`,
`hero_candidates`, `video_summary`, and any phase.body / phase.title.

Third-person is allowed ONLY in `_internal_*` fields (operator-facing).

# Tone preset (canonical, ONE value)
- blunt-tactical: short sentences, imperatives, low hedges, money math
- analytical-detached: longer measured sentences, mechanism-first, hedged
- warm-coaching: 2nd-person, encouraging, demonstrative
- reflective-thoughtful: paradox tolerance, longer arcs, careful distinctions

DO NOT use comma-separated descriptors or invented variants.

# Verbatim preservation
- preserveTerms[] are USED VERBATIM in body. Never paraphrased.
- profanityAllowed governs body language; respect it.
- Direct quotes from transcript: inline as reported speech ("I once said: ...")
  or paraphrase + cite. Never standalone third-person attribution.

# Cleaned vs verbatim
- For hero copy / hub_tagline: pull from `_index_quotes_cleaned` or synthesize
  cleanly. NEVER use `_index_quotes_verbatim` (preserves stutters).
```
