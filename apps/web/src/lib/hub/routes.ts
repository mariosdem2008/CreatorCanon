//
// Centralised hub URL builders. Components MUST NOT inline /h/${...} strings.

export const getHubRoute         = (hubSlug: string)                              => `/h/${hubSlug}`;
export const getStartRoute       = (hubSlug: string)                              => `/h/${hubSlug}/start`;
export const getTopicsRoute      = (hubSlug: string)                              => `/h/${hubSlug}/topics`;
export const getTopicRoute       = (hubSlug: string, topicSlug: string)           => `/h/${hubSlug}/topics/${topicSlug}`;
export const getPagesRoute       = (hubSlug: string)                              => `/h/${hubSlug}/pages`;
export const getPageRoute        = (hubSlug: string, pageSlug: string)            => `/h/${hubSlug}/pages/${pageSlug}`;
export const getSourcesRoute     = (hubSlug: string)                              => `/h/${hubSlug}/sources`;
export const getSourceRoute      = (hubSlug: string, videoId: string)             => `/h/${hubSlug}/sources/${videoId}`;
export const getMethodologyRoute = (hubSlug: string)                              => `/h/${hubSlug}/methodology`;
export const getSearchRoute      = (hubSlug: string, query?: string)              =>
  query ? `/h/${hubSlug}/search?q=${encodeURIComponent(query)}` : `/h/${hubSlug}/search`;
export const getAskRoute         = (hubSlug: string)                              => `/h/${hubSlug}/ask`;
export const getAskApiRoute      = (hubSlug: string)                              => `/h/${hubSlug}/ask/api`;
export const getHighlightsRoute  = (hubSlug: string)                              => `/h/${hubSlug}/highlights`;
