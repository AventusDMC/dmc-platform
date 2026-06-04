'use client';

// Next.js error boundary for /operations/dispatch. Server-side render errors
// in the page bubble up here instead of producing an opaque "Application
// error" blank screen. We surface error.message + digest so the actual cause
// is visible — much faster to diagnose than guessing from a digest hash.

import { AppAlert } from '../../components/ui';

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
      <AppAlert tone="danger">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <p style={{ margin: 0, fontWeight: 700 }}>
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
              background: 'var(--ds-color-danger, #B42318)',
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
              color: 'var(--ds-color-info, #175CD3)',
              border: '1px solid var(--ds-color-info-border, #84CAFF)',
              padding: '0.5rem 1rem',
              borderRadius: 8,
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            Back to operations
          </a>
        </div>
        </div>
      </AppAlert>
    </main>
  );
}
