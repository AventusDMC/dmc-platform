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

export function ImportPreviewPanel({ contractId }: { contractId: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PreviewResult | null>(null);

  async function onPreview(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError('Choose a workbook (.xlsx) first.');
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
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

  const sup = result?.entities.supplements;

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
            <p className="table-subcopy" style={{ marginTop: '0.75rem', color: '#94a3b8', fontSize: '0.75rem' }}>
              Applying these changes is a separate, confirmed step that ships next. For now this
              is preview-only.
            </p>
          </div>
        )
      ) : null}
    </div>
  );
}
