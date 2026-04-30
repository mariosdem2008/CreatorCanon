/**
 * Vision provider abstraction for visual-moment frame classification.
 *
 * Three providers are supported:
 *   - gemini  → Google Gemini 2.0 Flash (multimodal). Free tier: ~1500 RPD.
 *   - ollama  → Local Ollama HTTP API (e.g. llama3.2-vision:11b). Unbounded
 *               but requires the model to be pulled and Ollama running.
 *   - groq    → Groq llama-4-scout-17b-16e-instruct. Original. Daily TPD
 *               limit on the free tier.
 *
 * The runtime picks a fallback chain via the VISUAL_MOMENTS_PROVIDERS env
 * var (csv list of provider names, in priority order). On a quota error
 * (429 or our heuristics for "out of tokens"), the runner falls through to
 * the next provider in the chain. Non-quota errors propagate as warnings
 * and the frame is skipped.
 *
 * Default chain: "gemini,ollama,groq".
 */

import fs from 'node:fs/promises';

import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';

export interface FrameClassification {
  isUseful: boolean;
  type: string;
  description: string;
  extractedText: string;
  hubUse: string;
  usefulnessScore: number;
  visualClaims: string[];
  warnings: string[];
}

export type ProviderName = 'gemini' | 'ollama' | 'groq';

export interface VisionProvider {
  name: ProviderName;
  /** Classify a single JPEG frame. Throws on transient/quota errors. */
  classify(jpgPath: string, prompt: string): Promise<FrameClassification>;
  /** True when the supplied error is a quota / rate-limit signal. */
  isQuotaError(err: Error): boolean;
  /** True when this provider's required credentials / setup are present. */
  isAvailable(): boolean;
  /** Human-readable description of why the provider is or isn't ready. */
  describeReadiness(): string;
}

// ── Shared parsing ────────────────────────────────────────────────────────

function coerceClassification(parsed: Partial<FrameClassification>): FrameClassification {
  return {
    isUseful: Boolean(parsed.isUseful),
    type: typeof parsed.type === 'string' ? parsed.type : 'other',
    description: typeof parsed.description === 'string' ? parsed.description : '',
    extractedText: typeof parsed.extractedText === 'string' ? parsed.extractedText : '',
    hubUse: typeof parsed.hubUse === 'string' ? parsed.hubUse : '',
    usefulnessScore: typeof parsed.usefulnessScore === 'number' ? parsed.usefulnessScore : 0,
    visualClaims: Array.isArray(parsed.visualClaims) ? parsed.visualClaims.map(String) : [],
    warnings: Array.isArray(parsed.warnings) ? parsed.warnings.map(String) : [],
  };
}

/** Extract the first JSON object from a model's text response. */
function extractJsonObject(raw: string): Partial<FrameClassification> {
  const trimmed = raw.trim();
  // Strip ```json fences if present.
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const candidate = fenced ? fenced[1]! : trimmed;
  // Find the first { and last } so trailing prose doesn't break parsing.
  const first = candidate.indexOf('{');
  const last = candidate.lastIndexOf('}');
  if (first < 0 || last < first) {
    throw new Error(`vision provider returned non-JSON (preview: ${candidate.slice(0, 200)})`);
  }
  return JSON.parse(candidate.slice(first, last + 1));
}

// ── Gemini ─────────────────────────────────────────────────────────────────

const GEMINI_MODEL = process.env.VISUAL_MOMENTS_GEMINI_MODEL?.trim() || 'gemini-2.0-flash';

class GeminiProvider implements VisionProvider {
  readonly name: ProviderName = 'gemini';
  private client: GoogleGenerativeAI | null = null;

  isAvailable(): boolean {
    return Boolean(process.env.GEMINI_API_KEY);
  }

  describeReadiness(): string {
    return this.isAvailable()
      ? `gemini ready (model=${GEMINI_MODEL})`
      : `gemini not available — set GEMINI_API_KEY`;
  }

  isQuotaError(err: Error): boolean {
    const msg = err.message.toLowerCase();
    return msg.includes('429') ||
      msg.includes('quota') ||
      msg.includes('rate limit') ||
      msg.includes('resource_exhausted') ||
      msg.includes('too many requests');
  }

  async classify(jpgPath: string, prompt: string): Promise<FrameClassification> {
    if (!this.client) {
      const key = process.env.GEMINI_API_KEY!;
      this.client = new GoogleGenerativeAI(key);
    }
    const model = this.client.getGenerativeModel({
      model: GEMINI_MODEL,
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.2,
        maxOutputTokens: 1024,
      },
    });

    const bytes = await fs.readFile(jpgPath);
    const base64 = bytes.toString('base64');
    const result = await model.generateContent([
      { text: prompt },
      { inlineData: { mimeType: 'image/jpeg', data: base64 } },
    ]);
    const text = result.response.text();
    return coerceClassification(extractJsonObject(text));
  }
}

// ── Ollama (local) ─────────────────────────────────────────────────────────

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL?.trim() || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.VISUAL_MOMENTS_OLLAMA_MODEL?.trim() || 'llama3.2-vision:11b';

class OllamaProvider implements VisionProvider {
  readonly name: ProviderName = 'ollama';
  private modelChecked = false;
  private modelPresent = false;

  isAvailable(): boolean {
    // We can only know if Ollama is running and the model is pulled at
    // call time. Optimistically return true and let classify() throw a
    // descriptive non-quota error if it isn't ready — the runner skips the
    // frame and the chain falls through.
    return true;
  }

  describeReadiness(): string {
    return `ollama ready (base=${OLLAMA_BASE_URL}, model=${OLLAMA_MODEL}). Pull with: ollama pull ${OLLAMA_MODEL}`;
  }

  isQuotaError(_err: Error): boolean {
    // Ollama is local — there is no quota. Connection refused or model-
    // not-found should fall through to other providers, so treat them as
    // "quota-like" for chain purposes.
    const msg = _err.message.toLowerCase();
    return msg.includes('econnrefused') ||
      msg.includes('not found') ||
      msg.includes('model not found') ||
      msg.includes('pull the model') ||
      msg.includes('fetch failed');
  }

  private async ensureModelOnce(): Promise<void> {
    if (this.modelChecked) {
      if (!this.modelPresent) throw new Error(`ollama model not found: ${OLLAMA_MODEL} — pull with "ollama pull ${OLLAMA_MODEL}"`);
      return;
    }
    this.modelChecked = true;
    const r = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
    if (!r.ok) throw new Error(`ollama tags request failed: ${r.status}`);
    const data = await r.json() as { models?: Array<{ name?: string }> };
    const present = (data.models ?? []).some((m) => m.name === OLLAMA_MODEL);
    this.modelPresent = present;
    if (!present) throw new Error(`ollama model not found: ${OLLAMA_MODEL} — pull with "ollama pull ${OLLAMA_MODEL}"`);
  }

  async classify(jpgPath: string, prompt: string): Promise<FrameClassification> {
    await this.ensureModelOnce();
    const bytes = await fs.readFile(jpgPath);
    const base64 = bytes.toString('base64');
    const r = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt,
        images: [base64],
        format: 'json',
        stream: false,
        options: { temperature: 0.2 },
      }),
    });
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      throw new Error(`ollama generate ${r.status}: ${body.slice(0, 300)}`);
    }
    const data = await r.json() as { response?: string };
    const responseText = data.response ?? '{}';
    return coerceClassification(extractJsonObject(responseText));
  }
}

// ── Groq ───────────────────────────────────────────────────────────────────

const GROQ_MODEL = process.env.GROQ_VISION_MODEL?.trim() || 'meta-llama/llama-4-scout-17b-16e-instruct';

class GroqProvider implements VisionProvider {
  readonly name: ProviderName = 'groq';
  private client: OpenAI | null = null;

  isAvailable(): boolean {
    return Boolean(process.env.GROQ_API_KEY);
  }

  describeReadiness(): string {
    return this.isAvailable()
      ? `groq ready (model=${GROQ_MODEL})`
      : `groq not available — set GROQ_API_KEY`;
  }

  isQuotaError(err: Error): boolean {
    const msg = err.message.toLowerCase();
    return msg.includes('429') ||
      msg.includes('rate limit') ||
      msg.includes('tokens per day') ||
      msg.includes('tokens per minute');
  }

  async classify(jpgPath: string, prompt: string): Promise<FrameClassification> {
    if (!this.client) {
      this.client = new OpenAI({
        apiKey: process.env.GROQ_API_KEY!,
        baseURL: 'https://api.groq.com/openai/v1',
      });
    }
    const bytes = await fs.readFile(jpgPath);
    const base64 = bytes.toString('base64');
    const response = await this.client.chat.completions.create({
      model: GROQ_MODEL,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64}` } },
          ],
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
      max_tokens: 1024,
    });
    const content = response.choices[0]?.message?.content ?? '{}';
    return coerceClassification(extractJsonObject(content));
  }
}

// ── Chain runner ───────────────────────────────────────────────────────────

const ALL: Record<ProviderName, VisionProvider> = {
  gemini: new GeminiProvider(),
  ollama: new OllamaProvider(),
  groq: new GroqProvider(),
};

const DEFAULT_CHAIN: ProviderName[] = ['gemini', 'ollama', 'groq'];

function parseChainEnv(): ProviderName[] {
  const raw = process.env.VISUAL_MOMENTS_PROVIDERS?.trim();
  if (!raw) return DEFAULT_CHAIN;
  const tokens = raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const valid = tokens.filter((t): t is ProviderName => t === 'gemini' || t === 'ollama' || t === 'groq');
  if (valid.length === 0) {
    console.warn(`[vision] VISUAL_MOMENTS_PROVIDERS="${raw}" had no valid providers; using default ${DEFAULT_CHAIN.join(',')}`);
    return DEFAULT_CHAIN;
  }
  return valid;
}

export interface ChainRunner {
  /** The active chain (filtered to providers reporting isAvailable=true). */
  chain: VisionProvider[];
  /** Provider names that were configured but skipped due to missing credentials. */
  skipped: Array<{ name: ProviderName; reason: string }>;
  /** Per-provider quota-tripped flag — once a provider 429s, future calls skip it. */
  exhausted: Set<ProviderName>;
  classify(jpgPath: string, prompt: string): Promise<{ classification: FrameClassification; provider: ProviderName }>;
  describe(): string;
}

export function buildChain(): ChainRunner {
  const requested = parseChainEnv();
  const chain: VisionProvider[] = [];
  const skipped: Array<{ name: ProviderName; reason: string }> = [];
  for (const name of requested) {
    const p = ALL[name];
    if (!p) continue;
    if (p.isAvailable()) chain.push(p);
    else skipped.push({ name, reason: p.describeReadiness() });
  }
  const exhausted = new Set<ProviderName>();

  async function classify(jpgPath: string, prompt: string) {
    let lastErr: Error | null = null;
    for (const provider of chain) {
      if (exhausted.has(provider.name)) continue;
      try {
        const cls = await provider.classify(jpgPath, prompt);
        return { classification: cls, provider: provider.name };
      } catch (err) {
        lastErr = err as Error;
        if (provider.isQuotaError(lastErr)) {
          if (!exhausted.has(provider.name)) {
            console.warn(`[vision] ${provider.name} quota/setup error — falling through chain: ${lastErr.message.slice(0, 200)}`);
            exhausted.add(provider.name);
          }
          continue;
        }
        // Non-quota error from this provider: bubble up so caller skips this frame.
        throw lastErr;
      }
    }
    if (lastErr) throw lastErr;
    throw new Error('vision chain exhausted: every provider has been marked quota-tripped');
  }

  function describe(): string {
    const parts: string[] = [];
    parts.push(`active=[${chain.map((p) => p.name).join(',') || '(empty)'}]`);
    if (skipped.length > 0) parts.push(`skipped=[${skipped.map((s) => `${s.name}:${s.reason}`).join('; ')}]`);
    return parts.join(' · ');
  }

  return { chain, skipped, exhausted, classify, describe };
}
