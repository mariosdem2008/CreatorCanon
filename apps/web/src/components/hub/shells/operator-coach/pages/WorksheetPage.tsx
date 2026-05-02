import type { WorksheetIndexProps } from '../data-adapter';
import type { WorksheetComponent, WorksheetField } from '@creatorcanon/synthesis';

/**
 * Worksheets index + per-worksheet detail rendering.
 * Phase A: form fields with no client-side state. Phase B wires
 * localStorage save and decision-branch evaluation.
 */
export function WorksheetIndexPage({
  data,
  buildHref,
}: {
  data: WorksheetIndexProps;
  buildHref: (worksheetId: string) => string;
}) {
  return (
    <main style={{ maxWidth: 880, margin: '0 auto', padding: '64px 24px', fontFamily: 'system-ui' }}>
      <h1 style={{ fontSize: 36, fontWeight: 700, marginBottom: 16 }}>Worksheets</h1>
      <p style={{ fontSize: 18, color: '#444', marginBottom: 32 }}>
        Fillable worksheets that turn the playbooks into completed plans.
      </p>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {data.worksheets.map((w) => (
          <li
            key={w.id}
            style={{
              padding: '20px 0',
              borderBottom: '1px solid #eee',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <div>
              <a
                href={buildHref(w.id)}
                style={{ fontSize: 18, fontWeight: 600, color: '#111', textDecoration: 'none' }}
              >
                {w.title}
              </a>
              <p style={{ color: '#666', fontSize: 14, margin: '4px 0 0' }}>
                {w.fields.length} fields • ~{w.estimatedMinutes} min
              </p>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}

function renderField(field: WorksheetField): JSX.Element {
  const baseInputStyle = {
    width: '100%',
    padding: '8px 10px',
    border: '1px solid #d1d5db',
    borderRadius: 6,
    fontSize: 14,
  } as const;

  switch (field.type) {
    case 'text_short':
    case 'number':
      return (
        <input
          id={field.id}
          name={field.id}
          type={field.type === 'number' ? 'number' : 'text'}
          style={baseInputStyle}
        />
      );
    case 'text_long':
      return <textarea id={field.id} name={field.id} rows={4} style={baseInputStyle} />;
    case 'multi_choice':
      return (
        <select id={field.id} name={field.id} style={baseInputStyle}>
          {(field.options ?? []).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );
    case 'list':
      return <textarea id={field.id} name={field.id} rows={3} placeholder="One per line" style={baseInputStyle} />;
    case 'decision_branch':
      return (
        <div
          style={{
            padding: 12,
            background: '#f7f7f8',
            borderRadius: 6,
            fontSize: 14,
            color: '#444',
          }}
        >
          {(field.branches ?? []).map((b, i) => (
            <p key={i} style={{ margin: '4px 0' }}>
              <strong>If</strong> {b.trigger}: {b.thenSteps.join(' / ')}
            </p>
          ))}
        </div>
      );
    default:
      return <input id={field.id} name={field.id} type="text" style={baseInputStyle} />;
  }
}

export function WorksheetDetailPage({
  worksheet,
  primaryColor,
}: {
  worksheet: WorksheetComponent;
  primaryColor: string;
}) {
  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '64px 24px', fontFamily: 'system-ui' }}>
      <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 12 }}>{worksheet.title}</h1>
      <p style={{ color: '#444', marginBottom: 24 }}>{worksheet.setupQuestion}</p>
      <form style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {worksheet.fields.map((f) => (
          <div key={f.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label htmlFor={f.id} style={{ fontWeight: 600, fontSize: 14 }}>
              {f.label}
            </label>
            {f.helpText ? (
              <span style={{ color: '#666', fontSize: 13 }}>{f.helpText}</span>
            ) : null}
            {renderField(f)}
          </div>
        ))}
        <div
          style={{
            marginTop: 16,
            padding: 16,
            background: '#fafafa',
            borderRadius: 8,
            borderLeft: `3px solid ${primaryColor}`,
          }}
        >
          <strong>Output rubric:</strong> {worksheet.outputRubric}
        </div>
      </form>
    </main>
  );
}
