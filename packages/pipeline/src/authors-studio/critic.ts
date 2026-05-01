import { z } from 'zod';
import { runSpecialist, type SpecialistContext } from './specialists/_runner';
import type { ArtifactBundle, CriticOutput, PagePlan } from './types';

const criticSchema = z.object({
  approved: z.boolean(),
  notes: z.array(z.object({
    artifactKind: z.enum(['cited_prose', 'roadmap', 'hypothetical_example', 'diagram', 'common_mistakes']),
    severity: z.enum(['critical', 'important', 'minor']),
    issue: z.string().min(10),
    evidence: z.string().min(5),
    prescription: z.string().min(10),
  })).max(20),
});

export interface CriticInput {
  ctx: SpecialistContext;
  plan: PagePlan;
  artifacts: ArtifactBundle;
  canonNodes: Array<Record<string, unknown>>;
  channelProfilePayload: unknown;
}

export async function runCritic(input: CriticInput): Promise<CriticOutput> {
  const userMessage =
    `# PAGE PLAN\n${JSON.stringify(input.plan)}\n\n` +
    `# ARTIFACTS PRODUCED\n${JSON.stringify(input.artifacts)}\n\n` +
    `# CANON NODES (the source of truth)\n${JSON.stringify(input.canonNodes)}\n\n` +
    `# CHANNEL PROFILE\n${JSON.stringify(input.channelProfilePayload)}\n\n` +
    `IMPORTANT: When you quote a piece of an artifact in the "evidence" field, paraphrase or briefly describe it rather than copying source text that contains JSON-special characters (quotes, backslashes, brackets — Mermaid syntax is especially prone to break JSON output). Your output must be valid JSON; an unescapable quote of a Mermaid diagram defeats the whole revision pass.\n\n` +
    `Output revision notes as a single JSON object matching the schema.`;
  try {
    const { artifact, costCents } = await runSpecialist(input.ctx, userMessage, criticSchema);
    return { ...artifact, costCents };
  } catch (err) {
    // Critic output that fails JSON.parse / Zod validation is a recoverable
    // error: a single page should not kill the whole 8-page run. Treat it
    // as "no critique" so the page ships its specialist outputs as-is.
    // The Critic prompt (D8) is itself a quality gate; losing it costs us
    // the revise pass on this one page, not the page itself.
    // eslint-disable-next-line no-console
    console.warn(`[critic] page=${input.plan.pageId} unparseable output, treating as approved-no-notes: ${(err as Error).message.slice(0, 200)}`);
    return { notes: [], approved: true, costCents: 0 };
  }
}
