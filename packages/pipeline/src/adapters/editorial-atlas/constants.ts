export const DEFAULT_TRUST_BLOCK = {
  methodologySummary:
    'Every page in this hub is built from real moments in the source archive. Pages are stitched together from cited segments, ranked for evidence strength, and reviewed before publication.',
  qualityPrinciples: [
    { title: 'Source-backed', body: 'Every claim is anchored to a transcript segment.' },
    { title: 'Continuously updated', body: 'When the archive grows, this hub re-generates.' },
    { title: 'Made for learners', body: 'Pages are organized by what you need to know, not by upload date.' },
    { title: 'Editor reviewed', body: 'A human edit pass refines wording and structure.' },
  ],
  creationProcess: [
    { stepNumber: 1, title: 'Index videos', body: 'Transcripts ingested and segmented for citation-grade lookup.' },
    { stepNumber: 2, title: 'Discover themes', body: 'A network of specialist agents reads across the archive to identify topics, frameworks, and lessons.' },
    { stepNumber: 3, title: 'Verify evidence', body: 'Every claim is graded against its cited segments.' },
    { stepNumber: 4, title: 'Compose pages', body: 'Findings are stitched into hub pages, with related quotes embedded inline.' },
    { stepNumber: 5, title: 'Publish', body: 'The release is pushed to R2 and served as a static manifest.' },
  ],
  faq: [
    { question: 'Where do these pages come from?', answer: "Each page is a synthesis of segments cited from the source archive. We don't paraphrase from training data." },
    { question: 'How do you decide what becomes a page?', answer: 'Themes that appear in multiple videos with strong supporting evidence become pages. One-off mentions become quotes or are filed under Highlights.' },
    { question: 'Can I trust the citations?', answer: "Every citation links to a real timestamp in the source video. If a finding can't be cited, it isn't published." },
    { question: 'How often is the hub updated?', answer: "When the creator's archive grows, a new generation run produces a new release." },
    { question: 'Is anything written by AI?', answer: 'Page summaries and prose are drafted by an editor (LLM) but every claim must trace back to a cited transcript segment.' },
  ],
};

export const NAVIGATION_PRIMARY = [
  { label: 'Start here', href: '/start',   iconKey: 'compass' },
  { label: 'Topics',     href: '/topics',  iconKey: 'grid'    },
  { label: 'Pages',      href: '/pages',   iconKey: 'pages'   },
  { label: 'Sources',    href: '/sources', iconKey: 'video'   },
];

export const NAVIGATION_SECONDARY = [
  { label: 'Methodology',  href: '/methodology', iconKey: 'shield'  },
  { label: 'Search',       href: '/search',      iconKey: 'search'  },
  { label: 'Ask this hub', href: '/ask',          iconKey: 'message' },
];

export const HIGHLIGHTS_NAV_ITEM = { label: 'Highlights', href: '/highlights', iconKey: 'sparkle' };
