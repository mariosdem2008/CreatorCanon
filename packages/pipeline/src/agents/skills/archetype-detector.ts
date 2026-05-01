/**
 * Archetype detector: maps a ChannelProfilePayload to a creator archetype
 * slug. Runtime prompts then load the archetype's examples + voice presets.
 *
 * Detection is heuristic — keyword + tone matches against the channel
 * profile's fields. Threshold + margin requirements bias toward _DEFAULT
 * when the signal is weak, so we never force an archetype onto an unfamiliar
 * creator class.
 */

export type ArchetypeSlug =
  | 'operator-coach'
  | 'science-explainer'
  | 'instructional-craft'
  | 'contemplative-thinker'
  | '_DEFAULT';

export interface ChannelProfileShape {
  niche?: string;
  dominantTone?: string;
  expertiseCategory?: string;
  monetizationAngle?: string;
  recurringThemes?: string[];
  creatorTerminology?: string[];
  [k: string]: unknown;
}

interface ArchetypeRule {
  archetype: ArchetypeSlug;
  /** Keywords that count for 2 points each when found in the haystack. */
  keywords: string[];
  /** Tone words that count for 1 point each. */
  tone: string[];
}

const RULES: ArchetypeRule[] = [
  {
    archetype: 'operator-coach',
    keywords: [
      'business', 'entrepreneur', 'sales', 'marketing', 'operator', 'founder',
      'pricing', 'offer', 'startup', 'leverage', 'cashflow', 'wealth', 'hustle',
      'side-hustle', 'profit', 'revenue', 'growth', 'scale',
    ],
    tone: ['blunt', 'tactical', 'contrarian', 'no-excuses', 'urgent', 'profane'],
  },
  {
    archetype: 'science-explainer',
    keywords: [
      'science', 'neuroscience', 'biology', 'research', 'study', 'mechanism',
      'physiology', 'lab', 'evidence-based', 'peer-reviewed', 'randomized',
      'protocol', 'metabolism', 'circadian',
    ],
    tone: ['analytical', 'measured', 'curious', 'detailed', 'scientific', 'hedged'],
  },
  {
    archetype: 'instructional-craft',
    keywords: [
      'cooking', 'recipe', 'technique', 'craft', 'tutorial', 'how-to',
      'making', 'building', 'baking', 'knife skills', 'woodworking',
      'fitness form', 'exercise technique', 'art', 'music', 'gear',
    ],
    tone: ['warm', 'instructional', 'demonstrative', 'patient', 'encouraging', 'hands-on'],
  },
  {
    archetype: 'contemplative-thinker',
    keywords: [
      'meditation', 'consciousness', 'philosophy', 'ethics', 'mindfulness',
      'introspection', 'self-inquiry', 'metaphysics', 'free will', 'awareness',
      'suffering', 'the self', 'non-dual',
    ],
    tone: ['reflective', 'thoughtful', 'measured', 'inquisitive', 'careful', 'paradoxical'],
  },
];

const MIN_SCORE_THRESHOLD = 4;
const MIN_MARGIN_OVER_RUNNER_UP = 1;

/**
 * Score how strongly a channel profile matches an archetype. Each keyword
 * match scores 2; each tone-word match scores 1. We intentionally don't
 * normalize — short profiles can still score high if multiple keywords hit.
 */
function scoreArchetype(haystack: string, rule: ArchetypeRule): number {
  let s = 0;
  for (const kw of rule.keywords) if (haystack.includes(kw.toLowerCase())) s += 2;
  for (const t of rule.tone) if (haystack.includes(t.toLowerCase())) s += 1;
  return s;
}

export function detectArchetype(profile: ChannelProfileShape): ArchetypeSlug {
  const haystack = [
    profile.niche ?? '',
    profile.dominantTone ?? '',
    profile.expertiseCategory ?? '',
    profile.monetizationAngle ?? '',
    ...(profile.recurringThemes ?? []),
    ...(profile.creatorTerminology ?? []),
  ]
    .join(' ')
    .toLowerCase();

  const scored = RULES.map((rule) => ({
    archetype: rule.archetype,
    score: scoreArchetype(haystack, rule),
  })).sort((a, b) => b.score - a.score);

  const top = scored[0]!;
  const runnerUp = scored[1] ?? { archetype: '_DEFAULT' as const, score: 0 };

  // Both checks must pass: top score is meaningful AND it's not a tie.
  if (top.score < MIN_SCORE_THRESHOLD) return '_DEFAULT';
  if (top.score - runnerUp.score < MIN_MARGIN_OVER_RUNNER_UP) return '_DEFAULT';
  return top.archetype;
}

/** Inspect why a profile matched a given archetype — useful for telemetry. */
export function explainArchetype(profile: ChannelProfileShape): {
  detected: ArchetypeSlug;
  scores: Array<{ archetype: ArchetypeSlug; score: number }>;
} {
  const haystack = [
    profile.niche ?? '',
    profile.dominantTone ?? '',
    profile.expertiseCategory ?? '',
    profile.monetizationAngle ?? '',
    ...(profile.recurringThemes ?? []),
    ...(profile.creatorTerminology ?? []),
  ]
    .join(' ')
    .toLowerCase();
  const scores = RULES.map((rule) => ({
    archetype: rule.archetype,
    score: scoreArchetype(haystack, rule),
  })).sort((a, b) => b.score - a.score);
  return { detected: detectArchetype(profile), scores };
}
