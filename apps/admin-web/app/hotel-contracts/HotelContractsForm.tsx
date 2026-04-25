'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CurrencySelect } from '../components/CurrencySelect';
import { getErrorMessage, logFetchUrl } from '../lib/api';
import { type SupportedCurrency } from '../lib/currencyOptions';

type HotelOption = {
  id: string;
  name: string;
  city: string;
};

type HotelContractsFormProps = {
  apiBaseUrl: string;
  hotels: HotelOption[];
  contractId?: string;
  submitLabel?: string;
  initialValues?: {
    hotelId: string;
    name: string;
    validFrom: string;
    validTo: string;
    currency: SupportedCurrency;
  };
};

export function HotelContractsForm({ apiBaseUrl, hotels, contractId, submitLabel, initialValues }: HotelContractsFormProps) {
  const router = useRouter();
  const [hotelId, setHotelId] = useState(initialValues?.hotelId || hotels[0]?.id || '');
  const [name, setName] = useState(initialValues?.name || '');
  const [validFrom, setValidFrom] = useState(initialValues?.validFrom || '');
  const [validTo, setValidTo] = useState(initialValues?.validTo || '');
  const [currency, setCurrency] = useState<SupportedCurrency>(initialValues?.currency || 'USD');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const isEditing = Boolean(contractId);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      const url = `${apiBaseUrl}/contracts${contractId ? `/${contractId}` : ''}`;
      const response = await fetch(logFetchUrl(url), {
        method: contractId ? 'PATCH' : 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          hotelId,
          name,
          validFrom,
          validTo,
          currency,
        }),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, `Could not ${isEditing ? 'update' : 'create'} hotel contract.`));
      }

      if (!isEditing) {
        setName('');
        setValidFrom('');
        setValidTo('');
        setCurrency('USD');
      }
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : `Could not ${isEditing ? 'update' : 'create'} hotel contract.`);
    } finally {
      setIsSubmitting(false);
    }
  }

  const canSubmit = hotels.length > 0;

  return (
    <form className="entity-form" onSubmit={handleSubmit}>
      <label>
        Hotel
        <select value={hotelId} onChange={(event) => setHotelId(event.target.value)} disabled={hotels.length === 0} required>
          {hotels.length === 0 ? (
            <option value="">Create a hotel first</option>
          ) : (
            hotels.map((hotel) => (
              <option key={hotel.id} value={hotel.id}>
                {hotel.name} ({hotel.city})
              </option>
            ))
          )}
        </select>
      </label>

      <label>
        Contract name
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Summer 2026" required />
      </label>

      <div className="form-row form-row-3">
        <label>
          Valid from
          <input value={validFrom} onChange={(event) => setValidFrom(event.target.value)} type="date" required />
        </label>

        <label>
          Valid to
          <input value={validTo} onChange={(event) => setValidTo(event.target.value)} type="date" required />
        </label>

        <label>
          Currency
          <CurrencySelect value={currency} onChange={(value) => setCurrency((value || 'USD') as SupportedCurrency)} required />
        </label>
      </div>

      <button type="submit" disabled={isSubmitting || !canSubmit}>
        {isSubmitting ? 'Saving...' : submitLabel || (isEditing ? 'Save changes' : 'Create contract')}
      </button>

      {error ? <p className="form-error">{error}</p> : null}
    </form>
  );
}
