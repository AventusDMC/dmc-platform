'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getErrorMessage } from '../lib/api';

export type TicketRateVariant = {
  id?: string | null;
  label: string;
  costPrice: number;
  sellPrice?: number | null;
  currency: string;
  pricingBasis: 'PER_PERSON' | 'PER_GROUP' | 'PER_DAY';
  notes?: string | null;
  active: boolean;
  sortOrder?: number | null;
};

type TicketVariantFormRow = {
  id?: string | null;
  label: string;
  costPrice: string;
  sellPrice: string;
  currency: string;
  pricingBasis: 'PER_PERSON' | 'PER_GROUP' | 'PER_DAY';
  notes: string;
  active: boolean;
};

type TicketVariantsManagerProps = {
  apiBaseUrl: string;
  serviceId: string;
  initialVariants: TicketRateVariant[];
};

function toRow(variant?: TicketRateVariant): TicketVariantFormRow {
  return {
    id: variant?.id,
    label: variant?.label || '',
    costPrice: variant?.costPrice === undefined || variant?.costPrice === null ? '' : String(variant.costPrice),
    sellPrice: variant?.sellPrice === undefined || variant?.sellPrice === null ? '' : String(variant.sellPrice),
    currency: variant?.currency || 'JOD',
    pricingBasis: variant?.pricingBasis || 'PER_PERSON',
    notes: variant?.notes || '',
    active: variant?.active ?? true,
  };
}

export function TicketVariantsManager({ apiBaseUrl, serviceId, initialVariants }: TicketVariantsManagerProps) {
  const router = useRouter();
  const [rows, setRows] = useState<TicketVariantFormRow[]>(initialVariants.map(toRow));
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  function updateRow(index: number, updates: Partial<TicketVariantFormRow>) {
    setStatus('');
    setRows((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...updates } : row)));
  }

  function duplicateRow(index: number) {
    setStatus('');
    setRows((current) => {
      const source = current[index];
      if (!source) return current;
      const duplicate = { ...source, id: undefined, label: `${source.label || 'Variant'} Copy`, active: true };
      return [...current.slice(0, index + 1), duplicate, ...current.slice(index + 1)];
    });
  }

  function moveRow(index: number, direction: -1 | 1) {
    setStatus('');
    setRows((current) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      const [row] = next.splice(index, 1);
      next.splice(nextIndex, 0, row);
      return next;
    });
  }

  async function saveVariants() {
    setIsSaving(true);
    setError('');
    setStatus('Saving variants...');

    try {
      const ticketRateVariants = rows.map((row, index) => {
        const costPrice = Number(row.costPrice);
        const sellPrice = row.sellPrice.trim() ? Number(row.sellPrice) : null;

        if (!row.label.trim()) {
          throw new Error(`Variant ${index + 1} label is required.`);
        }
        if (!Number.isFinite(costPrice) || costPrice < 0) {
          throw new Error(`Variant ${index + 1} cost must be zero or greater.`);
        }
        if (sellPrice !== null && (!Number.isFinite(sellPrice) || sellPrice < 0)) {
          throw new Error(`Variant ${index + 1} sell price must be zero or greater.`);
        }
        if (!row.currency.trim()) {
          throw new Error(`Variant ${index + 1} currency is required.`);
        }

        return {
          id: row.id || undefined,
          label: row.label.trim(),
          costPrice,
          sellPrice,
          currency: row.currency.trim().toUpperCase(),
          pricingBasis: row.pricingBasis,
          notes: row.notes.trim() || null,
          active: row.active,
        };
      });

      const response = await fetch(`${apiBaseUrl}/services/${serviceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketRateVariants }),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not save ticket variants.'));
      }

      setStatus('Ticket variants saved.');
      router.refresh();
    } catch (caughtError) {
      setStatus('');
      setError(caughtError instanceof Error ? caughtError.message : 'Could not save ticket variants.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="quote-hotel-step-panel">
      <div className="quote-hotel-step-head">
        <div>
          <p className="eyebrow">Ticket variants</p>
          <h3>Operational ticket options</h3>
        </div>
        <button type="button" className="secondary-button" onClick={() => setRows((current) => [...current, toRow()])}>
          Add variant
        </button>
      </div>

      {rows.length === 0 ? <p className="detail-copy">No variants. Quotes use the simple ticket service price.</p> : null}
      {rows.map((row, index) => (
        <div className="form-row form-row-3" key={row.id || index}>
          <label>
            Label
            <input value={row.label} onChange={(event) => updateRow(index, { label: event.target.value })} placeholder="1 Day" required />
          </label>
          <label>
            Cost
            <input value={row.costPrice} onChange={(event) => updateRow(index, { costPrice: event.target.value })} type="number" min="0" step="0.01" required />
          </label>
          <label>
            Sell
            <input value={row.sellPrice} onChange={(event) => updateRow(index, { sellPrice: event.target.value })} type="number" min="0" step="0.01" />
          </label>
          <label>
            Currency
            <input value={row.currency} onChange={(event) => updateRow(index, { currency: event.target.value.toUpperCase() })} maxLength={3} required />
          </label>
          <label>
            Pricing basis
            <select value={row.pricingBasis} onChange={(event) => updateRow(index, { pricingBasis: event.target.value as TicketVariantFormRow['pricingBasis'] })}>
              <option value="PER_PERSON">Per person</option>
              <option value="PER_GROUP">Per group</option>
              <option value="PER_DAY">Per day</option>
            </select>
          </label>
          <label>
            Notes
            <input value={row.notes} onChange={(event) => updateRow(index, { notes: event.target.value })} />
          </label>
          <label className="checkbox-row">
            <input type="checkbox" checked={row.active} onChange={(event) => updateRow(index, { active: event.target.checked })} />
            {row.active ? 'Active' : 'Inactive'}
          </label>
          <div className="table-action-group">
            <button type="button" className="secondary-button" onClick={() => moveRow(index, -1)} disabled={index === 0}>Move up</button>
            <button type="button" className="secondary-button" onClick={() => moveRow(index, 1)} disabled={index === rows.length - 1}>Move down</button>
            <button type="button" className="secondary-button" onClick={() => duplicateRow(index)}>Duplicate</button>
            <button type="button" className="secondary-button" onClick={() => updateRow(index, { active: false })}>Deactivate</button>
          </div>
        </div>
      ))}

      <button type="button" className="secondary-button" onClick={saveVariants} disabled={isSaving}>
        {isSaving ? 'Saving...' : 'Save variants'}
      </button>
      {status ? <p className="detail-copy">{status}</p> : null}
      {error ? <p className="form-error">{error}</p> : null}
    </section>
  );
}
