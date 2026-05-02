import type {
  CreatorManualClaim,
  CreatorManualEvidenceRef,
  CreatorManualGlossaryEntry,
  CreatorManualManifest,
  CreatorManualNode,
  CreatorManualPillar,
  CreatorManualSearchDoc,
  CreatorManualSegment,
  CreatorManualSource,
  CreatorManualTheme,
  CreatorManualWorkshopStage,
} from './schema';

export type CreatorManualIndex = {
  manifest: CreatorManualManifest;
  nodesById: Map<string, CreatorManualNode>;
  nodesBySlug: Map<string, CreatorManualNode>;
  pillarsById: Map<string, CreatorManualPillar>;
  pillarsBySlug: Map<string, CreatorManualPillar>;
  sourcesById: Map<string, CreatorManualSource>;
  segmentsById: Map<string, CreatorManualSegment>;
  segmentsBySlug: Map<string, CreatorManualSegment>;
  claimsById: Map<string, CreatorManualClaim>;
  glossaryById: Map<string, CreatorManualGlossaryEntry>;
  glossaryBySlug: Map<string, CreatorManualGlossaryEntry>;
  themesById: Map<string, CreatorManualTheme>;
  themesBySlug: Map<string, CreatorManualTheme>;
  workshopById: Map<string, CreatorManualWorkshopStage>;
  workshopBySlug: Map<string, CreatorManualWorkshopStage>;
  searchDocsById: Map<string, CreatorManualSearchDoc>;
};

const mapBy = <T>(records: T[], getKey: (record: T) => string) =>
  new Map(records.map((record) => [getKey(record), record]));

export const buildCreatorManualIndex = (manifest: CreatorManualManifest): CreatorManualIndex => ({
  manifest,
  nodesById: mapBy(manifest.nodes, (node) => node.id),
  nodesBySlug: mapBy(manifest.nodes, (node) => node.slug),
  pillarsById: mapBy(manifest.pillars, (pillar) => pillar.id),
  pillarsBySlug: mapBy(manifest.pillars, (pillar) => pillar.slug),
  sourcesById: mapBy(manifest.sources, (source) => source.id),
  segmentsById: mapBy(manifest.segments, (segment) => segment.id),
  segmentsBySlug: mapBy(manifest.segments, (segment) => segment.slug),
  claimsById: mapBy(manifest.claims, (claim) => claim.id),
  glossaryById: mapBy(manifest.glossary, (entry) => entry.id),
  glossaryBySlug: mapBy(manifest.glossary, (entry) => entry.slug),
  themesById: mapBy(manifest.themes, (theme) => theme.id),
  themesBySlug: mapBy(manifest.themes, (theme) => theme.slug),
  workshopById: mapBy(manifest.workshop, (stage) => stage.id),
  workshopBySlug: mapBy(manifest.workshop, (stage) => stage.slug),
  searchDocsById: mapBy(manifest.search, (doc) => doc.id),
});

export const getPillarBySlug = (index: CreatorManualIndex, slug: string) =>
  index.pillarsBySlug.get(slug) ?? null;

export const getThemeBySlug = (index: CreatorManualIndex, slug: string) =>
  index.themesBySlug.get(slug) ?? null;

export const getSourceById = (index: CreatorManualIndex, id: string) =>
  index.sourcesById.get(id) ?? null;

export const getSegmentById = (index: CreatorManualIndex, id: string) =>
  index.segmentsById.get(id) ?? null;

export const getWorkshopStageBySlug = (index: CreatorManualIndex, slug: string) =>
  index.workshopBySlug.get(slug) ?? null;

export const getNodeById = (index: CreatorManualIndex, id: string) =>
  index.nodesById.get(id) ?? null;

export const getNodeBySlug = (index: CreatorManualIndex, slug: string) =>
  index.nodesBySlug.get(slug) ?? null;

export const getClaimById = (index: CreatorManualIndex, id: string) =>
  index.claimsById.get(id) ?? null;

export const getGlossaryEntryBySlug = (index: CreatorManualIndex, slug: string) =>
  index.glossaryBySlug.get(slug) ?? null;

export const getNodesByIds = (index: CreatorManualIndex, ids: string[]) =>
  ids.map((id) => index.nodesById.get(id)).filter((node): node is CreatorManualNode => Boolean(node));

export const getClaimsByIds = (index: CreatorManualIndex, ids: string[]) =>
  ids.map((id) => index.claimsById.get(id)).filter((claim): claim is CreatorManualClaim => Boolean(claim));

export const getPillarsByIds = (index: CreatorManualIndex, ids: string[]) =>
  ids.map((id) => index.pillarsById.get(id)).filter((pillar): pillar is CreatorManualPillar => Boolean(pillar));

export const getThemesByIds = (index: CreatorManualIndex, ids: string[]) =>
  ids.map((id) => index.themesById.get(id)).filter((theme): theme is CreatorManualTheme => Boolean(theme));

export const getSegmentsForSource = (index: CreatorManualIndex, sourceId: string) =>
  index.manifest.segments.filter((segment) => segment.sourceId === sourceId);

export const getSegmentsByEvidenceRefs = (index: CreatorManualIndex, refs: CreatorManualEvidenceRef[]) =>
  refs
    .map((ref) => (ref.segmentId ? index.segmentsById.get(ref.segmentId) : null))
    .filter((segment): segment is CreatorManualSegment => Boolean(segment));

export const getEvidenceRefsForRecord = (
  record:
    | CreatorManualNode
    | CreatorManualPillar
    | CreatorManualClaim
    | CreatorManualTheme
    | CreatorManualWorkshopStage,
) => record.evidence;
