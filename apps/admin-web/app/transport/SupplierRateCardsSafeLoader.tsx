'use client';

import { useEffect, useMemo, useState } from 'react';
import type { CityOption } from '../lib/cities';
import type { PlaceTypeOption } from '../lib/placeTypes';
import type { PlaceOption } from '../lib/places';
import type { RouteOption } from '../lib/routes';
import { formatRouteLabel } from '../lib/transport-formatters';
import { getDefaultVehicleTypeOptions, normalizeVehicleTypeLabel, readStoredVehicleTypeOptions, type VehicleTypeOption } from '../lib/vehicle-types';
import { VehicleRatesTable, type Supplier, type TransportServiceType, type Vehicle } from './VehicleRatesTable';

type SupplierRateCardsSafeLoaderProps = {
  apiBaseUrl: string;
  routeId?: string;
  vehicles: Vehicle[];
  serviceTypes: TransportServiceType[];
  places: PlaceOption[];
  cities: CityOption[];
  placeTypes: PlaceTypeOption[];
  routes: RouteOption[];
  suppliers: Supplier[];
};

export function SupplierRateCardsSafeLoader({
  apiBaseUrl,
  routeId,
  vehicles,
  serviceTypes,
  places,
  cities,
  placeTypes,
  routes,
  suppliers,
}: SupplierRateCardsSafeLoaderProps) {
  const [supplierFilter, setSupplierFilter] = useState('');
  const [vehicleTypeFilter, setVehicleTypeFilter] = useState('');
  const [routeFilter, setRouteFilter] = useState('');
  const [hasRequestedLoad, setHasRequestedLoad] = useState(false);
  const [hasRequestedCreate, setHasRequestedCreate] = useState(false);
  const [createRequestToken, setCreateRequestToken] = useState(0);
  const [vehicleTypeCatalog, setVehicleTypeCatalog] = useState<VehicleTypeOption[]>(getDefaultVehicleTypeOptions());

  const supplierOptions = useMemo(() => suppliers.slice().sort((left, right) => left.name.localeCompare(right.name)), [suppliers]);

  const vehicleTypeOptions = useMemo(
    () => Array.from(new Set(vehicleTypeCatalog.map((vehicleType) => vehicleType.label).filter(Boolean))).sort(),
    [vehicleTypeCatalog],
  );

  useEffect(() => {
    function refreshVehicleTypes() {
      setVehicleTypeCatalog(readStoredVehicleTypeOptions());
    }

    refreshVehicleTypes();
    window.addEventListener('dmc:vehicle-types-changed', refreshVehicleTypes);
    window.addEventListener('storage', refreshVehicleTypes);

    return () => {
      window.removeEventListener('dmc:vehicle-types-changed', refreshVehicleTypes);
      window.removeEventListener('storage', refreshVehicleTypes);
    };
  }, []);

  const routeOptions = useMemo(() => {
    return routes.map((route) => ({ id: route.id, name: formatRouteLabel(route.name) })).sort((left, right) => left.name.localeCompare(right.name));
  }, [routes]);

  const hasAnyFilter = Boolean(supplierFilter || vehicleTypeFilter || routeFilter);
  const shouldMountTable = hasRequestedLoad || hasRequestedCreate;
  const rateCardFilters = useMemo(
    () => ({
      supplierId: supplierFilter,
      vehicleType: normalizeVehicleTypeLabel(vehicleTypeFilter, vehicleTypeCatalog),
      routeId: routeFilter || routeId || '',
    }),
    [routeFilter, routeId, supplierFilter, vehicleTypeCatalog, vehicleTypeFilter],
  );

  function handleAddRateCard() {
    setHasRequestedCreate(true);
    setCreateRequestToken((currentToken) => currentToken + 1);
  }

  return (
    <div className="supplier-rate-card-safe-loader">
      <div className="transport-rate-card-toolbar">
        <div>
          <p className="transport-rate-card-label">Imported supplier contracts</p>
          <strong>Supplier Rate Cards</strong>
          <p className="detail-copy">Cards are grouped by supplier and route; vehicle types control pricing and quote matching inside each card.</p>
        </div>
        <button type="button" className="primary-button transport-contract-new-button" onClick={handleAddRateCard}>
          + Add Rate Card
        </button>
      </div>

      <div className="supplier-rate-card-safe-filters">
        <label>
          Supplier
          <select value={supplierFilter} onChange={(event) => setSupplierFilter(event.target.value)}>
            <option value="">All suppliers</option>
            {supplierOptions.map((supplier) => (
              <option key={supplier.id || supplier.name} value={supplier.id || supplier.name}>
                {supplier.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Vehicle type
          <select value={vehicleTypeFilter} onChange={(event) => setVehicleTypeFilter(event.target.value)}>
            <option value="">All vehicle types</option>
            {vehicleTypeOptions.map((vehicleType) => (
              <option key={vehicleType} value={vehicleType}>
                {vehicleType}
              </option>
            ))}
          </select>
        </label>
        <label>
          Route
          <select value={routeFilter} onChange={(event) => setRouteFilter(event.target.value)}>
            <option value="">All routes</option>
            {routeOptions.map((route) => (
              <option key={route.id || route.name} value={route.id || route.name}>
                {route.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!hasAnyFilter ? <p className="detail-copy">Large rate-card lists may take time. Use filters for faster loading.</p> : null}

      {!shouldMountTable ? (
        <div className="transport-rate-card-safe-shell">
          <p className="empty-state">Click Load Rate Cards to view supplier rates.</p>
          <button type="button" className="secondary-button" onClick={() => setHasRequestedLoad(true)}>
            Load Rate Cards
          </button>
        </div>
      ) : (
        <VehicleRatesTable
          apiBaseUrl={apiBaseUrl}
          vehicleRates={[]}
          rateCardFilters={rateCardFilters}
          vehicles={vehicles}
          serviceTypes={serviceTypes}
          places={places}
          cities={cities}
          placeTypes={placeTypes}
          routes={routes}
          suppliers={suppliers}
          initialListEnabled={hasRequestedLoad}
          initialCreateOpen={hasRequestedCreate && !hasRequestedLoad}
          showToolbar={false}
          createRequestToken={createRequestToken}
        />
      )}
    </div>
  );
}
