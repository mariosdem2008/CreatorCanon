/**
 * Diagnose why a specific page is missing a hypothetical_example block.
 *
 * Inspects:
 *   1. The persisted page_version block_tree to see what kinds DID land.
 *   2. The R2 page_strategist transcript IF the last-run page matches.
 *   3. The R2 example_author transcript IF present.
 *   4. The canon node payloads for evidence of usable example/scenario material.
 *
 * Usage (from packages/pipeline):
 *   tsx ./src/scripts/diagnose-hypothetical-example.ts <runId> <pageSlug>
 *
 * Example:
 *   tsx ./src/scripts/diagnose-hypothetical-example.ts 97e8772c-07e3-4408-ba40-0a17450f33cf pg-7d517d808e
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { and, eq, getDb, inArray } from '@creatorcanon/db';
import { canonNode, generationRun, page, pageBrief, pageVersion } from '@creatorcanon/db/schema';
import { createR2Client } from '@creatorcanon/adapters';
import { parseServerEnv } from '@creatorcanon/core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function loadEnv(p: string) {
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    const k = t.slice(0, i).trim();
    if (process.env[k] !== undefined) continue;
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[k] = v;
  }
}
loadEnv(path.resolve(__dirname, '../../../../.env'));

if (!process.argv[2] || !process.argv[3]) {
  console.error('Usage: tsx ./src/scripts/diagnose-hypothetical-example.ts <runId> <pageSlug>');
  process.exit(1);
}
const runId: string = process.argv[2];
const pageSlug: string = process.argv[3];

async function readTranscript(r2: ReturnType<typeof createR2Client>, key: string): Promise<Array<{ role: string; content: string }> | null> {
  try {
    const obj = await r2.getObject(key);
    return JSON.parse(new TextDecoder().decode(obj.body));
  } catch {
    return null;
  }
}

async function main() {
  const db = getDb();
  const env = parseServerEnv(process.env);
  const r2 = createR2Client(env);

  const runRows = await db
    .select({ workspaceId: generationRun.workspaceId })
    .from(generationRun)
    .where(eq(generationRun.id, runId))
    .limit(1);
  const workspaceId = runRows[0]?.workspaceId;
  if (!workspaceId) {
    console.error(`run ${runId} not found`);
    process.exit(2);
  }

  // 1. Find the page + its block tree
  const pageRows = await db
    .select({ id: page.id, title: pageVersion.title, summary: pageVersion.summary, tree: pageVersion.blockTreeJson })
    .from(page)
    .innerJoin(pageVersion, and(eq(pageVersion.pageId, page.id), eq(pageVersion.isCurrent, true)))
    .where(and(eq(page.runId, runId), eq(page.slug, pageSlug)))
    .limit(1);
  const pageRow = pageRows[0];
  if (!pageRow) {
    console.error(`page slug=${pageSlug} not found in run ${runId}`);
    process.exit(2);
  }
  const tree = pageRow.tree as { blocks?: Array<{ type: string }>; atlasMeta?: { workbench?: { artifactKinds?: string[] } } };
  console.info(`=== Page: ${pageRow.title} ===`);
  const blockKinds = (tree.blocks ?? []).map((b) => b.type);
  console.info(`block kinds delivered: ${JSON.stringify(blockKinds)}`);
  const hasHE = blockKinds.includes('hypothetical_example');
  console.info(`has hypothetical_example: ${hasHE ? 'YES' : 'NO'}`);

  // 2. Find the brief + its canon nodes
  const briefRows = await db
    .select()
    .from(pageBrief)
    .where(eq(pageBrief.runId, runId));
  const matchingBrief = briefRows.find((b) => {
    const p = b.payload as { slug?: string; pageTitle?: string };
    return p.slug === pageSlug || p.pageTitle === pageRow.title;
  });

  if (matchingBrief) {
    const briefPayload = matchingBrief.payload as { primaryCanonNodeIds?: string[]; supportingCanonNodeIds?: string[]; pageType?: string };
    console.info(`brief id: ${matchingBrief.id}`);
    console.info(`brief.pageType: ${briefPayload.pageType}`);
    console.info(`primary canon node count: ${(briefPayload.primaryCanonNodeIds ?? []).length}`);
    console.info(`supporting canon node count: ${(briefPayload.supportingCanonNodeIds ?? []).length}`);

    const nodeIds = [...(briefPayload.primaryCanonNodeIds ?? []), ...(briefPayload.supportingCanonNodeIds ?? [])];
    if (nodeIds.length > 0) {
      const nodes = await db
        .select({ id: canonNode.id, type: canonNode.type, payload: canonNode.payload })
        .from(canonNode)
        .where(and(eq(canonNode.runId, runId), inArray(canonNode.id, nodeIds)));

      console.info(`\n=== Canon node example/scenario coverage ===`);
      let nodesWithExample = 0;
      for (const n of nodes) {
        const p = n.payload as Record<string, unknown>;
        const exampleKeys = ['example', 'examples', 'useCase', 'useCases', 'scenario', 'scenarios', 'whenToUse'];
        const hits = exampleKeys.filter((k) => p[k] && (typeof p[k] === 'string' ? (p[k] as string).length > 0 : Array.isArray(p[k]) && (p[k] as unknown[]).length > 0));
        if (hits.length > 0) {
          nodesWithExample += 1;
          console.info(`  ${n.id} (${n.type}): has ${hits.join(', ')}`);
        }
      }
      console.info(`${nodesWithExample}/${nodes.length} canon nodes have example/scenario fields`);
    }
  } else {
    console.info(`(could not match the page to a brief)`);
  }

  // 3. Page strategist transcript (last-page wins, may not be this page)
  console.info(`\n=== R2 transcripts (NOTE: per-agent key, last-page wins) ===`);
  const stratKey = `workspaces/${workspaceId}/runs/${runId}/agents/page_strategist/transcript.json`;
  const strat = await readTranscript(r2, stratKey);
  if (!strat) {
    console.info(`  page_strategist: NO transcript at ${stratKey}`);
  } else {
    const lastAssistant = [...strat].reverse().find((t) => t.role === 'assistant' && t.content?.trim().length > 0);
    if (!lastAssistant) {
      console.info('  page_strategist: empty transcript');
    } else {
      try {
        const trimmed = lastAssistant.content.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
        const plan = JSON.parse(trimmed) as { pageId?: string; pageTitle?: string; artifacts?: Array<{ kind: string }> };
        const isThisPage = plan.pageTitle === pageRow.title;
        const kinds = (plan.artifacts ?? []).map((a) => a.kind);
        const hasHEInPlan = kinds.includes('hypothetical_example');
        console.info(`  page_strategist (last-page-only): pageTitle=${plan.pageTitle ?? '?'} matches=${isThisPage} kinds=${JSON.stringify(kinds)} planned_HE=${hasHEInPlan}`);
      } catch (err) {
        console.info('  page_strategist: could not parse plan JSON:', (err as Error).message);
      }
    }
  }

  // 4. example_author transcript
  const exKey = `workspaces/${workspaceId}/runs/${runId}/agents/example_author/transcript.json`;
  const ex = await readTranscript(r2, exKey);
  if (!ex) {
    console.info(`  example_author: NO transcript at ${exKey}`);
  } else {
    const lastAssistant = [...ex].reverse().find((t) => t.role === 'assistant' && t.content?.trim().length > 0);
    if (!lastAssistant) {
      console.info('  example_author: empty transcript');
    } else {
      const preview = lastAssistant.content.trim().slice(0, 240);
      console.info(`  example_author (last-page-only): returned content (first 240 chars):\n    ${preview}`);
    }
  }
}

main().catch((err) => {
  console.error('diagnose failed:', err);
  process.exit(1);
});
