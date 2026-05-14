'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { SearchableSelect, type SearchableSelectOption } from '../../../components/SearchableSelect';
import { SUPPORTED_CURRENCIES } from '../../../lib/currencyOptions';
import type { TouringRouteCatalogs, TouringRouteDetail, TouringRoutePricingDetail } from '../types';

type StopDraft = { id?: string; order: number; city: string; location: string; overnight: boolean; notes: string };
type PricingDraft = {
  id?: string;
  supplierId: string;
  vehicleId: string;
  transportServiceTypeId: string;
  pricingBasis: 'PER_VEHICLE' | 'PER_DAY';
  minPax: string;
  maxPax: string;
  currency: string;
  baseCost: string;
  costPerDay: string;
  includedKm: string;
  includedHours: string;
  extraKmRate: string;
  extraHourRate: string;
  validFrom: string;
  validTo: string;
  active: boolean;
  notes: string;
};

type TouringRouteEditorProps = {
  route: TouringRouteDetail;
  catalogs: TouringRouteCatalogs;
};

function dateInputValue(value?: string | null) {
  return value ? String(value).slice(0, 10) : '';
}

function stopHasOvernight(notes?: string | null) {
  return /overnight/i.test(notes || '');
}

function cleanStopNotes(notes: string, overnight: boolean) {
  const cleaned = notes.replace(/\bOvernight stop\b/gi, '').replace(/\s*\|\s*\|\s*/g, ' | ').replace(/^\s*\|\s*|\s*\|\s*$/g, '').trim();
  return [overnight ? 'Overnight stop' : '', cleaned].filter(Boolean).join(' | ');
}

function pricingToDraft(pricing?: TouringRoutePricingDetail): PricingDraft {
  return {
    id: pricing?.id,
    supplierId: pricing?.supplierId || pricing?.supplier?.id || '',
    vehicleId: pricing?.vehicleId || pricing?.vehicle?.id || '',
    transportServiceTypeId: pricing?.transportServiceTypeId || pricing?.transportServiceType?.id || '',
    pricingBasis: pricing?.pricingBasis || 'PER_VEHICLE',
    minPax: String(pricing?.minPax ?? 1),
    maxPax: String(pricing?.maxPax ?? pricing?.vehicle?.maxPax ?? 1),
    currency: pricing?.currency || 'USD',
    baseCost: String(pricing?.baseCost ?? 0),
    costPerDay: pricing?.costPerDay == null ? '' : String(pricing.costPerDay),
    includedKm: pricing?.includedKm == null ? '' : String(pricing.includedKm),
    includedHours: pricing?.includedHours == null ? '' : String(pricing.includedHours),
    extraKmRate: pricing?.extraKmRate == null ? '' : String(pricing.extraKmRate),
    extraHourRate: pricing?.extraHourRate == null ? '' : String(pricing.extraHourRate),
    validFrom: dateInputValue(pricing?.validFrom),
    validTo: dateInputValue(pricing?.validTo),
    active: pricing?.active !== false,
    notes: pricing?.notes || '',
  };
}

function optionalNumber(value: string) {
  return value.trim() ? Number(value) : null;
}

function uniqueTextOptions(values: string[], helper: string): SearchableSelectOption[] {
  const seen = new Set<string>();
  return values
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value) => {
      const key = value.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.localeCompare(b))
    .map((value) => ({ value, label: value, helper }));
}

export function TouringRouteEditor({ route, catalogs }: TouringRouteEditorProps) {
  const router = useRouter();
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [name, setName] = useState(route.name);
  const [startCity, setStartCity] = useState(route.startCity);
  const [durationDays, setDurationDays] = useState(String(route.durationDays || 1));
  const [destinations, setDestinations] = useState((route.mainDestinations || []).join(', '));
  const [routeDescription, setRouteDescription] = useState(route.routeDescription || '');
  const [includedKm, setIncludedKm] = useState(route.includedKm == null ? '' : String(route.includedKm));
  const [includedHours, setIncludedHours] = useState(route.includedHours == null ? '' : String(route.includedHours));
  const [active, setActive] = useState(route.active !== false);
  const [stops, setStops] = useState<StopDraft[]>(
    (route.stops || []).map((stop, index) => ({
      id: stop.id,
      order: stop.order || index + 1,
      city: stop.city || '',
      location: stop.location || '',
      overnight: stopHasOvernight(stop.notes),
      notes: (stop.notes || '').replace(/\bOvernight stop\b/gi, '').replace(/^\s*\|\s*|\s*\|\s*$/g, '').trim(),
    })),
  );
  const [pricings, setPricings] = useState<PricingDraft[]>((route.pricings || []).map(pricingToDraft));
  const cityOptions = useMemo(
    () => uniqueTextOptions([route.startCity, ...(route.mainDestinations || []), ...(route.stops || []).flatMap((stop) => [stop.city, stop.location || ''])], 'Saved touring route value'),
    [route.mainDestinations, route.startCity, route.stops],
  );
  const destinationOptions = useMemo(
    () => uniqueTextOptions([...(route.mainDestinations || []), ...(route.stops || []).flatMap((stop) => [stop.location || '', stop.city])], 'Route destination / stop'),
    [route.mainDestinations, route.stops],
  );
  const supplierOptions = useMemo<SearchableSelectOption[]>(
    () => catalogs.suppliers.map((supplier) => ({ value: supplier.id, label: supplier.name, helper: 'Transport supplier' })),
    [catalogs.suppliers],
  );
  const vehicleOptions = useMemo<SearchableSelectOption[]>(
    () =>
      catalogs.vehicles.map((vehicle) => ({
        value: vehicle.id,
        label: vehicle.name,
        helper: [vehicle.vehicleType, vehicle.maxPax ? `${vehicle.maxPax} pax` : null].filter(Boolean).join(' / '),
      })),
    [catalogs.vehicles],
  );
  const vehicleTypeOptions = useMemo(
    () => uniqueTextOptions(catalogs.vehicles.map((vehicle) => vehicle.vehicleType || vehicle.name), 'Vehicle catalog'),
    [catalogs.vehicles],
  );
  const transportServiceTypeOptions = useMemo<SearchableSelectOption[]>(
    () =>
      catalogs.transportServiceTypes.map((serviceType) => ({
        value: serviceType.id,
        label: serviceType.name,
        helper: [serviceType.code, serviceType.classification].filter(Boolean).join(' / '),
      })),
    [catalogs.transportServiceTypes],
  );
  const currencyOptions = useMemo<SearchableSelectOption[]>(
    () => SUPPORTED_CURRENCIES.map((currency) => ({ value: currency, label: currency, helper: 'Supported currency' })),
    [],
  );

  const warnings = useMemo(() => {
    const next: string[] = [];
    if (stops.length === 0) next.push('No stops are defined.');
    if (pricings.filter((pricing) => pricing.active).length === 0) next.push('No active vehicle pricing rows.');
    if (pricings.some((pricing) => !pricing.supplierId)) next.push('One or more pricing rows has no supplier mapping.');
    if (Number(durationDays) > 1 && !stops.some((stop) => stop.overnight)) next.push('Multi-day route has no overnight marker.');
    return next;
  }, [durationDays, pricings, stops]);

  function updateStop(index: number, patch: Partial<StopDraft>) {
    setStops((current) => current.map((stop, stopIndex) => (stopIndex === index ? { ...stop, ...patch } : stop)));
  }

  function updatePricing(index: number, patch: Partial<PricingDraft>) {
    setPricings((current) => current.map((pricing, pricingIndex) => (pricingIndex === index ? { ...pricing, ...patch } : pricing)));
  }

  async function saveRoute(activeOverride = active) {
    setIsSaving(true);
    setError('');
    setStatus('');
    try {
      const payload = {
        name,
        startCity,
        durationDays: Number(durationDays || 1),
        routeDescription,
        mainDestinations: destinations.split(',').map((entry) => entry.trim()).filter(Boolean),
        includedKm: optionalNumber(includedKm),
        includedHours: optionalNumber(includedHours),
        active: activeOverride,
        stops: stops.map((stop, index) => ({
          order: Number(stop.order || index + 1),
          city: stop.city,
          location: stop.location,
          notes: cleanStopNotes(stop.notes, stop.overnight),
        })),
        pricings: pricings.map((pricing) => ({
          supplierId: pricing.supplierId || null,
          vehicleId: pricing.vehicleId || null,
          transportServiceTypeId: pricing.transportServiceTypeId || null,
          pricingBasis: pricing.pricingBasis,
          minPax: Number(pricing.minPax || 1),
          maxPax: Number(pricing.maxPax || pricing.minPax || 1),
          currency: pricing.currency.toUpperCase() || 'USD',
          baseCost: Number(pricing.baseCost || 0),
          costPerDay: optionalNumber(pricing.costPerDay),
          includedKm: optionalNumber(pricing.includedKm),
          includedHours: optionalNumber(pricing.includedHours),
          extraKmRate: optionalNumber(pricing.extraKmRate),
          extraHourRate: optionalNumber(pricing.extraHourRate),
          validFrom: pricing.validFrom || null,
          validTo: pricing.validTo || null,
          active: pricing.active,
          notes: pricing.notes || null,
        })),
      };
      const response = await fetch(`/api/touring-routes/${encodeURIComponent(route.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.message || 'Could not save touring route.');
      }
      setStatus('Touring route saved.');
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not save touring route.');
    } finally {
      setIsSaving(false);
    }
  }

  async function archiveRoute() {
    setActive(false);
    await saveRoute(false);
  }

  return (
    <section className="section-stack" id="edit">
      {status ? <p className="form-success">{status}</p> : null}
      {error ? <p className="form-error">{error}</p> : null}

      <section className="workspace-section">
        <div className="section-heading-row">
          <div>
            <p className="eyebrow">Operational inventory</p>
            <h3>Route metadata</h3>
          </div>
          <div className="button-row">
            <button type="button" className="secondary-button" onClick={archiveRoute} disabled={isSaving || !active}>
              Delete
            </button>
            <button type="button" className="button" onClick={() => saveRoute()} disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save changes'}
            </button>
          </div>
        </div>
        <div className="form-grid">
          <label>Name<input value={name} onChange={(event) => setName(event.target.value)} /></label>
          <SearchableSelect
            label="Origin / start city"
            value={startCity}
            options={cityOptions}
            onChange={setStartCity}
            placeholder="Select start city"
            missingText="Saved start city is not in the known touring route city list."
            required
          />
          <label>Duration days<input type="number" min="1" value={durationDays} onChange={(event) => setDurationDays(event.target.value)} /></label>
          <SearchableSelect
            label="Main destination"
            value={destinations.split(',')[0]?.trim() || ''}
            options={destinationOptions}
            onChange={(value) => setDestinations(value)}
            placeholder="Select main destination"
            missingText="Saved destination is not in the known destination catalog."
          />
          <label>Included KM<input type="number" min="0" value={includedKm} onChange={(event) => setIncludedKm(event.target.value)} /></label>
          <label>Included hours<input type="number" min="0" value={includedHours} onChange={(event) => setIncludedHours(event.target.value)} /></label>
          <label>
            Status
            <select value={active ? 'active' : 'archived'} onChange={(event) => setActive(event.target.value === 'active')}>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </select>
          </label>
        </div>
        <label>
          Notes / route description
          <textarea rows={3} value={routeDescription} onChange={(event) => setRouteDescription(event.target.value)} />
        </label>
      </section>

      <section className="workspace-section">
        <div className="section-heading-row">
          <div>
            <h3>Stops</h3>
            <p className="detail-copy">Stops define the operational circuit and overnight markers for multi-day programs.</p>
          </div>
          <button type="button" className="secondary-button" onClick={() => setStops((current) => [...current, { order: current.length + 1, city: '', location: '', overnight: false, notes: '' }])}>
            Add stop
          </button>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Order</th><th>City</th><th>Stop</th><th>Overnight</th><th>Notes</th><th>Actions</th></tr></thead>
            <tbody>
              {stops.map((stop, index) => (
                <tr key={stop.id || `new-stop-${index}`}>
                  <td><input type="number" min="1" value={stop.order} onChange={(event) => updateStop(index, { order: Number(event.target.value || index + 1) })} /></td>
                  <td>
                    <SearchableSelect
                      label="Region"
                      value={stop.city}
                      options={cityOptions}
                      onChange={(value) => updateStop(index, { city: value })}
                      placeholder="Select region"
                      missingText="Saved region is not in the known route city list."
                    />
                  </td>
                  <td>
                    <SearchableSelect
                      label="Stop"
                      value={stop.location}
                      options={destinationOptions}
                      onChange={(value) => updateStop(index, { location: value })}
                      placeholder="Select stop"
                      missingText="Saved stop is not in the known destination list."
                    />
                  </td>
                  <td>
                    <select value={stop.overnight ? 'true' : 'false'} onChange={(event) => updateStop(index, { overnight: event.target.value === 'true' })}>
                      <option value="false">No</option>
                      <option value="true">Yes</option>
                    </select>
                  </td>
                  <td><input value={stop.notes} onChange={(event) => updateStop(index, { notes: event.target.value })} /></td>
                  <td><button type="button" className="secondary-button" onClick={() => setStops((current) => current.filter((_, stopIndex) => stopIndex !== index))}>Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="workspace-section">
        <div className="section-heading-row">
          <div>
            <h3>Vehicle pricing</h3>
            <p className="detail-copy">Supplier mappings, vehicles, validity ranges, and pricing basis for the route.</p>
          </div>
          <button type="button" className="secondary-button" onClick={() => setPricings((current) => [...current, pricingToDraft()])}>
            Add pricing row
          </button>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Supplier</th><th>Vehicle</th><th>Service type</th><th>Basis</th><th>Pax</th><th>Cost</th><th>Validity</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {pricings.map((pricing, index) => (
                <tr key={pricing.id || `new-pricing-${index}`}>
                  <td>
                    <select value={pricing.supplierId} onChange={(event) => updatePricing(index, { supplierId: event.target.value })}>
                      <option value="">Manual review</option>
                      {catalogs.suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
                    </select>
                  </td>
                  <td>
                    <select value={pricing.vehicleId} onChange={(event) => updatePricing(index, { vehicleId: event.target.value })}>
                      <option value="">Vehicle pending</option>
                      {catalogs.vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.name}{vehicle.vehicleType ? ` (${vehicle.vehicleType})` : ''}</option>)}
                    </select>
                  </td>
                  <td>
                    <select value={pricing.transportServiceTypeId} onChange={(event) => updatePricing(index, { transportServiceTypeId: event.target.value })}>
                      <option value="">Not mapped</option>
                      {catalogs.transportServiceTypes.map((serviceType) => <option key={serviceType.id} value={serviceType.id}>{serviceType.name}</option>)}
                    </select>
                  </td>
                  <td>
                    <select value={pricing.pricingBasis} onChange={(event) => updatePricing(index, { pricingBasis: event.target.value as PricingDraft['pricingBasis'] })}>
                      <option value="PER_VEHICLE">Per vehicle</option>
                      <option value="PER_DAY">Per day</option>
                    </select>
                  </td>
                  <td><input value={pricing.minPax} onChange={(event) => updatePricing(index, { minPax: event.target.value })} />-<input value={pricing.maxPax} onChange={(event) => updatePricing(index, { maxPax: event.target.value })} /></td>
                  <td><input value={pricing.currency} onChange={(event) => updatePricing(index, { currency: event.target.value.toUpperCase() })} /><input type="number" min="0" value={pricing.baseCost} onChange={(event) => updatePricing(index, { baseCost: event.target.value })} /></td>
                  <td><input type="date" value={pricing.validFrom} onChange={(event) => updatePricing(index, { validFrom: event.target.value })} /><input type="date" value={pricing.validTo} onChange={(event) => updatePricing(index, { validTo: event.target.value })} /></td>
                  <td><input type="checkbox" checked={pricing.active} onChange={(event) => updatePricing(index, { active: event.target.checked })} /></td>
                  <td><button type="button" className="secondary-button" onClick={() => setPricings((current) => current.filter((_, pricingIndex) => pricingIndex !== index))}>Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="workspace-section">
        <h3>Operational warnings</h3>
        {warnings.length > 0 ? warnings.map((warning) => <p className="form-helper" key={warning}>{warning}</p>) : <p className="form-success">No operational warnings detected.</p>}
      </section>
    </section>
  );
}
