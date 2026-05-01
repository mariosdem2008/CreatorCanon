import { z } from 'zod';
import { runSpecialist, type SpecialistContext } from './_runner';
import { validateMermaid } from '../mermaid-validate';
import type { DiagramArtifact, PagePlan } from '../types';

const diagramSchema = z.object({
  kind: z.literal('diagram'),
  diagramType: z.enum(['flowchart', 'sequence', 'state', 'mindmap']),
  mermaidSrc: z.string().min(20),
  caption: z.string().min(10),
  citationIds: z.array(z.string().min(1)).min(1),
});

export interface DiagramAuthorInput {
  ctx: SpecialistContext;
  plan: PagePlan;
  canonNodes: Array<Record<string, unknown>>;
  channelProfilePayload: unknown;
}

export async function runDiagramAuthor(input: DiagramAuthorInput): Promise<DiagramArtifact | null> {
  const userMessage =
    `# PAGE PLAN\n${JSON.stringify(input.plan)}\n\n` +
    `# CANON NODES (use steps/tools/dependencies)\n${JSON.stringify(input.canonNodes)}\n\n` +
    `# CHANNEL PROFILE\n${JSON.stringify(input.channelProfilePayload)}\n\n` +
    `Output the diagram as a single JSON object matching the schema.`;
  const { artifact, costCents } = await runSpecialist(input.ctx, userMessage, diagramSchema);
  // Server-side Mermaid validation. On failure, retry once with the parse
  // error fed back; second failure returns null and the diagram is dropped.
  const v1 = await validateMermaid(artifact.mermaidSrc);
  if (v1.ok) return { ...artifact, costCents };

  const retryMessage =
    userMessage +
    `\n\n# YOUR PREVIOUS OUTPUT FAILED Mermaid PARSE\nError: ${v1.error}\n\n` +
    `Output a corrected JSON object. Fix the Mermaid syntax error.`;
  try {
    const { artifact: retry, costCents: retryCost } = await runSpecialist(input.ctx, retryMessage, diagramSchema);
    const v2 = await validateMermaid(retry.mermaidSrc);
    if (v2.ok) return { ...retry, costCents: costCents + retryCost };
    // eslint-disable-next-line no-console
    console.warn(`[diagram_author] dropped after 2 parse failures: ${v2.error}`);
    return null;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[diagram_author] retry threw: ${(err as Error).message}`);
    return null;
  }
}
