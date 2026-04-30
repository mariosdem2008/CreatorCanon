---
archetype: science-explainer
description: Mechanism-first creators who translate peer-reviewed research into actionable protocols, hedge claims carefully, and cite studies by name. Canonical examples include Andrew Huberman, Peter Attia, and Rhonda Patrick.
---

# Science-Explainer

## DETECTION_HEURISTICS

Channel profile signals — score >= 4 hits across keywords + tone words to activate this archetype.

**Niche keywords (look for in `niche`, `recurringThemes`, `creatorTerminology`):**
- science
- neuroscience
- biology
- research
- study
- mechanism
- physiology
- lab
- evidence-based
- peer-reviewed
- randomized
- protocol
- biomarker
- longevity
- metabolism
- endocrine
- cardiovascular
- circadian
- pharmacology

**Expertise category phrases (look for in `expertiseCategory`):**
- "neuroscience and behavior"
- "health and longevity"
- "evidence-based medicine"
- "physiology and performance"
- "applied research translation"

**dominantTone words (must score on 2+ of these):**
- analytical
- measured
- curious
- evidence-based
- detailed
- scientific
- precise
- hedged

**monetizationAngle hints:**
- supplement / lab partnerships (disclosed)
- subscription premium podcasts / newsletters
- continuing-education for clinicians
- sponsored deep-dives with research partners

## JOURNEY_PHASE_LADDER

Five-phase ladder modeled on Huberman/Attia content trajectories. Each phase deepens commitment and individualizes intervention.

1. **Foundations** → understand the system (sleep architecture, light and circadian biology, autonomic nervous system, basic metabolic pathways)
2. **Protocols** → tactical interventions backed by evidence (morning sunlight, NSDR, time-restricted eating, Zone 2 cardio)
3. **Optimization** → titration, individual variation, dose-response curves, advanced protocols (cold exposure timing, caffeine half-life management, supplementation stacks)
4. **Integration** → stack protocols across domains (sleep × training × nutrition × stress recovery), manage trade-offs, periodize
5. **Edge** → emerging research, frontier interventions (peptides, gene-expression-targeted compounds, GLP-1 mechanism debates, hormetic stressor science)

## SYNTHESIS_EXAMPLES

Huberman/Attia-style — each one chains specific mechanism nodes into a clinical-feeling whole.

- **The Light/Cortisol Axis** — connects retinal-ganglion-cell signaling + suprachiasmatic-nucleus entrainment + cortisol-awakening-response + circadian-framework canon nodes
- **The Dopamine Recovery Protocol Stack** — connects baseline-vs-peak dopamine + post-pleasure trough mechanism + abstinence/reset windows + behavioral-activation evidence
- **The Cold Exposure Mechanism Tree** — connects norepinephrine spike + brown adipose tissue activation + cold-shock-protein literature + timing relative to training (catecholamine vs hypertrophy trade-off)
- **The Caffeine Half-Life Sequence** — connects adenosine-receptor pharmacology + CYP1A2 polymorphism + delayed-caffeine protocol + sleep-pressure interaction
- **The Sleep Architecture Hierarchy** — connects N1/N2/N3/REM staging + slow-wave-dominant first half + REM-dominant second half + temperature/light/timing levers ranked by effect size

## VOICE_PRESETS

- **profanityAllowed:** false
- **tonePreset:** analytical-detached
- **preserveTerms:** mechanism names verbatim ("retinal ganglion cells", "suprachiasmatic nucleus", "non-sleep deep rest", "Zone 2", "VO2max", "apoB", "rapamycin", "AMPK"), exact protocol parameters (durations, dosages, timing windows), study-author shorthand when used by the creator ("the Walker lab", "Attia's MED-PED framework"), units of measurement
- **toneNotes:** Long sentences with embedded subordinate clauses. Hedging is structural, not cosmetic — "the data suggest", "in the populations studied", "we don't yet have RCT evidence for". Mechanism described before recommendation. Effect sizes preferred over binary claims ("modestly improves" vs "fixes"). Direct address kept neutral ("you" used sparingly, "people" or "the listener" preferred). No exclamation points. Caveat-first framing when extrapolating from animal models or n=1 case reports. Citation density: at least one named study or researcher per major claim.

## TYPICAL_PILLARS

- Sleep
- Light & Circadian Biology
- Movement & Training
- Nutrition & Metabolism
- Stress & Recovery
- Cognitive Performance
- Cardiovascular Health
- Hormones & Endocrine Function

## ANTI_PATTERNS

- **Don't apply this archetype to operators, contemplative thinkers, or instructional craft creators.** Science-explainer cadence will sound stilted and over-qualified in those contexts.
- **Wrong-archetype signals:** profanity in the dominantTone, "just do it" framing, absence of mechanism vocabulary, monetary-outcome focus, paradox/koan framing — these point away from science-explainer.
- **Don't allow profanity** even if the runtime detects it elsewhere. Science-explainer voice is broken by tonal coarseness.
- **Don't compress mechanism descriptions** into one-liners — the mechanism IS the value. "Cold = good for you" loses the archetype; "cold elevates norepinephrine ~2-3x for ~1 hour, which is why timing it post-training competes with hypertrophy signaling" preserves it.
- **Don't drop hedges** in pursuit of punchier prose. Hedging is a fidelity signal, not a weakness.
- **Don't strip study citations or researcher names** when the creator named them — preserveTerms enforces this.
