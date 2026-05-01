/**
 * Runtime system-prompt builder. Takes a skill name (e.g.
 * 'framework-extraction-rubric') + an archetype slug + a mode and
 * returns the assembled prompt string.
 *
 * Modes:
 * - 'extract'   → the core generation prompt (PURPOSE + SCHEMA + RUBRIC + ANTI_PATTERNS + OUTPUT_FORMAT)
 * - 'few-shot'  → extract + EXAMPLES_GOOD inlined for example-primed generation
 * - 'validate'  → a verifier prompt (SCHEMA + RUBRIC + EXAMPLES_BAD + ANTI_PATTERNS)
 *
 * Archetype injection: when the skill is editorial-strategy or synthesis or
 * voice-fingerprint, we splice in archetype-specific sections so the prompt
 * carries operator-coach examples for Hormozi, science-explainer for Huberman,
 * instructional-craft for Weissman, etc.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { detectArchetype, type ArchetypeSlug, type ChannelProfileShape } from './archetype-detector';
import { loadSkill, parseSkillBody, SKILL_ROOT_PATH } from './skill-loader';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
void __dirname; // keep import alignment if anyone touches this later

const ARCHETYPE_ROOT = path.join(SKILL_ROOT_PATH, 'creator-archetypes');

interface ArchetypeContent {
  archetype: ArchetypeSlug;
  detectionHeuristics?: string;
  journeyPhaseLadder?: string;
  synthesisExamples?: string;
  voicePresets?: string;
  typicalPillars?: string;
  antiPatterns?: string;
}

function loadArchetype(archetype: ArchetypeSlug): ArchetypeContent {
  const archetypePath = path.join(ARCHETYPE_ROOT, `${archetype}.md`);
  if (!fs.existsSync(archetypePath)) {
    return { archetype };
  }
  const raw = fs.readFileSync(archetypePath, 'utf8');
  // Archetype files have the same frontmatter+sections shape as SKILL.md;
  // reuse the parser. The slug from frontmatter is `archetype:`, not `name:`,
  // so we ignore it and trust the caller-provided slug.
  let parsed;
  try {
    parsed = parseSkillBody(raw, archetype);
  } catch {
    // Archetype file lacks frontmatter? Treat it as section-only markdown.
    const sections: Record<string, string> = {};
    const sectionPattern = /^## ([A-Z_]+)\s*$/gm;
    const matches: Array<{ name: string; headerEnd: number; headerStart: number }> = [];
    let m: RegExpExecArray | null;
    while ((m = sectionPattern.exec(raw)) !== null) {
      matches.push({ name: m[1]!, headerStart: m.index, headerEnd: m.index + m[0].length });
    }
    for (let i = 0; i < matches.length; i += 1) {
      const start = matches[i]!.headerEnd;
      const end = i < matches.length - 1 ? matches[i + 1]!.headerStart : raw.length;
      sections[matches[i]!.name] = raw.slice(start, end).trim();
    }
    parsed = { name: archetype, description: '', sections };
  }
  return {
    archetype,
    detectionHeuristics: parsed.sections.DETECTION_HEURISTICS,
    journeyPhaseLadder: parsed.sections.JOURNEY_PHASE_LADDER,
    synthesisExamples: parsed.sections.SYNTHESIS_EXAMPLES,
    voicePresets: parsed.sections.VOICE_PRESETS,
    typicalPillars: parsed.sections.TYPICAL_PILLARS,
    antiPatterns: parsed.sections.ANTI_PATTERNS,
  };
}

export type SystemPromptMode = 'extract' | 'validate' | 'few-shot';

export interface BuildSystemPromptInput {
  skill: string;
  mode: SystemPromptMode;
  /** Pin archetype explicitly (overrides detection). */
  archetype?: ArchetypeSlug;
  /** If supplied (and archetype isn't), the detector picks the archetype. */
  channelProfile?: ChannelProfileShape;
}

/**
 * Skills that benefit from archetype-specific examples. Mapping:
 *   editorial-strategy-rubric  → journey ladder + typical pillars + synthesis examples
 *   cross-video-synthesis-rubric → synthesis examples
 *   voice-fingerprint-rubric    → voice presets + tone notes
 *   framework-extraction-rubric → typical pillars (lightly)
 *   citation-chain-rubric       → no archetype splice (citation rules are universal)
 */
const ARCHETYPE_INJECTION_MAP: Record<string, Array<keyof ArchetypeContent>> = {
  'editorial-strategy-rubric': ['journeyPhaseLadder', 'typicalPillars', 'synthesisExamples'],
  'cross-video-synthesis-rubric': ['synthesisExamples'],
  'voice-fingerprint-rubric': ['voicePresets'],
  'framework-extraction-rubric': ['typicalPillars'],
  'citation-chain-rubric': [],
};

export function buildSystemPrompt(input: BuildSystemPromptInput): string {
  const skill = loadSkill(input.skill);
  const archetype: ArchetypeSlug =
    input.archetype ??
    (input.channelProfile ? detectArchetype(input.channelProfile) : '_DEFAULT');
  const archetypeContent = loadArchetype(archetype);

  const parts: string[] = [];
  parts.push(`# Skill: ${skill.name}`);
  if (skill.description) parts.push(`> ${skill.description}`);

  if (skill.sections.PURPOSE) {
    parts.push('# Purpose');
    parts.push(skill.sections.PURPOSE);
  }

  if (skill.sections.SCHEMA) {
    parts.push('# Schema');
    parts.push(skill.sections.SCHEMA);
  }

  if (skill.sections.RUBRIC) {
    parts.push('# Rubric');
    parts.push(skill.sections.RUBRIC);
  }

  // Archetype-specific splice
  const inject = ARCHETYPE_INJECTION_MAP[input.skill] ?? [];
  if (inject.length > 0 && archetype !== '_DEFAULT') {
    const headerWritten = { value: false };
    const writeArchetypeHeader = () => {
      if (headerWritten.value) return;
      parts.push(`# Archetype-specific guidance — ${archetype}`);
      headerWritten.value = true;
    };
    for (const key of inject) {
      const v = archetypeContent[key];
      if (typeof v !== 'string' || v.trim().length === 0) continue;
      writeArchetypeHeader();
      const subhead = key
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, (c) => c.toUpperCase())
        .trim();
      parts.push(`## ${subhead}`);
      parts.push(v);
    }
  }

  // Mode-specific sections
  if ((input.mode === 'few-shot' || input.mode === 'extract') && skill.sections.EXAMPLES_GOOD && input.mode === 'few-shot') {
    parts.push('# Examples (good)');
    parts.push(skill.sections.EXAMPLES_GOOD);
  }
  if (input.mode === 'validate' && skill.sections.EXAMPLES_BAD) {
    parts.push('# Examples (bad — what to flag)');
    parts.push(skill.sections.EXAMPLES_BAD);
  }

  if (skill.sections.ANTI_PATTERNS) {
    parts.push('# Anti-patterns to avoid');
    parts.push(skill.sections.ANTI_PATTERNS);
  }

  // Output format goes last so it's the freshest instruction in context.
  if (input.mode !== 'validate' && skill.sections.OUTPUT_FORMAT) {
    parts.push('# Output format');
    parts.push(skill.sections.OUTPUT_FORMAT);
  }

  return parts.join('\n\n');
}

/** Re-export for downstream callers — consumers shouldn't need two imports. */
export { detectArchetype, type ArchetypeSlug } from './archetype-detector';
