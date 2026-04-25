'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CountrySelect } from '../components/CountrySelect';
import { getErrorMessage } from '../lib/api';

type CitiesFormProps = {
  apiBaseUrl: string;
  cityId?: string;
  submitLabel?: string;
  initialValues?: {
    name: string;
    country: string;
    isActive: boolean;
  };
};

export function CitiesForm({ apiBaseUrl, cityId, submitLabel, initialValues }: CitiesFormProps) {
  const router = useRouter();
  const [name, setName] = useState(initialValues?.name || '');
  const [country, setCountry] = useState(initialValues?.country || '');
  const [isActive, setIsActive] = useState(initialValues?.isActive ?? true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const isEditing = Boolean(cityId);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      const response = await fetch(`${apiBaseUrl}/cities${cityId ? `/${cityId}` : ''}`, {
        method: cityId ? 'PATCH' : 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          country,
          isActive,
        }),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not save city.'));
      }

      if (!isEditing) {
        setName('');
        setCountry('');
        setIsActive(true);
      }

      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not save city.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="entity-form" onSubmit={handleSubmit}>
      <div className="form-row">
        <label>
          Name
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Amman" required />
        </label>

        <CountrySelect value={country} onChange={setCountry} />
      </div>

      <label className="checkbox-field">
        <input checked={isActive} onChange={(event) => setIsActive(event.target.checked)} type="checkbox" />
        Active
      </label>

      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Saving...' : submitLabel || (isEditing ? 'Save city' : 'Add city')}
      </button>

      {error ? <p className="form-error">{error}</p> : null}
    </form>
  );
}
