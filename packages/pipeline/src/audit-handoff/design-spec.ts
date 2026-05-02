import { createOpenAIClient } from '@creatorcanon/adapters';
import { parseServerEnv } from '@creatorcanon/core';
import { zodToJsonSchema } from 'zod-to-json-schema';

import { createCodexCliProvider } from '../agents/providers/codex-cli';
import { resolveOpenAIProviderMode } from '../agents/providers/factory';
import type { AuditReport } from '../audit';
import {
  CREATOR_MANUAL_EDITABLE_KEYS,
  creatorManualDesignSpecSchema,
  type CreatorManualDesignSpec,
} from './types';

export interface CreatorManualDesignSpecModelContext {
  auditReport: AuditReport;
  prompt: string;
  jsonSchema: Record<string, unknown>;
}

export type CreatorManualDesignSpecModelClient = (
  context: CreatorManualDesignSpecModelContext,
) => Promise<unknown>;

export type CreatorManualDesignSpecSource = 'model' | 'fallback';

export interface CreatorManualDesignSpecGeneration {
  spec: CreatorManualDesignSpec;
  source: CreatorManualDesignSpecSource;
  fallbackReason?: string;
}

export interface GenerateCreatorManualDesignSpecInput {
  auditReport: AuditReport;
  modelClient?: CreatorManualDesignSpecModelClient | null;
}

const palettes = {
  operator: {
    background: '#f8fafc',
    foreground: '#111827',
    surface: '#ffffff',
    elevated: '#ffffff',
    border: '#cbd5e1',
    muted: '#64748b',
    accent: '#0f766e',
    accentForeground: '#ffffff',
    warning: '#b45309',
    success: '#15803d',
    typeMap: {
      lesson: '#0f766e',
      framework: '#1d4ed8',
      playbook: '#7c3aed',
    },
  },
  executive: {
    background: '#f7f3ea',
    foreground: '#161513',
    surface: '#fffaf0',
    elevated: '#ffffff',
    border: '#d8cebd',
    muted: '#686056',
    accent: '#334155',
    accentForeground: '#ffffff',
    warning: '#b45309',
    success: '#15803d',
    typeMap: {
      lesson: '#334155',
      framework: '#0f766e',
      playbook: '#7c3aed',
    },
  },
  creator: {
    background: '#fafafa',
    foreground: '#18181b',
    surface: '#ffffff',
    elevated: '#ffffff',
    border: '#d4d4d8',
    muted: '#71717a',
    accent: '#be123c',
    accentForeground: '#ffffff',
    warning: '#b45309',
    success: '#15803d',
    typeMap: {
      lesson: '#be123c',
      framework: '#2563eb',
      playbook: '#9333ea',
    },
  },
} as const;

export function buildFallbackCreatorManualDesignSpec(
  auditReport: AuditReport,
): CreatorManualDesignSpec {
  const palette = palettes[selectPalette(auditReport)];
  const isHighTicket =
    auditReport.scores.monetizationPotential >= 80 || auditReport.scores.overall >= 85;
  const audience = compactText(
    auditReport.auditMemo.recommendedHub.targetAudience || auditReport.positioning.audience,
    120,
    'the target audience',
  );
  const strongestTheme = compactText(
    auditReport.inventory.repeatedThemes[0] ?? auditReport.blueprint.sampleLesson.title,
    120,
    'the strongest archive theme',
  );
  const channelTitle = compactText(auditReport.channel.title, 120, 'the creator');
  const hubName = compactText(
    auditReport.auditMemo.bestFirstHub || auditReport.blueprint.hubTitle,
    120,
    'Creator Manual',
  );

  return creatorManualDesignSpecSchema.parse({
    version: 1,
    brand: {
      name: hubName,
      tone: isHighTicket
        ? 'Premium, direct, evidence-led, and built for decisive operators.'
        : 'Practical, clear, source-backed, and built for repeated use.',
      colors: palette,
      typography: {
        headingFamily: isHighTicket
          ? 'Georgia, ui-serif, serif'
          : 'Inter, ui-sans-serif, system-ui, sans-serif',
        bodyFamily: 'Geist, ui-sans-serif, system-ui, sans-serif',
      },
      assets: {},
      style: { mode: 'custom' },
      labels: {
        evidence: 'Source clips',
        workshop: 'Operating workshop',
        library: 'Manual library',
      },
      radius: isHighTicket ? '8px' : '6px',
      shadow: isHighTicket
        ? '0 24px 80px rgba(15, 23, 42, 0.14)'
        : '0 18px 60px rgba(15, 23, 42, 0.12)',
    },
    positioning: {
      tagline: compactText(
        `A source-backed operating manual for ${audience}.`,
        240,
        'A source-backed operating manual.',
      ),
      homeHeadline: compactText(hubName, 160, 'Creator Manual'),
      homeSummary: compactText(
        `A professional map of ${channelTitle}'s archive, organized around ${strongestTheme} and the lessons most ready to become products, workshops, and authority assets.`,
        420,
        'A professional map of the archive, organized around the lessons most ready to become products, workshops, and authority assets.',
      ),
    },
    motion: {
      intensity: isHighTicket ? 'subtle' : 'standard',
      principles: [
        'Use fast staggered reveals for dense manual sections.',
        'Keep navigation and evidence surfaces immediately usable.',
        'Respect reduced-motion preferences.',
      ],
    },
    customization: {
      editableKeys: CREATOR_MANUAL_EDITABLE_KEYS,
    },
  });
}

function compactText(
  value: string | null | undefined,
  maxLength: number,
  fallback: string,
): string {
  const normalized = value
    ?.replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const safe = normalized || fallback;
  if (safe.length <= maxLength) return safe;

  const suffix = '...';
  const limit = Math.max(1, maxLength - suffix.length);
  const breakAt = safe.lastIndexOf(' ', limit);
  const cut = breakAt >= Math.floor(limit * 0.6) ? breakAt : limit;
  return `${safe.slice(0, cut).trimEnd()}${suffix}`;
}

export async function generateCreatorManualDesignSpec(
  input: GenerateCreatorManualDesignSpecInput,
): Promise<CreatorManualDesignSpec> {
  const generation = await generateCreatorManualDesignSpecWithProvenance(input);
  return generation.spec;
}

export async function generateCreatorManualDesignSpecWithProvenance(
  input: GenerateCreatorManualDesignSpecInput,
): Promise<CreatorManualDesignSpecGeneration> {
  const fallback = (fallbackReason: string): CreatorManualDesignSpecGeneration => ({
    spec: buildFallbackCreatorManualDesignSpec(input.auditReport),
    source: 'fallback',
    fallbackReason,
  });
  const jsonSchema = buildCreatorManualDesignSpecJsonSchema();
  const prompt = buildCreatorManualDesignSpecPrompt(input.auditReport);

  if (input.modelClient === null) return fallback('model_client_disabled');

  try {
    const client = input.modelClient ?? createEnvModelClient();
    if (!client) return fallback('model_client_unavailable');

    const output = await client({ auditReport: input.auditReport, prompt, jsonSchema });
    return {
      spec: creatorManualDesignSpecSchema.parse(parseModelOutput(output)),
      source: 'model',
    };
  } catch (error) {
    return fallback(designSpecFallbackReason(error));
  }
}

function designSpecFallbackReason(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`.replace(/\s+/g, ' ').slice(0, 280);
  }
  return String(error).replace(/\s+/g, ' ').slice(0, 280) || 'unknown_error';
}

export function buildCreatorManualDesignSpecJsonSchema(): Record<string, unknown> {
  const schema = zodToJsonSchema(creatorManualDesignSpecSchema, {
    $refStrategy: 'none',
  }) as Record<string, unknown>;
  delete schema.$schema;
  return schema;
}

function buildCreatorManualDesignSpecPrompt(auditReport: AuditReport): string {
  return [
    'You are the mid-process professional design spec generator for CreatorCanon Creator Manual.',
    'Return only JSON matching the provided schema. The design must feel high-ticket and professional, while remaining fully redesignable through the editable keys.',
    'Include complete brand color tokens, typography, labels, assets object, radius, shadow, style mode, positioning, motion metadata, and customization metadata.',
    '',
    `Creator: ${auditReport.channel.title}`,
    `Hub: ${auditReport.blueprint.hubTitle}`,
    `Audience: ${auditReport.positioning.audience}`,
    `Authority angle: ${auditReport.positioning.authorityAngle}`,
    `Scores: ${JSON.stringify(auditReport.scores)}`,
    `Themes: ${auditReport.inventory.repeatedThemes.join(', ')}`,
    `Frameworks: ${auditReport.inventory.frameworks.join(', ')}`,
    `Playbooks: ${auditReport.inventory.playbooks.join(', ')}`,
    `Memo: ${auditReport.auditMemo.headlineFinding}`,
    `Recommended hub: ${JSON.stringify(auditReport.auditMemo.recommendedHub)}`,
  ].join('\n');
}

function createEnvModelClient(): CreatorManualDesignSpecModelClient | null {
  if (resolveOpenAIProviderMode(process.env) === 'codex_cli') {
    return createCodexCliDesignSpecModelClient();
  }

  if (!process.env.OPENAI_API_KEY) return null;

  return async ({ prompt, jsonSchema }) => {
    const env = parseServerEnv(process.env);
    const openai = createOpenAIClient(env);
    const completion = await openai.chat({
      model: process.env.CREATOR_MANUAL_DESIGN_SPEC_MODEL || 'gpt-4o-mini',
      temperature: 0.2,
      maxTokens: 1600,
      messages: [
        {
          role: 'system',
          content:
            'Generate production-ready Creator Manual design specs. Return strict JSON only.',
        },
        { role: 'user', content: prompt },
      ],
      jsonSchema: {
        name: 'creator_manual_design_spec',
        schema: jsonSchema,
        strict: false,
      },
      userInteraction: 'audit_handoff_design_spec',
    });

    return completion.content;
  };
}

function createCodexCliDesignSpecModelClient(): CreatorManualDesignSpecModelClient {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('PIPELINE_OPENAI_PROVIDER=codex_cli is disabled in production.');
  }

  const provider = createCodexCliProvider({
    bin: process.env.CODEX_CLI_BIN,
    model: process.env.CODEX_CLI_MODEL,
    timeoutMs: process.env.CODEX_CLI_TIMEOUT_MS
      ? Number(process.env.CODEX_CLI_TIMEOUT_MS)
      : undefined,
  });

  return async ({ prompt, jsonSchema }) => {
    const completion = await provider.chat({
      modelId: process.env.CREATOR_MANUAL_DESIGN_SPEC_MODEL || 'gpt-5.5',
      tools: [],
      messages: [
        {
          role: 'system',
          content:
            'Return a single JSON object matching the supplied Creator Manual design spec schema. No Markdown.',
        },
        {
          role: 'user',
          content: `${prompt}\n\nJSON schema:\n${JSON.stringify(jsonSchema)}`,
        },
      ],
    });

    return completion.message.content;
  };
}

function parseModelOutput(output: unknown): unknown {
  if (typeof output !== 'string') return output;

  try {
    return JSON.parse(output);
  } catch {
    const start = output.indexOf('{');
    const end = output.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(output.slice(start, end + 1));
    throw new Error('Design spec model response did not contain JSON.');
  }
}

function selectPalette(auditReport: AuditReport): keyof typeof palettes {
  const text = [
    auditReport.positioning.audience,
    auditReport.positioning.authorityAngle,
    ...auditReport.inventory.repeatedThemes,
    ...auditReport.inventory.frameworks,
    ...auditReport.inventory.playbooks,
  ]
    .join(' ')
    .toLowerCase();

  if (/\b(founder|operator|sales|pricing|systems?|b2b|business|startup)\b/.test(text)) {
    return 'operator';
  }
  if (/\b(executive|finance|investor|advisory|leadership|enterprise)\b/.test(text)) {
    return 'executive';
  }
  return 'creator';
}
