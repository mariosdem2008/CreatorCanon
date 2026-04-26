import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { StopCaps } from '../stop-conditions';
import type { AgentName } from '../providers/selectModel';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface SpecialistConfig {
  agent: Exclude<AgentName, 'page_composer'>;
  systemPrompt: string;
  allowedTools: string[];
  stopOverrides?: Partial<StopCaps>;
}

function loadPrompt(filename: string): string {
  return readFileSync(join(__dirname, filename), 'utf8');
}

export const SPECIALISTS: Record<Exclude<AgentName, 'page_composer'>, SpecialistConfig> = {
  topic_spotter: {
    agent: 'topic_spotter',
    systemPrompt: loadPrompt('topic_spotter.md'),
    allowedTools: ['listVideos','getVideoSummary','searchSegments','listSegmentsForVideo','getSegment','proposeTopic','proposeRelation'],
  },
  framework_extractor: {
    agent: 'framework_extractor',
    systemPrompt: loadPrompt('framework_extractor.md'),
    allowedTools: ['listVideos','getVideoSummary','searchSegments','listSegmentsForVideo','getSegment','proposeFramework','proposeRelation'],
  },
  lesson_extractor: {
    agent: 'lesson_extractor',
    systemPrompt: loadPrompt('lesson_extractor.md'),
    allowedTools: ['listVideos','getVideoSummary','searchSegments','listSegmentsForVideo','getSegment','proposeLesson','proposeRelation'],
  },
  playbook_extractor: {
    agent: 'playbook_extractor',
    systemPrompt: loadPrompt('playbook_extractor.md'),
    allowedTools: ['listFindings','searchSegments','listSegmentsForVideo','getSegment','proposePlaybook','proposeRelation'],
  },
  source_ranker: {
    agent: 'source_ranker',
    systemPrompt: loadPrompt('source_ranker.md'),
    allowedTools: ['listFindings','listVideos','searchSegments','proposeSourceRanking'],
  },
  quote_finder: {
    agent: 'quote_finder',
    systemPrompt: loadPrompt('quote_finder.md'),
    allowedTools: ['listFindings','searchSegments','getSegment','proposeQuote','proposeRelation'],
  },
  aha_moment_detector: {
    agent: 'aha_moment_detector',
    systemPrompt: loadPrompt('aha_moment_detector.md'),
    allowedTools: ['listFindings','searchSegments','getSegment','proposeAhaMoment','proposeRelation'],
  },
  citation_grounder: {
    agent: 'citation_grounder',
    systemPrompt: loadPrompt('citation_grounder.md'),
    allowedTools: ['listFindings','getSegment','markFindingEvidence'],
  },
};
