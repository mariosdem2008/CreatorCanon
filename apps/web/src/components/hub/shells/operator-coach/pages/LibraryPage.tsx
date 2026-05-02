/**
 * Library page — de-emphasized for operator-coach hubs (the action plan
 * + worksheets + calculators are the headline products; library is a
 * reference tail). Phase A renders only a stub message; Phase B will
 * link out to the existing creator-manual library if the workspace has
 * one provisioned.
 */
export function LibraryPage() {
  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '64px 24px', fontFamily: 'system-ui' }}>
      <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 12 }}>Reference library</h1>
      <p style={{ color: '#444', fontSize: 16 }}>
        The operator-coach hub focuses on action plans, worksheets, and calculators. The
        knowledge library is available on request — contact your hub owner.
      </p>
    </main>
  );
}
