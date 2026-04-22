'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { buildAuthHeaders } from '../lib/auth-client';
import { getErrorMessage } from '../lib/api';
import { RouteOption } from '../lib/routes';

type VehicleOption = {
  id: string;
  name: string;
};

type ServiceTypeOption = {
  id: string;
  name: string;
  code: string;
};

type TransportPricingRuleFormProps = {
  apiBaseUrl: string;
  routes: RouteOption[];
  vehicles: VehicleOption[];
  serviceTypes: ServiceTypeOption[];
  ruleId?: string;
  submitLabel?: string;
  initialValues?: {
    routeId: string;
    transportServiceTypeId: string;
    vehicleId: string;
    pricingMode: 'per_vehicle' | 'capacity_unit';
    minPax: string;
    maxPax: string;
    unitCapacity: string;
    baseCost: string;
    discountPercent: string;
    currency: string;
    isActive: boolean;
  };
};

export function TransportPricingRuleForm({
  apiBaseUrl,
  routes,
  vehicles,
  serviceTypes,
  ruleId,
  submitLabel,
  initialValues,
}: TransportPricingRuleFormProps) {
  const router = useRouter();
  const [routeId, setRouteId] = useState(initialValues?.routeId || routes[0]?.id || '');
  const [transportServiceTypeId, setTransportServiceTypeId] = useState(initialValues?.transportServiceTypeId || serviceTypes[0]?.id || '');
  const [vehicleId, setVehicleId] = useState(initialValues?.vehicleId || vehicles[0]?.id || '');
  const [pricingMode, setPricingMode] = useState<'per_vehicle' | 'capacity_unit'>(initialValues?.pricingMode || 'per_vehicle');
  const [minPax, setMinPax] = useState(initialValues?.minPax || '1');
  const [maxPax, setMaxPax] = useState(initialValues?.maxPax || '1');
  const [unitCapacity, setUnitCapacity] = useState(initialValues?.unitCapacity || '');
  const [baseCost, setBaseCost] = useState(initialValues?.baseCost || '');
  const [discountPercent, setDiscountPercent] = useState(initialValues?.discountPercent || '0');
  const [currency, setCurrency] = useState(initialValues?.currency || 'USD');
  const [isActive, setIsActive] = useState(initialValues?.isActive ?? true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const isEditing = Boolean(ruleId);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      const response = await fetch(`${apiBaseUrl}/transport-pricing/rules${ruleId ? `/${ruleId}` : ''}`, {
        method: ruleId ? 'PATCH' : 'POST',
        headers: buildAuthHeaders({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          routeId,
          transportServiceTypeId,
          vehicleId,
          pricingMode,
          minPax: Number(minPax),
          maxPax: Number(maxPax),
          unitCapacity: pricingMode === 'capacity_unit' && unitCapacity ? Number(unitCapacity) : null,
          baseCost: Number(baseCost),
          discountPercent: Number(discountPercent || '0'),
          currency,
          isActive,
        }),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not save transport pricing rule.'));
      }

      if (!isEditing) {
        setVehicleId(vehicles[0]?.id || '');
        setPricingMode('per_vehicle');
        setMinPax('1');
        setMaxPax('1');
        setUnitCapacity('');
        setBaseCost('');
        setDiscountPercent('0');
        setCurrency('USD');
        setIsActive(true);
      }

      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not save transport pricing rule.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="entity-form compact-form" onSubmit={handleSubmit}>
      <div className="form-row form-row-3">
        <label>
          Route
          <select value={routeId} onChange={(event) => setRouteId(event.target.value)} disabled={routes.length === 0} required>
            {routes.length === 0 ? (
              <option value="">Create a route first</option>
            ) : (
              routes.map((route) => (
                <option key={route.id} value={route.id}>
                  {route.name}
                </option>
              ))
            )}
          </select>
        </label>

        <label>
          Service type
          <select
            value={transportServiceTypeId}
            onChange={(event) => setTransportServiceTypeId(event.target.value)}
            disabled={serviceTypes.length === 0}
            required
          >
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

        <label>
          Vehicle
          <select value={vehicleId} onChange={(event) => setVehicleId(event.target.value)} disabled={vehicles.length === 0} required>
            {vehicles.length === 0 ? (
              <option value="">Create a vehicle first</option>
            ) : (
              vehicles.map((vehicle) => (
                <option key={vehicle.id} value={vehicle.id}>
                  {vehicle.name}
                </option>
              ))
            )}
          </select>
        </label>
      </div>

      <div className="form-row form-row-4">
        <label>
          Pricing mode
          <select value={pricingMode} onChange={(event) => setPricingMode(event.target.value as 'per_vehicle' | 'capacity_unit')} required>
            <option value="per_vehicle">Per Vehicle</option>
            <option value="capacity_unit">Capacity Unit</option>
          </select>
        </label>

        <label>
          Min pax
          <input value={minPax} onChange={(event) => setMinPax(event.target.value)} type="number" min="1" required />
        </label>

        <label>
          Max pax
          <input value={maxPax} onChange={(event) => setMaxPax(event.target.value)} type="number" min="1" required />
        </label>

        <label>
          Unit capacity
          <input
            value={unitCapacity}
            onChange={(event) => setUnitCapacity(event.target.value)}
            type="number"
            min="1"
            disabled={pricingMode !== 'capacity_unit'}
            placeholder={pricingMode === 'capacity_unit' ? 'e.g. 4' : 'N/A'}
          />
        </label>
      </div>

      <div className="form-row form-row-4">
        <label>
          Base cost
          <input value={baseCost} onChange={(event) => setBaseCost(event.target.value)} type="number" min="0" step="0.01" required />
        </label>

        <label>
          Discount %
          <input
            value={discountPercent}
            onChange={(event) => setDiscountPercent(event.target.value)}
            type="number"
            min="0"
            step="0.01"
            required
          />
        </label>

        <label>
          Currency
          <input value={currency} onChange={(event) => setCurrency(event.target.value.toUpperCase())} maxLength={3} required />
        </label>

        <label>
          Status
          <select value={isActive ? 'active' : 'inactive'} onChange={(event) => setIsActive(event.target.value === 'active')}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </label>
      </div>

      <button type="submit" disabled={isSubmitting || routes.length === 0 || vehicles.length === 0 || serviceTypes.length === 0}>
        {isSubmitting ? 'Saving...' : submitLabel || (isEditing ? 'Save pricing rule' : 'Add pricing rule')}
      </button>

      {error ? <p className="form-error">{error}</p> : null}
    </form>
  );
}
