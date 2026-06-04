'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { SUPPORTED_CURRENCIES } from '../../../lib/currencyOptions';
import { filterCanonicalFleetVehicles } from '../../../lib/transport-vehicles';
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

type DayDraft = {
  id?: string;
  title: string;
  description: string;
  distanceKm: string;
  driveHours: string;
  driveMinutes: string;
  lunchIncluded: boolean;
  dinnerIncluded: boolean;
};

const BLANK_DAY: DayDraft = {
  title: '',
  description: '',
  distanceKm: '',
  driveHours: '',
  driveMinutes: '',
  lunchIncluded: false,
  dinnerIncluded: false,
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

function splitHours(value?: number | null) {
  const totalMinutes = Math.round(Number(value || 0) * 60);
  return {
    hours: totalMinutes ? String(Math.floor(totalMinutes / 60)) : '',
    minutes: totalMinutes ? String(totalMinutes % 60) : '',
  };
}

function combineHours(hours: string, minutes: string) {
  const hourValue = Number(hours || 0);
  const minuteValue = Number(minutes || 0);
  if (!hourValue && !minuteValue) return null;
  return Number((hourValue + minuteValue / 60).toFixed(2));
}

function uniqueTextOptions(values: string[]) {
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
    .map((value) => value);
}

export function TouringRouteEditor({ route, catalogs }: TouringRouteEditorProps) {
  const router = useRouter();
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [code, setCode] = useState(route.code || '');
  const [name, setName] = useState(route.name);
  const [startCity, setStartCity] = useState(route.startCity);
  const initialDuration = splitHours(route.includedHours ?? route.estimatedDriveHours);
  const [durationHours, setDurationHours] = useState(initialDuration.hours);
  const [durationMinutes, setDurationMinutes] = useState(initialDuration.minutes);
  const [durationDays, setDurationDays] = useState(String(route.durationDays || 1));
  const [destinations, setDestinations] = useState((route.mainDestinations || []).join(', '));
  const [routeDescription, setRouteDescription] = useState(route.routeDescription || '');
  const [includedKm, setIncludedKm] = useState(route.includedKm == null ? '' : String(route.includedKm));
  const [estimatedDistanceKm, setEstimatedDistanceKm] = useState(route.estimatedDistanceKm == null ? '' : String(route.estimatedDistanceKm));
  const [pickupRecommendation, setPickupRecommendation] = useState('');
  const [operationalNotes, setOperationalNotes] = useState(route.reviewNotes || '');
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
  const [days, setDays] = useState<DayDraft[]>(
    (route.days || [])
      .slice()
      .sort((left, right) => left.dayNumber - right.dayNumber)
      .map((day) => ({
        id: day.id,
        title: day.title || '',
        description: day.description || '',
        distanceKm: day.distanceKm == null ? '' : String(day.distanceKm),
        driveHours: day.driveMinutes == null ? '' : String(Math.floor(day.driveMinutes / 60)),
        driveMinutes: day.driveMinutes == null ? '' : String(day.driveMinutes % 60),
        lunchIncluded: Boolean(day.lunchIncluded),
        dinnerIncluded: Boolean(day.dinnerIncluded),
      })),
  );
  const activeTransportSuppliers = useMemo(
    () => catalogs.suppliers.filter((supplier) => supplier.active !== false && (!supplier.type || supplier.type.toLowerCase() === 'transport')),
    [catalogs.suppliers],
  );
  const canonicalVehicles = useMemo(
    () => filterCanonicalFleetVehicles(catalogs.vehicles),
    [catalogs.vehicles],
  );
  const cityOptions = useMemo(
    () => uniqueTextOptions([route.startCity, ...(route.mainDestinations || []), ...(route.stops || []).flatMap((stop) => [stop.city, stop.location || ''])]),
    [route.mainDestinations, route.startCity, route.stops],
  );
  const destinationOptions = useMemo(
    () => uniqueTextOptions([...(route.mainDestinations || []), ...(route.stops || []).flatMap((stop) => [stop.location || '', stop.city])]),
    [route.mainDestinations, route.stops],
  );
  const validityYearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return [currentYear - 1, currentYear, currentYear + 1, currentYear + 2].map((year) => String(year));
  }, []);

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

  function updateDay(index: number, patch: Partial<DayDraft>) {
    setDays((current) => {
      const next = current.slice();
      while (next.length <= index) {
        next.push({ ...BLANK_DAY });
      }
      next[index] = { ...next[index], ...patch };
      return next;
    });
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
        code,
        name,
        startCity,
        durationDays: Number(durationDays || 1),
        routeDescription,
        mainDestinations: destinations.split(',').map((entry) => entry.trim()).filter(Boolean),
        includedKm: optionalNumber(includedKm || estimatedDistanceKm),
        includedHours: combineHours(durationHours, durationMinutes),
        estimatedDistanceKm: optionalNumber(estimatedDistanceKm || includedKm),
        estimatedDriveHours: combineHours(durationHours, durationMinutes),
        reviewNotes: [pickupRecommendation ? `Pickup recommendation: ${pickupRecommendation}` : '', operationalNotes].filter(Boolean).join('\n') || null,
        active: activeOverride,
        stops: stops.map((stop, index) => ({
          order: Number(stop.order || index + 1),
          city: stop.city,
          location: stop.location,
          notes: cleanStopNotes(stop.notes, stop.overnight),
        })),
        pricings: pricings.map((pricing) => ({
          id: pricing.id || null,
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
        days: Array.from({ length: Math.max(1, Number(durationDays) || 1) }, (_, index) => {
          const day = days[index] || BLANK_DAY;
          const driveTotal = (Number(day.driveHours) || 0) * 60 + (Number(day.driveMinutes) || 0);
          return {
            dayNumber: index + 1,
            title: day.title.trim() || null,
            description: day.description.trim() || null,
            distanceKm: optionalNumber(day.distanceKm),
            driveMinutes: driveTotal > 0 ? driveTotal : null,
            lunchIncluded: day.lunchIncluded,
            dinnerIncluded: day.dinnerIncluded,
          };
        }),
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
      <datalist id="touring-route-city-options">
        {cityOptions.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
      <datalist id="touring-route-destination-options">
        {destinationOptions.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
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
          <label>Route code<input value={code} onChange={(event) => setCode(event.target.value)} placeholder="JOR-TR-..." /></label>
          <label>Name<input value={name} onChange={(event) => setName(event.target.value)} /></label>
          <label>
            Origin / start place
            <input value={startCity} list="touring-route-city-options" onChange={(event) => setStartCity(event.target.value)} required />
          </label>
          <label>Duration days<input type="number" min="1" value={durationDays} onChange={(event) => setDurationDays(event.target.value)} /></label>
          <label>Duration hours<input type="number" min="0" value={durationHours} onChange={(event) => setDurationHours(event.target.value)} /></label>
          <label>Duration minutes<input type="number" min="0" max="59" value={durationMinutes} onChange={(event) => setDurationMinutes(event.target.value)} /></label>
          <label>
            Main destination
            <input value={destinations.split(',')[0]?.trim() || ''} list="touring-route-destination-options" onChange={(event) => setDestinations(event.target.value)} />
          </label>
          <label>Distance km<input type="number" min="0" value={estimatedDistanceKm} onChange={(event) => setEstimatedDistanceKm(event.target.value)} /></label>
          <label>Included KM<input type="number" min="0" value={includedKm} onChange={(event) => setIncludedKm(event.target.value)} /></label>
          <label>
            Status
            <select value={active ? 'active' : 'archived'} onChange={(event) => setActive(event.target.value === 'active')}>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </select>
          </label>
        </div>
        <label>
          Pickup recommendation
          <input value={pickupRecommendation} onChange={(event) => setPickupRecommendation(event.target.value)} placeholder="08:00 from Amman hotels" />
        </label>
        <label>
          Operational notes
          <textarea rows={3} value={operationalNotes} onChange={(event) => setOperationalNotes(event.target.value)} />
        </label>
        <label>
          Route description
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
            <thead><tr><th>Stop order</th><th>Region</th><th>Place</th><th>Overnight</th><th>Notes</th><th>Actions</th></tr></thead>
            <tbody>
              {stops.map((stop, index) => (
                <tr key={stop.id || `new-stop-${index}`}>
                  <td><input type="number" min="1" value={stop.order} onChange={(event) => updateStop(index, { order: Number(event.target.value || index + 1) })} /></td>
                  <td>
                    <label>
                      Region
                      <input value={stop.city} list="touring-route-city-options" onChange={(event) => updateStop(index, { city: event.target.value })} />
                    </label>
                  </td>
                  <td>
                    <label>
                      Stop
                      <input value={stop.location} list="touring-route-destination-options" onChange={(event) => updateStop(index, { location: event.target.value })} />
                    </label>
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
            <h3>Day-by-day itinerary</h3>
            <p className="detail-copy">
              Authored once per route and copied into the quote itinerary when an operator generates from this route.
              Breakfast is derived from the matched hotel; set lunch/dinner here.
            </p>
          </div>
        </div>
        <div className="section-stack">
          {Array.from({ length: Math.max(1, Number(durationDays) || 1) }, (_, index) => {
            const day = days[index] || BLANK_DAY;
            return (
              <div key={`route-day-${index}`} className="detail-card">
                <div className="section-heading-row">
                  <strong>Day {index + 1}</strong>
                </div>
                <label>
                  Title
                  <input
                    value={day.title}
                    placeholder={`Day ${index + 1}`}
                    onChange={(event) => updateDay(index, { title: event.target.value })}
                  />
                </label>
                <div className="form-grid">
                  <label>
                    Distance (km)
                    <input
                      type="number"
                      min="0"
                      value={day.distanceKm}
                      onChange={(event) => updateDay(index, { distanceKm: event.target.value })}
                    />
                  </label>
                  <label>
                    Drive time (hours)
                    <input
                      type="number"
                      min="0"
                      value={day.driveHours}
                      onChange={(event) => updateDay(index, { driveHours: event.target.value })}
                    />
                  </label>
                  <label>
                    Drive time (minutes)
                    <input
                      type="number"
                      min="0"
                      max="59"
                      value={day.driveMinutes}
                      onChange={(event) => updateDay(index, { driveMinutes: event.target.value })}
                    />
                  </label>
                </div>
                <div className="inline-actions">
                  <label className="checkbox-inline">
                    <input
                      type="checkbox"
                      checked={day.lunchIncluded}
                      onChange={(event) => updateDay(index, { lunchIncluded: event.target.checked })}
                    />
                    Lunch included
                  </label>
                  <label className="checkbox-inline">
                    <input
                      type="checkbox"
                      checked={day.dinnerIncluded}
                      onChange={(event) => updateDay(index, { dinnerIncluded: event.target.checked })}
                    />
                    Dinner included
                  </label>
                </div>
                <label>
                  Description
                  <textarea
                    rows={6}
                    value={day.description}
                    placeholder="Client-facing description for this day (rendered as the proposal day summary)."
                    onChange={(event) => updateDay(index, { description: event.target.value })}
                  />
                </label>
              </div>
            );
          })}
        </div>
      </section>

      <section className="workspace-section">
        <div className="section-heading-row">
          <div>
            <h3>Pricing matrix</h3>
            <p className="detail-copy">Add supplier vehicle costs for this touring route only. Transfer route pricing and quote formulas are not changed here.</p>
          </div>
          <button type="button" className="secondary-button" onClick={() => setPricings((current) => [...current, pricingToDraft()])}>
            Add pricing row
          </button>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Supplier</th><th>Vehicle</th><th>Service type</th><th>Basis</th><th>Min pax</th><th>Max pax</th><th>Cost</th><th>Validity</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {pricings.map((pricing, index) => (
                <tr key={pricing.id || `new-pricing-${index}`}>
                  <td>
                    <select value={pricing.supplierId} onChange={(event) => updatePricing(index, { supplierId: event.target.value })}>
                      <option value="">Manual review</option>
                      {activeTransportSuppliers.map((supplier) => (
                        <option key={supplier.id} value={supplier.id}>
                          {supplier.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select value={pricing.vehicleId} onChange={(event) => updatePricing(index, { vehicleId: event.target.value })}>
                      <option value="">Vehicle pending</option>
                      {filterCanonicalFleetVehicles(canonicalVehicles, [pricing.vehicleId]).map((vehicle) => (
                        <option key={vehicle.id} value={vehicle.id}>
                          {vehicle.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select value={pricing.transportServiceTypeId} onChange={(event) => updatePricing(index, { transportServiceTypeId: event.target.value })}>
                      <option value="">Not mapped</option>
                      {catalogs.transportServiceTypes.map((serviceType) => (
                        <option key={serviceType.id} value={serviceType.id}>
                          {serviceType.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select value={pricing.pricingBasis} onChange={(event) => updatePricing(index, { pricingBasis: event.target.value as PricingDraft['pricingBasis'] })}>
                      <option value="PER_VEHICLE">Per vehicle</option>
                      <option value="PER_DAY">Per day</option>
                    </select>
                  </td>
                  <td><input type="number" min="1" value={pricing.minPax} onChange={(event) => updatePricing(index, { minPax: event.target.value })} /></td>
                  <td><input type="number" min="1" value={pricing.maxPax} onChange={(event) => updatePricing(index, { maxPax: event.target.value })} /></td>
                  <td>
                    <select value={pricing.currency} onChange={(event) => updatePricing(index, { currency: event.target.value })}>
                      {SUPPORTED_CURRENCIES.map((currency) => (
                        <option key={currency} value={currency}>
                          {currency}
                        </option>
                      ))}
                    </select>
                    <input type="number" min="0" value={pricing.baseCost} onChange={(event) => updatePricing(index, { baseCost: event.target.value })} />
                  </td>
                  <td>
                    <select
                      value={pricing.validFrom ? pricing.validFrom.slice(0, 4) : ''}
                      onChange={(event) => {
                        const year = event.target.value;
                        updatePricing(index, year ? { validFrom: `${year}-01-01`, validTo: `${year}-12-31` } : { validFrom: '', validTo: '' });
                      }}
                    >
                      <option value="">Validity year</option>
                      {validityYearOptions.map((year) => (
                        <option key={year} value={year}>
                          {year}
                        </option>
                      ))}
                    </select>
                    <select
                      value={
                        pricing.validFrom?.slice(5) === '01-01' && pricing.validTo?.slice(5) === '12-31'
                          ? 'FULL_YEAR'
                          : pricing.validFrom?.slice(5) === '04-01' && pricing.validTo?.slice(5) === '10-31'
                            ? 'SUMMER'
                            : pricing.validFrom?.slice(5) === '11-01' && pricing.validTo?.slice(5) === '03-31'
                              ? 'WINTER'
                              : ''
                      }
                      onChange={(event) => {
                        const season = event.target.value;
                        const year = pricing.validFrom ? pricing.validFrom.slice(0, 4) : String(new Date().getFullYear());
                        if (season === 'FULL_YEAR') updatePricing(index, { validFrom: `${year}-01-01`, validTo: `${year}-12-31` });
                        if (season === 'SUMMER') updatePricing(index, { validFrom: `${year}-04-01`, validTo: `${year}-10-31` });
                        if (season === 'WINTER') updatePricing(index, { validFrom: `${year}-11-01`, validTo: `${Number(year) + 1}-03-31` });
                      }}
                    >
                      <option value="">Validity season</option>
                      <option value="FULL_YEAR">Full year</option>
                      <option value="SUMMER">Summer</option>
                      <option value="WINTER">Winter</option>
                    </select>
                    <input type="date" value={pricing.validFrom} onChange={(event) => updatePricing(index, { validFrom: event.target.value })} />
                    <input type="date" value={pricing.validTo} onChange={(event) => updatePricing(index, { validTo: event.target.value })} />
                  </td>
                  <td>
                    <select value={pricing.active ? 'active' : 'inactive'} onChange={(event) => updatePricing(index, { active: event.target.value === 'active' })}>
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </td>
                  <td>
                    <div className="button-row">
                      <button type="button" className="secondary-button" onClick={() => updatePricing(index, { active: false })}>Deactivate</button>
                      <button type="button" className="secondary-button" onClick={() => setPricings((current) => current.filter((_, pricingIndex) => pricingIndex !== index))}>Delete row</button>
                    </div>
                  </td>
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
