'use client';

import { FormEvent, useEffect, useState } from 'react';
import { PlaceComboboxWithCreate } from '../components/PlaceComboboxWithCreate';
import { RouteCombobox } from '../components/RouteCombobox';
import { getErrorMessage, readJsonResponse } from '../lib/api';
import { CityOption } from '../lib/cities';
import { buildRouteName, fetchPlaces, PlaceOption } from '../lib/places';
import { PlaceTypeOption } from '../lib/placeTypes';
import { RouteOption } from '../lib/routes';

type TransportServiceType = {
  id: string;
  name: string;
  code: string;
};

type CalculatorResult = {
  vehicleRateId: string;
  routeId: string | null;
  routeName: string;
  paxCount: number;
  price: number;
  fromPlace: PlaceOption | null;
  toPlace: PlaceOption | null;
  currency: string;
  vehicle: {
    id: string;
    name: string;
    maxPax: number;
    luggageCapacity: number;
  };
  serviceType: {
    id: string;
    name: string;
    code: string;
  };
};

type TransportPricingCalculatorProps = {
  apiBaseUrl: string;
  serviceTypes: TransportServiceType[];
  places: PlaceOption[];
  cities: CityOption[];
  placeTypes: PlaceTypeOption[];
  routes: RouteOption[];
};

export function TransportPricingCalculator({
  apiBaseUrl,
  serviceTypes,
  places,
  cities,
  placeTypes,
  routes,
}: TransportPricingCalculatorProps) {
  const [availablePlaces, setAvailablePlaces] = useState(places);
  const [serviceTypeId, setServiceTypeId] = useState(serviceTypes[0]?.id || '');
  const [routeId, setRouteId] = useState('');
  const [fromPlaceId, setFromPlaceId] = useState('');
  const [toPlaceId, setToPlaceId] = useState('');
  const [routeName, setRouteName] = useState('');
  const [paxCount, setPaxCount] = useState('1');
  const [result, setResult] = useState<CalculatorResult | null>(null);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setAvailablePlaces(places);
  }, [places]);

  useEffect(() => {
    if (routeName.trim()) {
      return;
    }

    if (routeId) {
      const selectedRoute = routes.find((route) => route.id === routeId);

      if (selectedRoute?.name) {
        setRouteName(selectedRoute.name);
      }

      return;
    }

    const fromPlace = availablePlaces.find((place) => place.id === fromPlaceId) || null;
    const toPlace = availablePlaces.find((place) => place.id === toPlaceId) || null;
    const derivedRouteName = buildRouteName(fromPlace, toPlace);

    if (derivedRouteName) {
      setRouteName(derivedRouteName);
    }
  }, [availablePlaces, fromPlaceId, routeId, routeName, routes, toPlaceId]);

  async function handlePlaceCreated(place: PlaceOption, target: 'from' | 'to') {
    try {
      setAvailablePlaces(await fetchPlaces(apiBaseUrl));
    } catch {
      setAvailablePlaces((currentPlaces) =>
        currentPlaces.some((currentPlace) => currentPlace.id === place.id) ? currentPlaces : [place, ...currentPlaces],
      );
    }

    setRouteId('');

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
    setResult(null);

    try {
      const fromPlace = availablePlaces.find((place) => place.id === fromPlaceId) || null;
      const toPlace = availablePlaces.find((place) => place.id === toPlaceId) || null;
      const selectedRoute = routes.find((route) => route.id === routeId) || null;
      const resolvedRouteName = buildRouteName(fromPlace, toPlace) || routeName.trim();

      if (!routeId && ((fromPlaceId && !toPlaceId) || (!fromPlaceId && toPlaceId))) {
        throw new Error('Select both route places.');
      }

      if (!selectedRoute && !resolvedRouteName) {
        throw new Error('Select places or enter a legacy route.');
      }

      const response = await fetch(`${apiBaseUrl}/transport-pricing/calculate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          serviceTypeId,
          routeId: routeId || null,
          fromPlaceId: routeId ? null : fromPlaceId || null,
          toPlaceId: routeId ? null : toPlaceId || null,
          routeName: selectedRoute?.name || resolvedRouteName,
          paxCount: Number(paxCount),
        }),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'No matching vehicle slab found.'));
      }

      const data = await readJsonResponse<CalculatorResult>(response, 'No matching vehicle slab found.');
      setResult(data);
    } catch (caughtError) {
      if (caughtError instanceof Error && caughtError.message !== 'Request failed') {
        setError(caughtError.message);
        return;
      }

      setError('No matching vehicle slab found.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="detail-card">
      <h2>Calculator</h2>
      <form className="entity-form compact-form" onSubmit={handleSubmit}>
        <label>
          Service type
          <select value={serviceTypeId} onChange={(event) => setServiceTypeId(event.target.value)} required disabled={serviceTypes.length === 0}>
            {serviceTypes.length === 0 ? (
              <option value="">Create a service type first</option>
            ) : (
              serviceTypes.map((serviceType) => (
                <option key={serviceType.id} value={serviceType.id}>
                  {serviceType.name} ({serviceType.code})
                </option>
              ))
            )}
          </select>
        </label>

        <RouteCombobox
          label="Saved route"
          routes={routes.filter((route) => route.isActive || route.id === routeId)}
          value={routeId}
          onChange={(value) => {
            setRouteId(value);
            if (value) {
              setFromPlaceId('');
              setToPlaceId('');
            }
          }}
          placeholder="Search active routes"
        />

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
          Legacy route text
          <input
            value={routeName}
            onChange={(event) => setRouteName(event.target.value)}
            placeholder="Airport - Hotel"
            disabled={Boolean(routeId || (fromPlaceId && toPlaceId))}
          />
        </label>

        <label>
          Pax count
          <input value={paxCount} onChange={(event) => setPaxCount(event.target.value)} type="number" min="1" required />
        </label>

        <button type="submit" disabled={isSubmitting || serviceTypes.length === 0}>
          {isSubmitting ? 'Checking...' : 'Calculate'}
        </button>

        {error ? <p className="form-error">{error}</p> : null}
      </form>

      {result ? (
        <article className="entity-card">
          <div className="entity-card-header">
            <h2>{result.vehicle.name}</h2>
            <span>
              {result.currency} {result.price.toFixed(2)}
            </span>
          </div>
          <p>Route: {result.routeName}</p>
          <p>
            Service type: {result.serviceType.name} ({result.serviceType.code})
          </p>
          <p>Pax: {result.paxCount}</p>
          <p>Vehicle capacity: {result.vehicle.maxPax}</p>
          <p>Luggage capacity: {result.vehicle.luggageCapacity}</p>
        </article>
      ) : null}
    </div>
  );
}
