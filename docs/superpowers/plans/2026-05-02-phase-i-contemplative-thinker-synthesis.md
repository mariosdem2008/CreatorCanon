# Phase I — Contemplative-Thinker Product Synthesis

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** Build the product synthesis layer for contemplative-thinker archetype creators (Sivers). The PRODUCT MOMENT is **drawing a card** — the audience opens the hub, draws a random aphorism, and walks away with one line they'll remember for a week.

**Architecture:** Lighter than Phase A or H — contemplative archetype's content is more aphoristic-dense, less structured. Two main composers: Card Forge (per-aphorism cards) + Theme Curator (collections). Plus a dedicated shell with "draw card" interaction.

**Owner:** Claude.

**Dependencies:** Phase A (composer pattern). Synergy with Phase B (editor) for letting creator curate themes.

**Estimated weeks:** 4 (weeks 16-20 of meta-timeline).

---

## File structure

```
packages/synthesis/src/composers/
  card-forge.ts                                      ← NEW
  card-forge.test.ts
  theme-curator.ts                                   ← NEW (cluster cards by theme)
  theme-curator.test.ts
  decision-frame-composer.ts                         ← NEW (e.g., "Hell Yeah or No" as reusable framework)
  decision-frame-composer.test.ts

packages/synthesis/src/types.ts                      ← extend with CardComponent, ThemeComponent, DecisionFrameComponent

apps/web/src/components/hub/shells/contemplative-thinker/
  index.tsx
  pages/
    HomePage.tsx                                     ← card draw interface
    CardPage.tsx                                     ← single card deep view
    ThemePage.tsx                                    ← cards grouped by theme
    DecisionFramePage.tsx                            ← interactive decision tool
    SourcesPage.tsx                                  ← original talks/essays
  data-adapter.ts
  CardDraw.tsx                                       ← random card with animation
  JournalingPrompt.tsx                               ← per-card reflection prompts
```

---

## Tasks

### I.1 — Card / Theme / DecisionFrame component types

```ts
export interface AphorismCard {
  id: string;
  text: string;                              // verbatim from source — quoted exactly
  themeTags: string[];                       // ['work', 'money', 'creativity']
  whyThisMatters: string;                    // 1 line — Codex-authored
  sourceVideoId: string;
  sourceTimestampMs: number;
  journalingPrompt?: string;                 // 1-2 sentence reflection prompt
  shareableImageUrl?: string;
}

export interface ThemeCollection {
  id: string;
  name: string;
  description: string;
  cardIds: string[];
  primaryColor?: string;
}

export interface DecisionFrame {
  id: string;
  name: string;                              // "Hell Yeah or No"
  description: string;
  sourceCanonId: string;
  decisionRule: string;                      // the verbatim rule from source
  applicationSteps: string[];
  examples: Array<{ situation: string; outcome: string }>;
}

export interface CardComponent { cards: AphorismCard[]; }
export interface ThemeComponent { themes: ThemeCollection[]; }
export interface DecisionFrameComponent { frames: DecisionFrame[]; }
```

### I.2 — Card Forge

Source: aphorisms — verbatim creator quotes that match the contemplative archetype's voice fingerprint (short, declarative, philosophical). Detection:
- All canon nodes of type `aphorism`, `quote`
- All blockquoted first-person aphorisms inside hybrid-mode bodies (these are intentional inserts in Phase 8's hybrid prompt)
- Sentence-level extraction from canons of type `principle` where a single sentence is < 30 words AND high voice-fingerprint score

For each aphorism: 1 Codex call to author `whyThisMatters` + tag themes. Generate shareable card image via @vercel/og.

### I.3 — Theme Curator

Cluster aphorisms by theme via embedding similarity (use the same OpenAI embedding pipeline as Phase H ClaimSearchBar). Group into 5-12 themes per creator (work / money / creativity / relationships / decision-making / etc.). Codex names each theme.

### I.4 — Decision Frame Composer

For canons of type `framework` where the framework is a decision rule (Codex detects: "is this a rule for choosing?"), build a DecisionFrame. Sivers' "Hell Yeah or No" is the canonical example.

### I.5 — Contemplative shell — card draw interaction

`HomePage.tsx`: large central card with shuffle animation. Click → reveals random card. Side: theme filters ("today let me draw from work cards"). Save state in localStorage so cards already drawn aren't re-drawn (until they all are).

### I.6 — Email-of-the-day integration (optional v1)

If creator chose lead_magnet profile: opt-in for "Card a day in your inbox." Backend cron emails one card per day. Drives recurring engagement.

### I.7 — Cohort smoke test

Run on Sivers (`ad22df26-2b7f-4387-bcb3-19f0d9a06246`). Expected output:
- ~50-80 aphorism cards (source has ~12 short essays + many blockquoted lines)
- ~5-8 themes
- ~2-4 decision frames

### I.8 — Phase I results doc + PR

---

## Success criteria

- [ ] Sivers has full contemplative product bundle
- [ ] Card draw interaction feels delightful (animation, randomness, themes)
- [ ] Decision frames work as interactive tools
- [ ] Email-of-the-day cron sends test daily card

## Out of scope

- Card "favoriting" / personal collections (defer to v2)
- Multi-creator card-deck combinations (defer)
