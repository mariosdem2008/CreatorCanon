/**
 * ProductBundle — the single typed JSON document emitted by the synthesis
 * runner. Shell renderers and APIs consume this. Composer agents (action
 * plan, worksheet forge, calculator forge, diagnostic, funnel) each
 * contribute one component.
 *
 * NOTE: We re-declare ArchetypeSlug and VoiceMode locally rather than
 * importing from @creatorcanon/pipeline. Pipeline's barrel doesn't export
 * these, and we want synthesis to stay decoupled from pipeline internals.
 * The local copies MUST be kept in lock-step with:
 *   - packages/pipeline/src/agents/skills/archetype-detector.ts (ArchetypeSlug)
 *   - packages/pipeline/src/scripts/util/voice-mode.ts (VoiceMode)
 */

export type ArchetypeSlug =
  | 'operator-coach'
  | 'science-explainer'
  | 'instructional-craft'
  | 'contemplative-thinker'
  | '_DEFAULT';

export type VoiceMode = 'first_person' | 'third_person_editorial' | 'hybrid';

export type ProductGoal =
  | 'lead_magnet'
  | 'paid_product'
  | 'member_library'
  | 'sales_asset'
  | 'public_reference';

export interface CreatorConfig {
  brand: { primaryColor: string; logoUrl?: string; logoAlt?: string };
  ctas: {
    primary?: { label: string; href: string };
    secondary?: { label: string; href: string };
  };
  funnelDestination?: string;
  customDomain?: string;
}

// ---------- Action Plan ----------

export interface ActionPlanStep {
  id: string;
  title: string;
  description: string;
  /** "this week" | "this month" | "next 90 days" — free-form display string. */
  durationLabel: string;
  /** "you'll know it worked when..." */
  successCriterion: string;
  sourceCanonId: string;
  estimatedMinutes?: number;
}

export type ActionPlanPhaseId =
  | 'pre_revenue'
  | 'sub_10k_month'
  | 'sub_100k_month'
  | 'scale';

export interface ActionPlanPhase {
  id: ActionPlanPhaseId;
  name: string;
  position: number;
  steps: ActionPlanStep[];
}

export interface ActionPlanComponent {
  phases: ActionPlanPhase[];
  intro: string;
  outroCta: string;
}

// ---------- Worksheets ----------

export type WorksheetFieldType =
  | 'text_short'
  | 'text_long'
  | 'multi_choice'
  | 'number'
  | 'list'
  | 'decision_branch';

export interface WorksheetField {
  id: string;
  type: WorksheetFieldType;
  label: string;
  helpText?: string;
  /** For multi_choice. */
  options?: string[];
  /** For decision_branch — each branch has a trigger condition + follow-up step IDs. */
  branches?: Array<{ trigger: string; thenSteps: string[] }>;
}

export interface WorksheetComponent {
  id: string;
  canonId: string;
  title: string;
  setupQuestion: string;
  fields: WorksheetField[];
  outputRubric: string;
  estimatedMinutes: number;
}

// ---------- Calculators ----------

export type CalculatorVariableType =
  | 'currency'
  | 'integer'
  | 'percentage'
  | 'months';

export interface CalculatorVariable {
  id: string;
  label: string;
  type: CalculatorVariableType;
  defaultValue: number;
  minValue?: number;
  maxValue?: number;
}

export interface CalculatorComponent {
  id: string;
  title: string;
  description: string;
  variables: CalculatorVariable[];
  /**
   * Sandboxed expression. Evaluated by the renderer with a small expression
   * walker — NEVER `Function(...)` or `eval(...)`. Identifiers reference
   * variable IDs.
   */
  formula: string;
  outputLabel: string;
  outputUnit: string;
  /** "this number means..." — Codex-authored interpretation copy. */
  interpretation: string;
  /** Canon node IDs whose claims justify the formula. */
  sourceClaimCanonIds: string[];
}

// ---------- Diagnostic ----------

export interface DiagnosticOption {
  label: string;
  value: string;
  weight: number;
}

export interface DiagnosticQuestion {
  id: string;
  text: string;
  options: DiagnosticOption[];
}

export interface DiagnosticOutcome {
  matchScore: number;
  recommendedNextStep: string;
  routeToCanonIds: string[];
  routeToActionPlanPhaseId?: ActionPlanPhaseId;
}

export interface DiagnosticComponent {
  questions: DiagnosticQuestion[];
  /** key = sorted answer-value joinKey (e.g. "a|b|c"); value = outcome */
  scoring: Record<string, DiagnosticOutcome>;
  intro: string;
}

// ---------- Funnel ----------

export interface FunnelEmailCapture {
  label: string;
  submitText: string;
  thankyouText: string;
}

export interface FunnelPaywall {
  tagline: string;
  bullets: string[];
  ctaText: string;
}

export interface FunnelLogin {
  headline: string;
  ctaText: string;
  ctaHref?: string;
}

export interface FunnelShareCard {
  id: string;
  title: string;
  quote: string;
  sourceCanonId: string;
}

export interface FunnelInlineCta {
  pageDepth: 'shallow' | 'mid' | 'deep';
  text: string;
  href: string;
}

export interface FunnelComponent {
  goal: ProductGoal;
  emailCapture?: FunnelEmailCapture;
  paywall?: FunnelPaywall;
  login?: FunnelLogin;
  shareCardTemplates: FunnelShareCard[];
  inlineCtas: FunnelInlineCta[];
}

// ---------- Contemplative-thinker (Phase I) ----------

/**
 * AphorismCard — a single short, declarative line drawn from a contemplative
 * creator's canon. The PRODUCT MOMENT for this archetype is "drawing a card":
 * the audience opens the hub, draws a random aphorism, and walks away with
 * one line they'll remember for a week.
 *
 * Text is verbatim from source (creator's own voice). Codex authors
 * `whyThisMatters` and the optional `journalingPrompt`; theme tags come from
 * the Theme Curator's embedding cluster pass.
 */
export interface AphorismCard {
  id: string;
  /** Verbatim from source. Never paraphrase — these are the creator's own words. */
  text: string;
  /** Codex/Theme-Curator-authored tags. e.g. ['work', 'money', 'creativity']. */
  themeTags: string[];
  /** 1 line — Codex-authored "why this aphorism matters." */
  whyThisMatters: string;
  sourceCanonId: string;
  sourceVideoId?: string;
  sourceTimestampMs?: number;
  /** 1-2 sentence reflection prompt. Optional. */
  journalingPrompt?: string;
  /** @vercel/og rendered card image. Optional — generated at deploy time. */
  shareableImageUrl?: string;
}

export interface ThemeCollection {
  id: string;
  /** Short name, e.g. "Work" or "Decision making". */
  name: string;
  description: string;
  cardIds: string[];
  /** Optional brand-tinted accent colour for this theme. */
  primaryColor?: string;
}

export interface DecisionFrame {
  id: string;
  /** Short name, e.g. "Hell Yeah or No". */
  name: string;
  description: string;
  sourceCanonId: string;
  /** The verbatim rule from the source canon. */
  decisionRule: string;
  /** Ordered application steps for the reader. */
  applicationSteps: string[];
  examples: Array<{ situation: string; outcome: string }>;
}

export interface CardComponent {
  cards: AphorismCard[];
}

export interface ThemeComponent {
  themes: ThemeCollection[];
}

export interface DecisionFrameComponent {
  frames: DecisionFrame[];
}

// ---------- Bundle ----------

export interface ProductBundle {
  archetype: ArchetypeSlug;
  voiceMode: VoiceMode;
  productGoal: ProductGoal;
  creatorConfig: CreatorConfig;
  components: {
    actionPlan?: ActionPlanComponent;
    worksheets?: WorksheetComponent[];
    calculators?: CalculatorComponent[];
    diagnostic?: DiagnosticComponent;
    /** contemplative-thinker — Phase I. */
    cards?: CardComponent;
    /** contemplative-thinker — Phase I. */
    themes?: ThemeComponent;
    /** contemplative-thinker — Phase I. */
    decisionFrames?: DecisionFrameComponent;
    /** science-explainer — filled in Phase H. */
    reference?: never;
    /** instructional-craft — filled in Phase J. */
    lessonSequence?: never;
    funnel: FunnelComponent;
  };
  generatedAt: string;
  schemaVersion: 'product_bundle_v1';
}

export type ProductBundleComponentKey = keyof ProductBundle['components'];

// ---------- Composer input shape (shared by all composers) ----------

/**
 * Minimal, structural shape of a canon node as seen by composers. We don't
 * import the DB row type because composers should be testable with hand-
 * built fixtures — only the fields they read are required.
 */
export interface CanonRef {
  id: string;
  payload: {
    type?: string;
    title?: string;
    body?: string;
    /** Optional dependency hints: other canon IDs that must precede this one. */
    _index_dependencies?: string[];
    /** Audience-job tags for diagnostic routing. */
    _index_audience_job_tags?: string[];
    /** Voice fingerprint summary attached during audit. */
    _index_voice_fingerprint?: { archetype?: ArchetypeSlug | string };
    [k: string]: unknown;
  };
}

/**
 * Minimal channel profile shape. Composers read a small set of indexed
 * fields. Real ChannelProfile_v2 has many more fields — we only require
 * what we use, so test fixtures can stay small.
 */
export interface ChannelProfileRef {
  archetype?: ArchetypeSlug | string;
  voiceMode?: VoiceMode | string;
  creatorName?: string;
  niche?: string;
  /** Audience jobs-to-be-done extracted in audit Stage 1. */
  _index_audience_jobs?: Array<{ id: string; label: string; tags?: string[] }>;
  [k: string]: unknown;
}

/** Common composer input. Each composer narrows this further as needed. */
export interface ComposeInput {
  runId: string;
  canons: CanonRef[];
  channelProfile: ChannelProfileRef;
  voiceMode: VoiceMode;
  creatorName: string;
}

// ---------- Codex client interface (injectable for tests) ----------

export interface CodexClient {
  /**
   * Run a Codex prompt. Implementations may delegate to the real Codex CLI
   * runner (`packages/pipeline/src/scripts/util/codex-runner.ts`) or a
   * deterministic stub for tests.
   */
  run(
    prompt: string,
    options?: { stage?: string; timeoutMs?: number; label?: string },
  ): Promise<string>;
}
