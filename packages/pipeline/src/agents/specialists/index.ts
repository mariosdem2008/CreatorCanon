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
} from './prompts';

export interface SpecialistConfig {
  agent: Exclude<AgentName, 'page_composer'>;
  systemPrompt: string;
  allowedTools: string[];
  stopOverrides?: Partial<StopCaps>;
}

export const SPECIALISTS: Record<Exclude<AgentName, 'page_composer'>, SpecialistConfig> = {
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
};
