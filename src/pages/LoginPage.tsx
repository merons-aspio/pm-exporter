import { useEffect } from 'react';

export default function LoginPage() {
  useEffect(() => {
    document.title = 'Log in with Hubstaff';
  }, []);

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#0f172a',
      color: '#f8fafc',
      fontFamily: 'system-ui, sans-serif',
      padding: 24,
    }}>
      <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 16, letterSpacing: -1 }}>Hubstaff Exporter</h1>
      <p style={{ color: '#94a3b8', marginBottom: 32, maxWidth: 420, textAlign: 'center', lineHeight: 1.5 }}>
        Secure access to your Hubstaff tasks. Authorize via Hubstaff OAuth to begin.
      </p>
      <a
        href="/api/auth/hubstaff"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 12,
          padding: '14px 28px',
          borderRadius: 10,
          background: '#f59e0b',
          color: '#0f172a',
          textDecoration: 'none',
          fontWeight: 700,
          fontSize: 16,
          boxShadow: '0 10px 25px rgba(245,158,11,0.35)',
          transition: 'transform .15s ease',
        }}
        onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-2px)')}
        onMouseLeave={e => (e.currentTarget.style.transform = 'translateY(0)')}
      >
        Log in with Hubstaff
      </a>
      <p style={{ marginTop: 24, fontSize: 12, color: '#64748b' }}>
        Protected by Basic Auth · OAuth 2.0 · Server-side session storage
      </p>
    </div>
  );
}
