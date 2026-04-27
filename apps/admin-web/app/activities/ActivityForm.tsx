'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiValidationError, getApiError } from '../lib/api';
import { Activity, ActivityCompany, ActivityPricingBasis } from './types';

type ActivityFormProps = {
  apiBaseUrl: string;
  activityId?: string;
  companies: ActivityCompany[];
  submitLabel?: string;
  initialValues?: Activity | null;
};

const CURRENCIES = ['USD', 'EUR', 'JOD'];

function toStringValue(value: string | number | null | undefined) {
  return value === null || value === undefined ? '' : String(value);
}

export function ActivityForm({ apiBaseUrl, activityId, companies, submitLabel, initialValues }: ActivityFormProps) {
  const router = useRouter();
  const [name, setName] = useState(initialValues?.name || '');
  const [description, setDescription] = useState(initialValues?.description || '');
  const [country, setCountry] = useState(initialValues?.country || initialValues?.supplierCompany?.country || '');
  const [city, setCity] = useState(initialValues?.city || initialValues?.supplierCompany?.city || '');
  const [supplierCompanyId, setSupplierCompanyId] = useState(initialValues?.supplierCompanyId || '');
  const [pricingBasis, setPricingBasis] = useState<ActivityPricingBasis>(initialValues?.pricingBasis || 'PER_PERSON');
  const [costPrice, setCostPrice] = useState(toStringValue(initialValues?.costPrice));
  const [sellPrice, setSellPrice] = useState(toStringValue(initialValues?.sellPrice));
  const [currency, setCurrency] = useState(initialValues?.currency || 'USD');
  const [durationMinutes, setDurationMinutes] = useState(toStringValue(initialValues?.durationMinutes));
  const [defaultStartTime, setDefaultStartTime] = useState(initialValues?.defaultStartTime || '');
  const [operationNotes, setOperationNotes] = useState(initialValues?.operationNotes || '');
  const [active, setActive] = useState(initialValues?.active ?? true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [validationErrors, setValidationErrors] = useState<ApiValidationError[]>([]);
  const isEditing = Boolean(activityId);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setValidationErrors([]);

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

    setIsSubmitting(true);

    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        country: country.trim() || null,
        city: city.trim() || null,
        supplierCompanyId,
        pricingBasis,
        costPrice: normalizedCostPrice,
        sellPrice: normalizedSellPrice,
        currency,
        durationMinutes: durationMinutes.trim() ? Number(durationMinutes) : null,
        defaultStartTime: defaultStartTime.trim() || null,
        operationNotes: operationNotes.trim() || null,
        active,
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
        router.refresh();
      } else {
        router.push('/activities');
        router.refresh();
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : `Could not ${isEditing ? 'update' : 'create'} activity.`);
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

      <div className="form-row">
        <label>
          Country
          <input value={country} onChange={(event) => setCountry(event.target.value)} />
        </label>
        <label>
          City
          <input value={city} onChange={(event) => setCity(event.target.value)} />
        </label>
      </div>

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
          Currency
          <select value={currency} onChange={(event) => setCurrency(event.target.value)} required>
            {CURRENCIES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="form-row">
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
        <label>
          Default start time
          <input value={defaultStartTime} onChange={(event) => setDefaultStartTime(event.target.value)} type="time" />
        </label>
      </div>

      <label>
        Operation notes
        <textarea value={operationNotes} onChange={(event) => setOperationNotes(event.target.value)} rows={3} />
      </label>

      <label className="checkbox-row">
        <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />
        Active
      </label>

      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Saving...' : submitLabel || (isEditing ? 'Save activity' : 'Create activity')}
      </button>

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
