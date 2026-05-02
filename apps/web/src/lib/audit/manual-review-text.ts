import { z } from 'zod';

export const rewriteParagraphRequestSchema = z.object({
  paragraph: z.string().trim().min(1).max(8_000),
  instruction: z.string().trim().min(1).max(1_000),
});

export const paragraphRewriteResponseSchema = z.object({
  rewrittenParagraph: z.string().trim().min(1).max(8_000),
});

export interface RewritePromptInput {
  paragraph: string;
  instruction: string;
  canonTitle?: string | null;
}

export interface UpdateCanonPayloadParagraphInput {
  paragraph: string;
  rewrittenParagraph: string;
  instruction: string;
}

export interface ManualReviewMetadata {
  rewriteCount: number;
  lastInstruction: string;
  lastEditedAt: string;
  lastOriginalParagraph: string;
  lastRewrittenParagraph: string;
}

export type CanonPayloadWithManualReview = Record<string, unknown> & {
  body?: string;
  title?: string;
  _manual_review?: Partial<ManualReviewMetadata>;
};

export function splitManualReviewParagraphs(body: string): string[] {
  const trimmed = body.trim();
  if (!trimmed) return [];
  return trimmed
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

export function buildParagraphRewritePrompt(input: RewritePromptInput): string {
  return [
    `You are revising one paragraph inside a CreatorCanon audit canon page.`,
    input.canonTitle ? `Canon title: ${input.canonTitle}` : '',
    '',
    `Operator instruction: ${input.instruction}`,
    '',
    `Original paragraph:`,
    input.paragraph,
    '',
    `Rules:`,
    `- Rewrite only this paragraph.`,
    `- Preserve citation tokens like [11111111-1111-4111-8111-111111111111] exactly.`,
    `- Preserve visual moment markers like [VM:vm_123] exactly.`,
    `- Keep the meaning and evidence support intact.`,
    `- Make the paragraph sharper, clearer, and closer to the instruction.`,
    '',
    `Output one JSON object only:`,
    `{ "rewrittenParagraph": "<rewritten paragraph>" }`,
  ].filter(Boolean).join('\n');
}

export function updateCanonPayloadParagraph(
  payload: CanonPayloadWithManualReview,
  input: UpdateCanonPayloadParagraphInput,
): CanonPayloadWithManualReview {
  const currentBody = typeof payload.body === 'string' ? payload.body : '';
  if (!currentBody) {
    throw new Error('Canon payload has no body to rewrite.');
  }

  const index = currentBody.indexOf(input.paragraph);
  if (index < 0) {
    throw new Error('Requested paragraph was not found in the canon body.');
  }

  const rewrittenParagraph = input.rewrittenParagraph.trim();
  const nextBody = [
    currentBody.slice(0, index),
    rewrittenParagraph,
    currentBody.slice(index + input.paragraph.length),
  ].join('');

  const previousReview = payload._manual_review ?? {};
  const previousCount = typeof previousReview.rewriteCount === 'number'
    ? previousReview.rewriteCount
    : 0;

  return {
    ...payload,
    body: nextBody,
    _manual_review: {
      ...previousReview,
      rewriteCount: previousCount + 1,
      lastInstruction: input.instruction,
      lastEditedAt: new Date().toISOString(),
      lastOriginalParagraph: input.paragraph,
      lastRewrittenParagraph: rewrittenParagraph,
    },
  };
}
