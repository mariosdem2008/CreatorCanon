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

// ---------- Reference (science-explainer, Phase H) ----------

export type EvidenceVerdict =
  | 'supported'
  | 'partially_supported'
  | 'contradicted'
  | 'mixed';

export interface EvidenceCard {
  id: string;
  /** "Linoleic acid is inflammatory" — short claim summary. */
  claim: string;
  verdict: EvidenceVerdict;
  /** 1-2 sentence mechanism summary, why the evidence supports the verdict. */
  mechanismExplanation: string;
  /** Topic slug used for grouping cards in topicIndex. */
  topic: string;
  /** Canon node IDs that cite specific studies/data behind this card. */
  studyEvidenceCanonIds: string[];
  /** Caveats / nuance that qualifies the verdict. */
  caveats: string[];
  /** Optional counter-claim referenced by Debunking Forge. */
  counterClaim?: string;
  /** Pre-rendered shareable image; rendered by @vercel/og at runtime. */
  shareableImageUrl?: string;
}

export interface ReferenceComponent {
  cards: EvidenceCard[];
  /** topic slug → ordered list of EvidenceCard ids. */
  topicIndex: Record<string, string[]>;
}

// ---------- Debunking (science-explainer, Phase H) ----------

export interface DebunkingItem {
  id: string;
  /** "Seed oils cause inflammation" — popular myth. */
  myth: string;
  /** 1-paragraph counter-narrative grounded in canon evidence. */
  reality: string;
  /** Canon nodes whose evidence backs the counter-narrative. */
  primaryEvidenceCanonIds: string[];
  /** Optional EvidenceCard id this debunking links to. */
  evidenceCardId?: string;
  /** Pre-rendered share-card image; @vercel/og pattern. */
  shareableImageUrl?: string;
}

export interface DebunkingComponent {
  items: DebunkingItem[];
}

// ---------- Glossary (science-explainer, Phase H) ----------

export interface GlossaryEntry {
  id: string;
  /** "linoleic acid" — extracted mechanism / term. */
  term: string;
  /** 1-2 sentence definition. */
  definition: string;
  /** Canon ids that mention this term (cross-link). */
  appearsInCanonIds: string[];
}

export interface GlossaryComponent {
  entries: GlossaryEntry[];
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
    /** contemplative-thinker — filled in Phase I. */
    cards?: never;
    /** science-explainer — filled in Phase H. */
    reference?: ReferenceComponent;
    debunking?: DebunkingComponent;
    glossary?: GlossaryComponent;
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
    _index_voice_fingerprint?: {
      archetype?: ArchetypeSlug | string;
      /** Tags that classify rhetorical posture (e.g. "myth-busting"). */
      rhetoricalMoves?: string[];
      [k: string]: unknown;
    };
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
