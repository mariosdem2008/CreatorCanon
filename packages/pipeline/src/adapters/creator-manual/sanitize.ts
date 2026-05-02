export type CreatorManualSanitizerIssue = {
  kind: 'uuid' | 'internal_language';
  match: string;
  index: number;
};

export type CreatorManualManifestPublicTextIssue = CreatorManualSanitizerIssue & {
  path: Array<string | number>;
};

const uuidLikePattern = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
const internalLanguagePattern = /\b(?:internal review|manual review|manual-review|tagger|review queue|needs review|audit note|unpublished draft)\b/gi;
const nonPublicStringKeys = new Set([
  'avatarUrl',
  'canonicalUrl',
  'heroImageUrl',
  'logoUrl',
  'patternImageUrl',
  'portraitUrl',
  'thumbnailUrl',
  'url',
  'youtubeId',
  'generatedAt',
  'publishedAt',
  'schemaVersion',
  'hubSlug',
  'hubId',
  'releaseId',
  'id',
  'recordId',
  'sourceId',
  'segmentId',
]);

const collectMatches = (
  text: string,
  pattern: RegExp,
  kind: CreatorManualSanitizerIssue['kind'],
) => {
  const issues: CreatorManualSanitizerIssue[] = [];
  let match: RegExpExecArray | null;

  pattern.lastIndex = 0;
  while ((match = pattern.exec(text)) !== null) {
    issues.push({ kind, match: match[0], index: match.index });
  }

  return issues;
};

export const findCreatorManualPublicTextIssues = (text: string) => [
  ...collectMatches(text, uuidLikePattern, 'uuid'),
  ...collectMatches(text, internalLanguagePattern, 'internal_language'),
].sort((a, b) => a.index - b.index);

const isPublicTextPath = (path: Array<string | number>) => {
  const key = String(path.at(-1) ?? '');

  if (nonPublicStringKeys.has(key)) return false;
  if (key.endsWith('Id') || key.endsWith('Ids')) return false;
  if (path[0] === 'brand' && path[1] === 'tokens') return false;

  return true;
};

export const findCreatorManualManifestPublicTextIssues = (manifest: unknown) => {
  const issues: CreatorManualManifestPublicTextIssue[] = [];

  const visit = (value: unknown, path: Array<string | number>) => {
    if (typeof value === 'string') {
      if (isPublicTextPath(path)) {
        issues.push(
          ...findCreatorManualPublicTextIssues(value).map((issue) => ({
            ...issue,
            path,
          })),
        );
      }
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, [...path, index]));
      return;
    }

    if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        visit(child, [...path, key]);
      }
    }
  };

  visit(manifest, []);

  return issues;
};
