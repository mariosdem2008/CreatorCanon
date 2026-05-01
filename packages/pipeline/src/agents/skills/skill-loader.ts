/**
 * Skill loader: reads SKILL.md files from .claude/skills/pipeline/ and parses
 * the section structure (PURPOSE / SCHEMA / RUBRIC / EXAMPLES_GOOD /
 * EXAMPLES_BAD / ANTI_PATTERNS / OUTPUT_FORMAT). The runtime prompt builder
 * uses these parsed sections to construct system prompts.
 *
 * Skills are markdown so they're readable both by humans (during dev
 * iteration) and by the runtime prompt builder. The skill IS the rubric;
 * editing the rubric = editing the markdown, no TypeScript redeploy needed.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface ParsedSkill {
  /** Skill slug from frontmatter `name:` */
  name: string;
  /** Free-text description from frontmatter */
  description: string;
  /** Map of `## SECTION_NAME` → section body (trimmed) */
  sections: Record<string, string>;
}

/**
 * Walk up from this file to the repo root, then locate the skills dir.
 * Layout:
 *   <repo>/.claude/skills/pipeline/<skill-name>/SKILL.md
 *   <repo>/packages/pipeline/src/agents/skills/skill-loader.ts  ← this file
 * So we ascend 5 levels: skills → agents → src → pipeline → packages → repo.
 */
const SKILL_ROOT = path.resolve(__dirname, '../../../../../.claude/skills/pipeline');

export function loadSkill(skillName: string): ParsedSkill {
  const skillPath = path.join(SKILL_ROOT, skillName, 'SKILL.md');
  if (!fs.existsSync(skillPath)) {
    throw new Error(`Skill not found: ${skillName} (looked at ${skillPath})`);
  }
  const raw = fs.readFileSync(skillPath, 'utf8');
  return parseSkillBody(raw, skillName);
}

/**
 * Parse the YAML frontmatter (key:value pairs only — we don't need full YAML)
 * plus `## SECTION_NAME` blocks from a markdown body.
 *
 * Frontmatter keys are split on the FIRST colon, so values containing colons
 * (URLs, descriptions with prose) are preserved correctly.
 */
export function parseSkillBody(raw: string, fallbackName: string): ParsedSkill {
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!fmMatch) throw new Error(`Skill ${fallbackName}: no YAML frontmatter`);
  const fmText = fmMatch[1]!;
  const body = fmMatch[2]!;

  const fm: Record<string, string> = {};
  for (const ln of fmText.split('\n')) {
    const colon = ln.indexOf(':');
    if (colon < 0) continue;
    fm[ln.slice(0, colon).trim()] = ln.slice(colon + 1).trim();
  }

  // Extract `## SECTION_NAME` blocks. SECTION_NAME is uppercase + underscores
  // (PURPOSE, EXAMPLES_GOOD, etc.) — we deliberately ignore mixed-case headers
  // so prose `## Some Heading` stays inline.
  const sections: Record<string, string> = {};
  const sectionPattern = /^## ([A-Z_]+)\s*$/gm;
  const matches: Array<{ name: string; headerEnd: number; headerStart: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = sectionPattern.exec(body)) !== null) {
    matches.push({ name: m[1]!, headerStart: m.index, headerEnd: m.index + m[0].length });
  }
  for (let i = 0; i < matches.length; i += 1) {
    const start = matches[i]!.headerEnd;
    const end = i < matches.length - 1 ? matches[i + 1]!.headerStart : body.length;
    sections[matches[i]!.name] = body.slice(start, end).trim();
  }

  return {
    name: fm.name ?? fallbackName,
    description: fm.description ?? '',
    sections,
  };
}

/** Lists every skill directory under .claude/skills/pipeline/. */
export function listSkills(): string[] {
  if (!fs.existsSync(SKILL_ROOT)) return [];
  return fs
    .readdirSync(SKILL_ROOT)
    .filter((d) => {
      const p = path.join(SKILL_ROOT, d);
      // Skip the creator-archetypes directory — it holds archetype files,
      // not rubric SKILL.md files. Use loadArchetype() for those.
      if (d === 'creator-archetypes') return false;
      return fs.statSync(p).isDirectory() && fs.existsSync(path.join(p, 'SKILL.md'));
    });
}

/** Skill root path — exported for test setup and the archetype loader. */
export const SKILL_ROOT_PATH = SKILL_ROOT;
