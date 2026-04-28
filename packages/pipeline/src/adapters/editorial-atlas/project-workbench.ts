import type {
  Artifact,
  Citation,
  GuidedPath,
  HubWorkbenchNative,
  SourceMoment,
  WorkbenchIntent,
} from './manifest-types';
import type { ProjectedPageWithInternal } from './project-pages';

const SOURCE_MOMENT_CAP = 12;
const PATH_PAGE_CAP = 4;

type PathBranch = 'start' | 'build' | 'copy';

function formatTimestampLabel(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = (safeSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remainder}`;
}

function rankPage(page: ProjectedPageWithInternal): number {
  const evidenceScore = page.evidenceQuality === 'strong' ? 30 : page.evidenceQuality === 'moderate' ? 15 : 5;
  const typeScore = page.type === 'playbook' ? 20 : page.type === 'framework' ? 14 : 8;
  return evidenceScore + typeScore + Math.min(page.citationCount, 20) - page.estimatedReadMinutes;
}

function compareRankedPages(a: ProjectedPageWithInternal, b: ProjectedPageWithInternal): number {
  return rankPage(b) - rankPage(a) || a.title.localeCompare(b.title);
}

function branchIntent(branch: PathBranch): WorkbenchIntent {
  if (branch === 'build') return 'build';
  if (branch === 'copy') return 'copy';
  return 'learn';
}

function pagesForBranch(
  pages: ProjectedPageWithInternal[],
  branch: PathBranch,
): ProjectedPageWithInternal[] {
  const intent = branchIntent(branch);
  const preferred = pages.filter((page) => page.readerJob === intent);
  const selected = preferred.length > 0 ? preferred : pages;
  return [...selected].sort(compareRankedPages).slice(0, PATH_PAGE_CAP);
}

function sourceMomentFromCitation(page: ProjectedPageWithInternal, citation: Citation): SourceMoment {
  return {
    id: `${page.id}_${citation.id}`,
    title: citation.videoTitle || `Source from ${page.title}`,
    sourceVideoId: citation.sourceVideoId,
    timestampStart: Math.max(0, Math.floor(citation.timestampStart)),
    timestampLabel: citation.timestampLabel || formatTimestampLabel(citation.timestampStart),
    excerpt: citation.excerpt,
    pageIds: [page.id],
  };
}

function artifactIdsForPages(pageIds: string[], artifacts: Artifact[]): string[] {
  const pageIdSet = new Set(pageIds);
  return artifacts
    .filter((artifact) => pageIdSet.has(artifact.pageId))
    .map((artifact) => artifact.id);
}

function sourceMomentIdsForPages(pageIds: string[], sourceMoments: SourceMoment[]): string[] {
  const pageIdSet = new Set(pageIds);
  return sourceMoments
    .filter((moment) => moment.pageIds.some((pageId) => pageIdSet.has(pageId)))
    .map((moment) => moment.id);
}

function guidedPath(
  branch: PathBranch,
  pages: ProjectedPageWithInternal[],
  artifacts: Artifact[],
  sourceMoments: SourceMoment[],
): GuidedPath {
  const selectedPages = pagesForBranch(pages, branch);
  const pageIds = selectedPages.map((page) => page.id);
  const pageCount = pageIds.length;
  const totalMinutes = selectedPages.reduce((sum, page) => sum + page.estimatedReadMinutes, 0);

  const copy = {
    start: {
      id: 'path_start',
      title: 'Start with the core ideas',
      body: 'Get the source-backed concepts before applying the system.',
      outcome: 'Start path',
    },
    build: {
      id: 'path_build',
      title: 'Build the working system',
      body: 'Follow implementation pages and reusable workflows.',
      outcome: 'Build now',
    },
    copy: {
      id: 'path_copy',
      title: 'Copy reusable assets',
      body: 'Jump to prompts, templates, schemas, and checklists.',
      outcome: 'Open templates',
    },
  } satisfies Record<PathBranch, Pick<GuidedPath, 'id' | 'title' | 'body' | 'outcome'>>;

  return {
    ...copy[branch],
    timeLabel: pageCount > 0 ? `${Math.max(1, totalMinutes)} min` : '0 min',
    pageIds,
    artifactIds: artifactIdsForPages(pageIds, artifacts),
    sourceMomentIds: sourceMomentIdsForPages(pageIds, sourceMoments),
  };
}

export function projectWorkbench({
  pages,
}: {
  pages: ProjectedPageWithInternal[];
}): HubWorkbenchNative {
  const publishedPages = pages.filter((page) => page.status === 'published');

  if (publishedPages.length === 0) {
    return {
      primaryAction: { label: 'Start exploring', href: '/' },
      guidedPaths: [],
      artifacts: [],
      sourceMoments: [],
    };
  }

  const artifacts = publishedPages.flatMap((page) => {
    const validCitationIds = new Set(page.citations.map((citation) => citation.id));
    return (page._internal.workbench?.artifacts ?? []).map((artifact) => ({
      id: artifact.id,
      type: artifact.type,
      title: artifact.title,
      body: artifact.body,
      pageId: page.id,
      citationIds: artifact.citationIds.filter((citationId) => validCitationIds.has(citationId)),
    }));
  });

  const sourceMoments = publishedPages
    .flatMap((page) => page.citations.slice(0, 2).map((citation) => sourceMomentFromCitation(page, citation)))
    .slice(0, SOURCE_MOMENT_CAP);

  const guidedPaths = (['start', 'build', 'copy'] as const).map((branch) =>
    guidedPath(branch, publishedPages, artifacts, sourceMoments),
  );

  return {
    primaryAction: { label: 'Start exploring', pageId: guidedPaths[0]?.pageIds[0] ?? publishedPages[0]!.id },
    guidedPaths,
    artifacts,
    sourceMoments,
  };
}
