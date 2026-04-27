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
    stopOverrides: { maxCalls: 30, maxCostCents: 200 },
  },
  video_analyst: {
    agent: 'video_analyst',
    systemPrompt: VIDEO_ANALYST_PROMPT,
    allowedTools: [
      'getChannelProfile', 'getSegmentedTranscript', 'searchSegments', 'getSegment',
      'listVisualMoments', 'getVisualMoment', 'getFullTranscript',
      'proposeVideoIntelligenceCard',
    ],
    stopOverrides: { maxCalls: 80, maxCostCents: 400 },
  },
  canon_architect: {
    agent: 'canon_architect',
    systemPrompt: CANON_ARCHITECT_PROMPT,
    allowedTools: [
      'getChannelProfile', 'listVideoIntelligenceCards', 'getVideoIntelligenceCard',
      'searchSegments', 'getSegment',
      'listVisualMoments', 'getVisualMoment',
      'proposeCanonNode',
    ],
    stopOverrides: { maxCalls: 200, maxCostCents: 1000 },
  },
  page_brief_planner: {
    agent: 'page_brief_planner',
    systemPrompt: PAGE_BRIEF_PLANNER_PROMPT,
    allowedTools: [
      'getChannelProfile', 'listCanonNodes', 'getCanonNode', 'getSegment',
      'listVisualMoments',
      'proposePageBrief',
    ],
    stopOverrides: { maxCalls: 60, maxCostCents: 300 },
  },
  page_writer: {
    agent: 'page_writer',
    systemPrompt: PAGE_WRITER_PROMPT,
    allowedTools: [],
    stopOverrides: { maxCalls: 2, maxCostCents: 200 },
  },
};
