const ACRONYMS = new Set(['ai', 'api', 'crm', 'cms', 'cli', 'cdn', 'kpi', 'roi', 'ui', 'ux', 'sql', 'json', 'pdf', 'csv', 'http', 'https', 'url']);
const LOWERCASE_WORDS = new Set(['a', 'an', 'and', 'the', 'of', 'in', 'on', 'at', 'to', 'for', 'as', 'by', 'or']);

export function titleCase(input: string): string {
  if (!input) return '';
  const parts = input.split(/(\s+|-)/);
  return parts
    .map((part, i) => {
      if (/^\s+$/.test(part) || part === '-') return part;
      const lower = part.toLowerCase();
      if (ACRONYMS.has(lower)) return lower.toUpperCase();
      if (i > 0 && LOWERCASE_WORDS.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join('');
}
