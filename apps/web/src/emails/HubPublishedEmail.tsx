/**
 * Sent once, immediately after a hub is first published. Plain inline
 * styles — email clients butcher CSS-in-JS and external stylesheets.
 */
export interface HubPublishedEmailProps {
  hubTitle: string;
  publicUrl: string;
  theme: string;
}

const wrapStyle = {
  fontFamily: 'system-ui, -apple-system, sans-serif',
  color: '#1a1a1a',
  maxWidth: 580,
  margin: '0 auto',
  padding: 32,
} as const;

const ctaStyle = {
  display: 'inline-block',
  padding: '12px 20px',
  background: '#1a1a1a',
  color: '#f5f2ea',
  textDecoration: 'none',
  fontWeight: 600,
  borderRadius: 6,
} as const;

export default function HubPublishedEmail({
  hubTitle,
  publicUrl,
  theme,
}: HubPublishedEmailProps) {
  return (
    <html>
      <body style={wrapStyle}>
        <h1 style={{ fontSize: 28, margin: 0, fontWeight: 600 }}>
          Your hub is live.
        </h1>
        <p style={{ marginTop: 16, fontSize: 16, lineHeight: 1.5 }}>
          <strong>{hubTitle}</strong> is now published on the{' '}
          <em>{theme}</em> template.
        </p>
        <p style={{ marginTop: 24, fontSize: 16 }}>
          <a href={publicUrl} style={ctaStyle}>
            Open your hub
          </a>
        </p>
        <p style={{ marginTop: 24, fontSize: 14, color: '#666' }}>
          Share this link on Twitter, LinkedIn, your newsletter — anywhere you
          post about your work:
        </p>
        <p style={{ fontSize: 14, wordBreak: 'break-all' }}>
          <code>{publicUrl}</code>
        </p>
        <hr
          style={{
            marginTop: 32,
            border: 'none',
            borderTop: '1px solid #eee',
          }}
        />
        <p style={{ marginTop: 16, fontSize: 12, color: '#999' }}>
          CreatorCanon · You received this because you published a hub.
        </p>
      </body>
    </html>
  );
}
