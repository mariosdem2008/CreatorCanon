// apps/web/src/lib/hub/manifest/pageFilters.ts
import type { Page } from './schema';

export type PageFilters = {
  query: string;
  types: ('lesson' | 'framework' | 'playbook')[];
  topicSlugs: string[];
};

export type PageSort = 'newest' | 'most-cited' | 'title';

export function filterPages(pages: Page[], f: PageFilters): Page[] {
  const q = f.query.trim().toLowerCase();
  return pages.filter((p) => {
    if (p.status !== 'published') return false;
    if (f.types.length > 0 && !f.types.includes(p.type)) return false;
    if (f.topicSlugs.length > 0 && !f.topicSlugs.some((s) => p.topicSlugs.includes(s))) return false;
    if (q.length > 0) {
      const hay = `${p.title} ${p.summaryPlainText} ${p.searchKeywords.join(' ')}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function sortPages(pages: Page[], sort: PageSort): Page[] {
  const copy = [...pages];
  switch (sort) {
    case 'newest':
      return copy.sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt));
    case 'most-cited':
      return copy.sort((a, b) => b.citationCount - a.citationCount);
    case 'title':
      return copy.sort((a, b) => a.title.localeCompare(b.title));
  }
}
