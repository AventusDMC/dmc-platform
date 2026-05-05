'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getErrorMessage } from '../lib/api';
import { SUPPLIER_STANDARDIZATION_HELPER_TEXT } from '../lib/transport-suppliers';
import { getVehicleTypeOptionsWithFallback, normalizeVehicleTypeLabel, readStoredVehicleTypeOptions, writeVehicleTypeAssignment, type VehicleTypeOption } from '../lib/vehicle-types';

type SupplierOption = {
  id: string;
  name: string;
};

type VehiclesFormProps = {
  apiBaseUrl: string;
  vehicleId?: string;
  submitLabel?: string;
  suppliers?: SupplierOption[];
  vehicleTypes?: VehicleTypeOption[];
  initialValues?: {
    supplierId: string;
    supplierName?: string | null;
    name: string;
    vehicleType?: string | null;
    maxPax: string;
    luggageCapacity: string;
  };
};

export function VehiclesForm({ apiBaseUrl, vehicleId, submitLabel, suppliers = [], vehicleTypes = [], initialValues }: VehiclesFormProps) {
  const router = useRouter();
  const [supplierId, setSupplierId] = useState(initialValues?.supplierId || '');
  const [name, setName] = useState(initialValues?.name || '');
  const [storedVehicleTypes, setStoredVehicleTypes] = useState<VehicleTypeOption[]>(vehicleTypes);
  const [vehicleType, setVehicleType] = useState<string>(
    initialValues
      ? normalizeVehicleTypeLabel(initialValues.vehicleType, vehicleTypes) || vehicleTypes[0]?.label || 'Sedan'
      : vehicleTypes[0]?.label || 'Sedan',
  );
  const [maxPax, setMaxPax] = useState(initialValues?.maxPax || '');
  const [luggageCapacity, setLuggageCapacity] = useState(initialValues?.luggageCapacity || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const isEditing = Boolean(vehicleId);
  const vehicleTypeOptions = useMemo(() => {
    return getVehicleTypeOptionsWithFallback(storedVehicleTypes.length > 0 ? storedVehicleTypes : vehicleTypes);
  }, [storedVehicleTypes, vehicleTypes]);

  useEffect(() => {
    if (!vehicleTypeOptions.some((option) => option.label === vehicleType)) {
      setVehicleType(vehicleTypeOptions[0]?.label || 'Sedan');
    }
  }, [vehicleType, vehicleTypeOptions]);

  useEffect(() => {
    function loadVehicleTypes() {
      setStoredVehicleTypes(readStoredVehicleTypeOptions());
    }

    loadVehicleTypes();
    window.addEventListener('dmc:vehicle-types-changed', loadVehicleTypes);
    window.addEventListener('storage', loadVehicleTypes);

    return () => {
      window.removeEventListener('dmc:vehicle-types-changed', loadVehicleTypes);
      window.removeEventListener('storage', loadVehicleTypes);
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      const response = await fetch(`${apiBaseUrl}/vehicles${vehicleId ? `/${vehicleId}` : ''}`, {
        method: vehicleId ? 'PATCH' : 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          supplierId,
          name,
          vehicleType: normalizeVehicleTypeLabel(vehicleType, vehicleTypeOptions),
          maxPax: Number(maxPax),
          luggageCapacity: Number(luggageCapacity),
        }),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not save vehicle.'));
      }

      let savedVehicleId = vehicleId || '';
      try {
        const savedVehicle = (await response.clone().json()) as { id?: string };
        savedVehicleId = savedVehicle.id || savedVehicleId;
      } catch {
        savedVehicleId = savedVehicleId || name;
      }

      writeVehicleTypeAssignment(savedVehicleId || name, normalizeVehicleTypeLabel(vehicleType, vehicleTypeOptions));

      if (!isEditing) {
        setSupplierId('');
        setName('');
        setVehicleType(vehicleTypeOptions[0]?.label || 'Sedan');
        setMaxPax('');
        setLuggageCapacity('');
      }
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not save vehicle.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="entity-form" onSubmit={handleSubmit}>
      <div className="form-row">
        <label>
          Supplier
          <select value={supplierId} onChange={(event) => setSupplierId(event.target.value)} required>
            <option value="">Select supplier</option>
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name}
              </option>
            ))}
            {supplierId && !suppliers.some((supplier) => supplier.id === supplierId) ? (
              <option value={supplierId}>{initialValues?.supplierName || 'Current supplier'}</option>
            ) : null}
          </select>
          <p className="form-helper">{SUPPLIER_STANDARDIZATION_HELPER_TEXT}</p>
        </label>

        <label>
          Vehicle Name
          <input value={name} onChange={(event) => setName(event.target.value)} required />
        </label>
      </div>
      <p className="form-helper">Vehicle Types control pricing and quote matching. Vehicle Name is for internal label/display.</p>

      <label>
        Vehicle Type
        <select value={vehicleType} onChange={(event) => setVehicleType(event.target.value)}>
          {vehicleTypeOptions.map((type) => (
            <option key={type.id} value={type.label}>
              {type.label}
            </option>
          ))}
        </select>
      </label>

      <div className="form-row">
        <label>
          Max pax
          <input value={maxPax} onChange={(event) => setMaxPax(event.target.value)} type="number" min="1" required />
        </label>

        <label>
          Luggage capacity
          <input
            value={luggageCapacity}
            onChange={(event) => setLuggageCapacity(event.target.value)}
            type="number"
            min="0"
            required
          />
        </label>
      </div>

      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Saving...' : submitLabel || (isEditing ? 'Save changes' : 'Add vehicle')}
      </button>

      {error ? <p className="form-error">{error}</p> : null}
    </form>
  );
}
