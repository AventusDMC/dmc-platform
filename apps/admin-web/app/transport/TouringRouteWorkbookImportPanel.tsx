'use client';

import { useState } from 'react';

type TouringWorkbookPreview = {
  mode: 'preview' | 'import';
  routeCount: number;
  stopCount: number;
  pricingCount: number;
  supplierMapping?: { mapped: number; missing: number };
  routes?: Array<Record<string, unknown>>;
  stops?: Array<Record<string, unknown>>;
  pricings?: Array<Record<string, unknown>>;
  errors?: Array<{ sheet?: string; row?: number; message: string }>;
  warnings?: Array<{ sheet?: string; row?: number; message: string }>;
  imported?: {
    routes: number;
    stops: number;
    pricings: number;
    updatedRoutes: number;
    updatedPricings: number;
    skippedOverlaps: number;
  };
};

const TOURING_WORKBOOK_DECISIONS = ['NEW', 'UPDATED', 'UNCHANGED', 'OVERLAP'] as const;

async function readTouringWorkbookResponse(response: Response) {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.message || 'Touring route workbook import failed.');
  }
  return payload as TouringWorkbookPreview;
}

function buildUploadBody(file: File) {
  const body = new FormData();
  body.set('file', file);
  return body;
}

function formatDecision(value: unknown) {
  const decision = String(value || 'NEW').toUpperCase();
  return TOURING_WORKBOOK_DECISIONS.includes(decision as (typeof TOURING_WORKBOOK_DECISIONS)[number]) ? decision : 'NEW';
}

function DecisionBadge({ value }: { value: unknown }) {
  const decision = formatDecision(value);
  return <span className={`status-badge status-badge-${decision.toLowerCase()}`}>{decision}</span>;
}

function IssueList({ title, issues }: { title: string; issues?: Array<{ sheet?: string; row?: number; message: string }> }) {
  if (!issues?.length) return null;
  return (
    <div className="transport-import-errors">
      <strong>{title}</strong>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Sheet</th>
              <th>Row</th>
              <th>Message</th>
            </tr>
          </thead>
          <tbody>
            {issues.slice(0, 30).map((issue, index) => (
              <tr key={`${issue.sheet || 'workbook'}-${issue.row || index}-${index}`}>
                <td>{issue.sheet || 'WORKBOOK'}</td>
                <td>{issue.row || '-'}</td>
                <td>{issue.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function TouringRouteWorkbookImportPanel() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<TouringWorkbookPreview | null>(null);
  const [error, setError] = useState('');
  const [isBusy, setIsBusy] = useState(false);

  async function previewWorkbook() {
    if (!file) {
      setError('Choose a touring route workbook first.');
      return;
    }
    setIsBusy(true);
    setError('');
    try {
      setPreview(await readTouringWorkbookResponse(await fetch('/api/touring-routes/workbook/preview', { method: 'POST', body: buildUploadBody(file) })));
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not preview touring workbook.');
    } finally {
      setIsBusy(false);
    }
  }

  async function importWorkbook() {
    if (!file) return;
    setIsBusy(true);
    setError('');
    try {
      const result = await readTouringWorkbookResponse(await fetch('/api/touring-routes/workbook/import', { method: 'POST', body: buildUploadBody(file) }));
      setPreview(result);
      window.location.href = '/transport?tab=touring-routes&imported=1';
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not import touring workbook.');
    } finally {
      setIsBusy(false);
    }
  }

  const hasBlockingErrors = Boolean(preview?.errors?.length);

  return (
    <section className="workspace-section">
      <div className="section-heading-row">
        <div>
          <p className="eyebrow">Upload Touring Workbook</p>
          <h3>Touring route workbook import</h3>
          <p className="detail-copy">Supports TOURING_ROUTES, TOURING_ROUTE_STOPS, TOURING_ROUTE_RATES, and VEHICLE_TYPES tabs.</p>
        </div>
      </div>

      <div className="form-row form-row-3">
        <label>
          Touring workbook
          <input
            type="file"
            accept=".xlsx,.xls,.xlsm"
            onChange={(event) => {
              setFile(event.target.files?.[0] || null);
              setPreview(null);
              setError('');
            }}
          />
        </label>
        <div className="button-row">
          <button className="button button-secondary" type="button" onClick={previewWorkbook} disabled={isBusy || !file}>
            Preview workbook
          </button>
          <button className="button" type="button" onClick={importWorkbook} disabled={isBusy || !file || !preview || hasBlockingErrors}>
            Import safely
          </button>
        </div>
      </div>
      {error ? <p className="form-error">{error}</p> : null}

      {preview ? (
        <div className="section-stack">
          <div className="summary-strip">
            {[
              { label: 'Touring routes', value: preview.routeCount },
              { label: 'Stops', value: preview.stopCount },
              { label: 'Vehicle pricing', value: preview.pricingCount },
              { label: 'Suppliers mapped', value: preview.supplierMapping?.mapped || 0 },
              { label: 'Supplier warnings', value: preview.supplierMapping?.missing || 0 },
            ].map((item) => (
              <article key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </article>
            ))}
          </div>

          <IssueList title="Blocking validation errors" issues={preview.errors} />
          <IssueList title="Review warnings" issues={preview.warnings} />

          {preview.imported ? (
            <div className="quote-item-override-status quote-item-override-status-active">
              <strong>Import complete</strong>
              <span>
                {[
                  `${preview.imported.routes} routes created`,
                  `${preview.imported.updatedRoutes} routes updated`,
                  `${preview.imported.stops} stops imported`,
                  `${preview.imported.pricings} pricing rows created`,
                  `${preview.imported.updatedPricings} pricing rows updated`,
                  `${preview.imported.skippedOverlaps} overlaps skipped`,
                ].join(' | ')}
              </span>
            </div>
          ) : null}

          <section className="transport-import-preview-group">
            <div className="transport-import-preview-group-head">
              <div>
                <h4>Touring routes preview</h4>
                <p>Route records are matched by TourCode.</p>
              </div>
            </div>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Decision</th>
                    <th>TourCode</th>
                    <th>Name</th>
                    <th>Start city</th>
                    <th>Duration</th>
                    <th>Included</th>
                  </tr>
                </thead>
                <tbody>
                  {(preview.routes || []).map((route) => (
                    <tr key={String(route.code)}>
                      <td><DecisionBadge value={route.importDecision} /></td>
                      <td>{String(route.code || '')}</td>
                      <td>{String(route.name || '')}</td>
                      <td>{String(route.startCity || '')}</td>
                      <td>{String(route.durationDays || '')}D</td>
                      <td>{[route.includedKm ? `${route.includedKm} km` : null, route.includedHours ? `${route.includedHours} hours` : null].filter(Boolean).join(' / ') || 'Review'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="transport-import-preview-group">
            <div className="transport-import-preview-group-head">
              <div>
                <h4>Vehicle pricing preview</h4>
                <p>Existing pricing is matched by route, supplier, vehicle, pax range, currency, and validity.</p>
              </div>
            </div>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Decision</th>
                    <th>TourCode</th>
                    <th>Supplier</th>
                    <th>Vehicle</th>
                    <th>Pax</th>
                    <th>Cost</th>
                    <th>Validity</th>
                  </tr>
                </thead>
                <tbody>
                  {(preview.pricings || []).map((rate) => (
                    <tr key={`${String(rate.tourCode)}-${String(rate.row)}`}>
                      <td><DecisionBadge value={rate.importDecision} /></td>
                      <td>{String(rate.tourCode || '')}</td>
                      <td>{String(rate.supplierName || '')}{rate.supplierId ? null : <div className="table-subcopy">Mapping missing</div>}</td>
                      <td>{String(rate.vehicleName || rate.vehicleType || '')}</td>
                      <td>{String(rate.minPax || '')}-{String(rate.maxPax || '')}</td>
                      <td>{String(rate.currency || '')} {String(rate.baseCost || '')}</td>
                      <td>{String(rate.validFrom || '')} - {String(rate.validTo || '')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
