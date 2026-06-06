'use client';

// Phase 3D.1B/3D.1C — "Generate from Touring Route" panel.
//
// Reads GET /touring-routes/:id and previews a quote skeleton. Operator edits
// (move / reorder / drop POIs) mutate LOCAL React state only.
//
// Phase 3D.1C adds a NON-DESTRUCTIVE apply: it CREATES itinerary days, ONE
// touring-route transport package item, and ordered QuoteItineraryDayPoi rows
// via the existing endpoints. It NEVER deletes or overwrites: apply is blocked
// unless the quote has zero itinerary days (no replace mode here). Generated
// days carry NO notes text — the proposal composer remains the narrative source.

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { buildAuthHeaders } from '../../lib/auth-client';
import {
  formatTouringRouteOptionLabel,
  formatTouringRouteSecondaryMeta,
  touringRouteMatchesSearch,
  type RouteOption,
} from '../../lib/routes';
import {
  buildTouringRoutePreview,
  buildTouringRouteApplyPlan,
  buildOvernightHotelSuggestions,
  formatTouringRoutePricingLabel,
  movePreviewPoi,
  removePreviewPoi,
  reorderPreviewPoi,
  type TouringRouteDetailForGen,
  type TouringRoutePreview,
  type TouringRoutePricingRow,
  type Hotel,
  type HotelContract,
  type HotelRate,
  type OptimizationMode,
  type OvernightHotelOverride,
} from './QuoteAutoItineraryBuilder.logic';

type Props = {
  apiBaseUrl: string;
  routes: RouteOption[];
  quoteId: string;
  transportServiceId?: string | null;
  existingItemCount?: number;
  defaultPax?: number;
  defaultStartDate?: string | null;
  // Phase 3D.2B — hotel catalogs for SUGGESTIONS only (preview); optional so the
  // panel still renders if a caller omits them (suggestions just won't appear).
  hotels?: Hotel[];
  hotelContracts?: HotelContract[];
  hotelRates?: HotelRate[];
  optimizationMode?: OptimizationMode;
};

function isTouringRoute(route: RouteOption): boolean {
  return route.canonicalRouteType === 'TOURING_ROUTE';
}

export default function GenerateFromTouringRoutePanel({ apiBaseUrl, routes, quoteId, transportServiceId, existingItemCount, defaultPax, defaultStartDate, hotels, hotelContracts, hotelRates, optimizationMode }: Props) {
  const router = useRouter();
  const touringRoutes = useMemo(() => (routes || []).filter(isTouringRoute), [routes]);

  const [routeSearch, setRouteSearch] = useState('');
  const filteredTouringRoutes = useMemo(
    () => touringRoutes.filter((route) => touringRouteMatchesSearch(route, routeSearch)),
    [touringRoutes, routeSearch],
  );

  const [selectedRouteId, setSelectedRouteId] = useState('');
  const [routeDetail, setRouteDetail] = useState<TouringRouteDetailForGen | null>(null);
  const [pricingRows, setPricingRows] = useState<TouringRoutePricingRow[]>([]);
  const [pricingRowId, setPricingRowId] = useState('');
  const [startDate, setStartDate] = useState<string>(defaultStartDate || '');
  const [pax, setPax] = useState<number>(defaultPax && defaultPax > 0 ? defaultPax : 2);
  const [preview, setPreview] = useState<TouringRoutePreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // Phase 3D.2B — per-night hotel-suggestion overrides (local only; change
  // overnight city / disable a suggestion). Never persisted; reset on route load.
  const [hotelOverrides, setHotelOverrides] = useState<Record<number, OvernightHotelOverride>>({});

  // Existing-state detection for the non-destructive guard (refreshed on route load).
  const [existingDayCount, setExistingDayCount] = useState(0);
  const [existingPoiAssignmentCount, setExistingPoiAssignmentCount] = useState(0);
  const [acknowledged, setAcknowledged] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState('');
  const [applySuccess, setApplySuccess] = useState('');

  // READ-ONLY: count existing itinerary days + POI assignments so apply can block
  // safely (no overwrite / no replace in 3D.1C).
  async function refreshExistingState() {
    try {
      const res = await fetch(`${apiBaseUrl}/quotes/${quoteId}/itinerary`, { method: 'GET', headers: buildAuthHeaders(), cache: 'no-store' });
      if (!res.ok) return { dayCount: 0, poiCount: 0 };
      const body = await res.json();
      const days = (body?.days || []) as Array<{ poiAssignments?: unknown[] }>;
      const dayCount = days.length;
      const poiCount = days.reduce((sum, d) => sum + ((d.poiAssignments || []).length), 0);
      setExistingDayCount(dayCount);
      setExistingPoiAssignmentCount(poiCount);
      return { dayCount, poiCount };
    } catch {
      return { dayCount: 0, poiCount: 0 };
    }
  }

  async function loadRoute(routeId: string) {
    setSelectedRouteId(routeId);
    setPreview(null);
    setRouteDetail(null);
    setHotelOverrides({});
    setError('');
    setApplyError('');
    setApplySuccess('');
    setAcknowledged(false);
    if (!routeId) return;
    setLoading(true);
    try {
      await refreshExistingState();
      // READ-ONLY: fetch the route detail (ordered stops + POI translations).
      const response = await fetch(`${apiBaseUrl}/touring-routes/${routeId}`, {
        method: 'GET',
        headers: buildAuthHeaders(),
        cache: 'no-store',
      });
      if (!response.ok) {
        throw new Error(`Could not load route detail (${response.status}).`);
      }
      const detail = (await response.json()) as TouringRouteDetailForGen;
      const rows = (detail.pricings || []) as TouringRoutePricingRow[];
      const defaultRow = rows.find((r) => r.active !== false) || rows[0] || null;
      setRouteDetail(detail);
      setPricingRows(rows);
      setPricingRowId(defaultRow?.id || '');
      setPreview(buildTouringRoutePreview(detail, { pricingRowId: defaultRow?.id || null, startDate: startDate || null }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load the touring route.');
    } finally {
      setLoading(false);
    }
  }

  function rebuildPreview(nextPricingRowId: string, nextStartDate: string) {
    if (!routeDetail) return;
    // Rebuilding re-runs the auto-partition. (Operator POI edits are local; this
    // happens only when the route/date/pricing inputs change.)
    setPreview(buildTouringRoutePreview(routeDetail, { pricingRowId: nextPricingRowId || null, startDate: nextStartDate || null }));
  }

  function onPricingChange(value: string) {
    setPricingRowId(value);
    rebuildPreview(value, startDate);
  }

  function onStartDateChange(value: string) {
    setStartDate(value);
    rebuildPreview(pricingRowId, value);
  }

  const applyPlan = useMemo(() => {
    if (!preview) return null;
    return buildTouringRouteApplyPlan(preview, {
      pax,
      transportServiceId: transportServiceId ?? null,
      existingDayCount,
      existingItemCount: existingItemCount ?? 0,
      existingPoiAssignmentCount,
    });
  }, [preview, pax, transportServiceId, existingDayCount, existingItemCount, existingPoiAssignmentCount]);

  // Phase 3D.2B — per-night hotel SUGGESTIONS for the preview (pure; no writes).
  // Recomputed from the route + start date + local overrides. Empty when the
  // caller didn't pass hotel catalogs, or the route has no overnight nights.
  const hotelSuggestions = useMemo(() => {
    if (!routeDetail) return [];
    return buildOvernightHotelSuggestions(routeDetail, {
      hotels: hotels ?? [],
      hotelContracts: hotelContracts ?? [],
      hotelRates: hotelRates ?? [],
      travelStartDate: startDate || null,
      optimizationMode: optimizationMode ?? 'cost',
      overrides: hotelOverrides,
    }).suggestions;
  }, [routeDetail, hotels, hotelContracts, hotelRates, startDate, optimizationMode, hotelOverrides]);

  const needsAck = (applyPlan?.warnings.length ?? 0) > 0;
  const canSubmit = Boolean(applyPlan?.canApply) && (!needsAck || acknowledged) && !applying;

  // NON-DESTRUCTIVE apply: create-only. Re-checks the quote is empty first, then
  // creates days, ONE transport package item, and ordered POI rows. No deletes.
  async function applyGenerated() {
    if (!preview || !applyPlan || !applyPlan.canApply || !applyPlan.transport) return;
    setApplying(true);
    setApplyError('');
    setApplySuccess('');
    try {
      // Defensive pre-flight: confirm the quote still has no itinerary days.
      const { dayCount } = await refreshExistingState();
      if (dayCount > 0) {
        throw new Error('This quote now has itinerary days — refresh and use an empty quote (replace mode is a later phase).');
      }

      const post = async (path: string, body: unknown) => {
        const res = await fetch(`${apiBaseUrl}${path}`, {
          method: 'POST',
          headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify(body),
          cache: 'no-store',
        });
        if (!res.ok) throw new Error(`Request failed (${res.status}) for ${path}`);
        return res.json();
      };

      // 1) Create itinerary days (notes empty — composer is the narrative source).
      const dayIdByNumber = new Map<number, string>();
      for (const day of applyPlan.days) {
        const created = await post(`/quotes/${quoteId}/itinerary/day`, {
          dayNumber: day.dayNumber,
          title: day.title || `Day ${day.dayNumber}`,
          notes: '',
        });
        if (created?.id) dayIdByNumber.set(day.dayNumber, created.id);
      }

      // 2) Create exactly ONE touring-route transport package item on day 1.
      const t = applyPlan.transport;
      const day1Id = dayIdByNumber.get(t.attachToDayNumber);
      const day1Date = preview.days.find((d) => d.dayNumber === t.attachToDayNumber)?.date || null;
      await post(`/quotes/${quoteId}/items`, {
        serviceId: t.serviceId,
        itineraryId: day1Id,
        serviceDate: day1Date ? new Date(`${day1Date}T09:00:00`).toISOString() : undefined,
        startTime: '09:00',
        participantCount: t.paxCount,
        paxCount: t.paxCount,
        quantity: 1,
        dayCount: t.dayCount,
        markupPercent: 20,
        touringRouteId: t.touringRouteId,
        touringRoutePricingId: t.touringRoutePricingId,
        // Phase 3D.1H: pass the pricing row's currency so the backend can convert
        // overrideCost from the source currency into the quote currency before markup.
        currency: t.currency,
        overrideCost: t.overrideCost,
        useOverride: t.useOverride,
      });

      // 3) Assign ordered POIs per generated day (snapshots handled by the endpoint).
      for (const day of applyPlan.days) {
        if (day.poiAssignments.length === 0) continue;
        const dayId = dayIdByNumber.get(day.dayNumber);
        if (!dayId) continue;
        const res = await fetch(`${apiBaseUrl}/itinerary/day/${dayId}/pois`, {
          method: 'PUT',
          headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ assignments: day.poiAssignments }),
          cache: 'no-store',
        });
        if (!res.ok) throw new Error(`Could not assign POIs for day ${day.dayNumber} (${res.status}).`);
      }

      setApplySuccess(`Generated ${applyPlan.days.length} day(s), 1 transport package, and ${applyPlan.totalPoiAssignments} POI assignment(s). The proposal narrative is generated automatically.`);
      await refreshExistingState();
      router.refresh();
    } catch (caught) {
      setApplyError(caught instanceof Error ? caught.message : 'Could not generate the itinerary.');
    } finally {
      setApplying(false);
    }
  }

  return (
    <section className="quote-service-side-section" aria-label="Generate from touring route">
      <div className="workspace-section-head">
        <div>
          <p className="eyebrow">Itinerary</p>
          <h4>Generate from touring route</h4>
        </div>
      </div>
      <p style={{ margin: '0 0 0.6rem', fontSize: '0.78rem', color: 'var(--ds-color-muted, #475569)' }}>
        Preview a quote skeleton from a touring route&rsquo;s POI-linked stops. This is a preview only &mdash; nothing is saved.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', fontSize: '0.8rem' }}>
          <span>Touring route</span>
          <input
            className="app-input"
            type="search"
            value={routeSearch}
            onChange={(e) => setRouteSearch(e.target.value)}
            placeholder="Search by route name, code, or destination…"
            aria-label="Search touring routes"
            style={{ marginBottom: '0.25rem' }}
          />
          <select className="app-input" value={selectedRouteId} onChange={(e) => void loadRoute(e.target.value)} aria-label="Touring route">
            <option value="">Select a touring route…</option>
            {filteredTouringRoutes.map((route) => (
              <option key={route.id} value={route.id}>{formatTouringRouteOptionLabel(route)}</option>
            ))}
          </select>
          {routeSearch.trim() && filteredTouringRoutes.length === 0 ? (
            <span style={{ fontSize: '0.72rem', color: 'var(--ds-color-muted, #475569)' }}>
              No touring routes match “{routeSearch.trim()}”.
            </span>
          ) : null}
          {selectedRouteId ? (
            (() => {
              const sel = touringRoutes.find((r) => r.id === selectedRouteId);
              return sel ? (
                <span style={{ fontSize: '0.72rem', color: 'var(--ds-color-muted, #475569)' }}>
                  {formatTouringRouteSecondaryMeta(sel)}
                </span>
              ) : null;
            })()
          ) : null}
        </label>

        {routeDetail ? (
          <>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', fontSize: '0.8rem' }}>
              <span>Pricing row</span>
              <select className="app-input" value={pricingRowId} onChange={(e) => onPricingChange(e.target.value)} aria-label="Pricing row">
                {pricingRows.length === 0 ? <option value="">No pricing rows on this route</option> : null}
                {pricingRows.map((row) => (
                  <option key={row.id} value={row.id}>{formatTouringRoutePricingLabel(row)}</option>
                ))}
              </select>
            </label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', fontSize: '0.8rem', flex: 1 }}>
                <span>Start date</span>
                <input type="date" className="app-input" value={startDate} onChange={(e) => onStartDateChange(e.target.value)} aria-label="Start date" />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', fontSize: '0.8rem', width: '6rem' }}>
                <span>Pax</span>
                <input type="number" min={1} className="app-input" value={pax} onChange={(e) => setPax(Math.max(1, Number(e.target.value) || 1))} aria-label="Pax" />
              </label>
            </div>
          </>
        ) : null}
      </div>

      {loading ? <p style={{ fontSize: '0.8rem' }}>Loading route…</p> : null}
      {error ? <p className="form-error">{error}</p> : null}

      {preview ? (
        <div style={{ marginTop: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {!preview.hasUsablePois ? (
            <p className="form-error" role="status">
              This route has no POI-linked stops — the generated days would have no POI assignments and would fall back to manual notes.
            </p>
          ) : null}
          {preview.ambiguous ? (
            <div style={{ background: 'var(--ds-color-warn-bg, #FFF6D6)', border: '1px solid #E6C96B', borderRadius: 6, padding: '0.5rem 0.6rem' }}>
              <strong style={{ fontSize: '0.78rem' }}>Please review the suggested partition:</strong>
              <ul style={{ margin: '0.3rem 0 0', paddingInlineStart: '1.1rem', fontSize: '0.76rem' }}>
                {preview.ambiguityReasons.map((reason, i) => <li key={i}>{reason}</li>)}
              </ul>
            </div>
          ) : null}

          {preview.transport ? (
            <div style={{ fontSize: '0.8rem' }}>
              <strong>Transport package:</strong> {preview.transport.routeName} — {preview.transport.pricingLabel}
              {typeof preview.transport.cost === 'number'
                ? ` · ${preview.transport.currency} ${preview.transport.cost.toFixed(2)} (full package, ${preview.transport.dayCount} day${preview.transport.dayCount === 1 ? '' : 's'})`
                : null}
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.72rem', color: 'var(--ds-color-muted, #475569)' }}>
                Touring-route pricing is the <strong>full package price</strong> for the route, not a per-day rate. The day
                count is metadata on the quote item; it does not multiply the base cost.
              </p>
            </div>
          ) : null}

          <p style={{ margin: 0, fontSize: '0.76rem', color: 'var(--ds-color-muted, #475569)' }}>
            {preview.totalPois} POI assignment(s) across {preview.days.length} day(s)
            {preview.skippedStops > 0 ? ` · ${preview.skippedStops} base/operational stop(s) skipped` : ''}
          </p>

          {preview.days.map((day) => (
            <div key={day.dayNumber} style={{ border: '1px solid #e2e8f0', borderRadius: 6, padding: '0.5rem 0.6rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 700 }}>
                <span>Day {day.dayNumber}{day.title ? ` · ${day.title}` : ''}</span>
                <span style={{ color: 'var(--ds-color-muted, #475569)', fontWeight: 400 }}>{day.date || ''}</span>
              </div>
              {day.pois.length === 0 ? (
                <p style={{ margin: '0.3rem 0 0', fontSize: '0.76rem', color: '#b45309' }}>No usable POIs on this day — review or assign manually.</p>
              ) : (
                <ol style={{ margin: '0.3rem 0 0', paddingInlineStart: '1.2rem', fontSize: '0.78rem' }}>
                  {day.pois.map((poi, idx) => (
                    <li key={`${poi.poiId}-${idx}`} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', justifyContent: 'space-between' }}>
                      <span>{poi.title}</span>
                      <span style={{ display: 'flex', gap: '0.2rem' }}>
                        <button type="button" className="icon-button" title="Move up (within day)" disabled={idx === 0}
                          onClick={() => setPreview((p) => (p ? reorderPreviewPoi(p, day.dayNumber, idx, idx - 1) : p))}>↑</button>
                        <button type="button" className="icon-button" title="Move down (within day)" disabled={idx === day.pois.length - 1}
                          onClick={() => setPreview((p) => (p ? reorderPreviewPoi(p, day.dayNumber, idx, idx + 1) : p))}>↓</button>
                        <button type="button" className="icon-button" title="Move to previous day" disabled={day.dayNumber <= 1}
                          onClick={() => setPreview((p) => (p ? movePreviewPoi(p, day.dayNumber, idx, day.dayNumber - 1) : p))}>↥</button>
                        <button type="button" className="icon-button" title="Move to next day" disabled={day.dayNumber >= preview.days.length}
                          onClick={() => setPreview((p) => (p ? movePreviewPoi(p, day.dayNumber, idx, day.dayNumber + 1) : p))}>↧</button>
                        <button type="button" className="icon-button" title="Remove from preview"
                          onClick={() => setPreview((p) => (p ? removePreviewPoi(p, day.dayNumber, idx) : p))}>✕</button>
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          ))}

          {/* Phase 3D.2B — overnight hotel SUGGESTIONS (preview only; nothing saved). */}
          {hotelSuggestions.length > 0 ? (
            <div style={{ marginTop: '0.6rem', borderTop: '1px dashed #cbd5e1', paddingTop: '0.6rem' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 700 }}>Suggested overnight hotels</div>
              <p style={{ margin: '0.2rem 0 0.4rem', fontSize: '0.74rem', color: 'var(--ds-color-muted, #475569)' }}>
                Suggestions only — nothing is saved. Hotels are still added manually in this phase. Review the overnight city and edit if needed.
              </p>
              {hotelSuggestions.map((s) => (
                <div key={s.nightNumber} style={{ border: '1px solid #e2e8f0', borderRadius: 6, padding: '0.45rem 0.6rem', marginTop: '0.4rem', opacity: s.disabled ? 0.55 : 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                    <strong style={{ fontSize: '0.78rem' }}>Night {s.nightNumber}</strong>
                    <label style={{ display: 'flex', gap: '0.3rem', alignItems: 'center', fontSize: '0.74rem' }}>
                      <input
                        type="checkbox"
                        checked={s.disabled}
                        aria-label={`Skip hotel for night ${s.nightNumber}`}
                        onChange={(e) => setHotelOverrides((prev) => ({ ...prev, [s.nightNumber]: { ...prev[s.nightNumber], disabled: e.target.checked } }))}
                      />
                      <span>Skip / add later</span>
                    </label>
                  </div>
                  <label style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', marginTop: '0.3rem', fontSize: '0.76rem' }}>
                    <span style={{ color: 'var(--ds-color-muted, #475569)' }}>Overnight city</span>
                    <input
                      type="text"
                      className="app-input"
                      value={s.city}
                      aria-label={`Overnight city for night ${s.nightNumber}`}
                      onChange={(e) => setHotelOverrides((prev) => ({ ...prev, [s.nightNumber]: { ...prev[s.nightNumber], city: e.target.value } }))}
                      style={{ flex: 1, minWidth: 0 }}
                    />
                  </label>
                  {s.ambiguous ? (
                    <p style={{ margin: '0.25rem 0 0', fontSize: '0.72rem', color: '#b45309' }}>
                      ⚠️ Overnight city is uncertain — please confirm.{s.ambiguityReason === 'no-destination-city' ? ' No destination city was derived from the route.' : ''}
                    </p>
                  ) : null}
                  {s.disabled ? (
                    <p style={{ margin: '0.25rem 0 0', fontSize: '0.74rem', color: 'var(--ds-color-muted, #475569)' }}>No hotel will be suggested for this night.</p>
                  ) : s.hotelName ? (
                    <p style={{ margin: '0.25rem 0 0', fontSize: '0.76rem' }}>
                      <strong>{s.hotelName}</strong>
                      {s.roomName ? ` · ${s.roomName}` : ''}
                      {s.mealPlan ? ` · ${s.mealPlan}` : ''}
                      {typeof s.rateCost === 'number' ? ` · ${(s.rateCurrency || '').trim()} ${s.rateCost.toFixed(2)}`.replace(/\s+/g, ' ') : ''}
                    </p>
                  ) : (
                    <p style={{ margin: '0.25rem 0 0', fontSize: '0.74rem', color: '#b45309' }}>
                      No suitable hotel found
                      {s.missingReason === 'no-hotel-in-city'
                        ? ' — no hotel in this city (add one in Hotels).'
                        : s.missingReason === 'no-valid-contract'
                          ? ' — hotel exists but no valid contract (add one in Hotel Contracts).'
                          : s.missingReason === 'no-rate'
                            ? ' — contract exists but no rates (add rates).'
                            : s.city
                              ? '.'
                              : ' — choose an overnight city above.'}
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : null}

          {/* Phase 3D.1C — non-destructive apply */}
          <div style={{ marginTop: '0.4rem', borderTop: '1px solid #e2e8f0', paddingTop: '0.6rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {applyPlan && existingDayCount > 0 ? (
              <p className="form-error" role="status">⚠️ This quote already has {existingDayCount} itinerary day(s){existingPoiAssignmentCount > 0 ? ` and ${existingPoiAssignmentCount} POI assignment(s)` : ''}. Generate into a quote with no itinerary days (replace mode is a later phase).</p>
            ) : null}

            {applyPlan && applyPlan.warnings.length > 0 ? (
              <div style={{ background: 'var(--ds-color-warn-bg, #FFF6D6)', border: '1px solid #E6C96B', borderRadius: 6, padding: '0.5rem 0.6rem' }}>
                <strong style={{ fontSize: '0.78rem' }}>Please confirm before applying:</strong>
                <ul style={{ margin: '0.3rem 0 0', paddingInlineStart: '1.1rem', fontSize: '0.76rem' }}>
                  {applyPlan.warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
                <label style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', marginTop: '0.4rem', fontSize: '0.78rem' }}>
                  <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} />
                  <span>I have reviewed these warnings.</span>
                </label>
              </div>
            ) : null}

            {applyError ? <p className="form-error">{applyError}</p> : null}
            {applySuccess ? <p style={{ color: '#15803d', fontSize: '0.8rem', margin: 0 }}>{applySuccess}</p> : null}

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <button type="button" className="primary-button" disabled={!canSubmit} onClick={() => void applyGenerated()}>
                {applying ? 'Generating…' : 'Apply to quote'}
              </button>
              <span style={{ fontSize: '0.74rem', color: 'var(--ds-color-muted, #475569)' }}>
                Creates days + one transport package + POI assignments. Never deletes or overwrites existing days/items.
              </span>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
