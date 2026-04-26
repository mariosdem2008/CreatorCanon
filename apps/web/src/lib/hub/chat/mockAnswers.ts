// apps/web/src/lib/hub/chat/mockAnswers.ts
//
// Deterministic dictionary of mock answers for the grounded chat UI. Real
// retrieval lives in a separate project — see RAG-NOTES.md.

import type { AskResponse } from './schema';

// The 5 questions surfaced as `SuggestedQuestions` on /ask. Every one of these
// must return a successful answer; anything else returns the unsupported shape.
export const MOCK_ANSWER_QUESTIONS = [
  'How does Ali plan his week?',
  'What does Ali say about deep work?',
  'How should I start learning faster?',
  'What are the core ideas behind the Productivity Operating System?',
  'Which videos explain note-taking best?',
] as const;

const ANSWERS: Record<string, AskResponse> = {
  'how does ali plan his week?': {
    answer: {
      summary:
        'Ali recommends a weekly planning ritual built around outcomes rather than tasks: review last week, choose 1–3 outcomes for the next week, time-block deep work first, and leave a buffer for the unexpected.',
      bullets: [
        { text: 'Review what happened last week before planning the next.',     citationIds: ['cit_pos_4', 'cit_wp_3'] },
        { text: 'Choose 1–3 meaningful outcomes for the week — not a task list.', citationIds: ['cit_wp_2'] },
        { text: 'Time-block deep work first, then admin around it.',             citationIds: ['cit_tb_2'] },
        { text: 'Leave roughly 25% of the week as buffer.',                       citationIds: ['cit_tb_1'] },
        { text: 'Run a short Friday review to score the week.',                  citationIds: ['cit_wp_3'] },
      ],
      confidence: 'strong', evidenceQuality: 'strong', limitations: null,
    },
    citations: [
      { id: 'cit_pos_4', sourceVideoId: 'vid_002', videoTitle: 'My Simple Productivity System That Actually Works',
        timestampStart: 540, timestampEnd: 600, timestampLabel: '9:00',
        url: 'https://www.youtube.com/watch?v=YT1001&t=540s',
        excerpt: 'The system fails the week you skip the plan.' },
      { id: 'cit_wp_3', sourceVideoId: 'vid_002', videoTitle: 'My Simple Productivity System That Actually Works',
        timestampStart: 320, timestampEnd: 380, timestampLabel: '5:20',
        url: 'https://www.youtube.com/watch?v=YT1001&t=320s',
        excerpt: 'The Friday review is the most important 30 minutes of the week.' },
      { id: 'cit_wp_2', sourceVideoId: 'vid_001', videoTitle: 'How I Plan My Week for Maximum Productivity',
        timestampStart: 45,  timestampEnd: 110, timestampLabel: '0:45',
        url: 'https://www.youtube.com/watch?v=YT1000&t=45s',
        excerpt: 'Three outcomes. Three blocks. That is the spine of the week.' },
      { id: 'cit_tb_2', sourceVideoId: 'vid_008', videoTitle: 'Time Blocking — How I Actually Do It',
        timestampStart: 180, timestampEnd: 245, timestampLabel: '3:00',
        url: 'https://www.youtube.com/watch?v=YT1007&t=180s',
        excerpt: 'I block the hard thing first. Everything else fits around it.' },
      { id: 'cit_tb_1', sourceVideoId: 'vid_008', videoTitle: 'Time Blocking — How I Actually Do It',
        timestampStart: 45,  timestampEnd: 110, timestampLabel: '0:45',
        url: 'https://www.youtube.com/watch?v=YT1007&t=45s',
        excerpt: 'If it is not on the calendar, it does not happen.' },
    ],
    relatedPages: [
      { id: 'pg_weekly_planning',  title: 'How I plan my week',                  type: 'playbook',  slug: 'how-i-plan-my-week' },
      { id: 'pg_productivity_os',  title: 'The Productivity Operating System',  type: 'playbook',  slug: 'productivity-operating-system' },
      { id: 'pg_time_blocking',    title: 'Time blocking',                       type: 'lesson',    slug: 'time-blocking' },
    ],
    suggestedFollowups: [
      'What is the weekly planning checklist?',
      'What does Ali say about time blocking?',
      'Which videos explain weekly review best?',
    ],
  },

  'what does ali say about deep work?': {
    answer: {
      summary:
        'Deep work is sustained focus on a cognitively demanding task with no context-switching. Ali argues that one reliable daily block of 90–120 minutes outperforms multiple scattered ones.',
      bullets: [
        { text: 'Pick one deep block per day — same time, same place.',          citationIds: ['cit_dw_1'] },
        { text: 'No notifications, no browser tabs, no lyric music.',            citationIds: ['cit_dw_1'] },
        { text: 'After the block, take a real break — not a phone scroll.',     citationIds: ['cit_dw_2'] },
        { text: 'Two hours of real deep work beats eight of shallow.',          citationIds: ['cit_dw_2'] },
      ],
      confidence: 'strong', evidenceQuality: 'strong', limitations: null,
    },
    citations: [
      { id: 'cit_dw_1', sourceVideoId: 'vid_005', videoTitle: 'Deep Work: My Focus Routine',
        timestampStart: 45,  timestampEnd: 110, timestampLabel: '0:45',
        url: 'https://www.youtube.com/watch?v=YT1004&t=45s',
        excerpt: 'Deep work means doing the actual work. Not preparing to do it.' },
      { id: 'cit_dw_2', sourceVideoId: 'vid_005', videoTitle: 'Deep Work: My Focus Routine',
        timestampStart: 460, timestampEnd: 540, timestampLabel: '7:40',
        url: 'https://www.youtube.com/watch?v=YT1004&t=460s',
        excerpt: 'One block a day, every day. That is enough.' },
    ],
    relatedPages: [
      { id: 'pg_deep_work',     title: 'Deep work',     type: 'lesson', slug: 'deep-work' },
      { id: 'pg_time_blocking', title: 'Time blocking', type: 'lesson', slug: 'time-blocking' },
    ],
    suggestedFollowups: [
      'What is a good deep-work schedule?',
      'How long should a deep block be?',
      'Which videos explain focus routines?',
    ],
  },

  'how should i start learning faster?': {
    answer: {
      summary:
        'Two techniques drive most of the gain: active recall (testing yourself instead of re-reading) and the Feynman technique (writing the explanation as if for a child). Both are uncomfortable; that\'s the point.',
      bullets: [
        { text: 'Use blank-page recall before reaching for highlights.',   citationIds: ['cit_ar_1', 'cit_ar_3'] },
        { text: 'Run the Feynman technique every time you finish a chapter.', citationIds: ['cit_fey_1'] },
        { text: 'Compare your recall to the source — the gaps are the lesson.', citationIds: ['cit_ar_2'] },
        { text: 'Space the recall across days, not minutes.',               citationIds: ['cit_ar_3'] },
      ],
      confidence: 'strong', evidenceQuality: 'strong', limitations: null,
    },
    citations: [
      { id: 'cit_ar_1',  sourceVideoId: 'vid_015', videoTitle: 'Active Recall — The One Study Habit That Matters',
        timestampStart: 45,  timestampEnd: 110, timestampLabel: '0:45',
        url: 'https://www.youtube.com/watch?v=YT1014&t=45s',
        excerpt: 'Re-reading is the most popular study technique and one of the worst.' },
      { id: 'cit_ar_2',  sourceVideoId: 'vid_015', videoTitle: 'Active Recall — The One Study Habit That Matters',
        timestampStart: 180, timestampEnd: 245, timestampLabel: '3:00',
        url: 'https://www.youtube.com/watch?v=YT1014&t=180s',
        excerpt: 'Retrieval is the act of remembering. That is what locks the memory in.' },
      { id: 'cit_ar_3',  sourceVideoId: 'vid_015', videoTitle: 'Active Recall — The One Study Habit That Matters',
        timestampStart: 320, timestampEnd: 380, timestampLabel: '5:20',
        url: 'https://www.youtube.com/watch?v=YT1014&t=320s',
        excerpt: 'Blank page, no notes, write what you remember. Then check.' },
      { id: 'cit_fey_1', sourceVideoId: 'vid_004', videoTitle: 'The Feynman Technique Explained',
        timestampStart: 45,  timestampEnd: 110, timestampLabel: '0:45',
        url: 'https://www.youtube.com/watch?v=YT1003&t=45s',
        excerpt: 'The Feynman technique is the strongest learning method I have ever found.' },
    ],
    relatedPages: [
      { id: 'pg_active_recall', title: 'Active recall',          type: 'lesson', slug: 'active-recall' },
      { id: 'pg_feynman',       title: 'The Feynman Technique',  type: 'lesson', slug: 'feynman-technique' },
      { id: 'pg_smart_notes',   title: 'Smart notes',             type: 'lesson', slug: 'smart-notes' },
    ],
    suggestedFollowups: [
      'How do I use the Feynman technique on a math topic?',
      'What is spaced repetition?',
      'Which videos explain note-taking best?',
    ],
  },

  'what are the core ideas behind the productivity operating system?': {
    answer: {
      summary:
        'The Productivity OS has four layers: a small set of principles, a few recurring scenes (Sunday plan, daily wrap, Friday review), a weekly workflow that ties them together, and a watchlist of failure points where most systems collapse.',
      bullets: [
        { text: 'Principles, scenes, workflow, failure points — that is the spine.', citationIds: ['cit_pos_1'] },
        { text: 'Calm and consistent beats heroic and brittle.',                       citationIds: ['cit_pos_2'] },
        { text: 'Sunday plan, daily start, Friday review — the rhythm of the week.', citationIds: ['cit_pos_3'] },
        { text: 'The system fails the week you skip the plan.',                       citationIds: ['cit_pos_4'] },
      ],
      confidence: 'strong', evidenceQuality: 'strong', limitations: null,
    },
    citations: [
      { id: 'cit_pos_1', sourceVideoId: 'vid_001', videoTitle: 'How I Plan My Week for Maximum Productivity',
        timestampStart: 45,  timestampEnd: 110, timestampLabel: '0:45',
        url: 'https://www.youtube.com/watch?v=YT1000&t=45s',
        excerpt: 'A productivity OS is just a small set of routines you actually run.' },
      { id: 'cit_pos_2', sourceVideoId: 'vid_001', videoTitle: 'How I Plan My Week for Maximum Productivity',
        timestampStart: 180, timestampEnd: 245, timestampLabel: '3:00',
        url: 'https://www.youtube.com/watch?v=YT1000&t=180s',
        excerpt: 'Calm and consistent beats heroic and brittle.' },
      { id: 'cit_pos_3', sourceVideoId: 'vid_002', videoTitle: 'My Simple Productivity System That Actually Works',
        timestampStart: 45,  timestampEnd: 110, timestampLabel: '0:45',
        url: 'https://www.youtube.com/watch?v=YT1001&t=45s',
        excerpt: 'Sunday plan, daily start, Friday review. That is the spine.' },
      { id: 'cit_pos_4', sourceVideoId: 'vid_002', videoTitle: 'My Simple Productivity System That Actually Works',
        timestampStart: 540, timestampEnd: 600, timestampLabel: '9:00',
        url: 'https://www.youtube.com/watch?v=YT1001&t=540s',
        excerpt: 'The system fails the week you skip the plan.' },
    ],
    relatedPages: [
      { id: 'pg_productivity_os', title: 'The Productivity Operating System', type: 'playbook', slug: 'productivity-operating-system' },
      { id: 'pg_weekly_planning', title: 'How I plan my week',                 type: 'playbook', slug: 'how-i-plan-my-week' },
      { id: 'pg_time_blocking',   title: 'Time blocking',                      type: 'lesson',   slug: 'time-blocking' },
    ],
    suggestedFollowups: [
      'What does the Sunday plan look like?',
      'How do I structure the Friday review?',
      'What are the failure points to watch for?',
    ],
  },

  'which videos explain note-taking best?': {
    answer: {
      summary:
        'Two videos cover the core: "How I Take Smart Notes" introduces the Zettelkasten method, and "Building a Second Brain" puts it in a complete capture-organize-distill-express loop.',
      bullets: [
        { text: 'Each note = one idea, written in your own words, linked to others.', citationIds: ['cit_sn_1', 'cit_sn_2'] },
        { text: 'A second brain runs the loop: capture, organize, distill, express.', citationIds: ['cit_sb_1'] },
        { text: 'Capture is cheap; distillation is what compounds.',                   citationIds: ['cit_sb_2'] },
      ],
      confidence: 'strong', evidenceQuality: 'strong', limitations: null,
    },
    citations: [
      { id: 'cit_sn_1', sourceVideoId: 'vid_003', videoTitle: 'How I Take Smart Notes (Zettelkasten in plain English)',
        timestampStart: 45,  timestampEnd: 110, timestampLabel: '0:45',
        url: 'https://www.youtube.com/watch?v=YT1002&t=45s',
        excerpt: 'Each note is one idea. That is the whole rule.' },
      { id: 'cit_sn_2', sourceVideoId: 'vid_003', videoTitle: 'How I Take Smart Notes (Zettelkasten in plain English)',
        timestampStart: 180, timestampEnd: 245, timestampLabel: '3:00',
        url: 'https://www.youtube.com/watch?v=YT1002&t=180s',
        excerpt: 'Notes that don\'t link to anything die.' },
      { id: 'cit_sb_1', sourceVideoId: 'vid_006', videoTitle: 'How to Build a Second Brain',
        timestampStart: 45,  timestampEnd: 110, timestampLabel: '0:45',
        url: 'https://www.youtube.com/watch?v=YT1005&t=45s',
        excerpt: 'A second brain is not a list of files. It is a loop.' },
      { id: 'cit_sb_2', sourceVideoId: 'vid_006', videoTitle: 'How to Build a Second Brain',
        timestampStart: 180, timestampEnd: 245, timestampLabel: '3:00',
        url: 'https://www.youtube.com/watch?v=YT1005&t=180s',
        excerpt: 'Capture is cheap. Distillation is what compounds.' },
    ],
    relatedPages: [
      { id: 'pg_smart_notes',   title: 'Smart notes',          type: 'lesson',   slug: 'smart-notes' },
      { id: 'pg_second_brain',  title: 'Building a second brain', type: 'playbook', slug: 'second-brain' },
    ],
    suggestedFollowups: [
      'How do I link notes effectively?',
      'What tools does Ali use for notes?',
      'How does this connect to active recall?',
    ],
  },
};

const UNSUPPORTED: AskResponse = {
  answer: null,
  unsupported: true,
  message:
    "I couldn't find enough source support in this hub to answer that confidently. Try asking about a topic covered in Ali's videos, or browse related pages below.",
  partialMatches: [
    { type: 'topic', title: 'Productivity', slug: 'productivity' },
    { type: 'topic', title: 'Learning',     slug: 'learning' },
    { type: 'topic', title: 'Systems',      slug: 'systems' },
  ],
  suggestedSearches: ['weekly planning', 'deep work', 'time blocking', 'active recall'],
};

export function lookupMockAnswer(question: string): AskResponse {
  const key = question.trim().toLowerCase();
  return ANSWERS[key] ?? UNSUPPORTED;
}
