import { getCreatorManualRouteForSearchDoc } from './routes';
import type { CreatorManualManifest, CreatorManualSearchDoc, CreatorManualSearchDocType } from './schema';

export type CreatorManualSearchResult = {
  doc: CreatorManualSearchDoc;
  score: number;
  route: string;
};

export type CreatorManualSearchOptions = {
  types?: CreatorManualSearchDocType[];
  limit?: number;
};

const tokenize = (value: string) =>
  value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

const includesTerm = (value: string | undefined, term: string) =>
  Boolean(value?.toLowerCase().includes(term));

const scoreDoc = (doc: CreatorManualSearchDoc, terms: string[]) => {
  let score = 0;
  const keywordText = doc.keywords?.join(' ') ?? '';

  for (const term of terms) {
    if (includesTerm(doc.title, term)) score += 20;
    if (includesTerm(doc.summary, term)) score += 8;
    if (includesTerm(doc.body, term)) score += 4;
    if (includesTerm(keywordText, term)) score += 3;
  }

  return score;
};

export const searchCreatorManual = (
  manifest: CreatorManualManifest,
  query: string,
  options: CreatorManualSearchOptions = {},
): CreatorManualSearchResult[] => {
  const terms = tokenize(query);
  if (terms.length === 0) return [];

  const typeFilter = options.types ? new Set(options.types) : null;

  return manifest.search
    .filter((doc) => !typeFilter || typeFilter.has(doc.type))
    .map((doc, index) => ({
      doc,
      index,
      score: scoreDoc(doc, terms),
      route: getCreatorManualRouteForSearchDoc(manifest.hubSlug, doc),
    }))
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score || a.doc.title.localeCompare(b.doc.title) || a.index - b.index)
    .slice(0, options.limit ?? 20)
    .map(({ doc, score, route }) => ({ doc, score, route }));
};
