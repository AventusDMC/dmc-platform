'use client';

import { Fragment, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RouteOption } from '../lib/routes';
import { DuplicateVehicleRateButton } from '../vehicle-rates/DuplicateVehicleRateButton';
import { VehicleRatesForm } from '../vehicle-rates/VehicleRatesForm';
import { normalizeSupportedCurrency } from '../lib/currencyOptions';
import { CityOption } from '../lib/cities';
import { InlineRowEditorShell } from '../components/InlineRowEditorShell';
import { getErrorMessage } from '../lib/api';
import { buildAuthHeaders } from '../lib/auth-client';
import { PlaceOption } from '../lib/places';
import { PlaceTypeOption } from '../lib/placeTypes';

type Vehicle = {
  id: string;
  name: string;
};

type TransportServiceType = {
  id: string;
  name: string;
  code: string;
};

type VehicleRate = {
  id: string;
  vehicleId: string;
  serviceTypeId: string;
  routeId: string | null;
  fromPlaceId: string | null;
  toPlaceId: string | null;
  routeName: string;
  minPax: number;
  maxPax: number;
  price: number;
  currency: string;
  validFrom: string;
  validTo: string;
  vehicle: {
    name: string;
    supplierId?: string | null;
    supplier?: {
      name: string;
    } | null;
  };
  serviceType: { name: string; code: string };
  route: RouteOption | null;
};

type VehicleRatesTableProps = {
  apiBaseUrl: string;
  vehicleRates: VehicleRate[];
  vehicles: Vehicle[];
  serviceTypes: TransportServiceType[];
  places: PlaceOption[];
  cities: CityOption[];
  placeTypes: PlaceTypeOption[];
  routes: RouteOption[];
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString();
}

function formatMonthYear(value: string) {
  return new Date(value).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function getSupplierName(rate: VehicleRate) {
  return rate.vehicle.supplier?.name || rate.vehicle.supplierId || 'Unassigned supplier';
}

function getRateCardCategory(rates: VehicleRate[]) {
  const joinedText = rates.map((rate) => `${rate.vehicle.name} ${rate.serviceType.name} ${rate.routeName}`).join(' ').toLowerCase();

  if (joinedText.includes('bus') || joinedText.includes('coach')) {
    return 'Buses';
  }

  return 'Transport';
}

function getEffectiveFrom(rates: VehicleRate[]) {
  return rates.reduce((earliest, rate) => (new Date(rate.validFrom) < new Date(earliest) ? rate.validFrom : earliest), rates[0]?.validFrom || '');
}

function getPrimaryCurrency(rates: VehicleRate[]) {
  return rates[0]?.currency || 'USD';
}

function getRateCardTitle(rates: VehicleRate[]) {
  const effectiveFrom = getEffectiveFrom(rates);
  const year = effectiveFrom ? new Date(effectiveFrom).getFullYear() : new Date().getFullYear();

  return `${getRateCardCategory(rates)} ${year} Rates in ${getPrimaryCurrency(rates)}`;
}

function groupRatesBySupplier(vehicleRates: VehicleRate[]) {
  const groups = new Map<string, { supplierName: string; rates: VehicleRate[] }>();

  for (const rate of vehicleRates) {
    const supplierName = getSupplierName(rate);
    const key = supplierName.trim().toLowerCase() || 'unassigned supplier';
    const group = groups.get(key) || { supplierName, rates: [] };
    group.rates.push(rate);
    groups.set(key, group);
  }

  return Array.from(groups.values()).sort((left, right) => left.supplierName.localeCompare(right.supplierName));
}

export function VehicleRatesTable({
  apiBaseUrl,
  vehicleRates,
  vehicles,
  serviceTypes,
  places,
  cities,
  placeTypes,
  routes,
}: VehicleRatesTableProps) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const supplierGroups = groupRatesBySupplier(vehicleRates);

  async function handleDelete(rate: VehicleRate) {
    if (!window.confirm(`Delete ${rate.routeName}?`)) {
      return;
    }

    setDeletingId(rate.id);
    setError('');

    try {
      const response = await fetch(`${apiBaseUrl}/vehicle-rates/${rate.id}`, {
        method: 'DELETE',
        headers: buildAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not delete vehicle rate.'));
      }

      if (editingId === rate.id) {
        setEditingId(null);
      }

      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not delete vehicle rate.');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="entity-list allotment-table-stack">
      {error ? <p className="form-error">{error}</p> : null}

      {supplierGroups.map((group) => (
        <section key={group.supplierName} className="transport-contract-supplier-group">
          <div className="transport-contract-supplier-head">
            <div>
              <p className="transport-rate-card-label">Supplier</p>
              <h3>{group.supplierName}</h3>
            </div>
            <span className="transport-contract-count">{group.rates.length} rate lines</span>
          </div>
          <div className="transport-contract-divider" />
          <div className="transport-rate-card-summary">
            <div>
              <span>Rate Card</span>
              <strong>{getRateCardTitle(group.rates)}</strong>
            </div>
            <div>
              <span>Effective from</span>
              <strong>{formatMonthYear(getEffectiveFrom(group.rates))}</strong>
            </div>
            <div>
              <span>Category</span>
              <strong>{getRateCardCategory(group.rates)}</strong>
            </div>
          </div>
          <h4 className="transport-rate-lines-title">Rate lines</h4>
          <div className="table-wrap transport-contract-table-wrap">
            <table className="data-table allotment-table transport-contract-table" aria-label={`Rate lines for ${group.supplierName}`}>
              <thead>
                <tr>
                  <th>Service / Route</th>
                  <th>Vehicle Size</th>
                  <th>Duration / Basis</th>
                  <th>Pax / Capacity</th>
                  <th>Validity</th>
                  <th>Price</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {group.rates.map((rate) => {
                  const isEditing = editingId === rate.id;

                  return (
                    <Fragment key={rate.id}>
                      <tr>
                        <td>
                          <strong>{rate.routeName}</strong>
                          <div className="table-subcopy" hidden>
                            {[rate.route?.name, `${rate.serviceType.name} (${rate.serviceType.code})`].filter(Boolean).join(' · ')}
                          </div>
                          <div className="table-subcopy">{[rate.route?.name, rate.serviceType.code].filter(Boolean).join(' - ')}</div>
                        </td>
                        <td>{rate.vehicle.name}</td>
                        <td>{rate.serviceType.name}</td>
                        <td>
                          {rate.minPax} - {rate.maxPax}
                        </td>
                        <td>
                          {formatDate(rate.validFrom)} - {formatDate(rate.validTo)}
                        </td>
                        <td>
                          {rate.currency} {rate.price.toFixed(2)}
                        </td>
                        <td>
                          <div className="table-action-row">
                            <button
                              type="button"
                              className="compact-button"
                              onClick={() => setEditingId((current) => (current === rate.id ? null : rate.id))}
                            >
                              {isEditing ? 'Close edit' : 'Edit'}
                            </button>
                            <DuplicateVehicleRateButton apiBaseUrl={apiBaseUrl} rateId={rate.id} />
                            <button
                              type="button"
                              className="compact-button compact-button-danger"
                              onClick={() => handleDelete(rate)}
                              disabled={deletingId === rate.id}
                            >
                              {deletingId === rate.id ? 'Deleting...' : 'Delete'}
                            </button>
                          </div>
                        </td>
                      </tr>
                      {isEditing ? (
                        <tr>
                          <td colSpan={7}>
                            <InlineRowEditorShell>
                              <VehicleRatesForm
                                apiBaseUrl={apiBaseUrl}
                                vehicles={vehicles}
                                serviceTypes={serviceTypes}
                                places={places}
                                cities={cities}
                                placeTypes={placeTypes}
                                routes={routes}
                                rateId={rate.id}
                                submitLabel="Save rate line"
                                initialValues={{
                                  vehicleId: rate.vehicleId,
                                  serviceTypeId: rate.serviceTypeId,
                                  routeId: rate.routeId || '',
                                  fromPlaceId: rate.fromPlaceId || '',
                                  toPlaceId: rate.toPlaceId || '',
                                  routeName: rate.routeName,
                                  minPax: String(rate.minPax),
                                  maxPax: String(rate.maxPax),
                                  price: String(rate.price),
                                  currency: normalizeSupportedCurrency(rate.currency),
                                  validFrom: rate.validFrom.slice(0, 10),
                                  validTo: rate.validTo.slice(0, 10),
                                }}
                              />
                            </InlineRowEditorShell>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
