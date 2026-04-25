'use client';

import { FormEvent, useEffect, useState } from 'react';
import { CityCombobox } from './CityCombobox';
import { CitySelect } from './CitySelect';
import { CountrySelect } from './CountrySelect';
import { PlaceCombobox } from './PlaceCombobox';
import { PlaceTypeCombobox } from './PlaceTypeCombobox';
import { getErrorMessage, readJsonResponse } from '../lib/api';
import { CityOption } from '../lib/cities';
import { PlaceOption } from '../lib/places';
import { PlaceTypeOption } from '../lib/placeTypes';

type PlaceComboboxWithCreateProps = {
  apiBaseUrl: string;
  cities: CityOption[];
  placeTypes: PlaceTypeOption[];
  label: string;
  places: PlaceOption[];
  value: string;
  onChange: (value: string) => void;
  onPlaceCreated: (place: PlaceOption) => Promise<void> | void;
  placeholder?: string;
};

export function PlaceComboboxWithCreate({
  apiBaseUrl,
  cities,
  placeTypes,
  label,
  places,
  value,
  onChange,
  onPlaceCreated,
  placeholder,
}: PlaceComboboxWithCreateProps) {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState('');
  const [placeTypeId, setPlaceTypeId] = useState('');
  const [cityId, setCityId] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (country.trim() || !cityId) {
      return;
    }

    const selectedCity = cities.find((cityOption) => cityOption.id === cityId);

    if (selectedCity?.country) {
      setCountry(selectedCity.country);
    }
  }, [cities, cityId, country]);

  function resetCreateForm() {
    setName('');
    setType('');
    setPlaceTypeId('');
    setCityId('');
    setCity('');
    setCountry('');
    setIsActive(true);
    setError('');
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      const response = await fetch(`${apiBaseUrl}/places`, {
        method: 'POST',
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

      const createdPlace = await readJsonResponse<PlaceOption>(response, 'Could not save place.');
      await onPlaceCreated(createdPlace);
      resetCreateForm();
      setIsCreateOpen(false);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not save place.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="place-field">
      <PlaceCombobox label={label} places={places} value={value} onChange={onChange} placeholder={placeholder} />
      <div className="inline-create-action-row">
        <button
          type="button"
          className="secondary-button inline-create-trigger"
          onClick={() => {
            setIsCreateOpen((current) => {
              const next = !current;
              if (!next) {
                resetCreateForm();
              }
              return next;
            });
          }}
        >
          {isCreateOpen ? 'Cancel place' : '+ Create place'}
        </button>
      </div>

      {isCreateOpen ? (
        <div className="inline-create-panel">
          <form className="entity-form compact-form inline-place-form" onSubmit={handleCreate}>
            <div className="form-row">
              <label>
                Name
                <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Queen Alia Airport" required />
              </label>
            </div>

            <div className="form-row">
              <PlaceTypeCombobox
                label="Type"
                placeTypes={placeTypes}
                value={placeTypeId}
                onChange={(nextValue) => {
                  setPlaceTypeId(nextValue);
                  if (nextValue) {
                    setType('');
                  }
                }}
                placeholder="Search active place types"
              />
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

            <div className="form-row">
              <CityCombobox
                label="City"
                cities={cities}
                value={cityId}
                onChange={(nextValue) => {
                  setCityId(nextValue);
                  if (nextValue) {
                    setCity('');
                  }
                }}
                placeholder="Search active cities"
              />

              <CountrySelect value={country} onChange={setCountry} placeholder="Optional" />
            </div>

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
              {isSubmitting ? 'Saving...' : 'Add place'}
            </button>

            {error ? <p className="form-error">{error}</p> : null}
          </form>
        </div>
      ) : null}
    </div>
  );
}
