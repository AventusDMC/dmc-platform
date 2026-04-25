'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PlaceComboboxWithCreate } from '../components/PlaceComboboxWithCreate';
import { TypeSelect } from '../components/TypeSelect';
import { getErrorMessage } from '../lib/api';
import { CityOption } from '../lib/cities';
import { buildRouteName, fetchPlaces, PlaceOption } from '../lib/places';
import { PlaceTypeOption } from '../lib/placeTypes';
import { routeTypes } from '../lib/reference-data';

type RoutesFormProps = {
  apiBaseUrl: string;
  places: PlaceOption[];
  cities: CityOption[];
  placeTypes: PlaceTypeOption[];
  routeId?: string;
  submitLabel?: string;
  initialValues?: {
    fromPlaceId: string;
    toPlaceId: string;
    name: string;
    routeType: string;
    durationMinutes: string;
    distanceKm: string;
    notes: string;
    isActive: boolean;
  };
};

export function RoutesForm({ apiBaseUrl, places, cities, placeTypes, routeId, submitLabel, initialValues }: RoutesFormProps) {
  const router = useRouter();
  const [availablePlaces, setAvailablePlaces] = useState(places);
  const [fromPlaceId, setFromPlaceId] = useState(initialValues?.fromPlaceId || '');
  const [toPlaceId, setToPlaceId] = useState(initialValues?.toPlaceId || '');
  const [name, setName] = useState(initialValues?.name || '');
  const [routeType, setRouteType] = useState(initialValues?.routeType || '');
  const [durationMinutes, setDurationMinutes] = useState(initialValues?.durationMinutes || '');
  const [distanceKm, setDistanceKm] = useState(initialValues?.distanceKm || '');
  const [notes, setNotes] = useState(initialValues?.notes || '');
  const [isActive, setIsActive] = useState(initialValues?.isActive ?? true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const isEditing = Boolean(routeId);

  useEffect(() => {
    setAvailablePlaces(places);
  }, [places]);

  useEffect(() => {
    if (name.trim() || !fromPlaceId || !toPlaceId) {
      return;
    }

    const fromPlace = availablePlaces.find((place) => place.id === fromPlaceId) || null;
    const toPlace = availablePlaces.find((place) => place.id === toPlaceId) || null;
    const derivedRouteName = buildRouteName(fromPlace, toPlace);

    if (derivedRouteName) {
      setName(derivedRouteName);
    }
  }, [availablePlaces, fromPlaceId, name, toPlaceId]);

  async function handlePlaceCreated(place: PlaceOption, target: 'from' | 'to') {
    try {
      setAvailablePlaces(await fetchPlaces(apiBaseUrl));
    } catch {
      setAvailablePlaces((currentPlaces) =>
        currentPlaces.some((currentPlace) => currentPlace.id === place.id) ? currentPlaces : [place, ...currentPlaces],
      );
    }

    if (target === 'from') {
      setFromPlaceId(place.id);
      return;
    }

    setToPlaceId(place.id);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      if (!fromPlaceId || !toPlaceId) {
        throw new Error('Select both from and to places.');
      }

      const response = await fetch(`${apiBaseUrl}/routes${routeId ? `/${routeId}` : ''}`, {
        method: routeId ? 'PATCH' : 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fromPlaceId,
          toPlaceId,
          name: name.trim() || null,
          routeType: routeType.trim() || null,
          durationMinutes: durationMinutes.trim() ? Number(durationMinutes) : null,
          distanceKm: distanceKm.trim() ? Number(distanceKm) : null,
          notes: notes.trim() || null,
          isActive,
        }),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not save route.'));
      }

      if (!isEditing) {
        setFromPlaceId('');
        setToPlaceId('');
        setName('');
        setRouteType('');
        setDurationMinutes('');
        setDistanceKm('');
        setNotes('');
        setIsActive(true);
      }

      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not save route.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="entity-form" onSubmit={handleSubmit}>
      <div className="form-row">
        <PlaceComboboxWithCreate
          apiBaseUrl={apiBaseUrl}
          cities={cities}
          placeTypes={placeTypes}
          label="From place"
          places={availablePlaces.filter((place) => place.isActive || place.id === fromPlaceId)}
          value={fromPlaceId}
          onChange={setFromPlaceId}
          onPlaceCreated={(place) => handlePlaceCreated(place, 'from')}
          placeholder="Search a place"
        />
        <PlaceComboboxWithCreate
          apiBaseUrl={apiBaseUrl}
          cities={cities}
          placeTypes={placeTypes}
          label="To place"
          places={availablePlaces.filter((place) => place.isActive || place.id === toPlaceId)}
          value={toPlaceId}
          onChange={setToPlaceId}
          onPlaceCreated={(place) => handlePlaceCreated(place, 'to')}
          placeholder="Search a place"
        />
      </div>

      <label>
        Custom route name
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Optional, otherwise derived from from -> to"
        />
      </label>

      <div className="form-row form-row-3">
        <TypeSelect label="Route type" value={routeType} onChange={setRouteType} options={routeTypes} placeholder="Optional" />

        <label>
          Duration (minutes)
          <input value={durationMinutes} onChange={(event) => setDurationMinutes(event.target.value)} type="number" min="0" />
        </label>

        <label>
          Distance (km)
          <input value={distanceKm} onChange={(event) => setDistanceKm(event.target.value)} type="number" min="0" step="0.1" />
        </label>
      </div>

      <label>
        Notes
        <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} placeholder="Optional" />
      </label>

      <label className="checkbox-field">
        <input checked={isActive} onChange={(event) => setIsActive(event.target.checked)} type="checkbox" />
        Active
      </label>

      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Saving...' : submitLabel || (isEditing ? 'Save route' : 'Add route')}
      </button>

      {error ? <p className="form-error">{error}</p> : null}
    </form>
  );
}
