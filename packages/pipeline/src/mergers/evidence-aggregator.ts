import type { ArchiveFinding, ArchiveRelation } from '@creatorcanon/db/schema';

interface PageInput {
  id: string;
  sections: Array<{ citations?: string[] }>;
  primaryFindingId: string;
  supportingFindingIds: string[];
}

interface AggregateInput { pages: PageInput[]; findings: ArchiveFinding[]; relations: ArchiveRelation[]; }

interface PageStats {
  citationCount: number;
  sourceCoveragePercent: number;
  evidenceQuality: 'strong'|'moderate'|'limited'|'unverified';
  relatedPageIds: string[];
}

function maxQuality(qs: Array<'strong'|'moderate'|'limited'|'unverified'>): 'strong'|'moderate'|'limited'|'unverified' {
  if (qs.length === 0) return 'unverified';
  if (qs.includes('limited')) return 'limited';
  if (qs.every((q) => q === 'strong')) return 'strong';
  if (qs.includes('unverified')) return 'unverified';
  return 'moderate';
}

export function aggregateEvidence(input: AggregateInput): { byPageId: Record<string, PageStats> } {
  const findingById = new Map(input.findings.map((f) => [f.id, f] as const));
  const findingToPages = new Map<string, string[]>();
  for (const p of input.pages) {
    const ids = [p.primaryFindingId, ...p.supportingFindingIds];
    for (const fid of ids) {
      const list = findingToPages.get(fid) ?? [];
      list.push(p.id);
      findingToPages.set(fid, list);
    }
  }

  const byPageId: Record<string, PageStats> = {};
  for (const p of input.pages) {
    const allCitations = new Set<string>();
    let sectionsWithCitations = 0;
    for (const sec of p.sections) {
      if (sec.citations && sec.citations.length > 0) {
        sectionsWithCitations += 1;
        for (const c of sec.citations) allCitations.add(c);
      }
    }

    const findingsForPage = [findingById.get(p.primaryFindingId), ...p.supportingFindingIds.map((id) => findingById.get(id))].filter((f): f is ArchiveFinding => !!f);
    const quality = maxQuality(findingsForPage.map((f) => f.evidenceQuality));

    const linked: string[] = [];
    const linkTypes = new Set(['supports', 'builds_on', 'related_to']);
    for (const r of input.relations) {
      if (!linkTypes.has(r.type)) continue;
      const otherFindingId = r.fromFindingId === p.primaryFindingId ? r.toFindingId : r.toFindingId === p.primaryFindingId ? r.fromFindingId : null;
      if (!otherFindingId) continue;
      const otherPages = findingToPages.get(otherFindingId) ?? [];
      for (const op of otherPages) if (op !== p.id) linked.push(op);
    }

    byPageId[p.id] = {
      citationCount: allCitations.size,
      sourceCoveragePercent: p.sections.length === 0 ? 0 : sectionsWithCitations / p.sections.length,
      evidenceQuality: quality,
      relatedPageIds: [...new Set(linked)].sort(),
    };
  }
  return { byPageId };
}
