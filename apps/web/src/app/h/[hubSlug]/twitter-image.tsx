// Twitter uses the same 1200×630 card format as OpenGraph.
// Re-export everything from opengraph-image so Next.js serves both
// twitter:image and og:image from the same rendered card.
export { default, alt, size, contentType } from './opengraph-image';

export const runtime = 'nodejs';
