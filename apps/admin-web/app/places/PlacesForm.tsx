'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CityCombobox } from '../components/CityCombobox';
import { CitySelect } from '../components/CitySelect';
import { CountrySelect } from '../components/CountrySelect';
import { PlaceTypeCombobox } from '../components/PlaceTypeCombobox';
import { getErrorMessage } from '../lib/api';
import { CityOption } from '../lib/cities';
import { PlaceTypeOption } from '../lib/placeTypes';

type PlacesFormProps = {
  cities: CityOption[];
  placeTypes: PlaceTypeOption[];
  placeId?: string;
  submitLabel?: string;
  initialValues?: {
    name: string;
    type: string;
    placeTypeId: string;
    cityId: string;
    city: string;
    country: string;
    isActive: boolean;
  };
};

export function PlacesForm({ cities, placeTypes, placeId, submitLabel, initialValues }: PlacesFormProps) {
  const router = useRouter();
  const [name, setName] = useState(initialValues?.name || '');
  const [type, setType] = useState(initialValues?.type || '');
  const [placeTypeId, setPlaceTypeId] = useState(initialValues?.placeTypeId || '');
  const [cityId, setCityId] = useState(initialValues?.cityId || '');
  const [city, setCity] = useState(initialValues?.city || '');
  const [country, setCountry] = useState(initialValues?.country || '');
  const [isActive, setIsActive] = useState(initialValues?.isActive ?? true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const isEditing = Boolean(placeId);

  useEffect(() => {
    if (country.trim() || !cityId) {
      return;
    }

    const selectedCity = cities.find((cityOption) => cityOption.id === cityId);

    if (selectedCity?.country) {
      setCountry(selectedCity.country);
    }
  }, [cities, cityId, country]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      const response = await fetch(placeId ? `/api/places/${placeId}` : '/api/places', {
        method: placeId ? 'PATCH' : 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          type: placeTypeId ? undefined : type,
          placeTypeId: placeTypeId || null,
          cityId: cityId || null,
          city: cityId ? undefined : city,
          country,
          isActive,
        }),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not save place.'));
      }

      if (!isEditing) {
        setName('');
        setType('');
        setPlaceTypeId('');
        setCityId('');
        setCity('');
        setCountry('');
        setIsActive(true);
      }

      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not save place.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="entity-form" onSubmit={handleSubmit}>
      <div className="form-row">
        <label>
          Name
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Queen Alia Airport" required />
        </label>

        <PlaceTypeCombobox
          label="Type"
          placeTypes={placeTypes}
          value={placeTypeId}
          onChange={(value) => {
            setPlaceTypeId(value);
            if (value) {
              setType('');
            }
          }}
          placeholder="Search active place types"
        />
      </div>

      {!placeTypeId && initialValues?.type ? (
        <p className="form-helper">Current legacy type: {initialValues.type}. Link a structured place type when ready.</p>
      ) : null}

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

        <CountrySelect value={country} onChange={setCountry} placeholder="Optional" />
      </div>

      <label>
        Legacy type text
        <input
          value={type}
          onChange={(event) => {
            setType(event.target.value);
            if (event.target.value) {
              setPlaceTypeId('');
            }
          }}
          placeholder="Use only if the place type record does not exist yet"
          disabled={Boolean(placeTypeId)}
          required={!placeTypeId}
        />
      </label>

      <CitySelect
        country={country}
        label="Legacy city text"
        value={city}
        onChange={(nextCity) => {
          setCity(nextCity);
          if (nextCity) {
            setCityId('');
          }
        }}
        placeholder="Optional fallback if the city record does not exist yet"
        disabled={Boolean(cityId) || !country}
      />

      <label className="checkbox-field">
        <input checked={isActive} onChange={(event) => setIsActive(event.target.checked)} type="checkbox" />
        Active
      </label>

      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Saving...' : submitLabel || (isEditing ? 'Save place' : 'Add place')}
      </button>

      {error ? <p className="form-error">{error}</p> : null}
    </form>
  );
}
