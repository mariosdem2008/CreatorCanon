/**
 * Citation density helper for Phase 10 quality gate.
 *
 * Phase 8 cohort audit-the-audits revealed many bodies cite only 0-3
 * segments (especially for conceptual creators like Sivers, Norton, Huber).
 * Bodies need ≥5 inline [<UUID>] citations to feel evidence-grounded.
 *
 * This module counts unique UUID citations + provides per-type floors.
 * Used by the canon body writer's quality gate to retry under-cited bodies.
 */

const UUID_RE = /\[([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\]/gi;

export function countCitations(body: string | undefined | null): number {
  if (!body || typeof body !== 'string') return 0;
  const seen = new Set<string>();
  for (const m of body.matchAll(UUID_RE)) {
    seen.add(m[1]!.toLowerCase());
  }
  return seen.size;
}

/** Per-type minimum citation density. Tuned to canon-type characteristics:
 *  - quote/aha_moment: short, single-claim — low floor (2-3 cites)
 *  - definition: concept-explanation, moderate evidence (3 cites)
 *  - example: anchored in a specific story (4 cites)
 *  - lesson/pattern/tactic/principle/topic: argument with evidence ladder (5 cites)
 *  - framework: multi-step process with mechanism (7 cites)
 *  - playbook: full operating procedure (7 cites)
 */
export const CITATION_FLOOR_BY_TYPE: Record<string, number> = {
  quote: 2,
  aha_moment: 3,
  definition: 3,
  example: 4,
  lesson: 5,
  pattern: 5,
  tactic: 5,
  principle: 5,
  topic: 5,
  framework: 7,
  playbook: 7,
};

export function citationFloor(type: string): number {
  return CITATION_FLOOR_BY_TYPE[type] ?? 5;
}
