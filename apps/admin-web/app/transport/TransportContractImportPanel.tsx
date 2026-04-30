'use client';

import { useState } from 'react';

type ImportSummary = {
  rows: number;
  createdSuppliers: number;
  createdRoutes: number;
  createdServices: number;
  createdRates: number;
  updatedRates: number;
  skippedRows: number;
  errors: Array<{ row: number; message: string }>;
  previewRows: Array<Record<string, unknown>>;
};

type TransportContractImportPanelProps = {
  apiBaseUrl: string;
};

async function readImportResponse(response: Response) {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.message || 'Transport contract import failed.');
  }

  return payload as ImportSummary;
}

function buildUploadBody(file: File) {
  const formData = new FormData();
  formData.set('file', file);
  return formData;
}

export function TransportContractImportPanel({ apiBaseUrl }: TransportContractImportPanelProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportSummary | null>(null);
  const [result, setResult] = useState<ImportSummary | null>(null);
  const [error, setError] = useState('');
  const [isBusy, setIsBusy] = useState(false);

  async function handlePreview() {
    if (!file) {
      setError('Choose a transport contract Excel file first.');
      return;
    }

    setIsBusy(true);
    setError('');
    setResult(null);

    try {
      setPreview(await readImportResponse(await fetch(`${apiBaseUrl}/vehicle-rates/import-preview`, {
        method: 'POST',
        body: buildUploadBody(file),
      })));
    } catch (caughtError) {
      setPreview(null);
      setError(caughtError instanceof Error ? caughtError.message : 'Could not preview transport contract import.');
    } finally {
      setIsBusy(false);
    }
  }

  async function handleImport() {
    if (!file) {
      setError('Choose a transport contract Excel file first.');
      return;
    }

    setIsBusy(true);
    setError('');

    try {
      const nextResult = await readImportResponse(await fetch(`${apiBaseUrl}/vehicle-rates/import`, {
        method: 'POST',
        body: buildUploadBody(file),
      }));
      setResult(nextResult);
      setPreview(nextResult);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not import transport contract.');
    } finally {
      setIsBusy(false);
    }
  }

  const activeSummary = result || preview;
  const canImport = Boolean(preview && preview.errors.length === 0 && file);

  return (
    <div className="section-stack">
      <div className="form-row form-row-3">
        <label>
          Transport contract Excel
          <input
            type="file"
            accept=".xlsx,.xls,.xlsm"
            onChange={(event) => {
              setFile(event.target.files?.[0] || null);
              setPreview(null);
              setResult(null);
              setError('');
            }}
          />
        </label>

        <div className="button-row">
          <a className="button button-secondary" href={`${apiBaseUrl}/vehicle-rates/import-template`}>
            Download template
          </a>
          <button className="button button-secondary" type="button" onClick={handlePreview} disabled={isBusy || !file}>
            Preview import
          </button>
          <button className="button" type="button" onClick={handleImport} disabled={isBusy || !canImport}>
            Import rates
          </button>
        </div>
      </div>

      {error ? <p className="form-error">{error}</p> : null}

      {activeSummary ? (
        <div className="quote-item-override-status quote-item-override-status-active">
          <strong>{result ? 'Import complete' : 'Import preview'}</strong>
          <span>
            {[
              `${activeSummary.rows} rows`,
              `${activeSummary.createdSuppliers} suppliers created`,
              `${activeSummary.createdRoutes} routes created`,
              `${activeSummary.createdServices} services created`,
              `${activeSummary.createdRates} rates created`,
              `${activeSummary.updatedRates} rates updated`,
              `${activeSummary.skippedRows} skipped`,
            ].join(' | ')}
          </span>
        </div>
      ) : null}

      {preview?.errors.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Row</th>
                <th>Error</th>
              </tr>
            </thead>
            <tbody>
              {preview.errors.slice(0, 20).map((entry, index) => (
                <tr key={`${entry.row}-${index}`}>
                  <td>{entry.row}</td>
                  <td>{entry.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {preview?.previewRows.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Row</th>
                <th>Supplier</th>
                <th>Service</th>
                <th>Route</th>
                <th>Vehicle</th>
                <th>Capacity</th>
                <th>Cost</th>
              </tr>
            </thead>
            <tbody>
              {preview.previewRows.slice(0, 10).map((row) => (
                <tr key={String(row.row)}>
                  <td>{String(row.row)}</td>
                  <td>{String(row.supplierName || '')}</td>
                  <td>{String(row.serviceName || '')}</td>
                  <td>{String(row.routeName || '')}</td>
                  <td>{String(row.vehicleType || '')}</td>
                  <td>{String(row.maxPaxPerUnit || '')}</td>
                  <td>{String(row.currency || '')} {String(row.cost || '')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
