/**
 * Hero candidates + hub_title + hub_tagline generator (Phase 5 / Task 5.10).
 *
 * Generates the homepage's stop-the-scroll lines from the channel profile +
 * top page-worthy canon nodes + voice fingerprint. Single Codex call.
 *
 * Why this exists: the Jordan hub bug shipped a verbatim transcript stutter
 * ('AI lead generation is, it's a service-based business first and foremost')
 * as the homepage H1 because the builder was told 'use the strongest quote'.
 * This generator produces purpose-built hero copy — first-person, billboard
 * quality, 6-14 words, all five from distinct angles (pain, aspiration,
 * contrarian, specific number, curiosity).
 */

import path from 'node:path';

import { extractJsonFromCodexOutput } from '../../agents/providers/codex-extract-json';
import { runCodex } from './codex-runner';
import { type ArchetypeSlug } from '../../agents/skills/archetype-detector';
import fs from 'node:fs';
import { SKILL_ROOT_PATH } from '../../agents/skills/skill-loader';

const ARCHETYPE_DIR = path.join(SKILL_ROOT_PATH, 'creator-archetypes');

export interface HeroGeneratorInput {
  creatorName: string;
  archetype: ArchetypeSlug;
  /** From channel_profile._internal_*: niche, audience, dominantTone, recurringPromise, monetizationAngle. */
  niche: string;
  audience: string;
  dominantTone: string;
  recurringPromise: string;
  monetizationAngle: string;
  /** Top 5-10 page-worthy canon node titles. Inform what hooks the hero
   *  CAN draw from — gives the generator concrete vocabulary. */
  topCanonTitles: string[];
  /** Verbatim creator phrases used elsewhere in the audit. */
  preserveTerms: string[];
  voiceFingerprint: { profanityAllowed: boolean; tonePreset: string };
}

export interface HeroGeneratorOutput {
  hub_title: string;
  hub_tagline: string;
  hero_candidates: string[];
}

function loadArchetypeVoice(archetype: ArchetypeSlug): string {
  const filePath = path.join(ARCHETYPE_DIR, `${archetype}.md`);
  if (!fs.existsSync(filePath)) return '';
  const raw = fs.readFileSync(filePath, 'utf8');
  const start = raw.indexOf('## HUB_SOURCE_VOICE');
  if (start === -1) return '';
  const after = raw.slice(start + '## HUB_SOURCE_VOICE'.length);
  const nextHeading = after.search(/\n## [A-Z_]+/);
  return (nextHeading === -1 ? after : after.slice(0, nextHeading)).trim();
}

function buildHeroPrompt(input: HeroGeneratorInput): string {
  const archetypeVoice = loadArchetypeVoice(input.archetype);
  const lines: string[] = [];

  lines.push(`You are ${input.creatorName}, writing the homepage of your knowledge hub.`);
  lines.push('');
  lines.push(`First-person voice. Billboard quality. Each line is something you'd put`);
  lines.push(`on a poster — sticky, specific, in your voice.`);
  lines.push('');
  if (archetypeVoice) {
    lines.push(`# Your voice (archetype: ${input.archetype})`);
    lines.push('');
    lines.push(archetypeVoice);
    lines.push('');
  }
  lines.push(`# Channel context`);
  lines.push(`- Niche: ${input.niche}`);
  lines.push(`- Audience: ${input.audience}`);
  lines.push(`- Dominant tone: ${input.dominantTone}`);
  lines.push(`- Recurring promise: ${input.recurringPromise}`);
  lines.push(`- Monetization angle: ${input.monetizationAngle}`);
  lines.push('');
  lines.push(`# Voice fingerprint`);
  lines.push(`- profanityAllowed: ${input.voiceFingerprint.profanityAllowed}`);
  lines.push(`- tonePreset: ${input.voiceFingerprint.tonePreset}`);
  if (input.preserveTerms.length > 0) {
    lines.push(`- preserveTerms (USE VERBATIM): ${input.preserveTerms.join(', ')}`);
  }
  lines.push('');
  lines.push(`# Top page-worthy concepts (vocabulary you can pull from)`);
  for (const t of input.topCanonTitles) lines.push(`- ${t}`);
  lines.push('');
  lines.push(`# Task`);
  lines.push(`Produce three things for the homepage:`);
  lines.push('');
  lines.push(`1. **hub_title** — 4-10 words. The H1 of your homepage. First-person feel.`);
  lines.push(`   Example shapes: "<Creator> — <Operating System>", "How I <verb> <thing>",`);
  lines.push(`   "The <Creator> System: <one-line promise>"`);
  lines.push('');
  lines.push(`2. **hub_tagline** — 8-14 words. Positioning statement, first-person.`);
  lines.push(`   Sets up what someone will get if they read the hub.`);
  lines.push('');
  lines.push(`3. **hero_candidates** — EXACTLY 5 stop-the-scroll lines, 6-14 words each.`);
  lines.push(`   First-person. Each from a DISTINCT angle:`);
  lines.push(`     a. Pain — name the reader's actual frustration`);
  lines.push(`     b. Aspiration — paint where they end up`);
  lines.push(`     c. Contrarian — invert the standard advice`);
  lines.push(`     d. Specific number — anchor on a concrete metric`);
  lines.push(`     e. Curiosity — open a loop they want closed`);
  lines.push('');
  lines.push(`# Voice rules (CRITICAL)`);
  lines.push(`- First-person ("I", "you", "we"). NEVER "the creator", "${input.creatorName}",`);
  lines.push(`  "she/he says", or third-person attribution.`);
  lines.push(`- Each hero candidate is 6-14 words. Counted strictly.`);
  lines.push(`- DO NOT use verbatim transcript stutters. Build clean, intentional lines.`);
  lines.push(`- Verbatim preserveTerms when natural — but don't force them.`);
  lines.push(`- profanityAllowed governs language; respect it.`);
  lines.push('');
  lines.push(`# Output format`);
  lines.push(`ONE JSON object. No code fences. No preamble. First char \`{\`, last char \`}\`.`);
  lines.push('');
  lines.push(`{`);
  lines.push(`  "hub_title": "...",`);
  lines.push(`  "hub_tagline": "...",`);
  lines.push(`  "hero_candidates": ["pain line", "aspiration line", "contrarian line", "specific-number line", "curiosity line"]`);
  lines.push(`}`);

  return lines.join('\n');
}

export async function generateHeroCandidates(
  input: HeroGeneratorInput,
  options: { timeoutMs?: number } = {},
): Promise<HeroGeneratorOutput> {
  const timeoutMs = options.timeoutMs ?? 5 * 60 * 1000;
  const prompt = buildHeroPrompt(input);
  const raw = await runCodex(prompt, { timeoutMs, label: 'hero_candidates' });
  const json = extractJsonFromCodexOutput(raw);
  const parsed = JSON.parse(json) as Partial<HeroGeneratorOutput>;
  const hub_title = typeof parsed.hub_title === 'string' ? parsed.hub_title : `${input.creatorName} Hub`;
  const hub_tagline = typeof parsed.hub_tagline === 'string' ? parsed.hub_tagline : '';
  const heroes = Array.isArray(parsed.hero_candidates) ? parsed.hero_candidates : [];
  // Pad / trim to exactly 5.
  const padded = heroes.slice(0, 5);
  while (padded.length < 5) padded.push('');
  return { hub_title, hub_tagline, hero_candidates: padded };
}
