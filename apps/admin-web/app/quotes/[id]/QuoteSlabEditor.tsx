'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getApiError } from '../../lib/api';
import { buildAuthHeaders } from '../../lib/auth-client';
import { InlineRowEditorShell } from '../../components/InlineRowEditorShell';

type QuotePricingMode = 'SLAB' | 'FIXED';

type SlabRow = {
  id?: string;
  clientId: string;
  minPax: string;
  maxPax: string;
  focPax: string;
  price: string;
  notes: string;
};

type QuoteSlab = {
  id?: string;
  minPax: number;
  maxPax: number | null;
  focPax?: number | null;
  price: number;
  notes?: string | null;
  totalSell?: number;
  pricePerActualPax?: number | null;
};

type QuoteSlabEditorProps = {
  apiBaseUrl: string;
  quoteId: string;
  initialMode: QuotePricingMode;
  initialSlabs: QuoteSlab[];
  initialFixedPricePerPerson: number;
  initialGroupSize: number;
};

function createRow(values?: Partial<SlabRow>): SlabRow {
  return {
    id: values?.id,
    clientId: values?.clientId || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    minPax: values?.minPax || '',
    maxPax: values?.maxPax || '',
    focPax: values?.focPax || '0',
    price: values?.price || '',
    notes: values?.notes || '',
  };
}

function sortRows(rows: SlabRow[]) {
  return [...rows].sort((left, right) => {
    const leftMin = Number(left.minPax);
    const rightMin = Number(right.minPax);
    if (!Number.isFinite(leftMin) && !Number.isFinite(rightMin)) {
      return 0;
    }
    if (!Number.isFinite(leftMin)) {
      return 1;
    }
    if (!Number.isFinite(rightMin)) {
      return -1;
    }
    return leftMin - rightMin;
  });
}

function formatMoney(value: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

function buildSlabLabel(minPax: number, maxPax: number | null, focPax: number) {
  const rangeLabel =
    maxPax === null ? `${minPax}+ guests` : minPax === maxPax ? `${minPax} guest` : `${minPax}\u2013${maxPax} guests`;
  return focPax > 0 ? `${rangeLabel} + ${focPax} FOC` : rangeLabel;
}

function normalizeRows(rows: SlabRow[]) {
  return sortRows(
    rows.map((row) => ({
      ...row,
      focPax: row.focPax || '0',
    })),
  );
}

function validateRows(rows: SlabRow[]) {
  const errors: string[] = [];
  const normalized = rows
    .map((row, index) => {
      const minPax = row.minPax.trim() ? Number(row.minPax) : Number.NaN;
      const maxPax = row.maxPax.trim() ? Number(row.maxPax) : null;
      const focPax = row.focPax.trim() ? Number(row.focPax) : 0;
      const price = row.price.trim() ? Number(row.price) : Number.NaN;
      return { row, index, minPax, maxPax, focPax, price };
    })
    .filter((entry) => entry.row.minPax.trim() || entry.row.maxPax.trim() || entry.row.price.trim() || entry.row.notes.trim() || entry.row.focPax.trim());

  if (normalized.length === 0) {
    errors.push('Add at least one slab for group slab pricing.');
    return errors;
  }

  normalized.forEach((entry) => {
    const rowLabel = `Row ${entry.index + 1}`;
    if (!Number.isInteger(entry.minPax) || entry.minPax < 1) {
      errors.push(`${rowLabel}: From Pax is required and must be a whole number above zero.`);
    }
    if (entry.maxPax !== null && (!Number.isInteger(entry.maxPax) || entry.maxPax < 1)) {
      errors.push(`${rowLabel}: To Pax must be blank or a whole number above zero.`);
    }
    if (entry.maxPax !== null && Number.isInteger(entry.minPax) && entry.maxPax < entry.minPax) {
      errors.push(`${rowLabel}: To Pax must be greater than or equal to From Pax.`);
    }
    if (!Number.isFinite(entry.price) || entry.price < 0) {
      errors.push(`${rowLabel}: Price / paying guest must be zero or greater.`);
    }
    if (!Number.isInteger(entry.focPax) || entry.focPax < 0) {
      errors.push(`${rowLabel}: FOC must be zero or greater.`);
    }
    if (Number.isInteger(entry.minPax) && Number.isInteger(entry.focPax) && entry.focPax >= entry.minPax) {
      errors.push(`${rowLabel}: FOC must be lower than the slab group size.`);
    }
  });

  const sorted = [...normalized].sort((left, right) => left.minPax - right.minPax);
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    if (previous.maxPax === null) {
      errors.push(`Row ${previous.index + 1}: Open-ended slab must be last.`);
      continue;
    }
    if (current.minPax <= previous.maxPax) {
      errors.push(`Rows ${previous.index + 1} and ${current.index + 1}: slab ranges cannot overlap.`);
    }
  }

  const openEnded = sorted.findIndex((entry) => entry.maxPax === null);
  if (openEnded !== -1 && openEnded !== sorted.length - 1) {
    errors.push(`Row ${sorted[openEnded].index + 1}: Open-ended slab must be last.`);
  }

  return Array.from(new Set(errors));
}

export function QuoteSlabEditor({
  apiBaseUrl,
  quoteId,
  initialMode,
  initialSlabs,
  initialFixedPricePerPerson,
  initialGroupSize,
}: QuoteSlabEditorProps) {
  const router = useRouter();
  const [pricingMode, setPricingMode] = useState<QuotePricingMode>(initialMode);
  const [fixedPricePerPerson, setFixedPricePerPerson] = useState(
    initialFixedPricePerPerson > 0 ? String(initialFixedPricePerPerson) : '',
  );
  const [rows, setRows] = useState<SlabRow[]>(
    initialSlabs.length > 0
      ? normalizeRows(
          initialSlabs.map((slab) =>
            createRow({
              id: slab.id,
              minPax: String(slab.minPax),
              maxPax: slab.maxPax === null ? '' : String(slab.maxPax),
              focPax: String(slab.focPax ?? 0),
              price: String(slab.price),
              notes: slab.notes || '',
            }),
          ),
        )
      : [createRow()],
  );
  const [sampleGroupSize, setSampleGroupSize] = useState(String(Math.max(initialGroupSize, 1)));
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const validationErrors = useMemo(() => (pricingMode === 'SLAB' ? validateRows(rows) : []), [pricingMode, rows]);

  const normalizedPreviewRows = useMemo(
    () =>
      rows
        .map((row) => ({
          minPax: row.minPax.trim() ? Number(row.minPax) : Number.NaN,
          maxPax: row.maxPax.trim() ? Number(row.maxPax) : null,
          focPax: row.focPax.trim() ? Number(row.focPax) : 0,
          price: row.price.trim() ? Number(row.price) : Number.NaN,
          notes: row.notes.trim() || null,
        }))
        .filter((row) => Number.isInteger(row.minPax) && Number.isFinite(row.price) && row.price >= 0)
        .sort((left, right) => left.minPax - right.minPax),
    [rows],
  );

  const preview = useMemo(() => {
    const actualGuests = Math.max(1, Number(sampleGroupSize) || 1);
    const matchedSlab =
      normalizedPreviewRows.find((row) => actualGuests >= row.minPax && (row.maxPax === null || actualGuests <= row.maxPax)) || null;

    if (!matchedSlab) {
      return {
        actualGuests,
        matchedSlab: null,
        payingGuests: null,
        estimatedPerPerson: null,
        estimatedTotal: null,
      };
    }

    const payingGuests = Math.max(actualGuests - Math.max(0, matchedSlab.focPax), 0);
    const estimatedTotal = Number((matchedSlab.price * payingGuests).toFixed(2));
    const estimatedPerPerson = actualGuests > 0 ? Number((estimatedTotal / actualGuests).toFixed(2)) : null;

    return {
      actualGuests,
      matchedSlab,
      payingGuests,
      estimatedPerPerson,
      estimatedTotal,
    };
  }, [normalizedPreviewRows, sampleGroupSize]);

  function updateRow(clientId: string, field: keyof SlabRow, value: string) {
    setRows((current) =>
      normalizeRows(current.map((row) => (row.clientId === clientId ? { ...row, [field]: value } : row))),
    );
  }

  function addRow() {
    setRows((current) => normalizeRows([...current, createRow()]));
  }

  function duplicateRow(clientId: string) {
    setRows((current) => {
      const source = current.find((row) => row.clientId === clientId);
      if (!source) {
        return current;
      }
      return normalizeRows([
        ...current,
        createRow({
          minPax: source.minPax,
          maxPax: source.maxPax,
          focPax: source.focPax,
          price: source.price,
          notes: source.notes,
        }),
      ]);
    });
  }

  function removeRow(clientId: string) {
    setRows((current) => {
      const next = current.filter((row) => row.clientId !== clientId);
      return next.length > 0 ? normalizeRows(next) : [createRow()];
    });
  }

  async function savePricingModel() {
    setIsSaving(true);
    setError('');
    try {
      if (pricingMode === 'SLAB' && validationErrors.length > 0) {
        throw new Error(validationErrors[0]);
      }

      const payload =
        pricingMode === 'SLAB'
          ? {
              pricingMode: 'SLAB',
              pricingType: 'group',
              fixedPricePerPerson: null,
              pricingSlabs: normalizeRows(rows)
                .filter((row) => row.minPax.trim() || row.maxPax.trim() || row.price.trim() || row.notes.trim() || row.focPax.trim())
                .map((row) => ({
                  minPax: Number(row.minPax),
                  maxPax: row.maxPax.trim() ? Number(row.maxPax) : null,
                  focPax: row.focPax.trim() ? Number(row.focPax) : 0,
                  price: Number(row.price),
                  notes: row.notes.trim() || null,
                })),
            }
          : {
              pricingMode: 'FIXED',
              pricingType: 'simple',
              fixedPricePerPerson: fixedPricePerPerson.trim() ? Number(fixedPricePerPerson) : null,
              pricingSlabs: [],
            };

      const response = await fetch(`${apiBaseUrl}/quotes/${quoteId}`, {
        method: 'PATCH',
        headers: buildAuthHeaders({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const apiError = await getApiError(response, 'Could not save pricing setup.');
        throw new Error(apiError.message);
      }

      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not save pricing setup.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="section-stack">
      <InlineHelp />
      <label>
        Pricing Mode
        <select value={pricingMode} onChange={(event) => setPricingMode(event.target.value as QuotePricingMode)}>
          <option value="FIXED">Package price</option>
          <option value="SLAB">Group slabs</option>
        </select>
      </label>

      {pricingMode === 'SLAB' ? (
        <div className="section-stack">
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>From Pax</th>
                  <th>To Pax</th>
                  <th>FOC</th>
                  <th>Price / Paying Guest</th>
                  <th>Label Preview</th>
                  <th>Notes</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const minPax = row.minPax.trim() ? Number(row.minPax) : 0;
                  const maxPax = row.maxPax.trim() ? Number(row.maxPax) : null;
                  const focPax = row.focPax.trim() ? Number(row.focPax) : 0;
                  return (
                    <tr key={row.clientId}>
                      <td>
                        <input value={row.minPax} onChange={(event) => updateRow(row.clientId, 'minPax', event.target.value)} type="number" min="1" step="1" />
                      </td>
                      <td>
                        <input value={row.maxPax} onChange={(event) => updateRow(row.clientId, 'maxPax', event.target.value)} type="number" min={row.minPax || '1'} step="1" placeholder="Open ended" />
                      </td>
                      <td>
                        <input value={row.focPax} onChange={(event) => updateRow(row.clientId, 'focPax', event.target.value)} type="number" min="0" step="1" />
                      </td>
                      <td>
                        <input value={row.price} onChange={(event) => updateRow(row.clientId, 'price', event.target.value)} type="number" min="0" step="0.01" />
                      </td>
                      <td>{minPax > 0 ? buildSlabLabel(minPax, Number.isFinite(maxPax as number) ? maxPax : null, Math.max(0, focPax || 0)) : 'Awaiting range'}</td>
                      <td>
                        <input value={row.notes} onChange={(event) => updateRow(row.clientId, 'notes', event.target.value)} placeholder="Optional note" />
                      </td>
                      <td>
                        <div className="inline-actions">
                          <button type="button" className="secondary-button" onClick={() => duplicateRow(row.clientId)}>
                            Duplicate
                          </button>
                          <button type="button" className="secondary-button" onClick={() => removeRow(row.clientId)}>
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <button type="button" className="secondary-button" onClick={addRow}>
            Add slab
          </button>

          {validationErrors.length > 0 ? (
            <div className="section-stack">
              {validationErrors.map((message) => (
                <p key={message} className="form-error">
                  {message}
                </p>
              ))}
            </div>
          ) : null}

          <InlineRowEditorShell>
            <div className="section-stack">
              <div className="workspace-section-head">
                <div>
                  <p className="eyebrow">Live Preview</p>
                  <h3>Check a sample group size</h3>
                </div>
              </div>
              <label>
                Sample group size
                <input value={sampleGroupSize} onChange={(event) => setSampleGroupSize(event.target.value)} type="number" min="1" step="1" />
              </label>
              <div className="quote-preview-total-list">
                <div>
                  <span>Matching slab</span>
                  <strong>{preview.matchedSlab ? buildSlabLabel(preview.matchedSlab.minPax, preview.matchedSlab.maxPax, preview.matchedSlab.focPax) : 'No slab match'}</strong>
                </div>
                <div>
                  <span>Paying guests</span>
                  <strong>{preview.payingGuests ?? '-'}</strong>
                </div>
                <div>
                  <span>Estimated price per person</span>
                  <strong>{preview.estimatedPerPerson === null ? 'Pricing to be confirmed' : formatMoney(preview.estimatedPerPerson)}</strong>
                </div>
                <div>
                  <span>Estimated total</span>
                  <strong>{preview.estimatedTotal === null ? 'Pricing to be confirmed' : formatMoney(preview.estimatedTotal)}</strong>
                </div>
              </div>
              {preview.matchedSlab?.notes ? <p className="table-subcopy">{preview.matchedSlab.notes}</p> : null}
            </div>
          </InlineRowEditorShell>
        </div>
      ) : (
        <label>
          Package sell price per person
          <input value={fixedPricePerPerson} onChange={(event) => setFixedPricePerPerson(event.target.value)} type="number" min="0" step="0.01" placeholder="Set package sell price" />
        </label>
      )}

      <div className="inline-actions">
        <button type="button" onClick={savePricingModel} disabled={isSaving}>
          {isSaving ? 'Saving...' : 'Save pricing model'}
        </button>
      </div>
      {error ? <p className="form-error">{error}</p> : null}
    </div>
  );
}

function InlineHelp() {
  return <p className="table-subcopy">FOC reduces paying guests for this slab.</p>;
}
