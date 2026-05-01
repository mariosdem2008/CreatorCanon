---
archetype: _DEFAULT
description: Generic fallback archetype used when the heuristic detector cannot confidently match a creator to one of the named archetypes. Stays adaptive and lets channel-profile fields drive prompt customization.
---

# Default (Fallback)

## DETECTION_HEURISTICS

This archetype is the FALLBACK. It does not have its own keyword list.

**Activation rule:** activate when no other archetype scores >= 4 in the heuristic detector, or when the top-scoring archetype's score is within 1 point of the runner-up (ambiguous match).

**Behavior:** instead of injecting archetype-specific examples, the prompt builder should pass through the channel-profile fields directly:
- `dominantTone` → drives `tonePreset`
- `creatorTerminology` → drives `preserveTerms`
- `recurringThemes` → drives `TYPICAL_PILLARS`
- `monetizationAngle` → informs CTA framing
- `expertiseCategory` → informs phase-ladder labels

The runtime should NOT invent archetype-specific syntheses, pillars, or voice presets when this archetype is active. Stay generic and adaptive.

## JOURNEY_PHASE_LADDER

Generic four-phase ladder. Suitable for almost any creator class. The runtime may relabel these phases using the creator's own vocabulary if the channel profile supplies preferred phase names.

1. **Foundations** → core concepts and vocabulary, the baseline a new audience member needs
2. **Practice** → applying the concepts to specific situations, the creator's recurring playbooks
3. **Mastery** → advanced techniques, edge cases, exceptions, the questions long-time fans ask
4. **Integration** → combining the creator's frameworks across domains, applying insights from one pillar to another

## SYNTHESIS_EXAMPLES

Generic shapes only — no archetype-specific naming. The prompt builder should fill in the specific titles using canon-node clustering against the creator's own content.

- **The "Foundations Ladder"** — connects 3+ foundational canon nodes the creator returns to repeatedly
- **The "Synthesis of Practice"** — connects 3+ practice or playbook nodes into a coherent how-to arc
- **The "Mastery Connection"** — connects 3+ advanced or edge-case nodes into a single deep-cut piece
- **The "Cross-Pillar Bridge"** — connects nodes from two different pillars to show how the creator's frameworks compose
- **The "Recurring Theme Thread"** — connects 3+ nodes that revisit the same idea across different contexts

## VOICE_PRESETS

- **profanityAllowed:** follow the channel profile — do NOT override. If `dominantTone` includes "profane" or "blunt" or the `creatorTerminology` array contains profanity, allow it. Otherwise default to false.
- **tonePreset:** adapt directly to the `dominantTone` field. Common mappings:
  - "blunt", "tactical", "direct" → blunt-tactical
  - "warm", "encouraging", "patient" → warm-coaching
  - "analytical", "measured", "evidence-based" → analytical-detached
  - "reflective", "thoughtful", "paradoxical" → reflective-thoughtful
  - If `dominantTone` does not match any preset, fall back to a neutral instructional tone.
- **preserveTerms:** use the `creatorTerminology` array from the channel profile verbatim. If that array is empty, preserve nothing beyond standard proper-noun handling.
- **toneNotes:** mirror the cadence and framing devices observed in the channel profile's sample episodes. Avoid imposing any archetype-specific cadence (no operator-coach short imperatives, no science-explainer hedge density, no contemplative long sentences) unless the channel profile signals them.

## TYPICAL_PILLARS

Drive directly from the creator's `recurringThemes` field. No fixed list. If `recurringThemes` is empty or thin, fall back to a coarse 3-pillar split derived from clustering the top canon nodes by topic.

## HUB_SOURCE_VOICE

When writing canon node bodies, brief bodies, synthesis bodies, hero candidates, and any other rendered field under the _DEFAULT archetype, follow these rules. This archetype intentionally stays neutral — it does NOT impose any of the four named archetypes' voices.

### Sentence rhythm
- Mirror the channel profile's `_internal_dominant_tone` field directly. Do not impose any archetype's cadence.
- If the profile signals "warm" → conversational, second-person, varied length.
- If the profile signals "analytical" → measured medium-length sentences, comma-clause rhythm.
- If the profile signals "blunt" → shorter declaratives, but only if the profile actually carries that signal.

### Vocabulary signature
- Pull verbatim from `_index_creator_terminology`. Do not substitute synonyms for terms the creator uses by name.
- Do not invent jargon to "sound like an archetype". If the creator says "system" instead of "framework", say "system".
- Example phrases come from the channel profile's sample episodes, not from any of the four named archetypes' phrase lists.

### Body structure (recommended)
- Generic 6-step structure: hook → define → walk through → example → mistake or counter-case → close.
- If the channel profile shows a different recurring structure (e.g., creator always opens with a story), adapt to that observed structure.
- Do not force the operator-coach 5-bullet shape, the science-explainer evidence ladder, the instructional sensory-cue chain, or the contemplative paradox arc — unless the profile shows the creator actually uses that structure.

### Citation discipline
- Cite claims that need source-grounding regardless of style — every factual claim should map to a `[<segmentId>]` reference.
- Citation density should mirror the creator's actual citation behavior in source episodes, not an archetype's default density.
- Do not invent named studies, dollar figures, or technical terms to fit an archetype shape.

### Forbidden patterns
- Choosing an archetype's voice when the detector returned _DEFAULT. Stay neutral until detector confidence improves.
- Importing operator-coach imperatives, science-explainer hedge density, instructional 2nd-person heaviness, or contemplative paradox cadence by default.
- Fabricating preserveTerms or framework names that aren't in the channel profile's `creatorTerminology`.
- Padding with archetype-flavored example phrases ("money math", "the mechanism is", "you'll notice", "consider this") when the profile doesn't show the creator using them.

### Example body excerpts (3, ~80 words each)

These are intentionally tone-neutral. They demonstrate the generic 6-step structure without leaning into any archetype's signature cadence. The actual rendered output should adapt to the channel profile's observed tone.

#### Excerpt 1 — defining a concept
A retention loop is the pattern that brings a customer back to the product without external prompting [a1a6709f-a2a7-48f4-839b-82687165fbdd]. The defining feature is that the loop is internal to the product experience, not driven by a marketing channel. Different teams describe this with different vocabulary — habit loop, engagement flywheel, sticky core action — but the underlying idea is consistent: a designed return path. In this body of work, the term used most often is "retention loop", and it appears across several recurring discussions [b2b4818e-c3d6-49e5-840c-93798276cefe].

#### Excerpt 2 — walking through mechanism / steps
The process generally moves through three stages. First, the user encounters a triggering event tied to a real need [c3c5929f-d4e7-46f6-851d-a4809387dgff]. Second, the product delivers a clear, low-friction action that resolves the need. Third, the resolution itself surfaces a small reward or progress signal that anchors the next return. Each stage is observable, which is part of why the framework gets revisited so often. When one stage breaks, the loop weakens. The diagnostic work is identifying which stage is the constraint.

#### Excerpt 3 — closing with practical "what to do now"
A reasonable starting move is to map the current loop and note where it actually breaks [d4d6a3af-e5f8-47g7-862e-b591a498ehgg]. Do not redesign the entire experience. Instead, identify the single weakest stage and focus there for one cycle. Measure before the change, hold the rest of the system constant, and revisit after a defined window. The point is iteration on a real loop, not an aspirational redesign. As the underlying material is revisited, this practical framing tends to recur, and is worth keeping close.

## ANTI_PATTERNS

- **This is the catch-all. Don't add archetype-specific pillars or syntheses.** The whole point of the default is to stay neutral.
- **Don't impose a voice the channel profile didn't request.** If the profile says "warm and patient", don't override with blunt-tactical because the topic happens to be business.
- **Don't fabricate a phase ladder beyond the four generic phases.** If the creator's content genuinely has more or fewer phases, log it as a profile-improvement signal rather than padding here.
- **Don't suppress profanity that the channel profile authorized**, and don't authorize profanity the profile didn't.
- **Don't bias toward any of the four named archetypes.** If a creator is a 50/50 mix of operator-coach and science-explainer (e.g., a lab-trained founder), this default keeps them neutral until detector confidence improves.
- **If the runtime keeps falling through to default**, that's a signal the detector heuristics need tuning — surface it for review rather than papering over with default content.
