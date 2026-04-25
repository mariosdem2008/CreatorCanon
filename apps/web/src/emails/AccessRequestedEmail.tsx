/**
 * Sent to the operator when someone submits /request-access. Minimal inline
 * styles because email clients mangle CSS-in-JS.
 */
export interface AccessRequestedEmailProps {
  email: string;
  ip: string | null;
  submittedAt: string;
}

const wrapStyle = {
  fontFamily: 'system-ui, -apple-system, sans-serif',
  color: '#1a1a1a',
  maxWidth: 520,
  margin: '0 auto',
  padding: 24,
} as const;

const kvStyle = {
  fontSize: 14,
  lineHeight: 1.5,
  margin: '8px 0',
} as const;

export default function AccessRequestedEmail({
  email,
  ip,
  submittedAt,
}: AccessRequestedEmailProps) {
  return (
    <html>
      <body style={wrapStyle}>
        <h1 style={{ fontSize: 22, margin: 0, fontWeight: 600 }}>
          New alpha access request
        </h1>
        <p style={kvStyle}>
          <strong>Email:</strong> <code>{email}</code>
        </p>
        <p style={kvStyle}>
          <strong>IP:</strong> <code>{ip ?? '\u2014'}</code>
        </p>
        <p style={kvStyle}>
          <strong>Submitted:</strong> {submittedAt}
        </p>
        <hr
          style={{
            marginTop: 24,
            border: 'none',
            borderTop: '1px solid #eee',
          }}
        />
        <p style={{ fontSize: 13, color: '#666', marginTop: 16 }}>
          To approve, run in Neon SQL Editor:
        </p>
        <pre
          style={{
            fontSize: 12,
            background: '#f5f5f5',
            padding: 12,
            borderRadius: 4,
            overflow: 'auto',
          }}
        >{`UPDATE allowlist_email
SET approved = true, approved_at = NOW()
WHERE email = '${email}';`}</pre>
      </body>
    </html>
  );
}
