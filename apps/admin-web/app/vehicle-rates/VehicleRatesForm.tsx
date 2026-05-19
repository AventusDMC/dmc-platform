'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PlaceComboboxWithCreate } from '../components/PlaceComboboxWithCreate';
import { CurrencySelect } from '../components/CurrencySelect';
import { buildAuthHeaders } from '../lib/auth-client';
import { RouteCombobox } from '../components/RouteCombobox';
import { getErrorMessage } from '../lib/api';
import { CityOption } from '../lib/cities';
import { type SupportedCurrency } from '../lib/currencyOptions';
import { buildRouteName, fetchPlaces, filterCanonicalGeographicPlaces, PlaceOption } from '../lib/places';
import { PlaceTypeOption } from '../lib/placeTypes';
import { RouteOption } from '../lib/routes';
import { formatServiceTypeLabel } from '../lib/transport-formatters';
import { isBackendUuid } from '../lib/backend-uuid';
import {
  buildTransportPricingModeServiceTypeOptions,
  getOriginalTransportPricingModeAlias,
  TRANSPORT_PRICING_MODE_HELPER_TEXT,
  TRANSPORT_PRICING_MODE_GROUPS,
} from '../lib/transport-pricing-modes';
import { filterCanonicalFleetVehicles } from '../lib/transport-vehicles';

type VehicleRateFormMode = 'add' | 'edit' | 'duplicate';

type VehicleOption = {
  id: string;
  name: string;
  maxPax?: number | null;
};

type ServiceTypeOption = {
  id: string;
  name: string;
  code: string;
};

type VehicleRatesFormProps = {
  apiBaseUrl: string;
  vehicles: VehicleOption[];
  serviceTypes: ServiceTypeOption[];
  places: PlaceOption[];
  cities: CityOption[];
  placeTypes: PlaceTypeOption[];
  routes: RouteOption[];
  mode?: VehicleRateFormMode;
  rateId?: string;
  submitLabel?: string;
  lockRateCardContext?: boolean;
  onSaved?: (rate: unknown) => void | Promise<void>;
  initialValues?: {
    vehicleId: string;
    serviceTypeId: string;
    supplierId?: string | null;
    routeId: string;
    fromPlaceId: string;
    toPlaceId: string;
    routeName: string;
    minPax: string;
    maxPax: string;
    price: string;
    currency: SupportedCurrency;
    notes?: string | null;
    active?: boolean;
    validFrom: string;
    validTo: string;
  };
};

type VehicleRateFormState = {
  vehicleId: string;
  serviceTypeId: string;
  supplierId: string;
  routeId: string;
  fromPlaceId: string;
  toPlaceId: string;
  routeName: string;
  minPax: string;
  maxPax: string;
  price: string;
  currency: SupportedCurrency;
  notes: string;
  active: boolean;
  validFrom: string;
  validTo: string;
};

function getVehicleRateSaveErrorMessage(message: string) {
  const normalized = message.toLowerCase();

  if (
    normalized.includes('unique') ||
    normalized.includes('duplicate') ||
    normalized.includes('already exists') ||
    normalized.includes('vehicle_rates')
  ) {
    return 'This rate already exists. Change vehicle, capacity, route, or dates.';
  }

  return message;
}

export function getVehicleRateSaveTarget(apiBaseUrl: string, rateId?: string) {
  const backendRateId = isBackendUuid(rateId) ? rateId : '';

  return {
    url: `${apiBaseUrl}/vehicle-rates${backendRateId ? `/${backendRateId}` : ''}`,
    method: backendRateId ? 'PATCH' : 'POST',
  };
}

function getVehicleRateFormMode(mode: VehicleRateFormMode | undefined, rateId?: string): VehicleRateFormMode {
  if (mode) {
    return mode;
  }

  return isBackendUuid(rateId) ? 'edit' : 'add';
}

function buildInitialVehicleRateFormState(
  mode: VehicleRateFormMode,
  initialValues: VehicleRatesFormProps['initialValues'],
  vehicles: VehicleOption[],
  serviceTypes: ServiceTypeOption[],
  pricingModeOptions: ReturnType<typeof buildTransportPricingModeServiceTypeOptions>,
): VehicleRateFormState {
  const initialVehicleOptions = filterCanonicalFleetVehicles(vehicles, [initialValues?.vehicleId]);
  const pricingModeServiceTypeIds = new Set(pricingModeOptions.map((option) => option.serviceType.id));
  const initialServiceTypeIsAvailable = Boolean(initialValues?.serviceTypeId && pricingModeServiceTypeIds.has(initialValues.serviceTypeId));

  if (mode === 'edit' || mode === 'duplicate') {
    return {
      vehicleId: initialValues?.vehicleId || '',
      serviceTypeId: initialValues?.serviceTypeId || '',
      supplierId: initialValues?.supplierId || '',
      routeId: initialValues?.routeId || '',
      fromPlaceId: initialValues?.fromPlaceId || '',
      toPlaceId: initialValues?.toPlaceId || '',
      routeName: initialValues?.routeName || '',
      minPax: initialValues?.minPax || '1',
      maxPax: initialValues?.maxPax || '1',
      price: initialValues?.price || '',
      currency: initialValues?.currency || 'USD',
      notes: initialValues?.notes || '',
      active: initialValues?.active ?? true,
      validFrom: initialValues?.validFrom || '',
      validTo: initialValues?.validTo || '',
    };
  }

  return {
    vehicleId: initialValues?.vehicleId || initialVehicleOptions[0]?.id || '',
    serviceTypeId: initialServiceTypeIsAvailable ? initialValues?.serviceTypeId || '' : pricingModeOptions[0]?.serviceType.id || '',
    supplierId: initialValues?.supplierId || '',
    routeId: initialValues?.routeId || '',
    fromPlaceId: initialValues?.fromPlaceId || '',
    toPlaceId: initialValues?.toPlaceId || '',
    routeName: initialValues?.routeName || '',
    minPax: initialValues?.minPax || '1',
    maxPax: initialValues?.maxPax || '1',
    price: initialValues?.price || '',
    currency: initialValues?.currency || 'USD',
    notes: initialValues?.notes || '',
    active: initialValues?.active ?? true,
    validFrom: initialValues?.validFrom || '',
    validTo: initialValues?.validTo || '',
  };
}

export function VehicleRatesForm({
  apiBaseUrl,
  vehicles,
  serviceTypes,
  places,
  cities,
  placeTypes,
  routes,
  mode,
  rateId,
  submitLabel,
  lockRateCardContext = false,
  onSaved,
  initialValues,
}: VehicleRatesFormProps) {
  const router = useRouter();
  const formMode = getVehicleRateFormMode(mode, rateId);
  const pricingModeOptions = buildTransportPricingModeServiceTypeOptions(serviceTypes);
  const initialFormState = buildInitialVehicleRateFormState(formMode, initialValues, vehicles, serviceTypes, pricingModeOptions);
  const [availablePlaces, setAvailablePlaces] = useState(places);
  const [vehicleId, setVehicleId] = useState(initialFormState.vehicleId);
  const [serviceTypeId, setServiceTypeId] = useState(initialFormState.serviceTypeId);
  const [supplierId] = useState(initialFormState.supplierId);
  const [routeId, setRouteId] = useState(initialFormState.routeId);
  const [fromPlaceId, setFromPlaceId] = useState(initialFormState.fromPlaceId);
  const [toPlaceId, setToPlaceId] = useState(initialFormState.toPlaceId);
  const [routeName, setRouteName] = useState(initialFormState.routeName);
  const [minPax, setMinPax] = useState(initialFormState.minPax);
  const [maxPax, setMaxPax] = useState(initialFormState.maxPax);
  const [price, setPrice] = useState(initialFormState.price);
  const [currency, setCurrency] = useState<SupportedCurrency>(initialFormState.currency);
  const [notes, setNotes] = useState(initialFormState.notes);
  const [active, setActive] = useState(initialFormState.active);
  const [validFrom, setValidFrom] = useState(initialFormState.validFrom);
  const [validTo, setValidTo] = useState(initialFormState.validTo);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const isEditing = formMode === 'edit';

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

    try {
      const fromPlace = availablePlaces.find((place) => place.id === fromPlaceId) || null;
      const toPlace = availablePlaces.find((place) => place.id === toPlaceId) || null;
      const selectedRoute = routes.find((route) => route.id === routeId) || null;
      const resolvedRouteName = buildRouteName(fromPlace, toPlace) || routeName.trim();

      if (!routeId && ((fromPlaceId && !toPlaceId) || (!fromPlaceId && toPlaceId))) {
        throw new Error('Select both a from place and a to place.');
      }

      if (!selectedRoute && !resolvedRouteName) {
        throw new Error('Select places or enter a legacy route.');
      }

      const saveTarget = getVehicleRateSaveTarget(apiBaseUrl, rateId);
      const response = await fetch(saveTarget.url, {
        method: saveTarget.method,
        headers: buildAuthHeaders({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          vehicleId,
          serviceTypeId,
          supplierId: supplierId || null,
          routeId: routeId || null,
          fromPlaceId: routeId ? null : fromPlaceId || null,
          toPlaceId: routeId ? null : toPlaceId || null,
          routeName: selectedRoute?.name || resolvedRouteName,
          minPax: Number(minPax),
          maxPax: Number(maxPax),
          price: Number(price),
          currency,
          notes: notes.trim() || null,
          active,
          validFrom,
          validTo,
        }),
      });

      if (!response.ok) {
        throw new Error(getVehicleRateSaveErrorMessage(await getErrorMessage(response, 'Could not save vehicle rate.')));
      }

      const savedRate = await response.json();
      await onSaved?.(savedRate);

      if (!isEditing) {
        setRouteId('');
        setFromPlaceId('');
        setToPlaceId('');
        setRouteName('');
        setMinPax('1');
        setMaxPax('1');
        setPrice('');
        setCurrency('USD');
        setNotes('');
        setActive(true);
        setValidFrom('');
        setValidTo('');
      }
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not save vehicle rate.');
    } finally {
      setIsSubmitting(false);
    }
  }

  const selectableVehicles = filterCanonicalFleetVehicles(vehicles, [vehicleId]);
  const canSubmit = selectableVehicles.length > 0 && pricingModeOptions.length > 0;
  const fromPlaceOptions = filterCanonicalGeographicPlaces(availablePlaces, [fromPlaceId]);
  const toPlaceOptions = filterCanonicalGeographicPlaces(availablePlaces, [toPlaceId]);

  return (
    <form className="entity-form" onSubmit={handleSubmit}>
      <div className="form-row">
        <label>
          Vehicle
          <select value={vehicleId} onChange={(event) => setVehicleId(event.target.value)} disabled={selectableVehicles.length === 0 || lockRateCardContext} required>
            {selectableVehicles.length === 0 ? (
              <option value="">Create a canonical vehicle first</option>
            ) : (
              selectableVehicles.map((vehicle) => (
                <option key={vehicle.id} value={vehicle.id}>
                  {vehicle.name}
                </option>
              ))
            )}
          </select>
        </label>

        <label>
          Pricing Mode
          <select
            value={serviceTypeId}
            onChange={(event) => setServiceTypeId(event.target.value)}
            disabled={pricingModeOptions.length === 0}
            required
          >
            {pricingModeOptions.length === 0 ? (
              <option value="">Create a pricing mode first</option>
            ) : (
              TRANSPORT_PRICING_MODE_GROUPS.map((group) => {
                const groupOptions = pricingModeOptions.filter((option) => group.modes.includes(option.mode));
                return groupOptions.length > 0 ? (
                  <optgroup key={group.label} label={group.label}>
                    {groupOptions.map(({ mode, serviceType }) => {
                      const originalAlias = getOriginalTransportPricingModeAlias(serviceType.name) || getOriginalTransportPricingModeAlias(serviceType.code);
                      return (
                        <option key={mode} value={serviceType.id}>
                          {formatServiceTypeLabel(mode)}{originalAlias ? ` (legacy: ${originalAlias})` : ''}
                        </option>
                      );
                    })}
                  </optgroup>
                ) : null;
              })
            )}
          </select>
          <p className="form-helper">{TRANSPORT_PRICING_MODE_HELPER_TEXT}</p>
        </label>
      </div>

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
        maxResults={50}
        disabled={lockRateCardContext}
      />

      <div className="form-row">
        <PlaceComboboxWithCreate
          apiBaseUrl={apiBaseUrl}
          cities={cities}
          placeTypes={placeTypes}
          label="From place"
          places={fromPlaceOptions}
          value={fromPlaceId}
          onChange={setFromPlaceId}
          onPlaceCreated={(place) => handlePlaceCreated(place, 'from')}
          placeholder="Search a place"
          disabled={lockRateCardContext}
        />
        <PlaceComboboxWithCreate
          apiBaseUrl={apiBaseUrl}
          cities={cities}
          placeTypes={placeTypes}
          label="To place"
          places={toPlaceOptions}
          value={toPlaceId}
          onChange={setToPlaceId}
          onPlaceCreated={(place) => handlePlaceCreated(place, 'to')}
          placeholder="Search a place"
          disabled={lockRateCardContext}
        />
      </div>

      <p className="form-helper">Prefer a saved route. Leave it blank to keep using manual place pairing or legacy text.</p>

      <label>
        Legacy route text
        <input
          value={routeName}
          onChange={(event) => setRouteName(event.target.value)}
          placeholder="Airport - Hotel"
          disabled={lockRateCardContext || Boolean(routeId || (fromPlaceId && toPlaceId))}
        />
      </label>

      <div className="form-row form-row-4">
        <label>
          Min pax
          <input value={minPax} onChange={(event) => setMinPax(event.target.value)} type="number" min="1" disabled={lockRateCardContext} required />
        </label>

        <label>
          Max pax
          <input value={maxPax} onChange={(event) => setMaxPax(event.target.value)} type="number" min="1" disabled={lockRateCardContext} required />
        </label>

        <label>
          Price
          <input value={price} onChange={(event) => setPrice(event.target.value)} type="number" min="0" step="0.01" required />
        </label>

        <label>
          Currency
          <CurrencySelect value={currency} onChange={(value) => setCurrency((value || 'USD') as SupportedCurrency)} disabled={lockRateCardContext} required />
        </label>
      </div>

      <div className="form-row">
        <label>
          Valid from
          <input value={validFrom} onChange={(event) => setValidFrom(event.target.value)} type="date" disabled={lockRateCardContext} required />
        </label>

        <label>
          Valid to
          <input value={validTo} onChange={(event) => setValidTo(event.target.value)} type="date" disabled={lockRateCardContext} required />
        </label>
      </div>

      <label>
        Notes
        <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} placeholder="Optional supplier row note" />
      </label>

      <label className="checkbox-label">
        <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} disabled={lockRateCardContext} />
        Active
      </label>

      <button type="submit" disabled={isSubmitting || !canSubmit}>
        {isSubmitting ? 'Saving...' : submitLabel || (isEditing ? 'Save changes' : 'Add vehicle rate')}
      </button>

      {error ? <p className="form-error">{error}</p> : null}
    </form>
  );
}
