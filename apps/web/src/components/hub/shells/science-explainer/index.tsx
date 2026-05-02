/**
 * Science-explainer shell — entry that selects the right page module given
 * a path within a hub.
 *
 * Routing convention (consumed by the hub route handlers in apps/web/src/app/h/):
 *   /                          -> HomePage
 *   /claim/[cardId]            -> ClaimPage
 *   /study/[studyCanonId]      -> StudyPage
 *   /debunking                 -> DebunkingPage (index)
 *   /debunking/[itemId]        -> DebunkingPage (detail)
 *   /glossary                  -> GlossaryPage (index)
 *   /glossary/[termId]         -> GlossaryPage (detail)
 *   /topic                     -> TopicPage (index)
 *   /topic/[topicSlug]         -> TopicPage (detail)
 *
 * Phase H scope: components only. Wiring into apps/web/src/app/h/[hubSlug]/
 * route segments is intentionally deferred — that file lives in territory
 * Codex may also touch (Phase G distribution work). The shell ships as a
 * self-contained library; the route segment that mounts it is a follow-up.
 */

export { adaptBundleForScienceExplainer } from './data-adapter';
export type {
  ClaimPageProps,
  DebunkingPageProps,
  GlossaryPageProps,
  HomePageProps,
  ScienceExplainerShellProps,
  StudyPageProps,
  TopicPageProps,
} from './data-adapter';

export { ClaimSearchBar } from './ClaimSearchBar';
export type { ClaimSearchBarProps } from './ClaimSearchBar';
export {
  cosineSimilarity,
  indexEvidenceCards,
  mockHashEmbedder,
  searchClaims,
} from './claim-search';
export type {
  Embedder,
  IndexedCard,
  SearchHit,
} from './claim-search';

export { HomePage } from './pages/HomePage';
export { ClaimPage } from './pages/ClaimPage';
export { StudyPage } from './pages/StudyPage';
export { DebunkingPage } from './pages/DebunkingPage';
export { GlossaryPage } from './pages/GlossaryPage';
export { TopicPage } from './pages/TopicPage';
