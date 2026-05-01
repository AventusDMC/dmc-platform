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
  previewRows?: Array<Record<string, unknown>>;
  routeTransfers?: Array<Record<string, unknown>>;
  fullDay?: Array<Record<string, unknown>>;
  addOns?: Array<Record<string, unknown>>;
  contractWarnings?: Array<{
    supplierName: string;
    currency: string;
    contractValidFrom: string;
    contractValidTo: string;
    contractNames: string[];
    suggestedContractName: string;
    message: string;
  }>;
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

type ContractMergeChoice = 'keep' | 'merge';

function buildUploadBody(file: File, options?: { contractMergeMode?: ContractMergeChoice; contractNameOverride?: string }) {
  const formData = new FormData();
  formData.set('file', file);
  if (options?.contractMergeMode) {
    formData.set('contractMergeMode', options.contractMergeMode);
  }
  if (options?.contractNameOverride) {
    formData.set('contractNameOverride', options.contractNameOverride);
  }
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

function getSafeRows(rows?: Array<Record<string, unknown>>) {
  return Array.isArray(rows) ? rows : [];
}

function getPreviewGroups(summary: ImportSummary | null) {
  if (!summary) {
    return [];
  }

  const previewRows = getSafeRows(summary.previewRows);
  const routeTransfers = getSafeRows(summary.routeTransfers);
  const fullDay = getSafeRows(summary.fullDay);
  const addOns = getSafeRows(summary.addOns);
  const hasGroupedRows = [routeTransfers, fullDay, addOns].some((rows) => rows.length > 0);
  const groups = hasGroupedRows
    ? [routeTransfers || [], fullDay || [], addOns || []]
    : [
        previewRows.filter((row) => getPreviewGroup(row) === 'routeTransfers'),
        previewRows.filter((row) => getPreviewGroup(row) === 'fullDay'),
        previewRows.filter((row) => getPreviewGroup(row) === 'addOns'),
      ];

  return [
    {
      id: 'routeTransfers',
      title: 'Route transfers',
      helper: 'Origin to destination transfer rates. These do not count as full-day usage.',
      rows: groups[0] || [],
    },
    {
      id: 'fullDay',
      title: 'Full-day services',
      helper: 'Full-day and Daily FD package rows. Daily FD minimum rules apply in Quote Planner.',
      rows: groups[1] || [],
    },
    {
      id: 'addOns',
      title: 'Add-ons',
      helper: 'Driver overnight, stationary, waiting, and other optional charges.',
      rows: groups[2] || [],
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
  const [contractMergeChoice, setContractMergeChoice] = useState<ContractMergeChoice>('keep');
  const [contractNameOverride, setContractNameOverride] = useState('');

  async function handlePreview() {
    if (!file) {
      setError('Choose a transport contract Excel file first.');
      return;
    }

    setIsBusy(true);
    setError('');
    setResult(null);

    try {
      const nextPreview = await readImportResponse(await fetch(`${apiBaseUrl}/vehicle-rates/import-preview`, {
        method: 'POST',
        body: buildUploadBody(file),
      }));
      setPreview(nextPreview);
      setContractMergeChoice('keep');
      setContractNameOverride(nextPreview.contractWarnings?.[0]?.suggestedContractName || '');
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

    const contractWarnings = preview?.contractWarnings || [];
    if (contractWarnings.length > 0 && contractMergeChoice === 'merge' && !contractNameOverride.trim()) {
      setError('Choose a contract name before merging imported contract rows.');
      return;
    }

    setIsBusy(true);
    setError('');

    try {
      const nextResult = await readImportResponse(await fetch(`${apiBaseUrl}/vehicle-rates/import`, {
        method: 'POST',
        body: buildUploadBody(file, {
          contractMergeMode: contractWarnings.length > 0 ? contractMergeChoice : undefined,
          contractNameOverride: contractMergeChoice === 'merge' ? contractNameOverride : undefined,
        }),
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
  const previewGroups = getPreviewGroups(preview);
  const skippedInvalidRows = preview?.errors?.length || 0;

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
              setContractMergeChoice('keep');
              setContractNameOverride('');
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

      {preview?.errors?.length ? (
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

      {preview?.contractWarnings?.length ? (
        <div className="transport-import-errors">
          <div>
            <strong>Possible split supplier contracts</strong>
            <p>Multiple contract names detected for the same supplier and validity period. This will create separate rate cards.</p>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Supplier</th>
                  <th>Validity</th>
                  <th>Currency</th>
                  <th>Contract names</th>
                  <th>Suggested merge name</th>
                </tr>
              </thead>
              <tbody>
                {preview.contractWarnings.map((warning) => (
                  <tr key={`${warning.supplierName}-${warning.currency}-${warning.contractValidFrom}-${warning.contractValidTo}`}>
                    <td>{formatSupplierName(warning.supplierName, null)}</td>
                    <td>{warning.contractValidFrom} - {warning.contractValidTo}</td>
                    <td>{warning.currency}</td>
                    <td>{warning.contractNames.join(', ')}</td>
                    <td>{warning.suggestedContractName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="form-row form-row-2">
            <label className="checkbox-row">
              <input
                type="radio"
                name="contractMergeChoice"
                value="keep"
                checked={contractMergeChoice === 'keep'}
                onChange={() => setContractMergeChoice('keep')}
              />
              Keep separate contracts
            </label>
            <label className="checkbox-row">
              <input
                type="radio"
                name="contractMergeChoice"
                value="merge"
                checked={contractMergeChoice === 'merge'}
                onChange={() => {
                  setContractMergeChoice('merge');
                  setContractNameOverride((current) => current || preview.contractWarnings?.[0]?.suggestedContractName || '');
                }}
              />
              Merge into one contract name
            </label>
          </div>
          {contractMergeChoice === 'merge' ? (
            <label>
              Contract name for merged rows
              <input
                value={contractNameOverride}
                onChange={(event) => setContractNameOverride(event.target.value)}
                placeholder={preview.contractWarnings[0]?.suggestedContractName || 'Supplier Transport 2026 JOD'}
              />
            </label>
          ) : null}
        </div>
      ) : null}

      {previewGroups.some((group) => (group.rows?.length || 0) > 0) ? (
        <div className="transport-import-preview-groups">
          {previewGroups.map((group) =>
            (group.rows?.length || 0) > 0 ? (
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
                        <th>Contract</th>
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
                          <td>
                            <strong>{String(row.contractName || '')}</strong>
                            <div className="table-subcopy">{String(row.contractValidFrom || '')} - {String(row.contractValidTo || '')}</div>
                          </td>
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
