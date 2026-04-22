'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CityCombobox } from '../components/CityCombobox';
import { HotelCategoryCombobox } from '../components/HotelCategoryCombobox';
import { getErrorMessage } from '../lib/api';
import { CityOption } from '../lib/cities';
import { HotelCategoryOption } from '../lib/hotelCategories';

type HotelsFormProps = {
  apiBaseUrl: string;
  cities: CityOption[];
  hotelCategories: HotelCategoryOption[];
  hotelId?: string;
  submitLabel?: string;
  initialValues?: {
    name: string;
    cityId: string;
    city: string;
    hotelCategoryId: string;
    category: string;
    supplierId: string;
  };
};

export function HotelsForm({ apiBaseUrl, cities, hotelCategories, hotelId, submitLabel, initialValues }: HotelsFormProps) {
  const router = useRouter();
  const [name, setName] = useState(initialValues?.name || '');
  const [cityId, setCityId] = useState(initialValues?.cityId || '');
  const [city, setCity] = useState(initialValues?.city || '');
  const [hotelCategoryId, setHotelCategoryId] = useState(initialValues?.hotelCategoryId || '');
  const [supplierId, setSupplierId] = useState(initialValues?.supplierId || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const isEditing = Boolean(hotelId);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hotelCategoryId && !(isEditing && initialValues?.category.trim())) {
      setError('Category is required.');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const response = await fetch(`${apiBaseUrl}/hotels${hotelId ? `/${hotelId}` : ''}`, {
        method: hotelId ? 'PATCH' : 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          cityId: cityId || null,
          city: cityId ? undefined : city,
          hotelCategoryId: hotelCategoryId || null,
          supplierId,
        }),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, `Could not ${isEditing ? 'update' : 'create'} hotel.`));
      }

      if (!isEditing) {
        setName('');
        setCityId('');
        setCity('');
        setHotelCategoryId('');
        setSupplierId('');
      }

      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : `Could not ${isEditing ? 'update' : 'create'} hotel.`);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="entity-form" onSubmit={handleSubmit}>
      <label>
        Hotel name
        <input value={name} onChange={(event) => setName(event.target.value)} required />
      </label>

      <div className="form-row">
        <CityCombobox
          label="City"
          cities={cities}
          value={cityId}
          onChange={(value) => {
            setCityId(value);
            if (value) {
              setCity('');
            }
          }}
          placeholder="Search active cities"
        />

        <HotelCategoryCombobox
          label="Category"
          hotelCategories={hotelCategories}
          value={hotelCategoryId}
          onChange={setHotelCategoryId}
          placeholder="Search active categories"
        />
      </div>

      {!hotelCategoryId && initialValues?.category ? (
        <p className="form-helper">Current legacy category: {initialValues.category}. Link a structured category when ready.</p>
      ) : null}

      <label>
        Legacy city text
        <input
          value={city}
          onChange={(event) => {
            setCity(event.target.value);
            if (event.target.value) {
              setCityId('');
            }
          }}
          placeholder="Use only if the city record does not exist yet"
          disabled={Boolean(cityId)}
        />
      </label>

      <label>
        Supplier ID
        <input value={supplierId} onChange={(event) => setSupplierId(event.target.value)} required />
      </label>

      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Saving...' : submitLabel || (isEditing ? 'Save changes' : 'Create hotel')}
      </button>

      {error ? <p className="form-error">{error}</p> : null}
    </form>
  );
}
