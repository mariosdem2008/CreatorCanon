/**
 * Calculator Forge — turns clusters of quantified claims into interactive
 * calculators.
 *
 * Pipeline:
 *   1. extractQuantifiedClaims: regex-scan canon bodies for $X, X%, Xx ROI,
 *      X months payback, X:Y LTV/CAC.
 *   2. clusterClaims: group claims by topic via context-window keyword
 *      analysis (LTV/CAC, monthly revenue, payback, retention, conversion).
 *   3. For each cluster meeting size threshold (>=3), Codex authors a
 *      calculator schema (title, variables, formula, interpretation).
 *   4. Validate formula via evaluateFormula on default values; reject
 *      calculators whose formula fails.
 *
 * Formula evaluator is a hand-rolled recursive-descent parser supporting
 * + - * / parentheses, unary minus, numeric literals, and identifier
 * variables. NO Math.X, NO eval(), NO Function(). Variables come from the
 * caller-supplied object.
 */

import type {
  CalculatorComponent,
  CanonRef,
  CodexClient,
  ComposeInput,
} from '../types';

// ---------- Claim extraction ----------

export type QuantifiedClaimKind =
  | 'currency'
  | 'percentage'
  | 'roi_multiplier'
  | 'months_payback'
  | 'ltv_cac_ratio';

export interface QuantifiedClaim {
  kind: QuantifiedClaimKind;
  value: number;
  raw: string;
  /** 50-char context window before the match (lower-cased). */
  contextBefore: string;
  /** 50-char context window after the match (lower-cased). */
  contextAfter: string;
  canonId: string;
}

const CURRENCY_RE = /\$([0-9][0-9,]*(?:\.[0-9]+)?)/g;
const PERCENT_RE = /([0-9]+(?:\.[0-9]+)?)\s*%/g;
const ROI_RE = /\b([0-9]+(?:\.[0-9]+)?)\s*x\s+ROI/gi;
const MONTHS_RE = /\b([0-9]+)\s+months?\s+payback/gi;
const RATIO_RE = /\b([0-9]+)\s*:\s*([0-9]+)\s+LTV(?:\s*\/\s*|\s+to\s+)CAC/gi;

function contextWindow(body: string, start: number, end: number): { before: string; after: string } {
  const before = body.slice(Math.max(0, start - 50), start).toLowerCase();
  const after = body.slice(end, Math.min(body.length, end + 50)).toLowerCase();
  return { before, after };
}

export function extractQuantifiedClaims(body: string, canonId = 'unknown'): QuantifiedClaim[] {
  const claims: QuantifiedClaim[] = [];

  for (const m of body.matchAll(CURRENCY_RE)) {
    const value = Number(m[1]!.replace(/,/g, ''));
    if (!Number.isFinite(value)) continue;
    const ctx = contextWindow(body, m.index ?? 0, (m.index ?? 0) + m[0].length);
    claims.push({
      kind: 'currency',
      value,
      raw: m[0],
      contextBefore: ctx.before,
      contextAfter: ctx.after,
      canonId,
    });
  }
  for (const m of body.matchAll(PERCENT_RE)) {
    const value = Number(m[1]!);
    if (!Number.isFinite(value)) continue;
    const ctx = contextWindow(body, m.index ?? 0, (m.index ?? 0) + m[0].length);
    claims.push({
      kind: 'percentage',
      value,
      raw: m[0],
      contextBefore: ctx.before,
      contextAfter: ctx.after,
      canonId,
    });
  }
  for (const m of body.matchAll(ROI_RE)) {
    const value = Number(m[1]!);
    if (!Number.isFinite(value)) continue;
    const ctx = contextWindow(body, m.index ?? 0, (m.index ?? 0) + m[0].length);
    claims.push({
      kind: 'roi_multiplier',
      value,
      raw: m[0],
      contextBefore: ctx.before,
      contextAfter: ctx.after,
      canonId,
    });
  }
  for (const m of body.matchAll(MONTHS_RE)) {
    const value = Number(m[1]!);
    if (!Number.isFinite(value)) continue;
    const ctx = contextWindow(body, m.index ?? 0, (m.index ?? 0) + m[0].length);
    claims.push({
      kind: 'months_payback',
      value,
      raw: m[0],
      contextBefore: ctx.before,
      contextAfter: ctx.after,
      canonId,
    });
  }
  for (const m of body.matchAll(RATIO_RE)) {
    const ratio = Number(m[1]!) / Number(m[2]!);
    if (!Number.isFinite(ratio)) continue;
    const ctx = contextWindow(body, m.index ?? 0, (m.index ?? 0) + m[0].length);
    claims.push({
      kind: 'ltv_cac_ratio',
      value: ratio,
      raw: m[0],
      contextBefore: ctx.before,
      contextAfter: ctx.after,
      canonId,
    });
  }

  return claims;
}

// ---------- Clustering ----------

const TOPIC_KEYWORDS: Record<string, RegExp> = {
  unit_economics: /\b(ltv|cac|lifetime|payback|unit economics|margin)\b/i,
  pricing: /\b(price|pricing|tier|premium|discount|charge)\b/i,
  conversion: /\b(conversion|convert|funnel|opt[- ]in|signup|sign[- ]up|landing)\b/i,
  retention: /\b(retention|churn|repeat|loyalty|stick)\b/i,
  acquisition: /\b(acquisition|acquire|cold|outreach|ads|paid)\b/i,
};

function topicForClaim(claim: QuantifiedClaim): string {
  const ctx = `${claim.contextBefore} ${claim.contextAfter}`;
  for (const [topic, re] of Object.entries(TOPIC_KEYWORDS)) {
    if (re.test(ctx)) return topic;
  }
  return 'general';
}

export function clusterClaims(claims: QuantifiedClaim[]): Map<string, QuantifiedClaim[]> {
  const buckets = new Map<string, QuantifiedClaim[]>();
  for (const c of claims) {
    const topic = topicForClaim(c);
    const list = buckets.get(topic) ?? [];
    list.push(c);
    buckets.set(topic, list);
  }
  return buckets;
}

// ---------- Formula evaluator (sandboxed) ----------

type Token =
  | { kind: 'num'; value: number }
  | { kind: 'ident'; name: string }
  | { kind: 'op'; op: '+' | '-' | '*' | '/' }
  | { kind: 'lparen' }
  | { kind: 'rparen' };

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i]!;
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (ch === '+' || ch === '-' || ch === '*' || ch === '/') {
      tokens.push({ kind: 'op', op: ch });
      i += 1;
      continue;
    }
    if (ch === '(') {
      tokens.push({ kind: 'lparen' });
      i += 1;
      continue;
    }
    if (ch === ')') {
      tokens.push({ kind: 'rparen' });
      i += 1;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j]!)) j += 1;
      const value = Number(src.slice(i, j));
      if (!Number.isFinite(value)) throw new Error(`bad number near "${src.slice(i, j)}"`);
      tokens.push({ kind: 'num', value });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j]!)) j += 1;
      const name = src.slice(i, j);
      // Reject access expressions (Math.sqrt etc).
      if (j < src.length && src[j] === '.') {
        throw new Error(`disallowed property access on identifier "${name}"`);
      }
      tokens.push({ kind: 'ident', name });
      i = j;
      continue;
    }
    throw new Error(`unexpected character "${ch}" at position ${i}`);
  }
  return tokens;
}

/**
 * Recursive-descent: expr := term (('+'|'-') term)*; term := factor (('*'|'/') factor)*;
 * factor := number | ident | '(' expr ')' | '-' factor.
 */
export function evaluateFormula(formula: string, vars: Record<string, number>): number {
  const tokens = tokenize(formula);
  let pos = 0;

  const peek = (): Token | undefined => tokens[pos];
  const consume = (): Token => {
    const t = tokens[pos];
    if (!t) throw new Error('unexpected end of formula');
    pos += 1;
    return t;
  };

  function parseExpr(): number {
    let value = parseTerm();
    while (true) {
      const t = peek();
      if (!t || t.kind !== 'op' || (t.op !== '+' && t.op !== '-')) break;
      consume();
      const rhs = parseTerm();
      value = t.op === '+' ? value + rhs : value - rhs;
    }
    return value;
  }

  function parseTerm(): number {
    let value = parseFactor();
    while (true) {
      const t = peek();
      if (!t || t.kind !== 'op' || (t.op !== '*' && t.op !== '/')) break;
      consume();
      const rhs = parseFactor();
      value = t.op === '*' ? value * rhs : value / rhs;
    }
    return value;
  }

  function parseFactor(): number {
    const t = peek();
    if (!t) throw new Error('unexpected end of formula');
    if (t.kind === 'op' && t.op === '-') {
      consume();
      return -parseFactor();
    }
    if (t.kind === 'op' && t.op === '+') {
      consume();
      return parseFactor();
    }
    if (t.kind === 'num') {
      consume();
      return t.value;
    }
    if (t.kind === 'ident') {
      consume();
      if (!(t.name in vars)) throw new Error(`unknown variable "${t.name}"`);
      const v = vars[t.name];
      if (typeof v !== 'number' || !Number.isFinite(v)) {
        throw new Error(`variable "${t.name}" is not a finite number`);
      }
      return v;
    }
    if (t.kind === 'lparen') {
      consume();
      const v = parseExpr();
      const next = consume();
      if (next.kind !== 'rparen') throw new Error('expected ")"');
      return v;
    }
    throw new Error(`unexpected token at position ${pos}`);
  }

  const result = parseExpr();
  if (pos !== tokens.length) throw new Error('trailing tokens after formula');
  return result;
}

// ---------- Codex authoring ----------

interface RawCalculatorVariable {
  id: string;
  label: string;
  type: 'currency' | 'integer' | 'percentage' | 'months';
  defaultValue: number;
  minValue?: number;
  maxValue?: number;
}

interface RawCalculator {
  title: string;
  description: string;
  variables: RawCalculatorVariable[];
  formula: string;
  outputLabel: string;
  outputUnit: string;
  interpretation: string;
}

// Identifier regex matches the tokenizer in evaluateFormula. Reject anything
// outside this character set — including dotted names, dunder names like
// "__proto__" / "constructor", and special tokens.
const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const FORBIDDEN_IDENTS = new Set(['__proto__', 'constructor', 'prototype']);

function isSafeVariable(v: RawCalculatorVariable): boolean {
  if (typeof v?.id !== 'string') return false;
  if (!IDENT_RE.test(v.id)) return false;
  if (FORBIDDEN_IDENTS.has(v.id)) return false;
  if (typeof v.defaultValue !== 'number' || !Number.isFinite(v.defaultValue)) return false;
  return true;
}

function safeJsonParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as T;
    } catch {
      return null;
    }
  }
}

async function authorCalculatorForCluster(
  topic: string,
  claims: QuantifiedClaim[],
  codex: CodexClient,
): Promise<CalculatorComponent | null> {
  const claimSummary = claims
    .slice(0, 8)
    .map((c) => `- ${c.kind}: ${c.raw} (context: ...${c.contextBefore.slice(-30)})`)
    .join('\n');

  const prompt = [
    `You are designing one interactive calculator from these quantified claims (topic: ${topic}).`,
    'Author a calculator with named variables, a sandboxed formula, and a 1-sentence interpretation.',
    '',
    'Quantified claims observed in the canon:',
    claimSummary,
    '',
    'Output rules:',
    '- "title": short noun phrase (e.g. "LTV Calculator")',
    '- "description": 1 sentence explaining what the reader learns',
    '- "variables": array of {id, label, type ∈ {currency,integer,percentage,months}, defaultValue, minValue?, maxValue?}',
    '- "formula": expression using ONLY variable ids + operators (+ - * /) + parentheses + numeric literals.',
    '            NO Math.X. NO function calls. NO property access.',
    '- "outputLabel": noun phrase (e.g. "Lifetime value")',
    '- "outputUnit": short string ($, %, months, customers, etc.)',
    '- "interpretation": 1 sentence — "this number means..."',
    '',
    'Format: ONE JSON object. First char {, last char }. No code fences. No prose outside the JSON.',
  ].join('\n');

  const raw = await codex.run(prompt, {
    stage: 'calculator_forge',
    timeoutMs: 60_000,
    label: `calculator-forge:${topic}`,
  });
  const parsed = safeJsonParse<RawCalculator>(raw);
  if (!parsed) return null;

  // Variable ids and default values come from non-deterministic LLM output.
  // Reject anything that isn't a clean identifier — this both matches the
  // tokenizer regex and blocks prototype-pollution paths like id="__proto__".
  const variables = parsed.variables ?? [];
  if (!variables.every(isSafeVariable)) return null;

  // Object.create(null) ensures even if a future change loosens validation,
  // assignment to "__proto__" doesn't reach Object.prototype.
  const defaults: Record<string, number> = Object.create(null) as Record<string, number>;
  for (const v of variables) defaults[v.id] = v.defaultValue;
  try {
    const test = evaluateFormula(parsed.formula, defaults);
    if (!Number.isFinite(test)) return null;
  } catch {
    return null;
  }

  const sourceClaimCanonIds = [...new Set(claims.map((c) => c.canonId))];

  return {
    id: `calc_${topic}`,
    title: parsed.title,
    description: parsed.description,
    variables: parsed.variables,
    formula: parsed.formula,
    outputLabel: parsed.outputLabel,
    outputUnit: parsed.outputUnit,
    interpretation: parsed.interpretation,
    sourceClaimCanonIds,
  };
}

// ---------- Public compose ----------

const MIN_CLAIMS_PER_CALCULATOR = 3;
const MAX_CALCULATORS = 7;

export async function composeCalculators(
  input: ComposeInput,
  opts: { codex: CodexClient },
): Promise<CalculatorComponent[]> {
  const allClaims: QuantifiedClaim[] = [];
  for (const canon of input.canons) {
    const body = canon.payload.body ?? '';
    if (!body) continue;
    allClaims.push(...extractQuantifiedClaims(body, canon.id));
  }

  const buckets = clusterClaims(allClaims);
  const eligible = [...buckets.entries()]
    .filter(([, claims]) => claims.length >= MIN_CLAIMS_PER_CALCULATOR)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, MAX_CALCULATORS);

  const calculators = await Promise.all(
    eligible.map(([topic, claims]) => authorCalculatorForCluster(topic, claims, opts.codex)),
  );
  return calculators.filter((c): c is CalculatorComponent => c !== null);
}
