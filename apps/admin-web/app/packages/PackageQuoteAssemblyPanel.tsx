'use client';

import { FormEvent, useState } from 'react';

type PackageAssemblyPreviewComponent = {
  id: string;
  componentType: string;
  label: string;
  sortOrder: number;
  optional: boolean;
  selected: boolean;
  insertable: boolean;
  skipReason?: string | null;
  warning?: string | null;
  operationalReference?: string | null;
};

type PackageAssemblyPreviewDay = {
  id?: string | null;
  dayNumber: number;
  title: string;
  notes?: string | null;
  components: PackageAssemblyPreviewComponent[];
};

type PackageAssemblyPreview = {
  quoteId: string;
  packageTemplateId: string;
  packageName: string;
  duplicate: boolean;
  duplicateReason?: string | null;
  days: PackageAssemblyPreviewDay[];
};

type PackageQuoteAssemblyPanelProps = {
  apiBaseUrl: string;
  packageTemplateId: string;
};

export function PackageQuoteAssemblyPanel({ apiBaseUrl, packageTemplateId }: PackageQuoteAssemblyPanelProps) {
  const [quoteId, setQuoteId] = useState('');
  const [preview, setPreview] = useState<PackageAssemblyPreview | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isApplying, setIsApplying] = useState(false);

  async function loadPreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedQuoteId = quoteId.trim();
    if (!normalizedQuoteId) {
      setStatus('Enter a quote ID before previewing this package.');
      return;
    }

    setIsLoading(true);
    setStatus(null);
    setPreview(null);

    try {
      const response = await fetch(
        `${apiBaseUrl}/quotes/${encodeURIComponent(normalizedQuoteId)}/package-templates/${encodeURIComponent(packageTemplateId)}/preview`,
        { cache: 'no-store' },
      );
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.message || 'Package preview failed');
      }

      setPreview(payload);
      setStatus(payload.duplicate ? payload.duplicateReason || 'This package is already linked to the quote.' : null);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Package preview failed');
    } finally {
      setIsLoading(false);
    }
  }

  async function applyPackage() {
    if (!preview || preview.duplicate) {
      return;
    }

    setIsApplying(true);
    setStatus(null);

    try {
      const response = await fetch(
        `${apiBaseUrl}/quotes/${encodeURIComponent(preview.quoteId)}/package-templates/${encodeURIComponent(packageTemplateId)}/apply`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ selectedOptionalComponentIds: [] }),
        },
      );
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.message || 'Package assembly failed');
      }

      setStatus(
        `Package added to quote: ${payload.createdDays?.length || 0} days, ${payload.createdItems?.length || 0} quote items, ${
          payload.skippedComponents?.length || 0
        } skipped.`,
      );
      setPreview(null);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Package assembly failed');
    } finally {
      setIsApplying(false);
    }
  }

  return (
    <article className="detail-card">
      <div className="section-header">
        <span>
          <span className="eyebrow">Quote assembly</span>
          <h2>Add Package to Quote</h2>
        </span>
      </div>
      <form className="form-grid" onSubmit={loadPreview}>
        <label>
          Quote ID
          <input value={quoteId} onChange={(event) => setQuoteId(event.target.value)} placeholder="Paste quote ID" />
        </label>
        <div className="form-actions">
          <button type="submit" disabled={isLoading}>
            {isLoading ? 'Previewing...' : 'Preview package days'}
          </button>
        </div>
      </form>

      {status ? <p className={preview?.duplicate ? 'form-error' : 'table-cell-copy'}>{status}</p> : null}

      {preview ? (
        <div className="section-stack">
          {(() => {
            const skippedRequired = preview.days.flatMap((day) => day.components).filter((component) => !component.optional && !component.insertable);
            if (skippedRequired.length === 0) {
              return null;
            }
            return (
              <p className="form-error">
                ⚠ {skippedRequired.length} required component{skippedRequired.length === 1 ? '' : 's'} will be skipped (not linked or not priceable) and will not
                be added to the quote. Link them on the package template first to avoid silently dropping them.
              </p>
            );
          })()}
          {preview.days.map((day) => (
            <section key={`${day.id || 'day'}-${day.dayNumber}`} className="section-stack">
              <div className="section-header">
                <span>
                  <span className="eyebrow">Day {day.dayNumber}</span>
                  <strong>{day.title}</strong>
                  {day.notes ? <p className="table-cell-copy">{day.notes}</p> : null}
                </span>
              </div>
              {day.components.length > 0 ? (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Insert</th>
                        <th>Component</th>
                        <th>Reference</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {day.components.map((component) => (
                        <tr key={component.id}>
                          <td>
                            <input type="checkbox" checked={!component.optional && component.insertable} disabled readOnly />
                          </td>
                          <td>
                            <strong>{component.label}</strong>
                            <p className="table-cell-copy">{component.componentType}</p>
                          </td>
                          <td>{component.operationalReference || 'No reference'}</td>
                          <td>
                            {component.insertable ? (
                              component.optional ? (
                                <span className="status-pill status-pill-warning">Optional unchecked</span>
                              ) : (
                                <span className="status-pill status-pill-success">Required</span>
                              )
                            ) : (
                              <span className="status-pill status-pill-muted">{component.skipReason || 'Skipped'}</span>
                            )}
                            {component.warning ? <p className="table-cell-copy">{component.warning}</p> : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="table-cell-copy">No active components on this package day.</p>
              )}
            </section>
          ))}
          <div className="form-actions">
            <button type="button" onClick={applyPackage} disabled={preview.duplicate || isApplying}>
              {isApplying ? 'Adding...' : 'Add Package to Quote'}
            </button>
          </div>
        </div>
      ) : null}
    </article>
  );
}
