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
import { formatClassificationLabel, formatRouteLabel, formatServiceTypeLabel, formatSupplierName } from '../lib/transport-formatters';

type Vehicle = {
  id: string;
  name: string;
};

type TransportServiceType = {
  id: string;
  name: string;
  code: string;
  classification?: string;
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
  active: boolean;
  validFrom: string;
  validTo: string;
  supplierId?: string | null;
  supplierName?: string | null;
  supplier?: {
    id?: string;
    name: string;
  } | null;
  transportService?: {
    supplier?: {
      name?: string | null;
    } | null;
  } | null;
  service?: {
    supplier?: {
      name?: string | null;
    } | null;
  } | null;
  vehicle: {
    name: string;
  };
  serviceType: { name: string; code: string; classification?: string };
  route: RouteOption | null;
};

type Supplier = {
  id: string;
  name: string;
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
  suppliers: Supplier[];
};

type ActiveRateForm = { mode: 'create-rate-card' } | { mode: 'edit-line'; rate: VehicleRate } | { mode: 'duplicate-line'; rate: VehicleRate } | null;
type ActiveSupplierEdit = { rateCardId: string; supplierId: string };
type AutoFillAddOnsSummary = {
  dailyCreated: number;
  overnightCreated: number;
  stationaryCreated: number;
  waitingCreated: number;
  skippedExisting: number;
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString();
}

function formatMonthYear(value: string) {
  return new Date(value).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function getSupplierName(rate: VehicleRate) {
  return formatSupplierName(
    rate.supplier?.name ??
      rate.supplierName ??
      rate.transportService?.supplier?.name ??
      rate.service?.supplier?.name,
    null,
  );
}

function getRateCardCategory(rates: VehicleRate[]) {
  const classifications = new Set(rates.map((rate) => rate.serviceType.classification || 'ROUTE_TRANSFER'));

  if (classifications.size > 1) {
    return 'Transport contract';
  }

  if (classifications.size === 1 && classifications.has('ADD_ON')) {
    return 'Add-ons';
  }

  if (classifications.has('FULL_DAY') || classifications.has('DAILY_PACKAGE')) {
    return 'Full-day packages';
  }

  const joinedText = rates.map((rate) => `${rate.vehicle.name} ${formatServiceTypeLabel(rate.serviceType.name)} ${formatRouteLabel(rate.routeName)}`).join(' ').toLowerCase();

  if (joinedText.includes('bus') || joinedText.includes('coach')) {
    return 'Buses';
  }

  return 'Transport';
}

function getSupplierId(rate: VehicleRate) {
  return rate.supplier?.id ?? rate.supplierId ?? '';
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

  return `${getSupplierName(rates[0])} - ${getRateCardCategory(rates)} ${year} Rates in ${getPrimaryCurrency(rates)}`;
}

function groupRatesIntoSupplierRateCards(vehicleRates: VehicleRate[]): SupplierRateCard[] {
  const groups = new Map<string, SupplierRateCard>();

  for (const rate of vehicleRates) {
    const supplierName = getSupplierName(rate);
    const validFrom = rate.validFrom.slice(0, 10);
    const validTo = rate.validTo.slice(0, 10);
    const key = [supplierName.trim().toLowerCase() || 'unassigned supplier', rate.currency, validFrom, validTo].join('|');
    const group =
      groups.get(key) ||
      ({
        id: key,
        supplierName,
        name: getRateCardTitle([rate]),
        category: getRateCardCategory([rate]),
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
  suppliers,
}: VehicleRatesTableProps) {
  const router = useRouter();
  const [activeForm, setActiveForm] = useState<ActiveRateForm>(null);
  const [activeSupplierEdit, setActiveSupplierEdit] = useState<ActiveSupplierEdit | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [savingSupplierCardId, setSavingSupplierCardId] = useState<string | null>(null);
  const [exportingRateCardId, setExportingRateCardId] = useState<string | null>(null);
  const [autoFillingRateCardId, setAutoFillingRateCardId] = useState<string | null>(null);
  const [autoFillSummary, setAutoFillSummary] = useState<AutoFillAddOnsSummary | null>(null);
  const [error, setError] = useState('');
  const rateCards = groupRatesIntoSupplierRateCards(vehicleRates);
  const supplierOptions = useMemo(() => Array.from(new Set(vehicleRates.map(getSupplierName))).sort(), [vehicleRates]);

  async function handleSaveRateCardSupplier(rateCard: SupplierRateCard) {
    if (!activeSupplierEdit || activeSupplierEdit.rateCardId !== rateCard.id) {
      return;
    }

    if (!suppliers.some((supplier) => supplier.id === activeSupplierEdit.supplierId)) {
      setError('Supplier must exist.');
      return;
    }

    setSavingSupplierCardId(rateCard.id);
    setError('');

    try {
      for (const rate of rateCard.rates) {
        const response = await fetch(`${apiBaseUrl}/vehicle-rates/${rate.id}`, {
          method: 'PATCH',
          headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ supplierId: activeSupplierEdit.supplierId }),
        });

        if (!response.ok) {
          throw new Error(await getErrorMessage(response, 'Could not update supplier for this rate card.'));
        }
      }

      setActiveSupplierEdit(null);
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not update supplier for this rate card.');
    } finally {
      setSavingSupplierCardId(null);
    }
  }

  async function handleExportRateCard(rateCard: SupplierRateCard) {
    setExportingRateCardId(rateCard.id);
    setError('');

    try {
      const response = await fetch(`${apiBaseUrl}/vehicle-rates/export?rateCardId=${encodeURIComponent(rateCard.id)}`, {
        method: 'GET',
        headers: buildAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not export supplier rate card.'));
      }

      const blob = await response.blob();
      const disposition = response.headers.get('content-disposition') || '';
      const fileNameMatch = disposition.match(/filename="?([^"]+)"?/i);
      const fileName = fileNameMatch?.[1] || `${rateCard.name.replace(/[^a-zA-Z0-9._-]+/g, '_')}_transport.xlsx`;
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not export supplier rate card.');
    } finally {
      setExportingRateCardId(null);
    }
  }

  async function handleAutoFillAddOns(rateCard: SupplierRateCard) {
    setAutoFillingRateCardId(rateCard.id);
    setAutoFillSummary(null);
    setError('');

    try {
      const response = await fetch(`${apiBaseUrl}/vehicle-rates/auto-fill-addons`, {
        method: 'POST',
        headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ rateCardId: rateCard.id }),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not auto-fill transport add-ons.'));
      }

      const summary = await response.json() as AutoFillAddOnsSummary;
      setAutoFillSummary(summary);
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not auto-fill transport add-ons.');
    } finally {
      setAutoFillingRateCardId(null);
    }
  }

  async function handleDelete(rate: VehicleRate) {
    if (!window.confirm(`Delete ${formatRouteLabel(rate.routeName)}?`)) {
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

      if ((activeForm?.mode === 'edit-line' || activeForm?.mode === 'duplicate-line') && activeForm.rate.id === rate.id) {
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
      {autoFillSummary ? (
        <div className="quote-item-override-status quote-item-override-status-active">
          <strong>Transport add-ons auto-filled</strong>
          <span>
            {[
              `Daily created: ${autoFillSummary.dailyCreated}`,
              `Overnight created: ${autoFillSummary.overnightCreated}`,
              `Stationary created: ${autoFillSummary.stationaryCreated}`,
              `Waiting created: ${autoFillSummary.waitingCreated}`,
              `Skipped existing: ${autoFillSummary.skippedExisting}`,
            ].join(' | ')}
          </span>
        </div>
      ) : null}

      <div className="transport-rate-card-toolbar">
        <div>
          <p className="transport-rate-card-label">Imported supplier contracts</p>
          <strong>Grouped rate cards</strong>
        </div>
        <button type="button" className="compact-button transport-contract-new-button" onClick={() => setActiveForm({ mode: 'create-rate-card' })}>
          Advanced / manual rate card
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
                <div className="table-action-row">
                  <span className="transport-contract-count">{rateCard.rates.length} rate lines</span>
                  <button type="button" className="compact-button" onClick={() => handleExportRateCard(rateCard)} disabled={exportingRateCardId === rateCard.id}>
                    {exportingRateCardId === rateCard.id ? 'Exporting...' : 'Export Excel'}
                  </button>
                  <button type="button" className="compact-button" onClick={() => handleAutoFillAddOns(rateCard)} disabled={autoFillingRateCardId === rateCard.id}>
                    {autoFillingRateCardId === rateCard.id ? 'Auto-filling...' : 'Auto-fill add-ons'}
                  </button>
                  <button
                    type="button"
                    className="compact-button"
                    onClick={() => setActiveSupplierEdit({ rateCardId: rateCard.id, supplierId: getSupplierId(rateCard.rates[0]) })}
                  >
                    Edit Supplier
                  </button>
                </div>
              </div>
              {activeSupplierEdit?.rateCardId === rateCard.id ? (
                <div className="transport-rate-card-supplier-edit">
                  <label>
                    Supplier
                    <select
                      value={activeSupplierEdit.supplierId}
                      onChange={(event) => setActiveSupplierEdit({ rateCardId: rateCard.id, supplierId: event.target.value })}
                    >
                      <option value="">Select supplier</option>
                      {suppliers.map((supplier) => (
                        <option key={supplier.id} value={supplier.id}>
                          {supplier.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="table-action-row">
                    <button
                      type="button"
                      className="compact-button"
                      onClick={() => handleSaveRateCardSupplier(rateCard)}
                      disabled={savingSupplierCardId === rateCard.id || !activeSupplierEdit.supplierId}
                    >
                      {savingSupplierCardId === rateCard.id ? 'Saving...' : 'Save supplier'}
                    </button>
                    <button type="button" className="compact-button" onClick={() => setActiveSupplierEdit(null)} disabled={savingSupplierCardId === rateCard.id}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}
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
                      <th>Classification</th>
                      <th>Vehicle Size</th>
                      <th>Duration / Basis</th>
                      <th>Pax / Capacity</th>
                      <th>Validity</th>
                      <th>Price</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rateCard.rates.map((rate) => (
                      <Fragment key={rate.id}>
                        <tr>
                          <td>
                            <strong>{formatRouteLabel(rate.routeName)}</strong>
                            <div className="table-subcopy">{formatRouteLabel(rate.route?.name)}</div>
                          </td>
                          <td><span className="status-badge">{formatClassificationLabel(rate.serviceType.classification)}</span></td>
                          <td>{rate.vehicle.name}</td>
                          <td>{formatServiceTypeLabel(rate.serviceType.name)}</td>
                          <td>
                            {rate.minPax} - {rate.maxPax}
                          </td>
                          <td>
                            {formatDate(rate.validFrom)} - {formatDate(rate.validTo)}
                          </td>
                          <td>
                            {rate.currency} {rate.price.toFixed(2)}
                          </td>
                          <td>{rate.active ? 'Active' : 'Inactive'}</td>
                          <td>
                            <div className="table-action-row">
                              <button type="button" className="compact-button" onClick={() => setActiveForm({ mode: 'edit-line', rate })}>
                                Edit
                              </button>
                              <DuplicateVehicleRateButton onDuplicate={() => setActiveForm({ mode: 'duplicate-line', rate })} />
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
          <aside className="transport-rate-card-form-panel" aria-label={activeForm.mode === 'create-rate-card' ? 'Create Rate Card' : activeForm.mode === 'duplicate-line' ? 'Duplicate rate line' : 'Edit rate line'}>
            <div className="transport-rate-card-form-head">
              <div>
                <p className="transport-rate-card-label">
                  {activeForm.mode === 'create-rate-card'
                    ? 'Advanced / manual'
                    : activeForm.mode === 'duplicate-line'
                      ? 'Duplicate rate line'
                      : 'Advanced / manual edit'}
                </p>
                <h3>{activeForm.mode === 'create-rate-card' ? 'Manual Rate Card' : formatRouteLabel(activeForm.rate.routeName)}</h3>
              </div>
              <button type="button" className="compact-button" onClick={() => setActiveForm(null)}>
                Close
              </button>
            </div>
            {activeForm.mode === 'create-rate-card' ? (
              <form className="transport-rate-card-metadata-form" onSubmit={(event) => event.preventDefault()}>
                <p className="detail-copy">Use Excel contract upload for normal supplier rates. This manual form is reserved for cleanup and exceptional one-off maintenance.</p>
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
                rateId={activeForm.mode === 'edit-line' ? activeForm.rate.id : undefined}
                submitLabel={activeForm.mode === 'duplicate-line' ? 'Save duplicate rate line' : 'Save rate line'}
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
                  active: activeForm.rate.active,
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
