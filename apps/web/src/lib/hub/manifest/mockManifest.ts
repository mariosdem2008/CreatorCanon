// apps/web/src/lib/hub/manifest/mockManifest.ts
//
// Deterministic mock for the Editorial Atlas template. The visual contract
// while the pipeline emits the older release_manifest_v0. Replace via
// adapter.ts once the pipeline integration project lands.

import type { EditorialAtlasManifest, Page, SourceVideo, Topic, Citation } from './schema';

const NOW = '2026-04-25T10:00:00Z';
const ONE_YEAR_AGO = '2025-04-25T10:00:00Z';

const topics: Topic[] = [
  { id: 'top_prod',  slug: 'productivity',     title: 'Productivity',     description: 'Systems, focus, planning, and methods for doing meaningful work well.',           iconKey: 'productivity',  accentColor: 'mint',   pageCount: 0 },
  { id: 'top_learn', slug: 'learning',         title: 'Learning',         description: 'How to learn faster, retain more, and build deep understanding.',                iconKey: 'learning',      accentColor: 'peach',  pageCount: 0 },
  { id: 'top_write', slug: 'writing',          title: 'Writing',          description: 'Clear thinking through writing, idea capture, and publishing.',                  iconKey: 'writing',       accentColor: 'lilac',  pageCount: 0 },
  { id: 'top_career',slug: 'career-business',  title: 'Career & Business',description: 'Building a career and a calm, sustainable creator business.',                    iconKey: 'career',        accentColor: 'rose',   pageCount: 0 },
  { id: 'top_sys',   slug: 'systems',          title: 'Systems',          description: 'Personal operating systems for sustainable, repeatable output.',                 iconKey: 'systems',       accentColor: 'blue',   pageCount: 0 },
  { id: 'top_mind',  slug: 'mindset',          title: 'Mindset',          description: 'Mental models, motivation, and the inner game of getting things done.',         iconKey: 'mindset',       accentColor: 'amber',  pageCount: 0 },
  { id: 'top_habit', slug: 'health-habits',    title: 'Health & Habits',  description: 'Foundations: sleep, movement, energy, focus, and habits that stick.',            iconKey: 'habits',        accentColor: 'sage',   pageCount: 0 },
  { id: 'top_growth',slug: 'creator-growth',   title: 'Creator Growth',   description: 'YouTube, audience, content strategy, and the craft of being seen.',             iconKey: 'growth',        accentColor: 'slate',  pageCount: 0 },
];

// 20 source videos — keep titles believable and key moments meaningful.
const sources: SourceVideo[] = Array.from({ length: 20 }, (_, i) => {
  const id = `vid_${String(i + 1).padStart(3, '0')}`;
  const youtubeId = `YT${String(1000 + i)}`;
  const titles = [
    'How I Plan My Week for Maximum Productivity',
    'My Simple Productivity System That Actually Works',
    'How I Take Smart Notes (Zettelkasten in plain English)',
    'The Feynman Technique Explained',
    'Deep Work: My Focus Routine',
    'How to Build a Second Brain',
    'My Energy Management System',
    'Time Blocking — How I Actually Do It',
    'Habit Stacking: The 1% Rule',
    'How I Read 100+ Books a Year',
    'Creator Burnout — What I Got Wrong',
    'The 3-Hour Writing Routine',
    'Frameworks vs. Routines — The Real Difference',
    'My YouTube Process from Idea to Upload',
    'Active Recall — The One Study Habit That Matters',
    'The Eisenhower Matrix in Practice',
    'Building a Personal Operating System',
    'Compound Hobbies — The Long Game',
    'How I Track Energy, Not Just Time',
    'Ship It — Why Done Beats Perfect',
  ];
  return {
    id,
    youtubeId,
    title: titles[i] ?? `Source video ${i + 1}`,
    channelName: 'Ali Abdaal',
    publishedAt: ONE_YEAR_AGO,
    durationSec: 600 + i * 30,
    thumbnailUrl: `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`,
    transcriptStatus: i % 7 === 6 ? 'partial' : 'available',
    topicSlugs: [topics[i % topics.length]!.slug],
    citedPageIds: [],
    keyMoments: [
      { timestampStart:  45, timestampEnd: 110, label: 'The core idea' },
      { timestampStart: 180, timestampEnd: 245, label: 'How it works in practice' },
      { timestampStart: 320, timestampEnd: 380, label: 'A common mistake' },
      { timestampStart: 460, timestampEnd: 540, label: 'Pulling it together' },
      { timestampStart: 600, timestampEnd: 660, label: 'Why this matters' },
    ],
    transcriptExcerpts: [
      { timestampStart:  60, body: 'Most people skip this step, and that is exactly why their system never sticks.' },
      { timestampStart: 200, body: 'The point isn\'t to be efficient. The point is to be effective.' },
      { timestampStart: 460, body: 'Once you do this once a week, the rest of the system runs itself.' },
    ],
  };
});

// Citation helper — pick a video and a key moment.
const cite = (vidIndex: number, momentIndex: number, citationId: string, excerpt: string): Citation => {
  const v = sources[vidIndex]!;
  const m = v.keyMoments[momentIndex]!;
  return {
    id: citationId,
    sourceVideoId: v.id,
    videoTitle: v.title,
    timestampStart: m.timestampStart,
    timestampEnd: m.timestampEnd,
    timestampLabel: `${Math.floor(m.timestampStart / 60)}:${String(m.timestampStart % 60).padStart(2, '0')}`,
    excerpt,
    url: `https://www.youtube.com/watch?v=${v.youtubeId}&t=${m.timestampStart}s`,
  };
};

// Build the 14 pages. Every section kind appears at least once across the set.
// (The test in mockManifest.test.ts enforces this.)
const pages: Page[] = [
  // ─── Lesson 1: Feynman Technique (overview, why_it_works, steps, common_mistakes, aha_moments, paragraph, quote) ───
  {
    id: 'pg_feynman', slug: 'feynman-technique', type: 'lesson', status: 'published',
    title: 'The Feynman Technique',
    summary: 'A powerful mental model for learning anything by teaching it in simple terms.',
    summaryPlainText: 'A powerful mental model for learning anything by teaching it in simple terms.',
    searchKeywords: ['feynman', 'learning', 'teach', 'simple'],
    topicSlugs: ['learning'],
    estimatedReadMinutes: 6,
    publishedAt: ONE_YEAR_AGO, updatedAt: NOW,
    citationCount: 4, sourceCoveragePercent: 0.85, evidenceQuality: 'strong',
    reviewedBy: 'Ali Abdaal', lastReviewedAt: NOW,
    hero: { illustrationKey: 'open-notebook' },
    sections: [
      { kind: 'overview',
        body: 'The Feynman Technique is a four-step method named after physicist Richard Feynman. The idea is simple: if you can explain something in plain words, you understand it; if you can\'t, you have found the gap.',
        citationIds: ['cit_fey_1'] },
      { kind: 'why_it_works',
        body: 'Teaching forces compression. Compression exposes the parts you don\'t actually understand.',
        points: ['It surfaces vague language.', 'It demands concrete examples.', 'It pushes you to find the right level of abstraction.'],
        citationIds: ['cit_fey_1', 'cit_fey_2'] },
      { kind: 'steps',
        title: 'The 4-step method',
        items: [
          { title: '1. Choose a concept',  body: 'Pick what you want to understand. Be specific. "Calculus" is too broad; "the chain rule" is workable.' },
          { title: '2. Teach it to a child', body: 'Write the explanation as if for a 12-year-old. No jargon, no shortcuts.' },
          { title: '3. Identify the gaps', body: 'Wherever you stalled or reached for big words — that is the gap. Go back to the source.' },
          { title: '4. Simplify and analogize', body: 'Rewrite the explanation. Use analogies. Iterate until it flows.' },
        ],
        citationIds: ['cit_fey_3'] },
      { kind: 'common_mistakes',
        items: [
          { title: 'Skipping step 3', body: 'It is tempting to feel done after the first explanation. The whole point is the audit.' },
          { title: 'Choosing too broad a concept', body: 'You will end up writing a textbook chapter, not finding the gap.' },
        ],
        citationIds: ['cit_fey_4'] },
      { kind: 'aha_moments',
        items: [
          { quote: 'If you can\'t explain it simply, you don\'t understand it well enough.', attribution: 'Richard Feynman (paraphrase)' },
        ] },
      { kind: 'paragraph',
        body: 'Most learners under-use this technique because writing things out feels like wasted effort. It isn\'t. The discomfort of writing is the learning.' },
      { kind: 'quote',
        body: 'Once you do this once a week, the rest of the system runs itself.',
        attribution: 'Ali, on building a learning routine',
        sourceVideoId: 'vid_004',
        timestampStart: 460,
        citationIds: ['cit_fey_2'] },
    ],
    citations: [
      cite(3, 0, 'cit_fey_1', 'The Feynman technique is the strongest learning method I have ever found.'),
      cite(3, 1, 'cit_fey_2', 'You write it down for a 12-year-old. That is the whole trick.'),
      cite(3, 2, 'cit_fey_3', 'Step three is the only step that actually matters.'),
      cite(2, 1, 'cit_fey_4', 'The most common mistake is picking a topic that is too big.'),
    ],
    relatedPageIds: ['pg_active_recall', 'pg_smart_notes'],
  },

  // ─── Lesson 2: Active Recall (overview, why_it_works, steps, list, paragraph) ───
  {
    id: 'pg_active_recall', slug: 'active-recall', type: 'lesson', status: 'published',
    title: 'Active recall',
    summary: 'The single most effective learning technique — and how to actually do it.',
    summaryPlainText: 'The single most effective learning technique — and how to actually do it.',
    searchKeywords: ['active recall', 'learning', 'study', 'retention'],
    topicSlugs: ['learning'],
    estimatedReadMinutes: 5,
    publishedAt: ONE_YEAR_AGO, updatedAt: NOW,
    citationCount: 3, sourceCoveragePercent: 0.7, evidenceQuality: 'strong',
    hero: { illustrationKey: 'books' },
    sections: [
      { kind: 'overview', body: 'Active recall is the practice of retrieving information from memory, rather than re-reading it. It is the strongest predictor of long-term retention we have.',
        citationIds: ['cit_ar_1'] },
      { kind: 'why_it_works', body: 'Re-reading creates a feeling of familiarity that is easily mistaken for understanding. Retrieval forces the brain to do the work that actually consolidates memory.',
        citationIds: ['cit_ar_2'] },
      { kind: 'steps', title: 'How to do it',
        items: [
          { title: '1. Read once',     body: 'Skim the material to map the territory. Don\'t take notes yet.' },
          { title: '2. Close the book', body: 'Write down everything you remember without looking.' },
          { title: '3. Compare',        body: 'Diff your recall against the source. The mistakes are the lesson.' },
        ],
        citationIds: ['cit_ar_3'] },
      { kind: 'list', ordered: false,
        items: [
          'Use blank-page recall before reaching for highlights.',
          'Quiz yourself with cue questions, not summaries.',
          'Space the recall sessions across days, not minutes.',
        ] },
      { kind: 'paragraph', body: 'Active recall feels harder than re-reading because it is harder. That is the point.' },
    ],
    citations: [
      cite(14, 0, 'cit_ar_1', 'Re-reading is the most popular study technique and one of the worst.'),
      cite(14, 1, 'cit_ar_2', 'Retrieval is the act of remembering. That is what locks the memory in.'),
      cite(14, 2, 'cit_ar_3', 'Blank page, no notes, write what you remember. Then check.'),
    ],
    relatedPageIds: ['pg_feynman', 'pg_smart_notes'],
  },

  // ─── Lesson 3: Time Blocking (overview, steps, callout, list) ───
  {
    id: 'pg_time_blocking', slug: 'time-blocking', type: 'lesson', status: 'published',
    title: 'Time blocking',
    summary: 'How to build a calendar that actually reflects what you intend to do.',
    summaryPlainText: 'How to build a calendar that actually reflects what you intend to do.',
    searchKeywords: ['time blocking', 'calendar', 'productivity', 'focus'],
    topicSlugs: ['productivity', 'systems'],
    estimatedReadMinutes: 4,
    publishedAt: ONE_YEAR_AGO, updatedAt: NOW,
    citationCount: 2, sourceCoveragePercent: 0.6, evidenceQuality: 'moderate',
    hero: { illustrationKey: 'desk' },
    sections: [
      { kind: 'overview', body: 'Time blocking is putting every intended task on the calendar — including admin, breaks, and deep work — instead of leaving them on a to-do list.',
        citationIds: ['cit_tb_1'] },
      { kind: 'steps', title: 'A simple version',
        items: [
          { title: '1. Pick the hard thing first', body: 'Block 90–120 minutes of deep work. This goes on the calendar before anything else.' },
          { title: '2. Cluster the small things',  body: 'Email, Slack, admin — one or two boxes a day. Outside those boxes, leave the inbox closed.' },
          { title: '3. Leave a buffer',            body: 'Block 25% of the day as buffer. The day will run over and that is fine.' },
        ],
        citationIds: ['cit_tb_2'] },
      { kind: 'callout', tone: 'note',
        body: 'Time blocking is a forecast, not a contract. If a block runs over, redraw the day — don\'t skip it.' },
      { kind: 'list', ordered: false,
        items: ['One calendar, not three.', 'Color by category, not priority.', 'Review tomorrow at the end of today.'] },
    ],
    citations: [
      cite(7, 0, 'cit_tb_1', 'If it is not on the calendar, it does not happen.'),
      cite(7, 1, 'cit_tb_2', 'I block the hard thing first. Everything else fits around it.'),
    ],
    relatedPageIds: ['pg_weekly_planning', 'pg_eisenhower'],
  },

  // ─── Lesson 4: Habit Stacking (overview, why_it_works, common_mistakes, paragraph) ───
  {
    id: 'pg_habit_stacking', slug: 'habit-stacking', type: 'lesson', status: 'published',
    title: 'Habit stacking',
    summary: 'How to attach new habits onto existing routines without willpower.',
    summaryPlainText: 'How to attach new habits onto existing routines without willpower.',
    searchKeywords: ['habit stacking', 'habits', 'routine'],
    topicSlugs: ['health-habits'],
    estimatedReadMinutes: 4,
    publishedAt: ONE_YEAR_AGO, updatedAt: NOW,
    citationCount: 2, sourceCoveragePercent: 0.65, evidenceQuality: 'moderate',
    hero: { illustrationKey: 'plant' },
    sections: [
      { kind: 'overview', body: 'A habit stack is "After [existing habit], I will [new habit]". You inherit the trigger from a routine that is already automatic.',
        citationIds: ['cit_hs_1'] },
      { kind: 'why_it_works', body: 'New habits fail because there is no cue. Existing habits already have one. Borrowing is cheaper than building.',
        citationIds: ['cit_hs_2'] },
      { kind: 'common_mistakes',
        items: [
          { title: 'Stacking onto a habit that isn\'t actually automatic', body: 'If you skip the anchor, you skip the stack. Test the anchor for a week before relying on it.' },
          { title: 'Stacking too many at once',                            body: 'Pick one new habit per anchor. Adding three is how stacks collapse.' },
        ] },
      { kind: 'paragraph', body: 'The art is choosing an anchor that is genuinely habitual — like brushing your teeth, not "checking email" (which mutates by mood).' },
    ],
    citations: [
      cite(8, 0, 'cit_hs_1', 'After I pour my coffee, I will write three sentences. That is the whole stack.'),
      cite(8, 2, 'cit_hs_2', 'You don\'t need a new trigger. You need to borrow one that already works.'),
    ],
    relatedPageIds: [],
  },

  // ─── Lesson 5: Deep Work (overview, principles section misuse — actually use principles for a framework. Use list+paragraph here) ───
  {
    id: 'pg_deep_work', slug: 'deep-work', type: 'lesson', status: 'published',
    title: 'Deep work',
    summary: 'What deep work actually is, and how to protect it on a normal week.',
    summaryPlainText: 'What deep work actually is, and how to protect it on a normal week.',
    searchKeywords: ['deep work', 'focus', 'attention'],
    topicSlugs: ['productivity', 'systems'],
    estimatedReadMinutes: 5,
    publishedAt: ONE_YEAR_AGO, updatedAt: NOW,
    citationCount: 2, sourceCoveragePercent: 0.55, evidenceQuality: 'moderate',
    hero: { illustrationKey: 'desk' },
    sections: [
      { kind: 'overview', body: 'Deep work is sustained focus on a cognitively demanding task with no context-switching. The output of two hours of deep work usually beats eight of shallow.',
        citationIds: ['cit_dw_1'] },
      { kind: 'list', ordered: true,
        items: [
          'Pick one deep block per day (90–120 min).',
          'Same time, same place — automate the start.',
          'No browser tabs, no notifications, no background music with lyrics.',
          'After the block, take a real break.',
        ] },
      { kind: 'paragraph', body: 'You do not need 4 hours of deep work a day. One reliable block is the difference between most weeks and your best ones.',
        citationIds: ['cit_dw_2'] },
    ],
    citations: [
      cite(4, 0, 'cit_dw_1', 'Deep work means doing the actual work. Not preparing to do it.'),
      cite(4, 3, 'cit_dw_2', 'One block a day, every day. That is enough.'),
    ],
    relatedPageIds: ['pg_time_blocking', 'pg_eisenhower'],
  },

  // ─── Lesson 6: Smart Notes (overview, paragraph, list) ───
  {
    id: 'pg_smart_notes', slug: 'smart-notes', type: 'lesson', status: 'published',
    title: 'Smart notes',
    summary: 'A note-taking method that compounds into a thinking system.',
    summaryPlainText: 'A note-taking method that compounds into a thinking system.',
    searchKeywords: ['smart notes', 'zettelkasten', 'note taking'],
    topicSlugs: ['learning', 'writing'],
    estimatedReadMinutes: 5,
    publishedAt: ONE_YEAR_AGO, updatedAt: NOW,
    citationCount: 2, sourceCoveragePercent: 0.7, evidenceQuality: 'moderate',
    hero: { illustrationKey: 'open-notebook' },
    sections: [
      { kind: 'overview', body: 'Smart notes (the Zettelkasten method) treat each note as a self-contained idea, written in your own words and linked to other notes.',
        citationIds: ['cit_sn_1'] },
      { kind: 'paragraph', body: 'The trick is the linking. A standalone note is a fact; a linked one is a thought.',
        citationIds: ['cit_sn_2'] },
      { kind: 'list', ordered: false,
        items: ['One idea per note.', 'Always in your own words.', 'Always link before saving.'] },
    ],
    citations: [
      cite(2, 0, 'cit_sn_1', 'Each note is one idea. That is the whole rule.'),
      cite(2, 1, 'cit_sn_2', 'Notes that don\'t link to anything die.'),
    ],
    relatedPageIds: ['pg_feynman', 'pg_active_recall'],
  },

  // ─── Framework 1: Eisenhower Matrix (overview, principles, common_mistakes, callout) ───
  {
    id: 'pg_eisenhower', slug: 'eisenhower-matrix', type: 'framework', status: 'published',
    title: 'The Eisenhower Matrix',
    summary: 'A 2×2 for sorting urgent from important.',
    summaryPlainText: 'A 2×2 for sorting urgent from important.',
    searchKeywords: ['eisenhower', 'priority', 'urgent', 'important'],
    topicSlugs: ['productivity'],
    estimatedReadMinutes: 4,
    publishedAt: ONE_YEAR_AGO, updatedAt: NOW,
    citationCount: 2, sourceCoveragePercent: 0.6, evidenceQuality: 'moderate',
    hero: { illustrationKey: 'desk' },
    sections: [
      { kind: 'overview', body: 'The matrix sorts work into four quadrants: urgent + important (do now), important not urgent (schedule), urgent not important (delegate), neither (delete).',
        citationIds: ['cit_em_1'] },
      { kind: 'principles',
        items: [
          { title: 'Important ≠ urgent', body: 'Most "urgent" tasks are someone else\'s priority arriving at the wrong moment.', iconKey: 'compass' },
          { title: 'Schedule beats remember', body: 'Important-not-urgent only happens if it goes on the calendar.', iconKey: 'calendar' },
          { title: 'Default to delete',  body: 'If a task fits neither axis cleanly, the right action is almost always to drop it.', iconKey: 'trash' },
        ],
        citationIds: ['cit_em_2'] },
      { kind: 'common_mistakes',
        items: [
          { title: 'Treating the matrix as a to-do list', body: 'It is a sorting tool. The output is a calendar, not a backlog.' },
          { title: 'Living in quadrant 1',                  body: 'If everything is urgent + important, you are reacting, not planning.' },
        ] },
      { kind: 'callout', tone: 'success',
        body: 'Run this once a week, not once a day. Sorting is cheap weekly; expensive daily.' },
    ],
    citations: [
      cite(15, 0, 'cit_em_1', 'The four quadrants don\'t change. What changes is how you spend the week.'),
      cite(15, 2, 'cit_em_2', 'Most "urgent" things are not actually important.'),
    ],
    relatedPageIds: ['pg_time_blocking'],
  },

  // ─── Framework 2: Compound Hobbies (overview, principles, paragraph) ───
  {
    id: 'pg_compound_hobbies', slug: 'compound-hobbies', type: 'framework', status: 'published',
    title: 'Compound hobbies',
    summary: 'Why some hobbies pay you back for life — and most don\'t.',
    summaryPlainText: 'Why some hobbies pay you back for life — and most don\'t.',
    searchKeywords: ['compound', 'hobbies', 'long term', 'leverage'],
    topicSlugs: ['career-business', 'mindset'],
    estimatedReadMinutes: 5,
    publishedAt: ONE_YEAR_AGO, updatedAt: NOW,
    citationCount: 2, sourceCoveragePercent: 0.55, evidenceQuality: 'moderate',
    hero: { illustrationKey: 'plant' },
    sections: [
      { kind: 'overview', body: 'A compound hobby is one whose value grows non-linearly with time spent — writing, programming, woodworking. The first year teaches you very little; the tenth pays for itself.',
        citationIds: ['cit_ch_1'] },
      { kind: 'principles',
        items: [
          { title: 'Pick one for life',  body: 'Compounding only works if you stay. Pick one slot, leave it open.', iconKey: 'tree' },
          { title: 'Optimize for years',  body: 'A compound hobby looks bad on a 30-day chart. That is the point.',  iconKey: 'chart' },
          { title: 'Document the path',   body: 'The unique value is the trail of artifacts you leave.',              iconKey: 'pen' },
        ],
        citationIds: ['cit_ch_2'] },
      { kind: 'paragraph', body: 'Most "productive" hobbies are consumption in a productivity costume. A compound hobby produces.' },
    ],
    citations: [
      cite(17, 0, 'cit_ch_1', 'A compound hobby is one you would still do at 60.'),
      cite(17, 2, 'cit_ch_2', 'The first year is bad. That is fine. Stay.'),
    ],
    relatedPageIds: [],
  },

  // ─── Framework 3: Energy Management (overview, principles, list, callout) ───
  {
    id: 'pg_energy_mgmt', slug: 'energy-management', type: 'framework', status: 'published',
    title: 'Energy management',
    summary: 'Schedule by energy, not just time.',
    summaryPlainText: 'Schedule by energy, not just time.',
    searchKeywords: ['energy', 'time management', 'schedule'],
    topicSlugs: ['productivity', 'health-habits'],
    estimatedReadMinutes: 4,
    publishedAt: ONE_YEAR_AGO, updatedAt: NOW,
    citationCount: 2, sourceCoveragePercent: 0.5, evidenceQuality: 'limited',
    hero: { illustrationKey: 'desk' },
    sections: [
      { kind: 'overview', body: 'You have 16 waking hours, but maybe 4 of them are high-energy. Treating all hours as equal is the most common scheduling mistake.',
        citationIds: ['cit_en_1'] },
      { kind: 'principles',
        items: [
          { title: 'Pair task to energy',   body: 'Hard cognitive work in your highest-energy block. Admin in the trough.', iconKey: 'sun' },
          { title: 'Track for two weeks',   body: 'You can\'t optimize what you haven\'t measured. Two weeks of energy logs reveal the pattern.', iconKey: 'clipboard' },
          { title: 'Protect peaks',          body: 'Meetings drift toward peaks. Defend them.', iconKey: 'shield' },
        ],
        citationIds: ['cit_en_2'] },
      { kind: 'list', ordered: false,
        items: ['Morning: deep work.', 'Mid-morning: writing or strategy.', 'Afternoon: meetings, admin.', 'Evening: reading, planning tomorrow.'] },
      { kind: 'callout', tone: 'warn',
        body: 'Your peak might not be the morning. Track first, schedule second.' },
    ],
    citations: [
      cite(18, 0, 'cit_en_1', 'You don\'t have 8 productive hours. You have maybe 4.'),
      cite(18, 2, 'cit_en_2', 'Track energy for two weeks before you redesign anything.'),
    ],
    relatedPageIds: ['pg_time_blocking', 'pg_deep_work'],
  },

  // ─── Framework 4: Frameworks vs Routines (overview, paragraph, quote, list) ───
  {
    id: 'pg_frameworks_vs_routines', slug: 'frameworks-vs-routines', type: 'framework', status: 'published',
    title: 'Frameworks vs. routines',
    summary: 'When to use a structure, and when to use a habit.',
    summaryPlainText: 'When to use a structure, and when to use a habit.',
    searchKeywords: ['frameworks', 'routines', 'systems'],
    topicSlugs: ['systems', 'mindset'],
    estimatedReadMinutes: 4,
    publishedAt: ONE_YEAR_AGO, updatedAt: NOW,
    citationCount: 1, sourceCoveragePercent: 0.45, evidenceQuality: 'limited',
    hero: { illustrationKey: 'open-notebook' },
    sections: [
      { kind: 'overview', body: 'A framework is a structure you apply when context changes. A routine is a behavior you repeat regardless. Confusing the two is why people abandon both.',
        citationIds: ['cit_fr_1'] },
      { kind: 'paragraph', body: 'Frameworks travel; routines protect. You do not need a routine for things that happen rarely. You do not need a framework for things you do every day.' },
      { kind: 'quote', body: 'Routines for the inevitable. Frameworks for the new.', attribution: 'Ali, summarizing the distinction',
        sourceVideoId: 'vid_013', timestampStart: 180 },
      { kind: 'list', ordered: false,
        items: ['Daily writing — routine.', 'Quarterly planning — framework.', 'Workout — routine.', 'Career decision — framework.'] },
    ],
    citations: [
      cite(12, 1, 'cit_fr_1', 'Routines are for the things that happen every day. Frameworks are for the rest.'),
    ],
    relatedPageIds: [],
  },

  // ─── Playbook 1: Productivity Operating System (overview, principles, scenes, workflow, failure_points) ───
  {
    id: 'pg_productivity_os', slug: 'productivity-operating-system', type: 'playbook', status: 'published',
    title: 'The Productivity Operating System',
    summary: 'A complete system for focus, energy, and weekly review.',
    summaryPlainText: 'A complete system for focus, energy, and weekly review.',
    searchKeywords: ['productivity os', 'system', 'weekly review'],
    topicSlugs: ['productivity', 'systems'],
    estimatedReadMinutes: 9,
    publishedAt: ONE_YEAR_AGO, updatedAt: NOW,
    citationCount: 4, sourceCoveragePercent: 0.85, evidenceQuality: 'strong',
    reviewedBy: 'Ali Abdaal', lastReviewedAt: NOW,
    hero: { illustrationKey: 'desk' },
    sections: [
      { kind: 'overview', body: 'A personal operating system has four layers: principles, scenes (recurring contexts), a weekly workflow, and a small set of failure points to watch.',
        citationIds: ['cit_pos_1'] },
      { kind: 'principles',
        items: [
          { title: 'Calm beats heroic',     body: 'A sustainable week is the win condition. Heroic weeks compound into burnout.',                                       iconKey: 'lighthouse' },
          { title: 'Plan once, ship daily', body: 'Plan on Sunday, then execute the plan. Replanning every day is the failure mode.',                                  iconKey: 'compass' },
          { title: 'One block, every day',  body: 'A reliable single deep block is more valuable than three theoretical ones.',                                          iconKey: 'anchor' },
          { title: 'Energy over time',       body: 'Schedule the hard thing where the energy is, not where the slot is.',                                                iconKey: 'sun' },
        ],
        citationIds: ['cit_pos_2'] },
      { kind: 'scenes',
        items: [
          { title: 'Sunday plan',         body: '90 minutes. Review last week, choose 3 outcomes, time-block the calendar.' },
          { title: 'Daily start',         body: '15 minutes. Top of day, top of mind: the one thing.' },
          { title: 'Daily wrap',          body: '10 minutes. What shipped, what didn\'t, what tomorrow needs.' },
          { title: 'Friday review',       body: '30 minutes. Was the week worth it? What next week needs.' },
        ],
        citationIds: ['cit_pos_3'] },
      { kind: 'workflow',
        schedule: [
          { day: 'Sunday',    items: ['Review last week.', 'Choose 3 outcomes.', 'Time-block the calendar.'] },
          { day: 'Monday',    items: ['Deep block 9–11.', 'Admin 14–15.', 'Daily wrap 17:00.'] },
          { day: 'Wednesday', items: ['Mid-week check.',   'Realign blocks.', 'Drop or defer extras.'] },
          { day: 'Friday',    items: ['30-minute review.', 'Carry forward.',   'Next-week first-block locked.'] },
        ] },
      { kind: 'failure_points',
        items: [
          { title: 'Skipping the Sunday plan', body: 'Without it, the week is reactive. The whole system depends on the plan being made.' },
          { title: 'Letting meetings creep into peaks', body: 'Calendar discipline is half the system. If meetings own the morning, deep work disappears.' },
          { title: 'Treating the wrap as optional',     body: 'The wrap is what stitches days together. Skipping it is what makes a week feel scattered.' },
        ],
        citationIds: ['cit_pos_4'] },
    ],
    citations: [
      cite(0, 0, 'cit_pos_1', 'A productivity OS is just a small set of routines you actually run.'),
      cite(0, 1, 'cit_pos_2', 'Calm and consistent beats heroic and brittle.'),
      cite(1, 0, 'cit_pos_3', 'Sunday plan, daily start, Friday review. That is the spine.'),
      cite(1, 3, 'cit_pos_4', 'The system fails the week you skip the plan.'),
    ],
    relatedPageIds: ['pg_time_blocking', 'pg_deep_work', 'pg_weekly_planning'],
  },

  // ─── Playbook 2: How I Plan My Week (overview, scenes, workflow, common_mistakes) ───
  {
    id: 'pg_weekly_planning', slug: 'how-i-plan-my-week', type: 'playbook', status: 'published',
    title: 'How I plan my week',
    summary: 'A weekly planning ritual built around outcomes, not tasks.',
    summaryPlainText: 'A weekly planning ritual built around outcomes, not tasks.',
    searchKeywords: ['weekly planning', 'plan', 'review'],
    topicSlugs: ['productivity', 'systems'],
    estimatedReadMinutes: 7,
    publishedAt: ONE_YEAR_AGO, updatedAt: NOW,
    citationCount: 3, sourceCoveragePercent: 0.75, evidenceQuality: 'strong',
    hero: { illustrationKey: 'open-notebook' },
    sections: [
      { kind: 'overview', body: 'The plan is not a task list. It is a small set of outcomes for the week, time-blocked into the days when they have the best chance.',
        citationIds: ['cit_wp_1'] },
      { kind: 'scenes',
        items: [
          { title: 'Pick the week\'s 3 outcomes', body: 'Three things, one sentence each. Outcome, not activity.' },
          { title: 'Block the deep work',         body: 'Each outcome gets at least one 90-minute block on the calendar.' },
          { title: 'Defend the buffer',           body: '25% of the week is unbooked. The plan will run over.' },
        ],
        citationIds: ['cit_wp_2'] },
      { kind: 'workflow',
        schedule: [
          { day: 'Sunday', items: ['90-minute plan.', 'Last week review.', 'Next week outcomes.', 'Calendar blocks.'] },
          { day: 'Wednesday', items: ['10-minute mid-week check.', 'Adjust blocks.', 'Note what is slipping.'] },
          { day: 'Friday', items: ['30-minute review.', 'Score outcomes.', 'Next-week first-block locked.'] },
        ] },
      { kind: 'common_mistakes',
        items: [
          { title: 'Planning tasks instead of outcomes', body: 'A task list is a backlog. Outcomes are decisions.' },
          { title: 'No buffer',                            body: 'The unplanned will happen. Leave room.' },
          { title: 'Skipping the Friday review',           body: 'Without the review, the next plan is built on hope.' },
        ],
        citationIds: ['cit_wp_3'] },
    ],
    citations: [
      cite(0, 1, 'cit_wp_1', 'Planning your week removes decision fatigue and helps you focus on what matters.'),
      cite(0, 0, 'cit_wp_2', 'Three outcomes. Three blocks. That is the spine of the week.'),
      cite(1, 2, 'cit_wp_3', 'The Friday review is the most important 30 minutes of the week.'),
    ],
    relatedPageIds: ['pg_productivity_os', 'pg_time_blocking'],
  },

  // ─── Playbook 3: Second Brain (overview, principles, scenes, failure_points) ───
  {
    id: 'pg_second_brain', slug: 'second-brain', type: 'playbook', status: 'published',
    title: 'Building a second brain',
    summary: 'A capture-organize-distill-express loop for ideas you actually reuse.',
    summaryPlainText: 'A capture-organize-distill-express loop for ideas you actually reuse.',
    searchKeywords: ['second brain', 'notes', 'capture', 'distill'],
    topicSlugs: ['learning', 'systems', 'writing'],
    estimatedReadMinutes: 8,
    publishedAt: ONE_YEAR_AGO, updatedAt: NOW,
    citationCount: 3, sourceCoveragePercent: 0.7, evidenceQuality: 'moderate',
    hero: { illustrationKey: 'books' },
    sections: [
      { kind: 'overview', body: 'A second brain is a personal knowledge system organized around the loop: Capture → Organize → Distill → Express. Most people stop at capture.',
        citationIds: ['cit_sb_1'] },
      { kind: 'principles',
        items: [
          { title: 'Capture is cheap',     body: 'Lower the friction of capture as much as possible. Sort later.', iconKey: 'inbox' },
          { title: 'Organize for action',  body: 'Files belong with the project that needs them, not with their topic.', iconKey: 'folder' },
          { title: 'Distill on demand',    body: 'Don\'t pre-summarize everything. Distill when you need it.',         iconKey: 'beaker' },
          { title: 'Express to lock it in', body: 'A note you never use is a note you never had.',                       iconKey: 'pen' },
        ],
        citationIds: ['cit_sb_2'] },
      { kind: 'scenes',
        items: [
          { title: 'Daily capture', body: 'Inbox stays open all day. Quick add, tag later.' },
          { title: 'Weekly sweep',  body: 'Empty inbox, file into projects. 30 min.' },
          { title: 'Monthly distill', body: 'Top 5 most-revisited notes get rewritten in your own words.' },
        ] },
      { kind: 'failure_points',
        items: [
          { title: 'Hoarding without distilling', body: 'A library of unread notes is not knowledge. It\'s decoration.' },
          { title: 'Over-organizing',              body: 'Three folders is enough. The taxonomy is the trap.' },
          { title: 'Tools as procrastination',     body: 'A new app is rarely the answer.' },
        ],
        citationIds: ['cit_sb_3'] },
    ],
    citations: [
      cite(5, 0, 'cit_sb_1', 'A second brain is not a list of files. It is a loop.'),
      cite(5, 1, 'cit_sb_2', 'Capture is cheap. Distillation is what compounds.'),
      cite(5, 2, 'cit_sb_3', 'Most second brains die from over-organization.'),
    ],
    relatedPageIds: ['pg_smart_notes', 'pg_active_recall'],
  },

  // ─── Playbook 4: YouTube Process (overview, scenes, workflow, failure_points, callout) ───
  {
    id: 'pg_youtube_process', slug: 'my-youtube-process', type: 'playbook', status: 'published',
    title: 'My YouTube process',
    summary: 'Idea to upload, end to end, on a sustainable cadence.',
    summaryPlainText: 'Idea to upload, end to end, on a sustainable cadence.',
    searchKeywords: ['youtube', 'creator', 'video', 'process'],
    topicSlugs: ['creator-growth', 'systems'],
    estimatedReadMinutes: 9,
    publishedAt: ONE_YEAR_AGO, updatedAt: NOW,
    citationCount: 3, sourceCoveragePercent: 0.8, evidenceQuality: 'strong',
    hero: { illustrationKey: 'desk' },
    sections: [
      { kind: 'overview', body: 'The process has four scenes: Idea, Script, Shoot, Edit & Ship. Each scene has a checklist; the calendar reflects them.',
        citationIds: ['cit_yt_1'] },
      { kind: 'scenes',
        items: [
          { title: 'Idea',         body: 'Start from a problem an audience already has, not a topic you find interesting.' },
          { title: 'Script',       body: 'Outline → first pass → tighten. Two days, not five.' },
          { title: 'Shoot',        body: 'Single setup, multiple cuts. Don\'t reset the room three times.' },
          { title: 'Edit & ship',  body: 'Cut for clarity, not pace. Ship before perfect.' },
        ],
        citationIds: ['cit_yt_2'] },
      { kind: 'workflow',
        schedule: [
          { day: 'Monday',  items: ['Idea + outline.'] },
          { day: 'Tuesday', items: ['Script first pass.'] },
          { day: 'Wednesday', items: ['Tighten + record.'] },
          { day: 'Thursday', items: ['Rough edit.'] },
          { day: 'Friday',  items: ['Polish + thumbnail + ship.'] },
        ] },
      { kind: 'failure_points',
        items: [
          { title: 'Scripting too long',          body: 'A 4-day script means a 5-day video. The cadence collapses.' },
          { title: 'Re-shooting for perfection',  body: 'Most reshoots improve nothing audiences notice.' },
          { title: 'Skipping the thumbnail',      body: 'Half the video is the thumbnail. Don\'t treat it as an afterthought.' },
        ],
        citationIds: ['cit_yt_3'] },
      { kind: 'callout', tone: 'success',
        body: 'A boring weekly video beats a heroic monthly one. Cadence compounds.' },
    ],
    citations: [
      cite(13, 0, 'cit_yt_1', 'Every video moves through the same four stages. The process is the leverage.'),
      cite(13, 1, 'cit_yt_2', 'Single setup, single batch. Resetting the room is a productivity tax.'),
      cite(13, 3, 'cit_yt_3', 'A boring weekly upload beats a heroic monthly one.'),
    ],
    relatedPageIds: ['pg_productivity_os'],
  },
];

// Backfill topic.pageCount and source.citedPageIds.
for (const t of topics) {
  t.pageCount = pages.filter((p) => p.topicSlugs.includes(t.slug)).length;
}
for (const v of sources) {
  v.citedPageIds = pages
    .filter((p) => p.citations.some((c) => c.sourceVideoId === v.id))
    .map((p) => p.id);
}

export const mockManifest: EditorialAtlasManifest = {
  schemaVersion: 'editorial_atlas_v1',
  hubId: 'hub_mock_ali_abdaal',
  releaseId: 'rel_mock_001',
  hubSlug: 'ali-abdaal',
  templateKey: 'editorial_atlas',
  visibility: 'public',
  publishedAt: ONE_YEAR_AGO,
  generatedAt: NOW,

  title: 'Editorial Atlas Hub',
  tagline:
    'A curated collection of lessons, frameworks, and systems from Ali\'s 400+ videos — to help you learn, build, and decide better.',

  creator: {
    name: 'Ali Abdaal',
    handle: '@aliabdaal',
    avatarUrl: 'https://yt3.ggpht.com/ytc/placeholder-avatar.jpg',
    bio: 'Doctor turned creator and entrepreneur. Writing about productivity, learning, and a calm, sustainable creator life.',
    youtubeChannelUrl: 'https://www.youtube.com/@aliabdaal',
  },

  stats: {
    videoCount: 412,
    sourceCount: sources.length,
    transcriptPercent: 0.87,
    archiveYears: 9.4,
    pageCount: pages.length,
  },

  topics,
  pages,
  sources,

  navigation: {
    primary: [
      { label: 'Home',        href: '/h/ali-abdaal',                 iconKey: 'home' },
      { label: 'Start here',  href: '/h/ali-abdaal/start',           iconKey: 'compass' },
      { label: 'Topics',      href: '/h/ali-abdaal/topics',          iconKey: 'tags' },
      { label: 'All pages',   href: '/h/ali-abdaal/pages',           iconKey: 'pages' },
      { label: 'Frameworks',  href: '/h/ali-abdaal/topics/systems',  iconKey: 'grid' },
      { label: 'Playbooks',   href: '/h/ali-abdaal/topics/productivity', iconKey: 'book' },
      { label: 'Sources',     href: '/h/ali-abdaal/sources',         iconKey: 'video' },
      { label: 'Methodology', href: '/h/ali-abdaal/methodology',     iconKey: 'shield' },
      { label: 'Ask this hub',href: '/h/ali-abdaal/ask',             iconKey: 'sparkles' },
    ],
    secondary: [
      { label: 'Videos',      href: '/h/ali-abdaal/sources',         iconKey: 'play' },
      { label: 'Newsletter',  href: 'https://aliabdaal.com',         iconKey: 'mail' },
      { label: 'Recommended', href: '/h/ali-abdaal/methodology',     iconKey: 'star' },
    ],
  },

  trust: {
    methodologySummary:
      'CreatorCanon structures Ali\'s entire video archive into a source-backed knowledge hub. Every page is built from transcripts, grounded in citations, and reviewed for clarity and accuracy.',
    qualityPrinciples: [
      { title: 'Source-backed',         body: 'Every substantive claim links to a video and timestamp.' },
      { title: 'Continuously updated',  body: 'New videos are processed within days; pages are republished, not duplicated.' },
      { title: 'Made for learners',     body: 'Pages are designed for re-reading, not algorithmic consumption.' },
      { title: 'Editor reviewed',       body: 'Pages move through draft → reviewed → published before they go live.' },
    ],
    creationProcess: [
      { stepNumber: 1, title: 'Index videos',     body: 'We import the channel, fetch transcripts, and structure source moments.' },
      { stepNumber: 2, title: 'Cluster ideas',    body: 'Recurring themes become topics; recurring concepts become candidate pages.' },
      { stepNumber: 3, title: 'Draft pages',      body: 'Each page is drafted from the transcript with grounded citations on every claim.' },
      { stepNumber: 4, title: 'Editor review',    body: 'A human editor reviews drafts for clarity and accuracy.' },
      { stepNumber: 5, title: 'Publish + revise', body: 'Published pages are revised — not replaced — as new videos add evidence.' },
    ],
    faq: [
      { question: 'Are the pages written by Ali?',                answer: 'Ali\'s words and ideas come from his videos. The page structure and prose are written and edited by CreatorCanon based on those sources, with citations on every substantive claim.' },
      { question: 'Why not just watch the videos?',                answer: 'Pages are designed for re-reading, search, and linking. They\'re a complement to videos, not a replacement.' },
      { question: 'How do you decide what is a Lesson vs Playbook?', answer: 'Lessons explain a single idea. Frameworks describe a structure. Playbooks describe an end-to-end practice you run.' },
      { question: 'How are citations chosen?',                      answer: 'Each citation links to the specific timestamp in the source video where the idea is best expressed.' },
      { question: 'What does "Limited evidence" mean?',             answer: 'Some pages cover topics where the archive has fewer references. We surface that explicitly so you know how strongly the page is supported.' },
    ],
  },
};
