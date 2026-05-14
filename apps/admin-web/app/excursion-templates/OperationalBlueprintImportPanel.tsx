'use client';

import { useState } from 'react';

type BlueprintIssue = {
  sheet?: string;
  row?: number;
  templateCode?: string;
  message: string;
};

type BlueprintTemplatePreview = {
  templateCode: string;
  templateName: string;
  routes: number;
  transportComponents: number;
  ticketComponents: number;
  guideComponents: number;
  diningComponents: number;
  activityComponents: number;
  optionalComponents: number;
};

type ReusableInventoryPreview = {
  componentType: string;
  name: string;
  found: boolean;
  linkedId?: string | null;
};

type BlueprintPreview = {
  mode: 'preview' | 'import';
  templates?: BlueprintTemplatePreview[];
  counts?: {
    templates?: number;
    touringRoutes?: number;
    routeStops?: number;
    transportComponents?: number;
    ticketComponents?: number;
    guideComponents?: number;
    diningComponents?: number;
    activityComponents?: number;
    optionalComponents?: number;
  };
  reusableInventory?: ReusableInventoryPreview[];
  errors?: BlueprintIssue[];
  warnings?: BlueprintIssue[];
  importedTemplates?: number;
  importedTouringRoutes?: number;
  importedComponents?: number;
};

function buildUploadBody(file: File) {
  const formData = new FormData();
  formData.set('file', file);
  return formData;
}

async function readBlueprintResponse(response: Response): Promise<BlueprintPreview> {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.message || 'Operational blueprint workbook import failed.');
  }
  return payload as BlueprintPreview;
}

function IssueList({ title, issues }: { title: string; issues?: BlueprintIssue[] }) {
  const safeIssues = Array.isArray(issues) ? issues : [];
  if (safeIssues.length === 0) {
    return null;
  }

  return (
    <div className="transport-import-errors">
      <div>
        <strong>{title}</strong>
        <p>Review structured workbook validation feedback before importing.</p>
      </div>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Sheet</th>
              <th>Row</th>
              <th>Template</th>
              <th>Message</th>
            </tr>
          </thead>
          <tbody>
            {safeIssues.map((issue, index) => (
              <tr key={`${issue.sheet || 'workbook'}-${issue.row || index}-${index}`}>
                <td>{issue.sheet || 'WORKBOOK'}</td>
                <td>{issue.row || '-'}</td>
                <td>{issue.templateCode || '-'}</td>
                <td>{issue.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function OperationalBlueprintImportPanel() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<BlueprintPreview | null>(null);
  const [error, setError] = useState('');
  const [isBusy, setIsBusy] = useState(false);

  async function previewWorkbook() {
    if (!file) {
      setError('Choose an operational blueprint workbook first.');
      return;
    }

    setIsBusy(true);
    setError('');
    try {
      setPreview(
        await readBlueprintResponse(
          await fetch('/api/excursion-templates/operational-blueprint/import-preview', {
            method: 'POST',
            body: buildUploadBody(file),
          }),
        ),
      );
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not preview operational blueprint workbook.');
    } finally {
      setIsBusy(false);
    }
  }

  async function importWorkbook() {
    if (!file) {
      setError('Choose an operational blueprint workbook first.');
      return;
    }

    setIsBusy(true);
    setError('');
    try {
      const result = await readBlueprintResponse(
        await fetch('/api/excursion-templates/operational-blueprint/import', {
          method: 'POST',
          body: buildUploadBody(file),
        }),
      );
      setPreview(result);
      window.location.href = '/excursion-templates?imported=1';
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not import operational blueprint workbook.');
    } finally {
      setIsBusy(false);
    }
  }

  const counts = preview?.counts || {};
  const hasBlockingErrors = Boolean(preview?.errors?.length);
  const templates = Array.isArray(preview?.templates) ? preview.templates : [];
  const reusableInventory = Array.isArray(preview?.reusableInventory) ? preview.reusableInventory : [];
  const missingReusableInventory = reusableInventory.filter((entry) => !entry.found);

  return (
    <section className="contract-workspace-card excursion-tariff-workbook-import-foundation">
      <div className="section-header-inline">
        <div>
          <p className="eyebrow">Excursion Templates</p>
          <h3>Operational Blueprint Workbook Import</h3>
          <p>Upload normalized excursion template workbooks while preserving links to touring routes, tickets, guides, dining, and activities.</p>
          <p className="detail-copy">
            Validation highlights Duplicate TemplateCode values, unknown touring route refs, missing required transport component links, and missing reusable
            inventory references before import.
          </p>
        </div>
      </div>

      <div className="form-row form-row-3">
        <label>
          Choose File
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
            Preview Workbook
          </button>
          <button className="button" type="button" onClick={importWorkbook} disabled={isBusy || !file || !preview || hasBlockingErrors}>
            Import Workbook
          </button>
        </div>
      </div>

      {error ? <p className="form-error">{error}</p> : null}

      {preview ? (
        <div className="section-stack">
          <div className="summary-strip">
            {[
              { label: 'Excursion templates', value: counts.templates || 0 },
              { label: 'Touring route variants', value: counts.touringRoutes || 0 },
              { label: 'Transport components', value: counts.transportComponents || 0 },
              { label: 'Ticket components', value: counts.ticketComponents || 0 },
              { label: 'Guide components', value: counts.guideComponents || 0 },
              { label: 'Dining / activity components', value: (counts.diningComponents || 0) + (counts.activityComponents || 0) },
            ].map((item) => (
              <div key={item.label} className="summary-card">
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>

          {preview.mode === 'import' ? (
            <p className="form-success">
              Imported {preview.importedTemplates || 0} templates, {preview.importedTouringRoutes || 0} touring routes, and{' '}
              {preview.importedComponents || 0} linked components.
            </p>
          ) : null}

          <IssueList title="Blocking validation errors" issues={preview.errors} />
          <IssueList title="Review warnings" issues={preview.warnings} />

          {templates.length > 0 ? (
            <section className="transport-import-preview-group">
              <div className="transport-import-preview-group-head">
                <div>
                  <h4>Excursion template preview</h4>
                  <p>Templates stay linked to reusable operational components instead of becoming flat pricing rows.</p>
                </div>
              </div>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>TemplateCode</th>
                      <th>Template</th>
                      <th>Touring routes</th>
                      <th>Transport</th>
                      <th>Tickets</th>
                      <th>Guides</th>
                      <th>Dining / activity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {templates.slice(0, 25).map((template) => (
                      <tr key={template.templateCode}>
                        <td>{template.templateCode}</td>
                        <td>{template.templateName || 'Unnamed template'}</td>
                        <td>{template.routes}</td>
                        <td>{template.transportComponents}</td>
                        <td>{template.ticketComponents}</td>
                        <td>{template.guideComponents}</td>
                        <td>{(template.diningComponents || 0) + (template.activityComponents || 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {templates.length > 25 ? <p className="table-subcopy">Showing first 25 of {templates.length} templates.</p> : null}
            </section>
          ) : null}

          {reusableInventory.length > 0 ? (
            <section className="transport-import-preview-group">
              <div className="transport-import-preview-group-head">
                <div>
                  <h4>Reusable inventory references</h4>
                  <p>{missingReusableInventory.length} missing reusable inventory references need operator review before activation.</p>
                </div>
              </div>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Component type</th>
                      <th>Name</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reusableInventory.slice(0, 40).map((entry, index) => (
                      <tr key={`${entry.componentType}-${entry.name}-${index}`}>
                        <td>{entry.componentType}</td>
                        <td>{entry.name || 'Unnamed reference'}</td>
                        <td>
                          <span className={entry.found ? 'status-pill status-pill-success' : 'status-pill status-pill-muted'}>
                            {entry.found ? 'Found' : 'Missing'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {reusableInventory.length > 40 ? <p className="table-subcopy">Showing first 40 of {reusableInventory.length} references.</p> : null}
            </section>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
