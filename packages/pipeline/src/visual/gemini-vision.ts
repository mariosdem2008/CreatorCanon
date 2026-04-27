import { GoogleGenerativeAI } from '@google/generative-ai';
import { z } from 'zod';

export const visionResponseSchema = z.object({
  isUseful: z.boolean(),
  type: z.enum([
    'screen_demo',
    'slide',
    'chart',
    'whiteboard',
    'code',
    'product_demo',
    'physical_demo',
    'diagram',
    'talking_head',
    'other',
  ]),
  description: z.string(),
  extractedText: z.string().default(''),
  hubUse: z.string(),
  usefulnessScore: z.number().int().min(0).max(100),
  visualClaims: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
});

export type VisionResponse = z.infer<typeof visionResponseSchema>;

/**
 * Direct Gemini Vision API call — NOT routed through the multi-turn
 * AgentProvider. One frame -> one JSON response. The vision model's
 * `responseMimeType: application/json` ensures parseable output; we
 * still validate against `visionResponseSchema` to defend against drift.
 */
export async function analyzeFrameWithGemini(input: {
  apiKey: string;
  modelId: string;
  prompt: string;
  imageBytes: Buffer;
  timestampMs: number;
}): Promise<VisionResponse> {
  if (!input.apiKey) throw new Error('GEMINI_API_KEY missing — set it in env to enable visual_context.');
  const client = new GoogleGenerativeAI(input.apiKey);
  const model = client.getGenerativeModel({
    model: input.modelId,
    generationConfig: { responseMimeType: 'application/json' },
  });
  const result = await model.generateContent([
    { text: `${input.prompt}\n\nFrame timestamp: ${input.timestampMs}ms.` },
    { inlineData: { data: input.imageBytes.toString('base64'), mimeType: 'image/jpeg' } },
  ]);
  const text = result.response.text();
  let parsedRaw: unknown;
  try {
    parsedRaw = JSON.parse(text);
  } catch {
    throw new Error(`Gemini returned non-JSON: ${text.slice(0, 200)}`);
  }
  const validated = visionResponseSchema.safeParse(parsedRaw);
  if (!validated.success) {
    const issues = validated.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new Error(`Gemini response failed schema: ${issues}`);
  }
  return validated.data;
}
