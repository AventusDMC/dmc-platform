'use client';

import { useState } from 'react';

// Hotels Engine — Excel import preview (client). Uploads an edited export
// workbook to the dry-run endpoint and renders what an import WOULD do.
// Nothing is written — the apply step is a separate, confirmed follow-up.

type EntityDiff = {
  fileRows: number;
  toCreate: number;
  toUpdate: number;
  toDelete: number;
  rowErrors: Array<{ row: number; message: string }>;
};
type PreviewResult = {
  schemaVersion: number | null;
  schemaOk: boolean;
  contractIdInFile: string | null;
  contractMatch: boolean;
  errors: string[];
  entities: { supplements: EntityDiff };
};

type ApplyResult = { supplements: { created: number; updated: number; skippedDeletes: number } };

export function ImportPreviewPanel({ hotelId, contractId }: { hotelId: string; contractId: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PreviewResult | null>(null);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState<ApplyResult | null>(null);

  async function onPreview(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError('Choose a workbook (.xlsx) first.');
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    setApplied(null);
    try {
      const body = new FormData();
      body.append('file', file);
      const res = await fetch(`/api/hotel-contracts/${encodeURIComponent(contractId)}/import-preview`, {
        method: 'POST',
        body,
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Preview failed: HTTP ${res.status} ${text.slice(0, 200)}`);
      }
      setResult((await res.json()) as PreviewResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Preview failed.');
    } finally {
      setLoading(false);
    }
  }

  async function onApply() {
    if (!file) return;
    setApplying(true);
    setError(null);
    try {
      const body = new FormData();
      body.append('file', file);
      const res = await fetch(`/api/hotel-contracts/${encodeURIComponent(contractId)}/import-apply`, {
        method: 'POST',
        body,
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Apply failed: HTTP ${res.status} ${text.slice(0, 200)}`);
      }
      setApplied((await res.json()) as ApplyResult);
      setResult(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Apply failed.');
    } finally {
      setApplying(false);
    }
  }

  const sup = result?.entities.supplements;
  const canApply = Boolean(result && result.errors.length === 0 && sup && sup.rowErrors.length === 0);

  return (
    <div>
      <form onSubmit={onPreview} className="entity-form compact-form" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <button type="submit" className="primary-button" disabled={loading}>
            {loading ? 'Checking…' : 'Preview import'}
          </button>
        </div>
      </form>

      {error ? (
        <p style={{ color: '#b91c1c' }}>{error}</p>
      ) : null}

      {result ? (
        result.errors.length > 0 ? (
          <div className="detail-card" style={{ borderColor: '#fca5a5' }}>
            <strong style={{ color: '#b91c1c' }}>This file can't be imported yet:</strong>
            <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.1rem' }}>
              {result.errors.map((m, i) => (
                <li key={i} style={{ color: '#b91c1c' }}>
                  {m}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="detail-card">
            <p className="table-subcopy" style={{ marginTop: 0 }}>
              File is valid for this contract (schema v{result.schemaVersion}). Here's what an
              import would do — <strong>nothing has been changed.</strong>
            </p>
            {sup ? (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Sheet</th>
                      <th className="numeric-cell">Rows in file</th>
                      <th className="numeric-cell">Create</th>
                      <th className="numeric-cell">Update</th>
                      <th className="numeric-cell">Delete</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Supplements</td>
                      <td className="numeric-cell">{sup.fileRows}</td>
                      <td className="numeric-cell" style={{ color: sup.toCreate ? '#16a34a' : undefined }}>{sup.toCreate}</td>
                      <td className="numeric-cell">{sup.toUpdate}</td>
                      <td className="numeric-cell" style={{ color: sup.toDelete ? '#b91c1c' : undefined }}>{sup.toDelete}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : null}
            {sup && sup.rowErrors.length > 0 ? (
              <div style={{ marginTop: '0.75rem' }}>
                <strong style={{ color: '#b45309' }}>Validation warnings (fix before importing):</strong>
                <ul style={{ margin: '0.4rem 0 0', paddingLeft: '1.1rem' }}>
                  {sup.rowErrors.map((re, i) => (
                    <li key={i} style={{ color: '#b45309', fontSize: '0.85rem' }}>
                      {re.row ? `Row ${re.row}: ` : ''}
                      {re.message}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {sup && sup.toDelete > 0 ? (
              <p className="table-subcopy" style={{ marginTop: '0.6rem', color: '#b45309', fontSize: '0.8rem' }}>
                {sup.toDelete} row{sup.toDelete === 1 ? '' : 's'} in the system{' '}
                {sup.toDelete === 1 ? 'is' : 'are'} missing from your file. For safety, apply only
                creates &amp; updates — it will <strong>not</strong> delete them. Remove those from
                the Supplements page manually if intended.
              </p>
            ) : null}
            <div style={{ marginTop: '0.9rem', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <button type="button" className="primary-button" onClick={onApply} disabled={!canApply || applying}>
                {applying ? 'Applying…' : 'Apply changes'}
              </button>
              <span className="table-subcopy" style={{ color: '#94a3b8', fontSize: '0.75rem' }}>
                Applies the creates &amp; updates above (audited). Re-reads the file server-side
                before writing.
              </span>
            </div>
          </div>
        )
      ) : null}

      {applied ? (
        <div className="detail-card" style={{ borderColor: '#86efac' }}>
          <strong style={{ color: '#16a34a' }}>Import applied.</strong>
          <p style={{ margin: '0.4rem 0 0' }}>
            Supplements: {applied.supplements.created} created, {applied.supplements.updated} updated.
            {applied.supplements.skippedDeletes > 0
              ? ` ${applied.supplements.skippedDeletes} absent row(s) left untouched (delete manually if intended).`
              : ''}
          </p>
          <p className="table-subcopy" style={{ marginTop: '0.5rem' }}>
            Open the{' '}
            <a
              href={`/hotels/${hotelId}/contracts/${contractId}/supplements`}
              style={{ textDecoration: 'underline' }}
            >
              supplements page
            </a>{' '}
            to see the changes, or upload another file to preview again.
          </p>
        </div>
      ) : null}
    </div>
  );
}
