import type { CreatorManualSearchDoc, CreatorManualSearchDocType } from './schema';

export const getCreatorManualHomeRoute = (hubSlug: string) => `/h/${hubSlug}`;
export const getCreatorManualLibraryRoute = (hubSlug: string) => `/h/${hubSlug}/library`;
export const getCreatorManualPillarsRoute = (hubSlug: string) => `/h/${hubSlug}/pillars`;
export const getCreatorManualPillarRoute = (hubSlug: string, pillarSlug: string) => `/h/${hubSlug}/pillars/${pillarSlug}`;
export const getCreatorManualSourcesRoute = (hubSlug: string) => `/h/${hubSlug}/sources`;
export const getCreatorManualSourceRoute = (hubSlug: string, sourceId: string) => `/h/${hubSlug}/sources/${sourceId}`;
export const getCreatorManualSegmentsRoute = (hubSlug: string) => `/h/${hubSlug}/segments`;
export const getCreatorManualSegmentRoute = (hubSlug: string, segmentId: string) => `/h/${hubSlug}/segments/${segmentId}`;
export const getCreatorManualClaimsRoute = (hubSlug: string) => `/h/${hubSlug}/claims`;
export const getCreatorManualClaimRoute = (hubSlug: string, claimId: string) => `${getCreatorManualClaimsRoute(hubSlug)}#${encodeURIComponent(claimId)}`;
export const getCreatorManualGlossaryRoute = (hubSlug: string) => `/h/${hubSlug}/glossary`;
export const getCreatorManualGlossaryEntryRoute = (hubSlug: string, entrySlug: string) => `${getCreatorManualGlossaryRoute(hubSlug)}#${encodeURIComponent(entrySlug)}`;
export const getCreatorManualThemesRoute = (hubSlug: string) => `/h/${hubSlug}/themes`;
export const getCreatorManualThemeRoute = (hubSlug: string, themeSlug: string) => `/h/${hubSlug}/themes/${themeSlug}`;
export const getCreatorManualWorkshopRoute = (hubSlug: string) => `/h/${hubSlug}/workshop`;
export const getCreatorManualWorkshopStageRoute = (hubSlug: string, stageSlug: string) => `/h/${hubSlug}/workshop/${stageSlug}`;
export const getCreatorManualSearchRoute = (hubSlug: string, query?: string) =>
  query ? `/h/${hubSlug}/search?q=${encodeURIComponent(query)}` : `/h/${hubSlug}/search`;

export const getCreatorManualRouteForType = (
  hubSlug: string,
  type: CreatorManualSearchDocType,
  recordId: string,
  slug?: string,
) => {
  switch (type) {
    case 'node':
      return slug ? `${getCreatorManualLibraryRoute(hubSlug)}#${encodeURIComponent(slug)}` : getCreatorManualLibraryRoute(hubSlug);
    case 'pillar':
      return slug ? getCreatorManualPillarRoute(hubSlug, slug) : getCreatorManualPillarsRoute(hubSlug);
    case 'source':
      return getCreatorManualSourceRoute(hubSlug, recordId);
    case 'segment':
      return getCreatorManualSegmentRoute(hubSlug, recordId);
    case 'claim':
      return getCreatorManualClaimRoute(hubSlug, recordId);
    case 'glossary':
      return slug ? getCreatorManualGlossaryEntryRoute(hubSlug, slug) : getCreatorManualGlossaryRoute(hubSlug);
    case 'theme':
      return slug ? getCreatorManualThemeRoute(hubSlug, slug) : getCreatorManualThemesRoute(hubSlug);
    case 'workshop':
      return slug ? getCreatorManualWorkshopStageRoute(hubSlug, slug) : getCreatorManualWorkshopRoute(hubSlug);
  }
};

export const getCreatorManualRouteForSearchDoc = (hubSlug: string, doc: CreatorManualSearchDoc) =>
  getCreatorManualRouteForType(hubSlug, doc.type, doc.recordId, doc.slug);
