'use client';

// Next.js error boundary for /operations/dispatch. Server-side render errors
// in the page bubble up here instead of producing an opaque "Application
// error" blank screen. We surface error.message + digest so the actual cause
// is visible — much faster to diagnose than guessing from a digest hash.

type DispatchErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function DispatchError({ error, reset }: DispatchErrorProps) {
  return (
    <main className="admin-page-shell">
      <div className="admin-page-heading">
        <h1>Operations Dispatch</h1>
        <p className="admin-muted-copy">The dispatch page failed to render. Details below.</p>
      </div>
      <section
        style={{
          background: '#fef3f2',
          border: '2px solid #f04438',
          borderRadius: 12,
          padding: '1rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
        }}
      >
        <p style={{ margin: 0, color: '#b42318', fontWeight: 700 }}>
          {error.message || 'Unknown render error'}
        </p>
        {error.digest ? (
          <p style={{ margin: 0, color: '#7a271a', fontSize: '0.85rem' }}>
            Digest: <code>{error.digest}</code>
          </p>
        ) : null}
        {error.stack ? (
          <details>
            <summary style={{ cursor: 'pointer', color: '#7a271a', fontWeight: 600 }}>Stack trace</summary>
            <pre
              style={{
                whiteSpace: 'pre-wrap',
                fontSize: '0.78rem',
                color: '#7a271a',
                maxHeight: '20rem',
                overflow: 'auto',
                marginTop: '0.5rem',
              }}
            >
              {error.stack}
            </pre>
          </details>
        ) : null}
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            type="button"
            onClick={reset}
            style={{
              background: '#b42318',
              color: '#ffffff',
              border: 'none',
              padding: '0.5rem 1rem',
              borderRadius: 8,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
          <a
            href="/operations"
            style={{
              background: '#ffffff',
              color: '#175cd3',
              border: '1px solid #84caff',
              padding: '0.5rem 1rem',
              borderRadius: 8,
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            Back to operations
          </a>
        </div>
      </section>
    </main>
  );
}
