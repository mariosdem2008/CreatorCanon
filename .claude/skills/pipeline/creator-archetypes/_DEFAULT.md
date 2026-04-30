---
archetype: _default
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

## ANTI_PATTERNS

- **This is the catch-all. Don't add archetype-specific pillars or syntheses.** The whole point of the default is to stay neutral.
- **Don't impose a voice the channel profile didn't request.** If the profile says "warm and patient", don't override with blunt-tactical because the topic happens to be business.
- **Don't fabricate a phase ladder beyond the four generic phases.** If the creator's content genuinely has more or fewer phases, log it as a profile-improvement signal rather than padding here.
- **Don't suppress profanity that the channel profile authorized**, and don't authorize profanity the profile didn't.
- **Don't bias toward any of the four named archetypes.** If a creator is a 50/50 mix of operator-coach and science-explainer (e.g., a lab-trained founder), this default keeps them neutral until detector confidence improves.
- **If the runtime keeps falling through to default**, that's a signal the detector heuristics need tuning — surface it for review rather than papering over with default content.
