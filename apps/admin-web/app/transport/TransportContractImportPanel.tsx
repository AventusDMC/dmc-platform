'use client';

import { useState } from 'react';
import { formatRouteLabel, formatServiceTypeLabel, formatSupplierName } from '../lib/transport-formatters';
import { formatTransportVehicleDisplay } from '../lib/transport-vehicles';
import { normalizeTransportPricingMode } from '../lib/transport-pricing-modes';
import { SUPPLIER_STANDARDIZATION_HELPER_TEXT } from '../lib/transport-suppliers';

const PREVIEW_SERVICE_CATEGORY_FILTER_OPTIONS = ['Transfers', 'Disposal', 'Add-ons'];
const PREVIEW_PRICING_MODE_FILTER_OPTIONS = [
  'Point-to-Point',
  'Full Day',
  'Half Day',
  'Day Tour',
  'Extra KM',
  'Driver Overnight',
  'Stationary / Waiting',
];

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
  halfDay?: Array<Record<string, unknown>>;
  dayTour?: Array<Record<string, unknown>>;
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

type ImportRowAction = 'UPDATE_EXISTING' | 'SKIP_IMPORTED_ROW' | 'CREATE_NEW_VALIDITY_VERSION' | 'ARCHIVE_OLD_VERSION';

async function readImportResponse(response: Response) {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.message || 'Transport contract import failed.');
  }

  return payload as ImportSummary;
}

type ContractMergeChoice = 'keep' | 'merge';

function buildUploadBody(
  file: File,
  options?: {
    contractMergeMode?: ContractMergeChoice;
    contractNameOverride?: string;
    allowCreateSuppliers?: boolean;
    rowActions?: Record<number, ImportRowAction>;
  },
) {
  const formData = new FormData();
  formData.set('file', file);
  if (options?.contractMergeMode) {
    formData.set('contractMergeMode', options.contractMergeMode);
  }
  if (options?.contractNameOverride) {
    formData.set('contractNameOverride', options.contractNameOverride);
  }
  if (options?.allowCreateSuppliers) {
    formData.set('allowCreateSuppliers', 'true');
  }
  if (options?.rowActions && Object.keys(options.rowActions).length > 0) {
    formData.set('rowActions', JSON.stringify(options.rowActions));
  }
  return formData;
}

function getPreviewGroup(row: Record<string, unknown>) {
  const classification = String(row.classification || '').toUpperCase();
  const pricingMode = getPreviewPricingMode(row);

  if (classification === 'ADD_ON' || pricingMode === 'Stationary / Waiting' || pricingMode === 'Extra Hour' || pricingMode === 'Extra KM' || pricingMode === 'Driver Overnight' || pricingMode === 'Add-on / Supplement') {
    return 'addOns';
  }

  if (classification === 'HALF_DAY' || pricingMode === 'Half Day') {
    return 'halfDay';
  }

  if (pricingMode === 'Day Tour') {
    return 'dayTour';
  }

  if (classification === 'FULL_DAY' || classification === 'DAILY_PACKAGE' || pricingMode === 'Full Day') {
    return 'fullDay';
  }

  return 'routeTransfers';
}

function getSafeRows(rows?: Array<Record<string, unknown>>) {
  return Array.isArray(rows) ? rows : [];
}

function getPreviewPricingMode(row: Record<string, unknown>) {
  return normalizeTransportPricingMode(String(row.serviceName || row.pricingMode || ''));
}

function filterPreviewRows(rows: Array<Record<string, unknown>>, filters: { serviceCategory: string; pricingMode: string }) {
  return rows.filter((row) => {
    const serviceCategory = String(row.serviceCategory || '').trim().toLowerCase();
    const pricingMode = getPreviewPricingMode(row);
    const matchesServiceCategory = !filters.serviceCategory || serviceCategory === filters.serviceCategory.toLowerCase();
    const matchesPricingMode = !filters.pricingMode || pricingMode === filters.pricingMode;
    return matchesServiceCategory && matchesPricingMode;
  });
}

function getDefaultRowActions(rows?: Array<Record<string, unknown>>) {
  return getSafeRows(rows).reduce<Record<number, ImportRowAction>>((actions, row) => {
    const rowNumber = Number(row.row);
    if (!Number.isInteger(rowNumber)) {
      return actions;
    }
    const allowedActions = Array.isArray(row.allowedActions) ? row.allowedActions.map(String) : [];
    if (String(row.importDecision || '') === 'NEW' && allowedActions.includes('CREATE_NEW_VALIDITY_VERSION')) {
      actions[rowNumber] = 'CREATE_NEW_VALIDITY_VERSION';
    } else if (allowedActions.includes('SKIP_IMPORTED_ROW')) {
      actions[rowNumber] = 'SKIP_IMPORTED_ROW';
    }
    return actions;
  }, {});
}

function getAllowedRowActions(row: Record<string, unknown>) {
  const allowedActions = Array.isArray(row.allowedActions) ? row.allowedActions.map(String) : ['SKIP_IMPORTED_ROW'];
  return allowedActions.filter((action): action is ImportRowAction =>
    ['UPDATE_EXISTING', 'SKIP_IMPORTED_ROW', 'CREATE_NEW_VALIDITY_VERSION', 'ARCHIVE_OLD_VERSION'].includes(action),
  );
}

function formatRowActionLabel(action: ImportRowAction) {
  switch (action) {
    case 'UPDATE_EXISTING':
      return 'Update existing';
    case 'CREATE_NEW_VALIDITY_VERSION':
      return 'Create new validity version';
    case 'ARCHIVE_OLD_VERSION':
      return 'Archive old version';
    case 'SKIP_IMPORTED_ROW':
    default:
      return 'Skip imported row';
  }
}

function formatChangedFields(row: Record<string, unknown>) {
  const changedFields = Array.isArray(row.changedFields) ? row.changedFields.map(String).filter(Boolean) : [];
  return changedFields.length > 0 ? changedFields.join(', ') : 'No field changes';
}

function formatPreviewVehicleLabel(row: Record<string, unknown>) {
  return formatTransportVehicleDisplay(
    {
      name: String(row.vehicleLabel || ''),
      vehicleType: String(row.vehicleType || ''),
      maxPax: Number(row.maxPaxPerUnit || 0),
    },
    [],
    { order: 'canonical-first', includePax: true, fallback: 'Vehicle' },
  );
}

function getPreviewGroups(summary: ImportSummary | null, filters: { serviceCategory: string; pricingMode: string }) {
  if (!summary) {
    return [];
  }

  const previewRows = filterPreviewRows(getSafeRows(summary.previewRows), filters);
  const routeTransfers = filterPreviewRows(getSafeRows(summary.routeTransfers), filters);
  const fullDay = filterPreviewRows(getSafeRows(summary.fullDay), filters);
  const halfDay = filterPreviewRows(getSafeRows(summary.halfDay), filters);
  const dayTour = filterPreviewRows(getSafeRows(summary.dayTour), filters);
  const addOns = filterPreviewRows(getSafeRows(summary.addOns), filters);
  const hasGroupedRows = [routeTransfers, fullDay, halfDay, dayTour, addOns].some((rows) => rows.length > 0);
  const groups = hasGroupedRows
    ? [routeTransfers || [], fullDay || [], halfDay || [], dayTour || [], addOns || []]
    : [
        previewRows.filter((row) => getPreviewGroup(row) === 'routeTransfers'),
        previewRows.filter((row) => getPreviewGroup(row) === 'fullDay'),
        previewRows.filter((row) => getPreviewGroup(row) === 'halfDay'),
        previewRows.filter((row) => getPreviewGroup(row) === 'dayTour'),
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
      id: 'halfDay',
      title: 'Half-day services',
      helper: 'Half-day disposal rows. These are not route transfers.',
      rows: groups[2] || [],
    },
    {
      id: 'dayTour',
      title: 'Day tour services',
      helper: 'Standalone sightseeing and FIT touring disposal rows that do not use full-day minimum contract logic.',
      rows: groups[3] || [],
    },
    {
      id: 'addOns',
      title: 'Add-ons',
      helper: 'Driver overnight, stationary, waiting, and other optional charges.',
      rows: groups[4] || [],
    },
  ];
}

export function TransportContractImportPanel({ apiBaseUrl }: TransportContractImportPanelProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportSummary | null>(null);
  const [result, setResult] = useState<ImportSummary | null>(null);
  const [error, setError] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [contractMergeChoice, setContractMergeChoice] = useState<ContractMergeChoice>('keep');
  const [contractNameOverride, setContractNameOverride] = useState('');
  const [allowCreateSuppliers, setAllowCreateSuppliers] = useState(false);
  const [previewServiceCategoryFilter, setPreviewServiceCategoryFilter] = useState('');
  const [previewPricingModeFilter, setPreviewPricingModeFilter] = useState('');
  const [rowActions, setRowActions] = useState<Record<number, ImportRowAction>>({});

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
        body: buildUploadBody(file, { allowCreateSuppliers }),
      }));
      setPreview(nextPreview);
      setRowActions(getDefaultRowActions(nextPreview.previewRows));
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
          allowCreateSuppliers,
          rowActions,
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
  const previewGroups = getPreviewGroups(preview, { serviceCategory: previewServiceCategoryFilter, pricingMode: previewPricingModeFilter });
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
              setPreviewServiceCategoryFilter('');
              setPreviewPricingModeFilter('');
            }}
          />
        </label>

        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={allowCreateSuppliers}
            onChange={(event) => setAllowCreateSuppliers(event.target.checked)}
          />
          Allow new suppliers from import
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
      <p className="form-helper">{SUPPLIER_STANDARDIZATION_HELPER_TEXT}</p>

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

      {preview ? (
        <div className="supplier-rate-card-safe-filters transport-import-preview-filters">
          <label>
            Service Category
            <select value={previewServiceCategoryFilter} onChange={(event) => setPreviewServiceCategoryFilter(event.target.value)}>
              <option value="">All service categories</option>
              {PREVIEW_SERVICE_CATEGORY_FILTER_OPTIONS.map((serviceCategory) => (
                <option key={serviceCategory} value={serviceCategory}>
                  {serviceCategory}
                </option>
              ))}
            </select>
          </label>
          <label>
            Pricing Mode
            <select value={previewPricingModeFilter} onChange={(event) => setPreviewPricingModeFilter(event.target.value)}>
              <option value="">All pricing modes</option>
              {PREVIEW_PRICING_MODE_FILTER_OPTIONS.map((pricingMode) => (
                <option key={pricingMode} value={pricingMode}>
                  {pricingMode}
                </option>
              ))}
            </select>
          </label>
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
                        <th>Card (Supplier + Route)</th>
                        <th>Vehicle Type Section</th>
                        <th>Route / Service Area</th>
                        <th>Service Category</th>
                        <th>Pricing Mode</th>
                        <th>Currency</th>
                        <th>Rate Amount</th>
                        <th>Validity</th>
                        <th>Import Review</th>
                        <th>Action</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.rows.map((row) => (
                        <tr key={String(row.row)}>
                          <td>{String(row.row)}</td>
                          <td>{String(row.rateCardGroup || `${formatSupplierName(String(row.supplierName || ''), null)} | ${formatRouteLabel(String(row.routeName || ''))}`)}</td>
                          <td>
                            {formatPreviewVehicleLabel(row)}
                            {row.vehicleTypeWarning ? <div className="table-subcopy">{String(row.vehicleTypeWarning)}</div> : null}
                          </td>
                          <td>
                            {formatRouteLabel(String(row.routeName || ''))}
                            {row.routeWarning ? <div className="table-subcopy">{String(row.routeWarning)}</div> : null}
                          </td>
                          <td>
                            <span className="status-badge" title="controlled supplier rate-card category">{String(row.serviceCategory || '')}</span>
                          </td>
                          <td>{formatServiceTypeLabel(String(row.serviceName || ''))}</td>
                          <td>{String(row.currency || '')}</td>
                          <td>{String(row.cost || '')}</td>
                          <td>{String(row.contractValidFrom || '')} - {String(row.contractValidTo || '')}</td>
                          <td>
                            <strong>{String(row.importDecision || 'NEW')}</strong>
                            <div className="table-subcopy">{String(row.validityComparison || '')}</div>
                            <div className="table-subcopy">Changed: {formatChangedFields(row)}</div>
                            {row.existingRate ? (
                              <div className="table-subcopy">
                                Existing: {String((row.existingRate as Record<string, unknown>).cost || '')}{' '}
                                {String((row.existingRate as Record<string, unknown>).currency || '')} |{' '}
                                {String((row.existingRate as Record<string, unknown>).validFrom || '')} -{' '}
                                {String((row.existingRate as Record<string, unknown>).validTo || '')}
                              </div>
                            ) : null}
                          </td>
                          <td>
                            <select
                              value={rowActions[Number(row.row)] || getAllowedRowActions(row)[0] || 'SKIP_IMPORTED_ROW'}
                              onChange={(event) =>
                                setRowActions((current) => ({
                                  ...current,
                                  [Number(row.row)]: event.target.value as ImportRowAction,
                                }))
                              }
                            >
                              {getAllowedRowActions(row).map((action) => (
                                <option key={action} value={action}>
                                  {formatRowActionLabel(action)}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <span className="status-badge">{row.active ? 'Active' : 'Inactive'}</span>
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
