import type { Citation, EditorialAtlasManifest, Page, PageSection, SourceVideo } from './manifest/schema';
import { formatTimestampLabel, safeCitationHref, safeSourceTitle } from './manifest/empty-state';

export type WorkbenchIntent = 'learn' | 'build' | 'copy' | 'debug';

export type WorkbenchPageCard = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  type: Page['type'];
  intent: WorkbenchIntent;
  timeLabel: string;
  citationLabel: string;
};

export type WorkbenchPath = {
  id: string;
  title: string;
  body: string;
  actionLabel: string;
  pages: WorkbenchPageCard[];
};

export type WorkbenchArtifact = {
  id: string;
  pageSlug: string;
  pageTitle: string;
  title: string;
  typeLabel: 'Prompt' | 'Checklist' | 'Workflow' | 'Template' | 'Mistakes';
  body: string;
};

export type WorkbenchSourceMoment = {
  id: string;
  pageSlug: string;
  pageTitle: string;
  sourceTitle: string;
  timestampLabel: string;
  excerpt: string;
  href: string | null;
};

export type WorkbenchPageView = {
  intent: WorkbenchIntent;
  outcome: string;
  useWhen: string[];
  primaryArtifact: WorkbenchArtifact | null;
  nextPages: WorkbenchPageCard[];
};

export type HubWorkbench = {
  startPath: WorkbenchPath;
  buildPath: WorkbenchPath;
  copyPath: WorkbenchPath;
  quickWins: WorkbenchPageCard[];
  artifacts: WorkbenchArtifact[];
  sourceMoments: WorkbenchSourceMoment[];
};

function publishedPages(manifest: EditorialAtlasManifest): Page[] {
  return manifest.pages.filter((page) => page.status === 'published');
}

function pageText(page: Page): string {
  return `${page.title} ${page.summary} ${page.searchKeywords.join(' ')}`.toLowerCase();
}

function intentForPage(page: Page): WorkbenchIntent {
  const haystack = pageText(page);

  if (page.type === 'playbook' || /\b(build|workflow|generator|system|automation)\b|make\.com/.test(haystack)) {
    return 'build';
  }
  if (/\b(json|template|prompt|schema|copy|placeholder|format)\b/.test(haystack)) {
    return 'copy';
  }
  if (/\b(mistake|avoid|fix|wrong|failure)\b/.test(haystack)) {
    return 'debug';
  }

  return 'learn';
}

function rankPage(page: Page): number {
  const evidenceScore = page.evidenceQuality === 'strong' ? 30 : page.evidenceQuality === 'moderate' ? 15 : 5;
  const typeScore = page.type === 'playbook' ? 20 : page.type === 'framework' ? 14 : 8;

  return evidenceScore + typeScore + Math.min(page.citationCount, 20) - page.estimatedReadMinutes;
}

function compareRankedPages(a: Page, b: Page): number {
  return rankPage(b) - rankPage(a) || a.title.localeCompare(b.title);
}

function toCard(page: Page): WorkbenchPageCard {
  const citationNoun = page.citationCount === 1 ? 'citation' : 'citations';

  return {
    id: page.id,
    slug: page.slug,
    title: page.title,
    summary: page.summaryPlainText || page.summary,
    type: page.type,
    intent: intentForPage(page),
    timeLabel: `${page.estimatedReadMinutes} min`,
    citationLabel: `${page.citationCount} ${citationNoun}`,
  };
}

function topPages(pages: Page[], predicate: (page: Page) => boolean, count: number): WorkbenchPageCard[] {
  const selected = pages
    .filter(predicate)
    .sort(compareRankedPages)
    .slice(0, count);

  if (selected.length >= count) {
    return selected.map(toCard);
  }

  const fill = pages
    .filter((page) => !selected.some((selectedPage) => selectedPage.id === page.id))
    .sort(compareRankedPages)
    .slice(0, count - selected.length);

  return [...selected, ...fill].map(toCard);
}

function sectionText(section: PageSection): string {
  if (section.kind === 'steps') {
    return section.items.map((item) => `${item.title}: ${item.body}`).join('\n');
  }
  if (section.kind === 'roadmap') {
    return section.steps.map((step) => `${step.title}: ${step.body}`).join('\n');
  }
  if (section.kind === 'workflow') {
    return section.schedule.map((entry) => `${entry.day}: ${entry.items.join('; ')}`).join('\n');
  }
  if (section.kind === 'hypothetical_example') {
    return [section.setup, ...section.stepsTaken, section.outcome].join('\n');
  }
  if (section.kind === 'common_mistakes') {
    return section.items.map((item) => `${item.title}: ${item.body}`).join('\n');
  }
  if (section.kind === 'list') {
    return section.items.join('\n');
  }
  if ('body' in section && typeof section.body === 'string') {
    return section.body;
  }

  return '';
}

function pageMentionsCopyableFormat(page: Page): boolean {
  return /\b(json|template|prompt|schema|placeholder|copy)\b/i.test(`${page.title} ${page.summary}`);
}

function artifactFromSection(page: Page, section: PageSection, index: number): WorkbenchArtifact | null {
  const body = sectionText(section).trim();
  if (!body) return null;

  if (section.kind === 'roadmap') {
    return {
      id: `${page.id}-roadmap-${index}`,
      pageSlug: page.slug,
      pageTitle: page.title,
      title: section.title,
      typeLabel: 'Workflow',
      body,
    };
  }

  if (section.kind === 'workflow') {
    return {
      id: `${page.id}-workflow-${index}`,
      pageSlug: page.slug,
      pageTitle: page.title,
      title: `Workflow from ${page.title}`,
      typeLabel: 'Workflow',
      body,
    };
  }

  if (section.kind === 'steps') {
    return {
      id: `${page.id}-steps-${index}`,
      pageSlug: page.slug,
      pageTitle: page.title,
      title: section.title,
      typeLabel: 'Checklist',
      body,
    };
  }

  if (section.kind === 'hypothetical_example') {
    return {
      id: `${page.id}-example-${index}`,
      pageSlug: page.slug,
      pageTitle: page.title,
      title: `Example from ${page.title}`,
      typeLabel: 'Template',
      body,
    };
  }

  if (section.kind === 'common_mistakes') {
    return {
      id: `${page.id}-mistakes-${index}`,
      pageSlug: page.slug,
      pageTitle: page.title,
      title: 'Mistakes to avoid',
      typeLabel: 'Mistakes',
      body,
    };
  }

  if (section.kind === 'list' && pageMentionsCopyableFormat(page)) {
    return {
      id: `${page.id}-list-${index}`,
      pageSlug: page.slug,
      pageTitle: page.title,
      title: `Copy from ${page.title}`,
      typeLabel: 'Prompt',
      body,
    };
  }

  return null;
}

export function deriveWorkbenchArtifacts(page: Page): WorkbenchArtifact[] {
  return page.sections
    .map((section, index) => artifactFromSection(page, section, index))
    .filter((artifact): artifact is WorkbenchArtifact => artifact !== null)
    .slice(0, 4);
}

function sourceMomentFromCitation(
  page: Page,
  citation: Citation,
  source: SourceVideo | undefined,
  ordinal: number,
): WorkbenchSourceMoment {
  const safeSource = source ?? ({ youtubeId: null } satisfies Pick<SourceVideo, 'youtubeId'>);

  return {
    id: `${page.id}-${citation.id}`,
    pageSlug: page.slug,
    pageTitle: page.title,
    sourceTitle: safeSourceTitle(source?.title || citation.videoTitle, ordinal),
    timestampLabel: citation.timestampLabel || formatTimestampLabel(citation.timestampStart),
    excerpt: citation.excerpt,
    href: safeCitationHref(citation, safeSource),
  };
}

export function deriveHubWorkbench(manifest: EditorialAtlasManifest): HubWorkbench {
  const pages = publishedPages(manifest);
  const rankedPages = [...pages].sort(compareRankedPages);
  const sourcesById = new Map(manifest.sources.map((source) => [source.id, source]));
  let sourceMomentOrdinal = 0;

  const artifacts = rankedPages.flatMap(deriveWorkbenchArtifacts).slice(0, 8);
  const sourceMoments = rankedPages
    .flatMap((page) =>
      page.citations.slice(0, 2).map((citation) => {
        sourceMomentOrdinal += 1;
        return sourceMomentFromCitation(page, citation, sourcesById.get(citation.sourceVideoId), sourceMomentOrdinal);
      }),
    )
    .slice(0, 8);

  return {
    startPath: {
      id: 'start',
      title: 'Start the 20-minute path',
      body: 'Get the core ideas before diving into implementation.',
      actionLabel: 'Start path',
      pages: topPages(pages, (page) => intentForPage(page) === 'learn', 3),
    },
    buildPath: {
      id: 'build',
      title: 'Build the working system',
      body: 'Follow the pages that describe workflows, automations, and implementation steps.',
      actionLabel: 'Build now',
      pages: topPages(pages, (page) => intentForPage(page) === 'build', 3),
    },
    copyPath: {
      id: 'copy',
      title: 'Copy templates and prompts',
      body: 'Jump to reusable formats, prompts, schemas, and checklists.',
      actionLabel: 'Open templates',
      pages: topPages(pages, (page) => intentForPage(page) === 'copy', 3),
    },
    quickWins: topPages(pages, (page) => page.estimatedReadMinutes <= 5 || page.type !== 'lesson', 4),
    artifacts,
    sourceMoments,
  };
}

export function deriveWorkbenchPageView(manifest: EditorialAtlasManifest, page: Page): WorkbenchPageView {
  const pages = publishedPages(manifest);
  const relatedPages = pages
    .filter((candidate) => page.relatedPageIds.includes(candidate.id))
    .sort(compareRankedPages)
    .slice(0, 3);
  const fallbackPages = pages
    .filter((candidate) => candidate.id !== page.id)
    .sort(compareRankedPages)
    .slice(0, 3);
  const artifacts = deriveWorkbenchArtifacts(page);
  const intent = intentForPage(page);
  const verb = intent === 'build' ? 'build' : intent === 'copy' ? 'reuse' : intent === 'debug' ? 'fix' : 'understand';

  return {
    intent,
    outcome: `Use this page to ${verb} ${page.title.toLowerCase()} without losing the source-backed context.`,
    useWhen: [
      `You need a practical next step from ${manifest.creator.name}'s archive.`,
      'You want the shortest path from source evidence to an applied result.',
      'You want citations available, but not in the way while reading.',
    ],
    primaryArtifact: artifacts[0] ?? null,
    nextPages: (relatedPages.length > 0 ? relatedPages : fallbackPages).map(toCard),
  };
}
