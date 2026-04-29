'use client';

import { Fragment, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RouteOption } from '../lib/routes';
import { DuplicateVehicleRateButton } from '../vehicle-rates/DuplicateVehicleRateButton';
import { VehicleRatesForm } from '../vehicle-rates/VehicleRatesForm';
import { normalizeSupportedCurrency } from '../lib/currencyOptions';
import { CityOption } from '../lib/cities';
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

type SupplierRateCard = {
  id: string;
  supplierName: string;
  name: string;
  category: string;
  effectiveFrom: string;
  currency: string;
  validFrom: string;
  validTo: string;
  rates: VehicleRate[];
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

type ActiveRateForm = { mode: 'create-rate-card' } | { mode: 'edit-line'; rate: VehicleRate } | null;

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

function groupRatesIntoSupplierRateCards(vehicleRates: VehicleRate[]): SupplierRateCard[] {
  const groups = new Map<string, SupplierRateCard>();

  for (const rate of vehicleRates) {
    const supplierName = getSupplierName(rate);
    const category = getRateCardCategory([rate]);
    const validFrom = rate.validFrom.slice(0, 10);
    const validTo = rate.validTo.slice(0, 10);
    const key = [supplierName.trim().toLowerCase() || 'unassigned supplier', category.toLowerCase(), rate.currency, validFrom, validTo].join('|');
    const group =
      groups.get(key) ||
      ({
        id: key,
        supplierName,
        name: getRateCardTitle([rate]),
        category,
        effectiveFrom: validFrom,
        currency: rate.currency,
        validFrom,
        validTo,
        rates: [],
      } satisfies SupplierRateCard);

    group.rates.push(rate);
    group.name = getRateCardTitle(group.rates);
    group.category = getRateCardCategory(group.rates);
    groups.set(key, group);
  }

  return Array.from(groups.values()).sort((left, right) => {
    const supplierSort = left.supplierName.localeCompare(right.supplierName);
    return supplierSort || left.name.localeCompare(right.name);
  });
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
  const [activeForm, setActiveForm] = useState<ActiveRateForm>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const rateCards = groupRatesIntoSupplierRateCards(vehicleRates);
  const supplierOptions = useMemo(() => Array.from(new Set(vehicleRates.map(getSupplierName))).sort(), [vehicleRates]);

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

      if (activeForm?.mode === 'edit-line' && activeForm.rate.id === rate.id) {
        setActiveForm(null);
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

      <div className="transport-rate-card-toolbar">
        <button type="button" className="primary-button transport-contract-new-button" onClick={() => setActiveForm({ mode: 'create-rate-card' })}>
          + Create Rate Card
        </button>
      </div>

      <div className={`transport-rate-card-workspace ${activeForm ? 'transport-rate-card-workspace-with-panel' : ''}`}>
        <div className="transport-rate-card-list">
          {rateCards.length === 0 ? <p className="empty-state">No supplier rate cards yet.</p> : null}

          {rateCards.map((rateCard) => (
            <section key={rateCard.id} className="transport-contract-supplier-group">
              <div className="transport-contract-supplier-head">
                <div>
                  <p className="transport-rate-card-label">Supplier Rate Card</p>
                  <h3>{rateCard.name}</h3>
                  <p className="transport-rate-card-supplier">Supplier: {rateCard.supplierName}</p>
                </div>
                <span className="transport-contract-count">{rateCard.rates.length} rate lines</span>
              </div>
              <div className="transport-contract-divider" />
              <div className="transport-rate-card-summary">
                <div>
                  <span>Category</span>
                  <strong>{rateCard.category}</strong>
                </div>
                <div>
                  <span>Effective from</span>
                  <strong>{formatMonthYear(rateCard.effectiveFrom)}</strong>
                </div>
                <div>
                  <span>Currency</span>
                  <strong>{rateCard.currency}</strong>
                </div>
              </div>
              <h4 className="transport-rate-lines-title">Rate lines</h4>
              <div className="table-wrap transport-contract-table-wrap">
                <table className="data-table allotment-table transport-contract-table" aria-label={`Rate lines for ${rateCard.name}`}>
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
                    {rateCard.rates.map((rate) => (
                      <Fragment key={rate.id}>
                        <tr>
                          <td>
                            <strong>{rate.routeName}</strong>
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
                              <button type="button" className="compact-button" onClick={() => setActiveForm({ mode: 'edit-line', rate })}>
                                Edit
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
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>

        {activeForm ? (
          <aside className="transport-rate-card-form-panel" aria-label={activeForm.mode === 'create-rate-card' ? 'Create Rate Card' : 'Edit rate line'}>
            <div className="transport-rate-card-form-head">
              <div>
                <p className="transport-rate-card-label">{activeForm.mode === 'create-rate-card' ? 'Create' : 'Edit rate line'}</p>
                <h3>{activeForm.mode === 'create-rate-card' ? 'Create Rate Card' : activeForm.rate.routeName}</h3>
              </div>
              <button type="button" className="compact-button" onClick={() => setActiveForm(null)}>
                Close
              </button>
            </div>
            {activeForm.mode === 'create-rate-card' ? (
              <form className="transport-rate-card-metadata-form" onSubmit={(event) => event.preventDefault()}>
                <label>
                  Supplier
                  <input name="supplier" list="transport-rate-card-suppliers" placeholder="Alpha Bus and Limo Co" />
                  <datalist id="transport-rate-card-suppliers">
                    {supplierOptions.map((supplier) => (
                      <option key={supplier} value={supplier} />
                    ))}
                  </datalist>
                </label>
                <label>
                  Rate Card Name
                  <input name="rateCardName" placeholder="Buses 2026 Rates in USD" />
                </label>
                <label>
                  Category
                  <input name="category" placeholder="Buses" />
                </label>
                <label>
                  Effective From
                  <input name="effectiveFrom" type="month" />
                </label>
                <label>
                  Currency
                  <input name="currency" placeholder="USD" />
                </label>
                <label>
                  Notes
                  <textarea name="notes" rows={4} placeholder="Supplier contract terms, inclusions, exclusions, or operational notes." />
                </label>
                <p className="detail-copy">Rate card metadata is captured in the UI model for now. Existing backend rate lines remain unchanged.</p>
              </form>
            ) : (
              <VehicleRatesForm
                apiBaseUrl={apiBaseUrl}
                vehicles={vehicles}
                serviceTypes={serviceTypes}
                places={places}
                cities={cities}
                placeTypes={placeTypes}
                routes={routes}
                rateId={activeForm.rate.id}
                submitLabel="Save rate line"
                initialValues={{
                  vehicleId: activeForm.rate.vehicleId,
                  serviceTypeId: activeForm.rate.serviceTypeId,
                  routeId: activeForm.rate.routeId || '',
                  fromPlaceId: activeForm.rate.fromPlaceId || '',
                  toPlaceId: activeForm.rate.toPlaceId || '',
                  routeName: activeForm.rate.routeName,
                  minPax: String(activeForm.rate.minPax),
                  maxPax: String(activeForm.rate.maxPax),
                  price: String(activeForm.rate.price),
                  currency: normalizeSupportedCurrency(activeForm.rate.currency),
                  validFrom: activeForm.rate.validFrom.slice(0, 10),
                  validTo: activeForm.rate.validTo.slice(0, 10),
                }}
              />
            )}
          </aside>
        ) : null}
      </div>
    </div>
  );
}
