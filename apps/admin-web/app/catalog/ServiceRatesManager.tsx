'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CurrencySelect } from '../components/CurrencySelect';
import { getErrorMessage, logFetchUrl } from '../lib/api';
import { type SupportedCurrency } from '../lib/currencyOptions';

type ServiceRate = {
  id: string;
  serviceId: string;
  supplierId: string | null;
  costBaseAmount: number;
  costCurrency: SupportedCurrency;
  pricingMode: 'PER_PERSON' | 'PER_GROUP' | 'PER_DAY';
  salesTaxPercent: number;
  salesTaxIncluded: boolean;
  serviceChargePercent: number;
  serviceChargeIncluded: boolean;
  tourismFeeAmount: number | null;
  tourismFeeCurrency: SupportedCurrency | null;
  tourismFeeMode: 'PER_NIGHT_PER_PERSON' | 'PER_NIGHT_PER_ROOM' | null;
};

type ServiceRatesManagerProps = {
  apiBaseUrl: string;
  serviceId: string;
  initialRates: ServiceRate[];
  showTourismFee?: boolean;
};

type FormState = {
  supplierId: string;
  costBaseAmount: string;
  costCurrency: SupportedCurrency;
  pricingMode: 'PER_PERSON' | 'PER_GROUP' | 'PER_DAY';
  salesTaxPercent: string;
  salesTaxIncluded: boolean;
  serviceChargePercent: string;
  serviceChargeIncluded: boolean;
  tourismFeeAmount: string;
  tourismFeeCurrency: SupportedCurrency | '';
  tourismFeeMode: '' | 'PER_NIGHT_PER_PERSON' | 'PER_NIGHT_PER_ROOM';
};

const DEFAULT_FORM_STATE: FormState = {
  supplierId: '',
  costBaseAmount: '',
  costCurrency: 'USD',
  pricingMode: 'PER_PERSON',
  salesTaxPercent: '',
  salesTaxIncluded: false,
  serviceChargePercent: '',
  serviceChargeIncluded: false,
  tourismFeeAmount: '',
  tourismFeeCurrency: '',
  tourismFeeMode: '',
};

function formatMoney(value: number, currency: string) {
  return `${currency} ${value.toFixed(2)}`;
}

function createFormState(rate?: ServiceRate): FormState {
  if (!rate) {
    return DEFAULT_FORM_STATE;
  }

  return {
    supplierId: rate.supplierId || '',
    costBaseAmount: String(rate.costBaseAmount),
    costCurrency: rate.costCurrency,
    pricingMode: rate.pricingMode,
    salesTaxPercent: rate.salesTaxPercent ? String(rate.salesTaxPercent) : '',
    salesTaxIncluded: Boolean(rate.salesTaxIncluded),
    serviceChargePercent: rate.serviceChargePercent ? String(rate.serviceChargePercent) : '',
    serviceChargeIncluded: Boolean(rate.serviceChargeIncluded),
    tourismFeeAmount: rate.tourismFeeAmount === null ? '' : String(rate.tourismFeeAmount),
    tourismFeeCurrency: rate.tourismFeeCurrency || '',
    tourismFeeMode: rate.tourismFeeMode || '',
  };
}

export function ServiceRatesManager({ apiBaseUrl, serviceId, initialRates, showTourismFee = false }: ServiceRatesManagerProps) {
  const router = useRouter();
  const [editingRateId, setEditingRateId] = useState<string | null>(null);
  const [formState, setFormState] = useState<FormState>(DEFAULT_FORM_STATE);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const rates = initialRates;

  function startCreate() {
    setEditingRateId(null);
    setFormState(DEFAULT_FORM_STATE);
    setError('');
    setOpen(true);
  }

  function startEdit(rate: ServiceRate) {
    setEditingRateId(rate.id);
    setFormState(createFormState(rate));
    setError('');
    setOpen(true);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      const url = editingRateId
        ? `${apiBaseUrl}/service-rates/${editingRateId}`
        : `${apiBaseUrl}/services/${serviceId}/rates`;
      const response = await fetch(logFetchUrl(url), {
        method: editingRateId ? 'PATCH' : 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          supplierId: formState.supplierId.trim() || null,
          costBaseAmount: Number(formState.costBaseAmount),
          costCurrency: formState.costCurrency,
          pricingMode: formState.pricingMode,
          salesTaxPercent: formState.salesTaxPercent.trim() ? Number(formState.salesTaxPercent) : 0,
          salesTaxIncluded: formState.salesTaxIncluded,
          serviceChargePercent: formState.serviceChargePercent.trim() ? Number(formState.serviceChargePercent) : 0,
          serviceChargeIncluded: formState.serviceChargeIncluded,
          tourismFeeAmount: formState.tourismFeeAmount.trim() ? Number(formState.tourismFeeAmount) : null,
          tourismFeeCurrency: formState.tourismFeeCurrency || null,
          tourismFeeMode: formState.tourismFeeMode || null,
        }),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not save service rate.'));
      }

      setEditingRateId(null);
      setFormState(DEFAULT_FORM_STATE);
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not save service rate.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete(rateId: string) {
    if (!window.confirm('Delete this service rate?')) {
      return;
    }

    try {
      const url = `${apiBaseUrl}/service-rates/${rateId}`;
      const response = await fetch(logFetchUrl(url), {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not delete service rate.'));
      }

      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not delete service rate.');
    }
  }

  return (
    <details className="stacked-card" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="inline-actions" style={{ cursor: 'pointer', listStyle: 'none' }}>
        <strong>Rates</strong>
        <span className="table-subcopy">{rates.length} structured rate{rates.length === 1 ? '' : 's'}</span>
      </summary>

      <div className="section-stack" style={{ marginTop: 12 }}>
        {rates.length > 0 ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Mode</th>
                  <th>Cost</th>
                  <th>Tax / service</th>
                  {showTourismFee ? <th>Tourism fee</th> : null}
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rates.map((rate) => (
                  <tr key={rate.id}>
                    <td>{rate.pricingMode.replaceAll('_', ' ')}</td>
                    <td>{formatMoney(rate.costBaseAmount, rate.costCurrency)}</td>
                    <td>
                      {`${rate.salesTaxPercent || 0}% tax${rate.salesTaxIncluded ? ' incl.' : ''} | ${rate.serviceChargePercent || 0}% svc${rate.serviceChargeIncluded ? ' incl.' : ''}`}
                    </td>
                    {showTourismFee ? (
                      <td>
                        {rate.tourismFeeAmount
                          ? `${formatMoney(rate.tourismFeeAmount, rate.tourismFeeCurrency || rate.costCurrency)} ${rate.tourismFeeMode?.replaceAll('_', ' ').toLowerCase()}`
                          : 'None'}
                      </td>
                    ) : null}
                    <td>
                      <div className="inline-actions">
                        <button type="button" className="secondary-button" onClick={() => startEdit(rate)}>
                          Edit
                        </button>
                        <button type="button" className="secondary-button" onClick={() => handleDelete(rate.id)}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="detail-copy">No structured rates yet.</p>
        )}

        <button type="button" className="secondary-button" onClick={startCreate}>
          {editingRateId ? 'Add another rate' : 'Add rate'}
        </button>

        {open ? (
          <form className="entity-form" onSubmit={handleSubmit}>
            <div className="form-row form-row-4">
              <label>
                Supplier ID
                <input
                  value={formState.supplierId}
                  onChange={(event) => setFormState((current) => ({ ...current, supplierId: event.target.value }))}
                  placeholder="Optional override"
                />
              </label>
              <label>
                Cost
                <input
                  value={formState.costBaseAmount}
                  onChange={(event) => setFormState((current) => ({ ...current, costBaseAmount: event.target.value }))}
                  type="number"
                  min="0"
                  step="0.01"
                  required
                />
              </label>
              <label>
                Currency
                <CurrencySelect
                  value={formState.costCurrency}
                  onChange={(value) => setFormState((current) => ({ ...current, costCurrency: (value || 'USD') as SupportedCurrency }))}
                  required
                />
              </label>
              <label>
                Pricing mode
                <select
                  value={formState.pricingMode}
                  onChange={(event) =>
                    setFormState((current) => ({ ...current, pricingMode: event.target.value as FormState['pricingMode'] }))
                  }
                >
                  <option value="PER_PERSON">Per person</option>
                  <option value="PER_GROUP">Per group</option>
                  <option value="PER_DAY">Per day</option>
                </select>
              </label>
            </div>

            <div className="form-row form-row-4">
              <label>
                Sales tax %
                <input
                  value={formState.salesTaxPercent}
                  onChange={(event) => setFormState((current) => ({ ...current, salesTaxPercent: event.target.value }))}
                  type="number"
                  min="0"
                  step="0.01"
                />
              </label>
              <label className="checkbox-row">
                <span>Sales tax included</span>
                <input
                  checked={formState.salesTaxIncluded}
                  onChange={(event) => setFormState((current) => ({ ...current, salesTaxIncluded: event.target.checked }))}
                  type="checkbox"
                />
              </label>
              <label>
                Service charge %
                <input
                  value={formState.serviceChargePercent}
                  onChange={(event) => setFormState((current) => ({ ...current, serviceChargePercent: event.target.value }))}
                  type="number"
                  min="0"
                  step="0.01"
                />
              </label>
              <label className="checkbox-row">
                <span>Service charge included</span>
                <input
                  checked={formState.serviceChargeIncluded}
                  onChange={(event) => setFormState((current) => ({ ...current, serviceChargeIncluded: event.target.checked }))}
                  type="checkbox"
                />
              </label>
            </div>

            {showTourismFee ? (
              <div className="form-row form-row-3">
                <label>
                  Tourism fee paid to hotel
                  <input
                    value={formState.tourismFeeAmount}
                    onChange={(event) => setFormState((current) => ({ ...current, tourismFeeAmount: event.target.value }))}
                    type="number"
                    min="0"
                    step="0.01"
                  />
                </label>
                <label>
                  Tourism fee currency
                  <CurrencySelect
                    value={formState.tourismFeeCurrency}
                    onChange={(value) =>
                      setFormState((current) => ({ ...current, tourismFeeCurrency: value as SupportedCurrency | '' }))
                    }
                    allowEmpty
                    emptyLabel="None"
                  />
                </label>
                <label>
                  Tourism fee basis
                  <select
                    value={formState.tourismFeeMode}
                    onChange={(event) =>
                      setFormState((current) => ({
                        ...current,
                        tourismFeeMode: event.target.value as FormState['tourismFeeMode'],
                      }))
                    }
                  >
                    <option value="">None</option>
                    <option value="PER_NIGHT_PER_PERSON">Per night per person</option>
                    <option value="PER_NIGHT_PER_ROOM">Per night per room</option>
                  </select>
                </label>
              </div>
            ) : null}

            <div className="form-row">
              <button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Saving...' : editingRateId ? 'Save rate' : 'Create rate'}
              </button>
            </div>

            {error ? <p className="form-error">{error}</p> : null}
          </form>
        ) : null}
      </div>
    </details>
  );
}
