'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { computeTimingConfidenceLabel } from '../route-standard-display';

type RouteStandard = {
  id: string;
  routeCode: string;
  routeName: string;
  fromCity: string | null;
  toCity: string | null;
  destinationArea: string | null;
  standardDistanceKm: number | null;
  standardDurationHours: number | null;
  operationalBufferMinutes: number | null;
  longDistanceFlag: boolean;
  overnightRisk: boolean;
  mountainRoadFlag: boolean;
  borderCrossingFlag: boolean;
  airportRouteFlag: boolean;
  notes: string | null;
  isActive: boolean;
};

function asString(value: number | null): string {
  return value === null ? '' : String(value);
}

export function RouteStandardEditor({ standard }: { standard: RouteStandard }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Local form state mirroring the standard. Cast number inputs to string
  // so blank fields stay blank instead of "0".
  const [state, setState] = useState({
    routeCode: standard.routeCode,
    routeName: standard.routeName,
    fromCity: standard.fromCity || '',
    toCity: standard.toCity || '',
    destinationArea: standard.destinationArea || '',
    standardDistanceKm: asString(standard.standardDistanceKm),
    standardDurationHours: asString(standard.standardDurationHours),
    operationalBufferMinutes: asString(standard.operationalBufferMinutes),
    longDistanceFlag: standard.longDistanceFlag,
    overnightRisk: standard.overnightRisk,
    mountainRoadFlag: standard.mountainRoadFlag,
    borderCrossingFlag: standard.borderCrossingFlag,
    airportRouteFlag: standard.airportRouteFlag,
    notes: standard.notes || '',
    isActive: standard.isActive,
  });

  // overnightRisk is intentionally NOT a confidence-classifier input —
  // it's a separate operational flag surfaced as an INFO warning in the
  // backend intelligence layer rather than a Heavy/Border/Mountain
  // confidence band. The classifier in lib/route-standards.ts only reads
  // longDistance / mountain / border / airport + durationHours.
  const confidence = computeTimingConfidenceLabel({
    longDistanceFlag: state.longDistanceFlag,
    mountainRoadFlag: state.mountainRoadFlag,
    borderCrossingFlag: state.borderCrossingFlag,
    airportRouteFlag: state.airportRouteFlag,
    standardDurationHours: state.standardDurationHours ? Number(state.standardDurationHours) : null,
  });

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch(`/api/route-standards/${standard.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          routeCode: state.routeCode,
          routeName: state.routeName,
          fromCity: state.fromCity || null,
          toCity: state.toCity || null,
          destinationArea: state.destinationArea || null,
          standardDistanceKm: state.standardDistanceKm ? Number(state.standardDistanceKm) : null,
          standardDurationHours: state.standardDurationHours ? Number(state.standardDurationHours) : null,
          operationalBufferMinutes: state.operationalBufferMinutes ? Number(state.operationalBufferMinutes) : null,
          longDistanceFlag: state.longDistanceFlag,
          overnightRisk: state.overnightRisk,
          mountainRoadFlag: state.mountainRoadFlag,
          borderCrossingFlag: state.borderCrossingFlag,
          airportRouteFlag: state.airportRouteFlag,
          notes: state.notes || null,
          isActive: state.isActive,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message || `Save failed (${response.status})`);
      setSuccess('Saved');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  async function destroy() {
    if (!confirm(`Delete route standard ${standard.routeCode}? This cannot be undone.`)) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/route-standards/${standard.id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error(`Delete failed (${response.status})`);
      router.push('/route-standards?success=Route+standard+deleted');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
      setBusy(false);
    }
  }

  const flagRow = (key: keyof typeof state, label: string, helper: string) => (
    <label
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '0.5rem',
        padding: '0.5rem',
        border: '1px solid #e4e7ec',
        borderRadius: 8,
        background: '#fff',
      }}
    >
      <input
        type="checkbox"
        checked={Boolean(state[key])}
        onChange={(e) => setState((s) => ({ ...s, [key]: e.target.checked }))}
        style={{ marginTop: '0.2rem' }}
      />
      <span style={{ flex: 1 }}>
        <strong style={{ fontSize: '0.88rem', color: '#101828', display: 'block' }}>{label}</strong>
        <span style={{ fontSize: '0.78rem', color: '#667085' }}>{helper}</span>
      </span>
    </label>
  );

  return (
    <form onSubmit={save} style={{ display: 'grid', gap: '1rem' }}>
      <section style={{ background: '#fff', border: '1px solid #e4e7ec', borderRadius: 10, padding: '1rem' }}>
        <h3 style={{ marginTop: 0 }}>Identity</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#475467' }}>Route code *</span>
            <input
              required
              value={state.routeCode}
              onChange={(e) => setState((s) => ({ ...s, routeCode: e.target.value }))}
              style={{ fontFamily: 'monospace' }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#475467' }}>Route name *</span>
            <input required value={state.routeName} onChange={(e) => setState((s) => ({ ...s, routeName: e.target.value }))} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#475467' }}>From city</span>
            <input value={state.fromCity} onChange={(e) => setState((s) => ({ ...s, fromCity: e.target.value }))} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#475467' }}>To city</span>
            <input value={state.toCity} onChange={(e) => setState((s) => ({ ...s, toCity: e.target.value }))} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#475467' }}>Destination area (if not a single city)</span>
            <input
              value={state.destinationArea}
              onChange={(e) => setState((s) => ({ ...s, destinationArea: e.target.value }))}
              placeholder="e.g., Dead Sea Resorts"
            />
          </label>
        </div>
      </section>

      <section style={{ background: '#fff', border: '1px solid #e4e7ec', borderRadius: 10, padding: '1rem' }}>
        <h3 style={{ marginTop: 0 }}>Standard timing</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#475467' }}>Distance (km)</span>
            <input
              type="number"
              step="0.1"
              value={state.standardDistanceKm}
              onChange={(e) => setState((s) => ({ ...s, standardDistanceKm: e.target.value }))}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#475467' }}>Duration (hours)</span>
            <input
              type="number"
              step="0.1"
              value={state.standardDurationHours}
              onChange={(e) => setState((s) => ({ ...s, standardDurationHours: e.target.value }))}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#475467' }}>Operational buffer (min)</span>
            <input
              type="number"
              step="5"
              value={state.operationalBufferMinutes}
              onChange={(e) => setState((s) => ({ ...s, operationalBufferMinutes: e.target.value }))}
            />
          </label>
        </div>
      </section>

      <section style={{ background: '#fff', border: '1px solid #e4e7ec', borderRadius: 10, padding: '1rem' }}>
        <h3 style={{ marginTop: 0 }}>Risk flags</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.5rem' }}>
          {flagRow('longDistanceFlag', 'Long distance', 'Triggers "Long Distance Drive" confidence label')}
          {flagRow('overnightRisk', 'Overnight risk', 'Day might roll over if departure pushed late')}
          {flagRow('mountainRoadFlag', 'Mountain road', 'Weather-sensitive, slower in winter')}
          {flagRow('borderCrossingFlag', 'Border crossing', '1-3 hour unpredictable border wait')}
          {flagRow('airportRouteFlag', 'Airport route', 'Peak-hour traffic risk')}
        </div>
        <p style={{ marginTop: '0.75rem', color: '#475467', fontSize: '0.85rem' }}>
          Computed confidence:{' '}
          <span
            style={{
              background: confidence.bg,
              color: confidence.text,
              padding: '0.1rem 0.5rem',
              borderRadius: 999,
              fontSize: '0.78rem',
              fontWeight: 700,
            }}
          >
            {confidence.label}
          </span>
          <br />
          <span style={{ fontSize: '0.78rem' }}>{confidence.detail}</span>
        </p>
      </section>

      <section style={{ background: '#fff', border: '1px solid #e4e7ec', borderRadius: 10, padding: '1rem' }}>
        <h3 style={{ marginTop: 0 }}>Notes &amp; status</h3>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#475467' }}>Operational notes</span>
          <textarea
            rows={3}
            value={state.notes}
            onChange={(e) => setState((s) => ({ ...s, notes: e.target.value }))}
            placeholder="e.g., Construction zone between km 60-80. Restroom stop suggested at Mujib viewpoint."
          />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.6rem' }}>
          <input
            type="checkbox"
            checked={state.isActive}
            onChange={(e) => setState((s) => ({ ...s, isActive: e.target.checked }))}
          />
          <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>Active</span>
          <span style={{ fontSize: '0.78rem', color: '#667085' }}>(unchecked = retained for history but excluded from lookups)</span>
        </label>
      </section>

      {error ? <p className="form-error">{error}</p> : null}
      {success ? <p className="success-banner" style={{ padding: '0.5rem 0.75rem' }}>{success}</p> : null}

      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <button type="submit" className="primary-button" disabled={busy}>
          {busy ? 'Saving…' : 'Save changes'}
        </button>
        <button type="button" className="secondary-button" onClick={destroy} disabled={busy} style={{ color: '#a85454' }}>
          Delete
        </button>
      </div>
    </form>
  );
}
