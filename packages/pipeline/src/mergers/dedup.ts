import type { ArchiveFinding } from '@creatorcanon/db/schema';

// Common English stopwords filtered out before Jaccard to improve title similarity signal.
const STOPWORDS = new Set(['the','and','for','with','from','this','that','are','was','were','has','have','had','its','not','but','can','all','out','via','per']);

function tokenize(s: string): Set<string> {
  return new Set((s.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []).filter((t) => !STOPWORDS.has(t)));
}
function jaccard(a: Set<string>, b: Set<string>): number {
  const inter = [...a].filter((x) => b.has(x)).length;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

// Lower than naive 0.5 because stopword-filtered Jaccard on short titles is still meaningful
// at 0.25+ (e.g. "Pomodoro Technique" ≈ "The Pomodoro method" → 0.33).
const TITLE_SIM_THRESHOLD = 0.25;
const EVIDENCE_OVERLAP_THRESHOLD = 0.5;

export interface DedupResult {
  dropFindingIds: string[];
  relationsToInsert: Array<{ fromFindingId: string; toFindingId: string; type: 'supports'; evidenceSegmentIds: string[]; notes: string }>;
}

export function dedupeLessonFramework(findings: ArchiveFinding[]): DedupResult {
  const frameworks = findings.filter((f) => f.type === 'framework');
  const lessons = findings.filter((f) => f.type === 'lesson');
  const drop: string[] = [];
  const relations: DedupResult['relationsToInsert'] = [];

  for (const lesson of lessons) {
    const lEv = new Set(lesson.evidenceSegmentIds);
    if (lEv.size === 0) continue;
    for (const fw of frameworks) {
      const fwEv = new Set(fw.evidenceSegmentIds);
      const overlap = [...lEv].filter((x) => fwEv.has(x)).length;
      const overlapRatio = overlap / Math.min(lEv.size, fwEv.size);
      if (overlapRatio < EVIDENCE_OVERLAP_THRESHOLD) continue;

      const titleSim = jaccard(tokenize((lesson.payload as any).title), tokenize((fw.payload as any).title));
      if (titleSim < TITLE_SIM_THRESHOLD) continue;

      drop.push(lesson.id);
      relations.push({
        fromFindingId: lesson.id, toFindingId: fw.id, type: 'supports',
        evidenceSegmentIds: [...lEv].filter((x) => fwEv.has(x)),
        notes: `auto-dedupe: lesson and framework refer to same concept (overlap=${overlap}, titleSim=${titleSim.toFixed(2)})`,
      });
      break;
    }
  }

  return { dropFindingIds: [...new Set(drop)], relationsToInsert: relations };
}
