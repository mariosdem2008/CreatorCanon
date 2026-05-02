'use client';

import { useMemo, useState } from 'react';

import type { CalculatorComponent } from '@creatorcanon/synthesis';

/**
 * Interactive calculator with sandboxed formula evaluation.
 *
 * Re-uses the formula evaluator from @creatorcanon/synthesis. Variables
 * accept user input; formula recomputes on every change.
 *
 * Phase A: minimal UI; Phase B adds slider inputs + chart of break-even
 * sensitivity.
 */
export function CalculatorPage({
  calculator,
  evaluateFormula,
  primaryColor,
}: {
  calculator: CalculatorComponent;
  /**
   * Inject the evaluator from `@creatorcanon/synthesis/composers/calculator-forge`.
   * Done via prop so this client component does not pull the synthesis package
   * directly and bloat the client bundle. The page-level wrapper resolves it.
   */
  evaluateFormula: (formula: string, vars: Record<string, number>) => number;
  primaryColor: string;
}) {
  const [vars, setVars] = useState<Record<string, number>>(() =>
    Object.fromEntries(calculator.variables.map((v) => [v.id, v.defaultValue])),
  );

  const result = useMemo(() => {
    try {
      const value = evaluateFormula(calculator.formula, vars);
      if (!Number.isFinite(value)) return null;
      return value;
    } catch {
      return null;
    }
  }, [calculator.formula, vars, evaluateFormula]);

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '64px 24px', fontFamily: 'system-ui' }}>
      <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 8 }}>{calculator.title}</h1>
      <p style={{ color: '#444', marginBottom: 32 }}>{calculator.description}</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginBottom: 32 }}>
        {calculator.variables.map((v) => (
          <div key={v.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label htmlFor={v.id} style={{ fontWeight: 600, fontSize: 14 }}>
              {v.label}
            </label>
            <input
              id={v.id}
              type="number"
              value={vars[v.id] ?? v.defaultValue}
              min={v.minValue}
              max={v.maxValue}
              onChange={(e) =>
                setVars((prev) => ({ ...prev, [v.id]: Number(e.target.value) || 0 }))
              }
              style={{
                padding: '8px 10px',
                border: '1px solid #d1d5db',
                borderRadius: 6,
                fontSize: 14,
              }}
            />
          </div>
        ))}
      </div>

      <div
        style={{
          padding: 20,
          background: '#fafafa',
          borderRadius: 12,
          borderLeft: `4px solid ${primaryColor}`,
        }}
      >
        <div style={{ fontSize: 13, color: '#666', marginBottom: 4 }}>{calculator.outputLabel}</div>
        <div style={{ fontSize: 32, fontWeight: 700 }}>
          {result === null
            ? '—'
            : `${calculator.outputUnit}${result.toLocaleString(undefined, {
                maximumFractionDigits: 2,
              })}`}
        </div>
        <p style={{ color: '#444', fontSize: 14, marginTop: 12 }}>{calculator.interpretation}</p>
      </div>
    </main>
  );
}
