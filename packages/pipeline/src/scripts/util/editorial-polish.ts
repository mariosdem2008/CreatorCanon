export interface SentenceCadenceAnalysis {
  sentenceWordCounts: number[];
  longSentenceRuns: Array<{ start: number; count: number }>;
  mean: number;
  standardDeviation: number;
  lowVariance: boolean;
}

export interface EditorialPolishResult {
  body: string;
  changes: Array<'dashes' | 'quotes' | 'oxford_commas'>;
  cadence: SentenceCadenceAnalysis;
}

export function normalizeDashes(input: string): string {
  return input.replace(/(?<=\w)\s+(?:--|—|–|-)\s+(?=\w)/g, ' — ');
}

export function normalizeQuotes(input: string): string {
  return input
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'");
}

export function addOxfordCommas(input: string): string {
  return input.replace(
    /\b([A-Za-z][A-Za-z -]{1,40}), ([A-Za-z][A-Za-z -]{1,40}) and ([A-Za-z][A-Za-z -]{1,40})(?=[.!?,"'])/g,
    '$1, $2, and $3',
  );
}

export function analyzeSentenceCadence(input: string): SentenceCadenceAnalysis {
  const sentences = input
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const counts = sentences.map((s) => s.split(/\s+/).filter(Boolean).length);
  const mean = counts.length > 0 ? counts.reduce((a, b) => a + b, 0) / counts.length : 0;
  const variance = counts.length > 0
    ? counts.reduce((sum, count) => sum + Math.pow(count - mean, 2), 0) / counts.length
    : 0;
  const standardDeviation = Math.sqrt(variance);
  const longSentenceRuns: Array<{ start: number; count: number }> = [];
  let runStart = -1;
  let runCount = 0;
  for (let i = 0; i < counts.length; i += 1) {
    if ((counts[i] ?? 0) > 35) {
      if (runStart === -1) runStart = i;
      runCount += 1;
    } else {
      if (runCount >= 3) longSentenceRuns.push({ start: runStart, count: runCount });
      runStart = -1;
      runCount = 0;
    }
  }
  if (runCount >= 3) longSentenceRuns.push({ start: runStart, count: runCount });

  return {
    sentenceWordCounts: counts,
    longSentenceRuns,
    mean,
    standardDeviation,
    lowVariance: counts.length >= 4 && standardDeviation < 2,
  };
}

export function polishBody(input: string): EditorialPolishResult {
  let body = input;
  const changes: EditorialPolishResult['changes'] = [];

  const dashed = normalizeDashes(body);
  if (dashed !== body) {
    body = dashed;
    changes.push('dashes');
  }

  const quoted = normalizeQuotes(body);
  if (quoted !== body) {
    body = quoted;
    changes.push('quotes');
  }

  const oxford = addOxfordCommas(body);
  if (oxford !== body) {
    body = oxford;
    changes.push('oxford_commas');
  }

  return {
    body,
    changes,
    cadence: analyzeSentenceCadence(body),
  };
}
