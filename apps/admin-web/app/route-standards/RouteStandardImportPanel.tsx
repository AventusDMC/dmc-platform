'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type ImportResult = { created: number; updated: number; errors: Array<{ routeCode: string; message: string }>; total: number };
type PreviewResult = { rows: Array<{ routeCode: string; routeName: string }>; count: number };

export function RouteStandardImportPanel() {
  const router = useRouter();
  const [busy, setBusy] = useState<'idle' | 'preview' | 'import'>('idle');
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function upload(action: 'preview' | 'import', event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fileInput = form.elements.namedItem('file') as HTMLInputElement;
    if (!fileInput?.files?.[0]) {
      setError('Pick a .xlsx file first');
      return;
    }
    setBusy(action);
    setError(null);
    if (action === 'preview') setResult(null);
    try {
      const fd = new FormData();
      fd.set('file', fileInput.files[0]);
      const response = await fetch(`/api/route-standards/workbook/${action}`, { method: 'POST', body: fd });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message || `Workbook ${action} failed (${response.status})`);
      if (action === 'preview') {
        setPreview(payload as PreviewResult);
      } else {
        setResult(payload as ImportResult);
        setPreview(null);
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Workbook upload failed');
    } finally {
      setBusy('idle');
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
        <div>
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
            Bulk import
          </p>
          <p style={{ margin: '0.2rem 0 0', color: 'var(--ds-color-text-muted, #475569)', fontSize: '0.85rem' }}>
            Upload a Route Standards <code>.xlsx</code> (export gives you the exact column layout). Preview first to confirm
            counts, then import to upsert by route code.
          </p>
        </div>
      </div>

      <form
        onSubmit={(e) => upload('preview', e)}
        style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', marginTop: '0.6rem' }}
      >
        <input type="file" name="file" accept=".xlsx" required />
        <button type="submit" className="secondary-button" disabled={busy !== 'idle'}>
          {busy === 'preview' ? 'Previewing…' : 'Preview'}
        </button>
        <button
          type="button"
          className="primary-button"
          disabled={busy !== 'idle' || !preview}
          onClick={(e) => upload('import', e.currentTarget.form as unknown as React.FormEvent<HTMLFormElement>)}
        >
          {busy === 'import' ? 'Importing…' : 'Import'}
        </button>
      </form>

      {error ? <p className="form-error" style={{ marginTop: '0.5rem' }}>{error}</p> : null}
      {preview ? (
        <p style={{ marginTop: '0.5rem', color: 'var(--ds-color-text-muted, #475569)', fontSize: '0.85rem' }}>
          Preview: <strong>{preview.count}</strong> row{preview.count === 1 ? '' : 's'} parsed. Click Import to upsert by route
          code (existing codes update in place; new ones get created).
        </p>
      ) : null}
      {result ? (
        <p style={{ marginTop: '0.5rem', color: '#3a5a3a', fontSize: '0.85rem' }}>
          Imported: <strong>{result.created}</strong> created, <strong>{result.updated}</strong> updated
          {result.errors.length > 0 ? `, ${result.errors.length} errors` : ''}.
          {result.errors.length > 0 ? (
            <ul style={{ marginTop: '0.4rem' }}>
              {result.errors.slice(0, 5).map((err, idx) => (
                <li key={idx} style={{ color: '#8b5e34' }}>
                  <code>{err.routeCode}</code> — {err.message}
                </li>
              ))}
              {result.errors.length > 5 ? <li>… and {result.errors.length - 5} more</li> : null}
            </ul>
          ) : null}
        </p>
      ) : null}
    </section>
  );
}
