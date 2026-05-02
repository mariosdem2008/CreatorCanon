import OpenAI from 'openai';

export interface TextEmbeddingProvider {
  embed(texts: string[]): Promise<number[][]>;
}

export interface VoiceSourceSegment {
  text: string;
}

export type VoiceFingerprintStatus = 'ok' | 'voice_drift' | 'insufficient_source';

export interface VoiceFingerprintScoreInput {
  renderedBody: string;
  sourceTranscript: string | VoiceSourceSegment[];
  embedder: TextEmbeddingProvider;
  threshold?: number;
  creatorName?: string;
  preserveTerms?: string[];
  maxSourceChars?: number;
}

export interface VoiceFingerprintScore {
  similarity: number;
  threshold: number;
  status: VoiceFingerprintStatus;
  shouldRetry: boolean;
  retryGuidance: string;
  sourceSample: string;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`cosineSimilarity dimension mismatch: ${a.length} !== ${b.length}`);
  }
  if (a.length === 0) return 0;

  let dot = 0;
  let aNorm = 0;
  let bNorm = 0;
  for (let i = 0; i < a.length; i += 1) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    aNorm += av * av;
    bNorm += bv * bv;
  }
  if (aNorm === 0 || bNorm === 0) return 0;
  return dot / (Math.sqrt(aNorm) * Math.sqrt(bNorm));
}

export function sampleTranscriptForVoice(
  segments: VoiceSourceSegment[] | string[],
  options: { maxChars?: number } = {},
): string {
  const maxChars = Math.max(1, options.maxChars ?? 12_000);
  const texts = segments
    .map((segment) => (typeof segment === 'string' ? segment : segment.text))
    .map((text) => text.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  if (texts.length === 0) return '';

  const selected = texts.length <= 3
    ? texts
    : [texts[0]!, texts[Math.floor((texts.length - 1) / 2)]!, texts[texts.length - 1]!];
  const separatorBudget = Math.max(0, selected.length - 1) * 2;
  const full = selected.join('\n\n');
  if (full.length <= maxChars) return full;

  const perChunkBudget = Math.max(1, Math.floor((maxChars - separatorBudget) / selected.length));
  const clipped = selected.map((text) => text.slice(0, perChunkBudget).trimEnd());
  return clipped.join('\n\n').slice(0, maxChars).trimEnd();
}

export function buildVoiceDriftRetryGuidance(input: {
  creatorName?: string;
  preserveTerms?: string[];
  similarity: number;
  threshold: number;
}): string {
  const creator = input.creatorName?.trim() || 'the creator';
  const preserveTerms = (input.preserveTerms ?? []).filter(Boolean).slice(0, 12);
  return [
    `Voice fingerprint drift detected: embedding similarity ${input.similarity.toFixed(2)} is below the ${input.threshold.toFixed(2)} threshold.`,
    `Rewrite as ${creator}, closer to the source transcript cadence, vocabulary, sentence length, and teaching rhythm.`,
    preserveTerms.length > 0
      ? `Preserve these terms verbatim when natural: ${preserveTerms.join(', ')}.`
      : `Preserve distinctive recurring terms from the transcript instead of smoothing them into generic editorial language.`,
    `Avoid generic essay voice. Keep the same facts and citations, but make the prose sound more like the source speaker.`,
  ].join('\n');
}

export async function scoreVoiceFingerprint(input: VoiceFingerprintScoreInput): Promise<VoiceFingerprintScore> {
  const threshold = input.threshold ?? 0.6;
  const renderedBody = input.renderedBody.replace(/\s+/g, ' ').trim();
  const sourceSample = typeof input.sourceTranscript === 'string'
    ? input.sourceTranscript.replace(/\s+/g, ' ').trim().slice(0, input.maxSourceChars ?? 12_000)
    : sampleTranscriptForVoice(input.sourceTranscript, { maxChars: input.maxSourceChars });

  if (!renderedBody || !sourceSample) {
    return {
      similarity: 0,
      threshold,
      status: 'insufficient_source',
      shouldRetry: false,
      retryGuidance: '',
      sourceSample,
    };
  }

  const embeddings = await input.embedder.embed([renderedBody, sourceSample]);
  if (embeddings.length !== 2) {
    throw new Error(`voice fingerprint embedder returned ${embeddings.length} embeddings, expected 2`);
  }

  const similarity = cosineSimilarity(embeddings[0]!, embeddings[1]!);
  const status: VoiceFingerprintStatus = similarity < threshold ? 'voice_drift' : 'ok';
  return {
    similarity,
    threshold,
    status,
    shouldRetry: status === 'voice_drift',
    retryGuidance: status === 'voice_drift'
      ? buildVoiceDriftRetryGuidance({
        creatorName: input.creatorName,
        preserveTerms: input.preserveTerms,
        similarity,
        threshold,
      })
      : '',
    sourceSample,
  };
}

export function createOpenAIEmbeddingProvider(options: {
  apiKey?: string;
  model?: string;
} = {}): TextEmbeddingProvider {
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('createOpenAIEmbeddingProvider: apiKey is required (set OPENAI_API_KEY in env).');
  }
  const client = new OpenAI({ apiKey });
  const model = options.model ?? 'text-embedding-3-small';

  return {
    async embed(texts: string[]): Promise<number[][]> {
      const response = await client.embeddings.create({
        model,
        input: texts,
      });
      return response.data
        .slice()
        .sort((a, b) => a.index - b.index)
        .map((item) => item.embedding);
    },
  };
}
