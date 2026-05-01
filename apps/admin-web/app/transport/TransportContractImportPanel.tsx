'use client';

import { useState } from 'react';
import { formatClassificationLabel, formatRouteLabel, formatServiceTypeLabel, formatSupplierName } from '../lib/transport-formatters';

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

function getPreviewGroup(row: Record<string, unknown>) {
  const classification = String(row.classification || '').toUpperCase();
  const serviceName = String(row.serviceName || '').toLowerCase();

  if (classification === 'ADD_ON' || /overnight|stationary|waiting|daily charge/.test(serviceName)) {
    return 'addOns';
  }

  if (classification === 'FULL_DAY' || classification === 'DAILY_PACKAGE' || /full day|daily fd|\bfd\b/.test(serviceName)) {
    return 'fullDay';
  }

  return 'routeTransfers';
}

function getPreviewGroups(rows: Array<Record<string, unknown>>) {
  return [
    {
      id: 'routeTransfers',
      title: 'Route transfers',
      helper: 'Origin to destination transfer rates. These do not count as full-day usage.',
      rows: rows.filter((row) => getPreviewGroup(row) === 'routeTransfers'),
    },
    {
      id: 'fullDay',
      title: 'Full-day services',
      helper: 'Full-day and Daily FD package rows. Daily FD minimum rules apply in Quote Planner.',
      rows: rows.filter((row) => getPreviewGroup(row) === 'fullDay'),
    },
    {
      id: 'addOns',
      title: 'Add-ons',
      helper: 'Driver overnight, stationary, waiting, and other optional charges.',
      rows: rows.filter((row) => getPreviewGroup(row) === 'addOns'),
    },
  ];
}

function formatPricingModeLabel(value?: string | null) {
  const normalized = String(value || 'PER_GROUP').trim().toUpperCase();
  if (normalized === 'PER_GROUP') return 'Per group';
  if (normalized === 'CAPACITY_UNIT') return 'Capacity unit';
  return formatServiceTypeLabel(normalized);
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
      window.location.href = '/transport?tab=rates&imported=1';
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not import transport contract.');
    } finally {
      setIsBusy(false);
    }
  }

  const activeSummary = result || preview;
  const canImport = Boolean(preview && file);
  const previewGroups = preview ? getPreviewGroups(preview.previewRows) : [];
  const skippedInvalidRows = preview?.errors.length || 0;

  return (
    <div className="section-stack transport-contract-import-workflow">
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
            Confirm import
          </button>
        </div>
      </div>

      {error ? <p className="form-error">{error}</p> : null}

      {activeSummary ? (
        <div className="quote-item-override-status quote-item-override-status-active">
          <strong>{result ? 'Import complete' : 'Ready to confirm import'}</strong>
          <span>
            {[
              `${activeSummary.rows} rows`,
              `${activeSummary.createdSuppliers} suppliers created`,
              `${activeSummary.createdRoutes} routes created`,
              `${activeSummary.createdServices} services created`,
              `${activeSummary.createdRates} rates created`,
              `${activeSummary.updatedRates} rates updated`,
              `${activeSummary.skippedRows + (result ? 0 : skippedInvalidRows)} skipped/invalid`,
            ].join(' | ')}
          </span>
        </div>
      ) : null}

      {preview?.errors.length ? (
        <div className="transport-import-errors">
          <div>
            <strong>{preview.errors.length} row-level issue{preview.errors.length === 1 ? '' : 's'}</strong>
            <p>Invalid rows are not imported. Fix the Excel file and preview again, or continue to import valid rows only.</p>
          </div>
          <div className="table-wrap">
          <table className="data-table">
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
        </div>
      ) : null}

      {previewGroups.some((group) => group.rows.length > 0) ? (
        <div className="transport-import-preview-groups">
          {previewGroups.map((group) =>
            group.rows.length > 0 ? (
              <section key={group.id} className="transport-import-preview-group">
                <div className="transport-import-preview-group-head">
                  <div>
                    <h4>{group.title}</h4>
                    <p>{group.helper}</p>
                  </div>
                  <span>{group.rows.length} row{group.rows.length === 1 ? '' : 's'}</span>
                </div>
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Row</th>
                        <th>Supplier</th>
                        <th>Service</th>
                        <th>Classification</th>
                        <th>Route</th>
                        <th>Vehicle / Capacity</th>
                        <th>Pricing</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.rows.map((row) => (
                        <tr key={String(row.row)}>
                          <td>{String(row.row)}</td>
                          <td>{formatSupplierName(String(row.supplierName || ''), null)}</td>
                          <td>{formatServiceTypeLabel(String(row.serviceName || ''))}</td>
                          <td>
                            <span className="status-badge" title="detected service classification">{formatClassificationLabel(String(row.classification || 'ROUTE_TRANSFER'))}</span>
                          </td>
                          <td>{formatRouteLabel(String(row.routeName || ''))}</td>
                          <td>
                            <strong>{String(row.vehicleType || '')}</strong>
                            <div className="table-subcopy">{String(row.maxPaxPerUnit || '')} pax per unit</div>
                          </td>
                          <td>
                            <strong>{String(row.currency || '')} {String(row.cost || '')}</strong>
                            <div className="table-subcopy">{formatPricingModeLabel(String(row.pricingMode || 'PER_GROUP'))}</div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null,
          )}
        </div>
      ) : null}
    </div>
  );
}
