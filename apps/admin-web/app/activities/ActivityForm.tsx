'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiValidationError, getApiError } from '../lib/api';
import { Activity, ActivityCompany, ActivityPricingBasis, ActivityRateVariant } from './types';

type ActivityFormProps = {
  apiBaseUrl: string;
  activityId?: string;
  companies: ActivityCompany[];
  submitLabel?: string;
  initialValues?: Activity | null;
};

function toStringValue(value: string | number | null | undefined) {
  return value === null || value === undefined ? '' : String(value);
}

type ActivityRateVariantFormRow = {
  id?: string;
  name: string;
  durationMinutes: string;
  costPrice: string;
  sellPrice: string;
  pricingBasis: ActivityPricingBasis;
  maxPaxPerUnit: string;
  active: boolean;
  notes: string;
};

function toVariantRow(variant?: Partial<ActivityRateVariant>): ActivityRateVariantFormRow {
  return {
    id: variant?.id,
    name: variant?.name || '',
    durationMinutes: toStringValue(variant?.durationMinutes),
    costPrice: toStringValue(variant?.costPrice),
    sellPrice: toStringValue(variant?.sellPrice),
    pricingBasis: variant?.pricingBasis || 'PER_GROUP',
    maxPaxPerUnit: toStringValue(variant?.maxPaxPerUnit),
    active: variant?.active ?? true,
    notes: variant?.notes || '',
  };
}

export function ActivityForm({ apiBaseUrl, activityId, companies, submitLabel, initialValues }: ActivityFormProps) {
  const router = useRouter();
  const [name, setName] = useState(initialValues?.name || '');
  const [description, setDescription] = useState(initialValues?.description || '');
  const [supplierCompanyId, setSupplierCompanyId] = useState(initialValues?.supplierCompanyId || '');
  const [pricingBasis, setPricingBasis] = useState<ActivityPricingBasis>(initialValues?.pricingBasis || 'PER_PERSON');
  const [costPrice, setCostPrice] = useState(toStringValue(initialValues?.costPrice));
  const [sellPrice, setSellPrice] = useState(toStringValue(initialValues?.sellPrice));
  const [durationMinutes, setDurationMinutes] = useState(toStringValue(initialValues?.durationMinutes));
  const [active, setActive] = useState(initialValues?.active ?? true);
  const [rateVariants, setRateVariants] = useState<ActivityRateVariantFormRow[]>(
    initialValues?.rateVariants?.map(toVariantRow) || [],
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [error, setError] = useState('');
  const [validationErrors, setValidationErrors] = useState<ApiValidationError[]>([]);
  const isEditing = Boolean(activityId);

  function updateVariant(index: number, updates: Partial<ActivityRateVariantFormRow>) {
    setSaveState('idle');
    setRateVariants((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...updates } : row)));
  }

  function duplicateVariant(index: number) {
    setSaveState('idle');
    setRateVariants((current) => {
      const source = current[index];
      if (!source) return current;

      const duplicatedVariant = {
        ...source,
        id: undefined,
        name: `${source.name || 'Variant'} Copy`,
        active: true,
      };

      return [...current.slice(0, index + 1), duplicatedVariant, ...current.slice(index + 1)];
    });
  }

  function moveVariant(index: number, direction: -1 | 1) {
    setSaveState('idle');
    setRateVariants((current) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.length) return current;

      const next = [...current];
      const [row] = next.splice(index, 1);
      next.splice(nextIndex, 0, row);
      return next;
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setValidationErrors([]);
    setSaveState('idle');

    const normalizedCostPrice = Number(costPrice);
    const normalizedSellPrice = Number(sellPrice);

    if (!name.trim()) {
      setError('Activity name is required.');
      return;
    }
    if (!supplierCompanyId) {
      setError('Supplier company is required.');
      return;
    }
    if (!Number.isFinite(normalizedCostPrice) || normalizedCostPrice < 0 || !Number.isFinite(normalizedSellPrice) || normalizedSellPrice < 0) {
      setError('Cost price and sell price must be zero or greater.');
      return;
    }

    const normalizedRateVariants = [];

    for (const [index, variant] of rateVariants.entries()) {
      const variantCost = Number(variant.costPrice);
      const variantSell = Number(variant.sellPrice);
      const variantDuration = variant.durationMinutes.trim() ? Number(variant.durationMinutes) : null;
      const variantMaxPax = variant.maxPaxPerUnit.trim() ? Number(variant.maxPaxPerUnit) : null;

      if (!variant.name.trim()) {
        setError(`Rate variant ${index + 1} name is required.`);
        return;
      }
      if (!Number.isFinite(variantCost) || variantCost < 0 || !Number.isFinite(variantSell) || variantSell < 0) {
        setError(`Rate variant ${index + 1} cost and sell must be zero or greater.`);
        return;
      }
      if (variantDuration !== null && (!Number.isFinite(variantDuration) || variantDuration < 0)) {
        setError(`Rate variant ${index + 1} duration must be zero or greater.`);
        return;
      }
      if (variantMaxPax !== null && (!Number.isFinite(variantMaxPax) || variantMaxPax < 1)) {
        setError(`Rate variant ${index + 1} max pax per unit must be one or greater.`);
        return;
      }

      normalizedRateVariants.push({
        id: variant.id,
        name: variant.name.trim(),
        durationMinutes: variantDuration,
        pricingBasis: variant.pricingBasis,
        costPrice: variantCost,
        sellPrice: variantSell,
        maxPaxPerUnit: variantMaxPax,
        active: variant.active,
        notes: variant.notes.trim() || null,
      });
    }

    setIsSubmitting(true);
    setSaveState('saving');

    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        supplierCompanyId,
        pricingBasis,
        costPrice: normalizedCostPrice,
        sellPrice: normalizedSellPrice,
        durationMinutes: durationMinutes.trim() ? Number(durationMinutes) : null,
        active,
        rateVariants: normalizedRateVariants,
      };

      const response = await fetch(`${apiBaseUrl}/activities${activityId ? `/${activityId}` : ''}`, {
        method: activityId ? 'PATCH' : 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const apiError = await getApiError(response, `Could not ${isEditing ? 'update' : 'create'} activity.`);
        setValidationErrors(apiError.errors);
        throw new Error(apiError.message);
      }

      if (isEditing) {
        setSaveState('saved');
        router.refresh();
      } else {
        router.push('/activities');
        router.refresh();
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : `Could not ${isEditing ? 'update' : 'create'} activity.`);
      setSaveState('idle');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="entity-form" onSubmit={handleSubmit}>
      <label>
        Name
        <input value={name} onChange={(event) => setName(event.target.value)} required />
      </label>

      <label>
        Description
        <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={4} />
      </label>

      <label>
        Supplier company
        <select value={supplierCompanyId} onChange={(event) => setSupplierCompanyId(event.target.value)} required>
          <option value="">Select supplier company</option>
          {companies.map((company) => (
            <option key={company.id} value={company.id}>
              {company.name}
              {company.type ? ` (${company.type})` : ''}
            </option>
          ))}
        </select>
      </label>

      <div className="form-row">
        <label>
          Pricing basis
          <select value={pricingBasis} onChange={(event) => setPricingBasis(event.target.value as ActivityPricingBasis)} required>
            <option value="PER_PERSON">Per person</option>
            <option value="PER_GROUP">Per group</option>
          </select>
        </label>
        <label>
          Cost price
          <input value={costPrice} onChange={(event) => setCostPrice(event.target.value)} type="number" min="0" step="0.01" required />
        </label>
        <label>
          Sell price
          <input value={sellPrice} onChange={(event) => setSellPrice(event.target.value)} type="number" min="0" step="0.01" required />
        </label>
      </div>

      <div className="form-row">
        <label>
          Duration minutes
          <input value={durationMinutes} onChange={(event) => setDurationMinutes(event.target.value)} type="number" min="0" />
        </label>
      </div>

      <label className="checkbox-row">
        <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />
        Active
      </label>

      <section className="quote-hotel-step-panel">
        <div className="quote-hotel-step-head">
          <div>
            <h3>Rate variants</h3>
            <p className="detail-copy">Use variants for duration or capacity-based options under this activity.</p>
          </div>
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              setSaveState('idle');
              setRateVariants((current) => [...current, toVariantRow()]);
            }}
          >
            Add variant
          </button>
        </div>

        {rateVariants.length === 0 ? (
          <p className="detail-copy">No variants. Quotes will use the simple activity price above.</p>
        ) : (
          <div className="quote-external-matrix-table">
            {rateVariants.map((variant, index) => (
              <div className="form-row form-row-3" key={variant.id || index}>
                <label>
                  Label
                  <input
                    value={variant.name}
                    onChange={(event) => updateVariant(index, { name: event.target.value })}
                    placeholder="2 Hours"
                    required
                  />
                </label>
                <label>
                  Duration minutes
                  <input
                    value={variant.durationMinutes}
                    onChange={(event) => updateVariant(index, { durationMinutes: event.target.value })}
                    type="number"
                    min="0"
                  />
                </label>
                <label>
                  Pricing basis
                  <select
                    value={variant.pricingBasis}
                    onChange={(event) => updateVariant(index, { pricingBasis: event.target.value as ActivityPricingBasis })}
                  >
                    <option value="PER_PERSON">Per person</option>
                    <option value="PER_GROUP">Per group</option>
                  </select>
                </label>
                <label>
                  Cost
                  <input
                    value={variant.costPrice}
                    onChange={(event) => updateVariant(index, { costPrice: event.target.value })}
                    type="number"
                    min="0"
                    step="0.01"
                    required
                  />
                </label>
                <label>
                  Sell
                  <input
                    value={variant.sellPrice}
                    onChange={(event) => updateVariant(index, { sellPrice: event.target.value })}
                    type="number"
                    min="0"
                    step="0.01"
                    required
                  />
                </label>
                <label>
                  Max pax per unit
                  <input
                    value={variant.maxPaxPerUnit}
                    onChange={(event) => updateVariant(index, { maxPaxPerUnit: event.target.value })}
                    type="number"
                    min="1"
                    placeholder="6"
                  />
                </label>
                <label>
                  Notes
                  <input
                    value={variant.notes}
                    onChange={(event) => updateVariant(index, { notes: event.target.value })}
                  />
                </label>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={variant.active}
                    onChange={(event) => updateVariant(index, { active: event.target.checked })}
                  />
                  {variant.active ? 'Active' : 'Inactive'}
                </label>
                <div className="table-action-group">
                  <button type="button" className="secondary-button" onClick={() => moveVariant(index, -1)} disabled={index === 0}>
                    Move up
                  </button>
                  <button type="button" className="secondary-button" onClick={() => moveVariant(index, 1)} disabled={index === rateVariants.length - 1}>
                    Move down
                  </button>
                  <button type="button" className="secondary-button" onClick={() => duplicateVariant(index)}>
                    Duplicate
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => {
                      setSaveState('idle');
                      setRateVariants((current) => current.filter((_, rowIndex) => rowIndex !== index));
                    }}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Saving...' : submitLabel || (isEditing ? 'Save activity' : 'Create activity')}
      </button>
      {saveState === 'saving' ? <p className="detail-copy">Saving activity changes...</p> : null}
      {saveState === 'saved' ? <p className="status-text-success">Activity changes saved.</p> : null}

      {error ? <p className="form-error">{error}</p> : null}
      {validationErrors.length > 0 ? (
        <div className="form-error">
          {validationErrors.map((validationError) => (
            <p key={`${validationError.path}:${validationError.code}`}>{validationError.message}</p>
          ))}
        </div>
      ) : null}
    </form>
  );
}
