import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { R2Client } from '@creatorcanon/adapters';
import type { AgentProvider } from '../../agents/providers';
import type { SpecialistContext } from '../specialists/_runner';
import { runExampleAuthor } from '../specialists/example';
import { runMistakesAuthor } from '../specialists/mistakes';
import { PROSE_AUTHOR_PROMPT } from '../../agents/specialists/prompts';
import { runProseAuthor } from '../specialists/prose';
import { runRoadmapAuthor } from '../specialists/roadmap';
import type { PagePlan } from '../types';

const SAMPLE_PLAN: PagePlan = {
  pageId: 'pb_test',
  pageType: 'framework',
  pageTitle: 'Reusable Workbench',
  thesis: 'Reusable workbench pages turn source-backed instruction into action.',
  arc: [
    { beat: 'Open with the reader job', canonNodeIds: ['cn_a'] },
    { beat: 'Produce the reusable artifact', canonNodeIds: ['cn_b'] },
  ],
  voiceMode: 'reader_second_person',
  voiceNotes: { tone: 'practitioner', creatorTermsToUse: [], avoidPhrases: [] },
  artifacts: [],
  siblingPagesToReference: [],
  workbench: {
    readerJob: 'build',
    outcome: 'Build a reusable source-backed workflow.',
    useWhen: ['Use this when a page needs to produce a reusable artifact.'],
    artifactRequests: [
      { type: 'workflow', title: 'Reusable workflow', intent: 'Create an executable workflow.', canonNodeIds: ['cn_a'] },
      { type: 'template', title: 'Reusable template', intent: 'Create a copyable template.', canonNodeIds: ['cn_a'] },
      { type: 'mistake_map', title: 'Mistake map', intent: 'Create a reusable diagnostic map.', canonNodeIds: ['cn_b'] },
    ],
    nextStepHints: [],
  },
  costCents: 0,
};

function makeR2(): R2Client {
  const objects = new Map<string, Uint8Array>();
  return {
    async putObject(input: { key: string; body: Uint8Array }) {
      objects.set(input.key, input.body);
    },
    async getObject(key: string) {
      const body = objects.get(key);
      if (!body) throw new Error(`missing object ${key}`);
      return { body };
    },
  } as unknown as R2Client;
}

function makeCtx(agent: string, payload: unknown): SpecialistContext {
  process.env.DATABASE_URL ??= 'postgres://user:pass@localhost:5432/test';
  const provider: AgentProvider = {
    name: 'openai',
    async chat() {
      return {
        message: { role: 'assistant', content: JSON.stringify(payload) },
        toolCalls: [],
        usage: { inputTokens: 1, outputTokens: 1 },
        rawId: 'test-response',
      };
    },
  };

  return {
    runId: 'run_test',
    workspaceId: 'ws_test',
    agent,
    modelId: 'test-model',
    provider,
    fallbacks: [],
    r2: makeR2(),
    systemPrompt: 'test prompt',
  };
}

describe('specialist workbench artifacts', () => {
  it('runRoadmapAuthor returns parsed workflow workbenchArtifact', async () => {
    const artifact = await runRoadmapAuthor({
      ctx: makeCtx('roadmap_author', {
        kind: 'roadmap',
        title: 'Launch workflow',
        steps: [
          { index: 1, title: 'Collect inputs', body: 'Collect the client inputs in the intake form.', citationIds: ['seg_1'] },
          { index: 2, title: 'Draft sequence', body: 'Draft the workflow sequence from the sourced steps.', citationIds: ['seg_2'] },
          { index: 3, title: 'Verify output', body: 'Verify the output against the success signal.', citationIds: ['seg_3'] },
        ],
        workbenchArtifact: {
          type: 'workflow',
          title: 'Launch workflow',
          body: 'Use this workflow to collect inputs, draft the sequence, and verify the output against source-backed success signals.',
          citationIds: ['seg_1'],
        },
      }),
      plan: SAMPLE_PLAN,
      canonNodes: [],
      channelProfilePayload: {},
    });

    assert.equal(artifact.workbenchArtifact?.type, 'workflow');
    assert.equal(artifact.workbenchArtifact?.citationIds[0], 'seg_1');
  });

  it('runExampleAuthor returns parsed template workbenchArtifact', async () => {
    const artifact = await runExampleAuthor({
      ctx: makeCtx('example_author', {
        kind: 'hypothetical_example',
        setup: 'Maya runs a three-person email agency and needs to reuse the creator workflow for a new SaaS lead.',
        stepsTaken: [
          'Maya captured the source-backed intake fields in one client brief.',
          'Maya copied the proposal sections into the reusable draft template.',
          'Maya checked each section against the cited success signal.',
        ],
        outcome: 'She produced a reusable template and sent a $4,500 proposal within 11 days.',
        citationIds: ['seg_1', 'seg_2'],
        workbenchArtifact: {
          type: 'template',
          title: 'Proposal template',
          body: 'Copy this template to capture source-backed inputs, draft the proposal sections, and check the result before sending.',
          citationIds: ['seg_1'],
        },
      }),
      plan: SAMPLE_PLAN,
      canonNodes: [],
      channelProfilePayload: {},
    });

    assert.equal(artifact.workbenchArtifact?.type, 'template');
  });

  it('runMistakesAuthor returns parsed mistake_map workbenchArtifact', async () => {
    const artifact = await runMistakesAuthor({
      ctx: makeCtx('mistakes_author', {
        kind: 'common_mistakes',
        items: [
          { mistake: 'Do not skip intake evidence.', why: 'The draft loses source support.', correction: 'Collect the cited inputs first.', citationIds: ['seg_1'] },
          { mistake: 'Do not merge unrelated steps.', why: 'The reader cannot verify completion.', correction: 'Keep each step atomic.', citationIds: ['seg_2'] },
          { mistake: 'Do not omit the success signal.', why: 'The reader cannot know if it worked.', correction: 'End with a measurable check.', citationIds: ['seg_3'] },
        ],
        workbenchArtifact: {
          type: 'mistake_map',
          title: 'Mistake map',
          body: 'Use this mistake map to spot missing evidence, over-combined steps, and absent success signals before publishing.',
          citationIds: ['seg_1'],
        },
      }),
      plan: SAMPLE_PLAN,
      canonNodes: [],
      vicMistakes: [],
      channelProfilePayload: {},
    });

    assert.equal(artifact.workbenchArtifact?.type, 'mistake_map');
  });
});

describe('prose author contract', () => {
  it('rejects more than five paragraphs', async () => {
    await assert.rejects(
      () => runProseAuthor({
        ctx: makeCtx('prose_author', {
          kind: 'cited_prose',
          paragraphs: Array.from({ length: 6 }, (_, index) => ({
            body: `Paragraph ${index + 1} opens with a concrete action and cites source-backed segment evidence.`,
            citationIds: [`seg_${index + 1}`],
          })),
        }),
        plan: SAMPLE_PLAN,
        canonNodes: [],
        segmentExcerpts: [],
        channelProfilePayload: {},
      }),
      /paragraphs/,
    );
  });

  it('documents concise action-first prose requirements in the runtime prompt', () => {
    assert.match(PROSE_AUTHOR_PROMPT, /reader job\/outcome/i);
    assert.match(PROSE_AUTHOR_PROMPT, /3-5 paragraphs/i);
    assert.match(PROSE_AUTHOR_PROMPT, /Every paragraph MUST have a non-empty citationIds array/i);
  });
});
