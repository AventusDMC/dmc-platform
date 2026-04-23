'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CurrencySelect } from '../components/CurrencySelect';
import { ServiceTypeCombobox } from '../components/ServiceTypeCombobox';
import { getErrorMessage } from '../lib/api';
import { type SupportedCurrency } from '../lib/currencyOptions';
import { ServiceTypeOption } from '../lib/serviceTypes';

type ServicesFormProps = {
  apiBaseUrl: string;
  serviceTypes: ServiceTypeOption[];
  serviceId?: string;
  submitLabel?: string;
  initialValues?: {
    supplierId: string;
    name: string;
    category: string;
    serviceTypeId: string | null;
    unitType: (typeof UNIT_TYPES)[number];
    baseCost: string;
    currency: SupportedCurrency;
  };
};

const UNIT_TYPES = [
  'per_person',
  'per_room',
  'per_vehicle',
  'per_group',
  'per_night',
  'per_day',
] as const;

export function ServicesForm({ apiBaseUrl, serviceTypes, serviceId, submitLabel, initialValues }: ServicesFormProps) {
  const router = useRouter();
  const [supplierId, setSupplierId] = useState(initialValues?.supplierId || '');
  const [name, setName] = useState(initialValues?.name || '');
  const [serviceTypeId, setServiceTypeId] = useState(initialValues?.serviceTypeId || '');
  const [category, setCategory] = useState(initialValues?.category || '');
  const [unitType, setUnitType] = useState<(typeof UNIT_TYPES)[number]>(initialValues?.unitType || 'per_person');
  const [baseCost, setBaseCost] = useState(initialValues?.baseCost || '');
  const [currency, setCurrency] = useState<SupportedCurrency>(initialValues?.currency || 'USD');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const isEditing = Boolean(serviceId);

  useEffect(() => {
    if (category.trim() || !serviceTypeId) {
      return;
    }

    const selectedServiceType = serviceTypes.find((serviceType) => serviceType.id === serviceTypeId);

    if (selectedServiceType?.name) {
      setCategory(selectedServiceType.name);
    }
  }, [category, serviceTypeId, serviceTypes]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      const response = await fetch(`${apiBaseUrl}/services${serviceId ? `/${serviceId}` : ''}`, {
        method: serviceId ? 'PATCH' : 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          supplierId,
          name,
          category,
          serviceTypeId: serviceTypeId || null,
          unitType,
          baseCost: Number(baseCost),
          currency,
        }),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not save service.'));
      }

      if (!isEditing) {
        setSupplierId('');
        setName('');
        setServiceTypeId('');
        setCategory('');
        setUnitType('per_person');
        setBaseCost('');
        setCurrency('USD');
      }
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not save service.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="entity-form" onSubmit={handleSubmit}>
      <div className="form-row">
        <label>
          Supplier ID
          <input value={supplierId} onChange={(event) => setSupplierId(event.target.value)} required />
        </label>

        <label>
          Service name
          <input value={name} onChange={(event) => setName(event.target.value)} required />
        </label>
      </div>

      <div className="form-row">
        <ServiceTypeCombobox
          label="Service type"
          serviceTypes={serviceTypes}
          value={serviceTypeId}
          onChange={setServiceTypeId}
          placeholder="Search service types"
          emptyLabel="No matching service types. Clear and use the legacy field if needed."
        />
      </div>

      <label>
        Legacy category
        <input
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          required={!serviceTypeId}
          placeholder={serviceTypeId ? 'Auto-filled from service type unless edited' : ''}
        />
      </label>

      <div className="form-row">
        <label>
          Unit type
          <select value={unitType} onChange={(event) => setUnitType(event.target.value as (typeof UNIT_TYPES)[number])}>
            {UNIT_TYPES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="form-row">
        <label>
          Base cost
          <input
            value={baseCost}
            onChange={(event) => setBaseCost(event.target.value)}
            type="number"
            min="0"
            step="0.01"
            required
          />
        </label>

        <label>
          Currency
          <CurrencySelect value={currency} onChange={(value) => setCurrency((value || 'USD') as SupportedCurrency)} required />
        </label>
      </div>

      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Saving...' : submitLabel || (isEditing ? 'Save changes' : 'Add service')}
      </button>

      {error ? <p className="form-error">{error}</p> : null}
    </form>
  );
}
