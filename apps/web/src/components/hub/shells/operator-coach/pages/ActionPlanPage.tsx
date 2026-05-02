import type { ActionPlanPageProps } from '../data-adapter';

/**
 * Action plan: phases × steps with progress markers.
 * Phase A: server-rendered, no client-side completion state. Phase B
 * adds localStorage progress tracking + checkbox interactions.
 */
export function ActionPlanPage({
  data,
  primaryColor,
}: {
  data: ActionPlanPageProps;
  primaryColor: string;
}) {
  return (
    <main style={{ maxWidth: 880, margin: '0 auto', padding: '64px 24px', fontFamily: 'system-ui' }}>
      <section style={{ marginBottom: 48 }}>
        <h1 style={{ fontSize: 36, fontWeight: 700, marginBottom: 16 }}>Your Action Plan</h1>
        <p style={{ fontSize: 18, color: '#444' }}>{data.intro}</p>
      </section>

      {data.phases.map((phase, phaseIdx) => (
        <section key={phase.id} style={{ marginBottom: 48 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 12,
              marginBottom: 16,
              paddingBottom: 8,
              borderBottom: `2px solid ${primaryColor}`,
            }}
          >
            <span
              style={{
                background: primaryColor,
                color: '#fff',
                width: 32,
                height: 32,
                borderRadius: 16,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: 14,
              }}
            >
              {phaseIdx + 1}
            </span>
            <h2 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>{phase.name}</h2>
            <span style={{ color: '#666', fontSize: 14 }}>
              {phase.steps.length} steps
            </span>
          </div>
          <ol style={{ paddingLeft: 0, listStyle: 'none', margin: 0 }}>
            {phase.steps.map((step, stepIdx) => (
              <li
                key={step.id}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 16,
                  padding: '16px 0',
                  borderBottom: '1px solid #eee',
                }}
              >
                <input
                  type="checkbox"
                  aria-label={`Mark ${step.title} complete`}
                  style={{ marginTop: 6 }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <strong style={{ fontSize: 16 }}>
                      {stepIdx + 1}. {step.title}
                    </strong>
                    <span style={{ color: '#666', fontSize: 13 }}>{step.durationLabel}</span>
                  </div>
                  <p style={{ color: '#333', margin: '4px 0' }}>{step.description}</p>
                  <p style={{ color: '#666', fontSize: 14, fontStyle: 'italic', margin: 0 }}>
                    {step.successCriterion}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      ))}

      <section style={{ paddingTop: 24, borderTop: '1px solid #eee', textAlign: 'center' }}>
        <p style={{ fontSize: 18, fontWeight: 600 }}>{data.outroCta}</p>
      </section>
    </main>
  );
}
