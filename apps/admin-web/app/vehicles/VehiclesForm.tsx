'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getErrorMessage } from '../lib/api';

type VehiclesFormProps = {
  apiBaseUrl: string;
  vehicleId?: string;
  submitLabel?: string;
  initialValues?: {
    supplierId: string;
    name: string;
    maxPax: string;
    luggageCapacity: string;
  };
};

export function VehiclesForm({ apiBaseUrl, vehicleId, submitLabel, initialValues }: VehiclesFormProps) {
  const router = useRouter();
  const [supplierId, setSupplierId] = useState(initialValues?.supplierId || '');
  const [name, setName] = useState(initialValues?.name || '');
  const [maxPax, setMaxPax] = useState(initialValues?.maxPax || '');
  const [luggageCapacity, setLuggageCapacity] = useState(initialValues?.luggageCapacity || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const isEditing = Boolean(vehicleId);

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
          maxPax: Number(maxPax),
          luggageCapacity: Number(luggageCapacity),
        }),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not save vehicle.'));
      }

      if (!isEditing) {
        setSupplierId('');
        setName('');
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
          Supplier ID
          <input value={supplierId} onChange={(event) => setSupplierId(event.target.value)} required />
        </label>

        <label>
          Vehicle name
          <input value={name} onChange={(event) => setName(event.target.value)} required />
        </label>
      </div>

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
