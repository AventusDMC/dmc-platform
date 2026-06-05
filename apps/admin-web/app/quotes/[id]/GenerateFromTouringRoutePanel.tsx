'use client';

// Phase 3D.1B — "Generate from Touring Route" PREVIEW panel.
//
// PREVIEW ONLY. This component never creates, updates, or deletes anything.
// The ONLY network call is a read: GET /touring-routes/:id. There is no Apply/
// Save button and no call to POST /quotes/{id}/itinerary/day, POST /quotes/{id}/
// items, or PUT /itinerary/day/:dayId/pois — those arrive in Phase 3D.1C.
// Operator edits (move / reorder / drop POIs) mutate LOCAL React state only.

import { useMemo, useState } from 'react';
import { buildAuthHeaders } from '../../lib/auth-client';
import { formatRouteLabel, type RouteOption } from '../../lib/routes';
import {
  buildTouringRoutePreview,
  formatTouringRoutePricingLabel,
  movePreviewPoi,
  removePreviewPoi,
  reorderPreviewPoi,
  type TouringRouteDetailForGen,
  type TouringRoutePreview,
  type TouringRoutePricingRow,
} from './QuoteAutoItineraryBuilder.logic';

type Props = {
  apiBaseUrl: string;
  routes: RouteOption[];
  defaultPax?: number;
  defaultStartDate?: string | null;
};

function isTouringRoute(route: RouteOption): boolean {
  return route.canonicalRouteType === 'TOURING_ROUTE';
}

export default function GenerateFromTouringRoutePanel({ apiBaseUrl, routes, defaultPax, defaultStartDate }: Props) {
  const touringRoutes = useMemo(() => (routes || []).filter(isTouringRoute), [routes]);

  const [selectedRouteId, setSelectedRouteId] = useState('');
  const [routeDetail, setRouteDetail] = useState<TouringRouteDetailForGen | null>(null);
  const [pricingRows, setPricingRows] = useState<TouringRoutePricingRow[]>([]);
  const [pricingRowId, setPricingRowId] = useState('');
  const [startDate, setStartDate] = useState<string>(defaultStartDate || '');
  const [pax, setPax] = useState<number>(defaultPax && defaultPax > 0 ? defaultPax : 2);
  const [preview, setPreview] = useState<TouringRoutePreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function loadRoute(routeId: string) {
    setSelectedRouteId(routeId);
    setPreview(null);
    setRouteDetail(null);
    setError('');
    if (!routeId) return;
    setLoading(true);
    try {
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
          <select className="app-input" value={selectedRouteId} onChange={(e) => void loadRoute(e.target.value)} aria-label="Touring route">
            <option value="">Select a touring route…</option>
            {touringRoutes.map((route) => (
              <option key={route.id} value={route.id}>{formatRouteLabel(route)}</option>
            ))}
          </select>
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
                ? ` · ${preview.transport.currency} ${preview.transport.cost.toFixed(2)} × ${preview.transport.dayCount} day(s)`
                : null}
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

          <p style={{ margin: 0, fontSize: '0.74rem', color: 'var(--ds-color-muted, #475569)' }}>
            Preview only — no Apply yet. Saving the generated itinerary arrives in a later step.
          </p>
        </div>
      ) : null}
    </section>
  );
}
