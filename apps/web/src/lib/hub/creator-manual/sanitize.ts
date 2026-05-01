export type CreatorManualSanitizerIssue = {
  kind: 'uuid' | 'internal_language';
  match: string;
  index: number;
};

const uuidLikePattern = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
const internalLanguagePattern = /\b(?:internal review|manual review|manual-review|tagger|review queue|needs review|audit note|unpublished draft)\b/gi;

const collectMatches = (text: string, pattern: RegExp, kind: CreatorManualSanitizerIssue['kind']) => {
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

export const isCreatorManualPublicTextSafe = (text: string) =>
  findCreatorManualPublicTextIssues(text).length === 0;
