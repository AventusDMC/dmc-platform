'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type BootstrapSummary = {
  touringRoutesScanned: number;
  transferRoutesScanned: number;
  createdFromTouring: number;
  createdFromTransfer: number;
  createdTotal: number;
  skippedExistingByCode: number;
  skippedWithoutCode: number;
  missingDataWarnings: Array<{ routeCode: string; routeName: string; missing: string[] }>;
};

export function RouteStandardBootstrapPanel() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<BootstrapSummary | null>(null);

  async function runBootstrap() {
    if (busy) return;
    if (!confirm(
      'Generate Route Standards from existing Transfer Routes + Touring Routes? ' +
      'Existing standards will NOT be overwritten — only missing ones get created as drafts you can refine.',
    )) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/route-standards/bootstrap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message || `Bootstrap failed (${response.status})`);
      setSummary(payload as BootstrapSummary);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bootstrap failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      style={{
        background: '#f5f8f5',
        border: '1px solid #cdd7cd',
        borderRadius: 10,
        padding: '0.85rem 1rem',
        marginBottom: '1rem',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 280 }}>
          <p
            style={{
              color: '#3a5a3a',
              fontSize: '0.72rem',
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              margin: 0,
            }}
          >
            Auto-generate from existing routes
          </p>
          <p style={{ margin: '0.2rem 0 0', color: 'var(--ds-color-text-muted, #475569)', fontSize: '0.85rem' }}>
            Scan your Transfer Routes + Touring Routes and create draft RouteStandard rows for any without one yet.
            Existing standards are <strong>never</strong> overwritten. New rows are tagged{' '}
            <code style={{ background: '#fff', padding: '0 0.3rem', borderRadius: 3 }}>AUTO_BOOTSTRAP</code> so you can refine
            distance / duration / buffers / risk flags afterwards.
          </p>
        </div>
        <button type="button" className="secondary-button" onClick={runBootstrap} disabled={busy}>
          {busy ? 'Generating…' : 'Generate from existing routes'}
        </button>
      </div>

      {error ? <p className="form-error" style={{ marginTop: '0.5rem' }}>{error}</p> : null}

      {summary ? (
        <div
          style={{
            marginTop: '0.75rem',
            background: '#ffffff',
            border: '1px solid #cdd7cd',
            borderRadius: 8,
            padding: '0.7rem 0.85rem',
          }}
        >
          <p
            style={{
              color: '#3a5a3a',
              fontSize: '0.72rem',
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              margin: 0,
            }}
          >
            Bootstrap summary
          </p>
          <ul style={{ marginTop: '0.4rem', marginBottom: 0, paddingLeft: '1.1rem', color: 'var(--ds-color-text-muted, #475569)', fontSize: '0.85rem' }}>
            <li>
              <strong>Scanned:</strong> {summary.touringRoutesScanned} touring + {summary.transferRoutesScanned} transfer ={' '}
              <strong>{summary.touringRoutesScanned + summary.transferRoutesScanned}</strong> operational routes
            </li>
            <li>
              <strong>Created:</strong> {summary.createdTotal} new RouteStandard{summary.createdTotal === 1 ? '' : 's'}{' '}
              ({summary.createdFromTouring} from touring, {summary.createdFromTransfer} from transfer)
            </li>
            <li>
              <strong>Skipped:</strong> {summary.skippedExistingByCode} already had a standard
              {summary.skippedWithoutCode > 0 ? `, ${summary.skippedWithoutCode} without a usable code` : ''}
            </li>
            {summary.missingDataWarnings.length > 0 ? (
              <li style={{ color: '#8b5e34', marginTop: '0.3rem' }}>
                <strong>{summary.missingDataWarnings.length} draft{summary.missingDataWarnings.length === 1 ? '' : 's'} need attention</strong>{' '}
                — distance or duration was missing on the source route. Refine these manually before dispatch can use the timing:
                <ul style={{ marginTop: '0.3rem', marginBottom: 0 }}>
                  {summary.missingDataWarnings.slice(0, 8).map((warn) => (
                    <li key={warn.routeCode}>
                      <code style={{ fontSize: '0.78rem' }}>{warn.routeCode}</code> — {warn.routeName} (missing: {warn.missing.join(', ')})
                    </li>
                  ))}
                  {summary.missingDataWarnings.length > 8 ? (
                    <li>… and {summary.missingDataWarnings.length - 8} more</li>
                  ) : null}
                </ul>
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
