import type { StopCaps } from '../stop-conditions';
import type { AgentName } from '../providers/selectModel';
import {
  TOPIC_SPOTTER_PROMPT,
  FRAMEWORK_EXTRACTOR_PROMPT,
  LESSON_EXTRACTOR_PROMPT,
  PLAYBOOK_EXTRACTOR_PROMPT,
  SOURCE_RANKER_PROMPT,
  QUOTE_FINDER_PROMPT,
  AHA_MOMENT_DETECTOR_PROMPT,
  CITATION_GROUNDER_PROMPT,
  CHANNEL_PROFILER_PROMPT,
  VIDEO_ANALYST_PROMPT,
  CANON_ARCHITECT_PROMPT,
  PAGE_BRIEF_PLANNER_PROMPT,
  PAGE_WRITER_PROMPT,
} from './prompts';

export interface SpecialistConfig {
  agent: Exclude<AgentName, 'page_composer' | 'visual_frame_analyst'>;
  systemPrompt: string;
  allowedTools: string[];
  stopOverrides?: Partial<StopCaps>;
}

export const SPECIALISTS: Record<Exclude<AgentName, 'page_composer' | 'visual_frame_analyst'>, SpecialistConfig> = {
  topic_spotter: {
    agent: 'topic_spotter',
    systemPrompt: TOPIC_SPOTTER_PROMPT,
    allowedTools: ['listVideos','getVideoSummary','searchSegments','listSegmentsForVideo','getSegment','proposeTopic','proposeRelation'],
  },
  framework_extractor: {
    agent: 'framework_extractor',
    systemPrompt: FRAMEWORK_EXTRACTOR_PROMPT,
    allowedTools: ['listVideos','getVideoSummary','searchSegments','listSegmentsForVideo','getSegment','proposeFramework','proposeRelation'],
  },
  lesson_extractor: {
    agent: 'lesson_extractor',
    systemPrompt: LESSON_EXTRACTOR_PROMPT,
    allowedTools: ['listVideos','getVideoSummary','searchSegments','listSegmentsForVideo','getSegment','proposeLesson','proposeRelation'],
  },
  playbook_extractor: {
    agent: 'playbook_extractor',
    systemPrompt: PLAYBOOK_EXTRACTOR_PROMPT,
    allowedTools: ['listFindings','searchSegments','listSegmentsForVideo','getSegment','proposePlaybook','proposeRelation'],
  },
  source_ranker: {
    agent: 'source_ranker',
    systemPrompt: SOURCE_RANKER_PROMPT,
    allowedTools: ['listFindings','listVideos','searchSegments','proposeSourceRanking'],
  },
  quote_finder: {
    agent: 'quote_finder',
    systemPrompt: QUOTE_FINDER_PROMPT,
    allowedTools: ['listFindings','searchSegments','getSegment','proposeQuote','proposeRelation'],
  },
  aha_moment_detector: {
    agent: 'aha_moment_detector',
    systemPrompt: AHA_MOMENT_DETECTOR_PROMPT,
    allowedTools: ['listFindings','searchSegments','getSegment','proposeAhaMoment','proposeRelation'],
  },
  citation_grounder: {
    agent: 'citation_grounder',
    systemPrompt: CITATION_GROUNDER_PROMPT,
    allowedTools: ['listFindings','getSegment','markFindingEvidence'],
  },
  // ---------------------------------------------------------------------
  // Canon v1 specialists (Stage 1 deep knowledge extraction)
  // visual_frame_analyst is NOT a specialist — it is a direct-call stage.
  // ---------------------------------------------------------------------
  channel_profiler: {
    agent: 'channel_profiler',
    systemPrompt: CHANNEL_PROFILER_PROMPT,
    allowedTools: ['listVideos', 'getSegmentedTranscript', 'getFullTranscript', 'proposeChannelProfile'],
    // Single sample-and-emit; agents that exhaust this cap have gone off the rails.
    stopOverrides: { maxCalls: 12, maxCostCents: 80 },
  },
  video_analyst: {
    agent: 'video_analyst',
    systemPrompt: VIDEO_ANALYST_PROMPT,
    // Channel profile + transcript + visual moments are pre-loaded in the
    // user message. Only getSegment is kept for last-mile quote verification.
    allowedTools: [
      'getSegment',
      'proposeVideoIntelligenceCard',
    ],
    // Tighter caps reflect the single-shot expectation.
    stopOverrides: { maxCalls: 8, maxCostCents: 50 },
  },
  canon_architect: {
    agent: 'canon_architect',
    systemPrompt: CANON_ARCHITECT_PROMPT,
    // VICs + visual moments + channel profile pre-loaded. Keep getSegment
    // for occasional verification.
    allowedTools: [
      'getSegment',
      'proposeCanonNode',
    ],
    stopOverrides: { maxCalls: 100, maxCostCents: 500 },
  },
  page_brief_planner: {
    agent: 'page_brief_planner',
    systemPrompt: PAGE_BRIEF_PLANNER_PROMPT,
    // Channel profile + page-worthy canon nodes + visual moments are
    // pre-loaded in the user message. Only getSegment kept for last-mile
    // verification when the planner wants to double-check evidence wording.
    allowedTools: [
      'getSegment',
      'proposePageBrief',
    ],
    stopOverrides: { maxCalls: 30, maxCostCents: 100 },
  },
  page_writer: {
    agent: 'page_writer',
    systemPrompt: PAGE_WRITER_PROMPT,
    allowedTools: [],
    // Writer is single-shot JSON. maxCalls=2 = 1 attempt + 1 retry margin.
    stopOverrides: { maxCalls: 2, maxCostCents: 50 },
  },
};
