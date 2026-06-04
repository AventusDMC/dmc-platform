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
  canonicalRouteCode?: string | null;
  reviewStatus?: string | null;
  suspiciousDurationFlag?: boolean;
};

const REVIEW_STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Unreviewed' },
  { value: 'AUTO_BOOTSTRAP', label: 'Auto bootstrap (untouched)' },
  { value: 'REVIEW_REQUIRED', label: 'Review required' },
  { value: 'VERIFIED', label: 'Verified (operator signoff)' },
  { value: 'CANONICALIZED', label: 'Canonicalized' },
];

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
    // Cleanup Phase v1 — operator can override the canonical code (rare,
    // but useful when the FROM_TO derivation gets it wrong for a custom
    // route) and explicitly promote to VERIFIED after refining the numbers.
    canonicalRouteCode: standard.canonicalRouteCode || '',
    reviewStatus: standard.reviewStatus || '',
    suspiciousDurationFlag: Boolean(standard.suspiciousDurationFlag),
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
          canonicalRouteCode: state.canonicalRouteCode || null,
          reviewStatus: state.reviewStatus || null,
          suspiciousDurationFlag: state.suspiciousDurationFlag,
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

  // Defensive card layout — no <label> at all. Globals.css contains many
  // rules targeting `label { display: grid }` inside various form shells
  // (.entity-form label, .app-form-section label, etc.) and at least one
  // of them was leaking through to break our flag cards (tall empty
  // columns with no visible text). By using a plain <div> with an
  // onClick toggle, we sidestep the entire label cascade. The checkbox
  // input still receives clicks directly; clicking the text area also
  // toggles via the wrapper's onClick.
  const toggleFlag = (key: keyof typeof state) => () => {
    setState((s) => ({ ...s, [key]: !s[key] } as typeof s));
  };
  const flagRow = (key: keyof typeof state, label: string, helper: string) => (
    <div
      onClick={toggleFlag(key)}
      role="checkbox"
      aria-checked={Boolean(state[key])}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          toggleFlag(key)();
        }
      }}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '0.5rem',
        padding: '0.6rem 0.7rem',
        border: '1px solid var(--ds-color-border-subtle, #E4E7EC)',
        borderRadius: 8,
        background: '#fff',
        cursor: 'pointer',
        userSelect: 'none',
      }}
    >
      <input
        type="checkbox"
        checked={Boolean(state[key])}
        onChange={(e) => setState((s) => ({ ...s, [key]: e.target.checked }))}
        onClick={(e) => e.stopPropagation()}
        style={{ width: 18, height: 18, marginTop: '0.15rem', flexShrink: 0 }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--ds-color-text, #0F172A)', lineHeight: 1.3 }}>
          {label}
        </div>
        <div style={{ fontSize: '0.78rem', color: 'var(--ds-color-text-subtle, #667085)', lineHeight: 1.35, marginTop: '0.15rem' }}>
          {helper}
        </div>
      </div>
    </div>
  );

  return (
    <form onSubmit={save} style={{ display: 'grid', gap: '1rem' }}>
      <section style={{ background: '#fff', border: '1px solid var(--ds-color-border-subtle, #E4E7EC)', borderRadius: 10, padding: '1rem' }}>
        <h3 style={{ marginTop: 0 }}>Identity</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--ds-color-text-muted, #475569)' }}>Route code *</span>
            <input
              required
              value={state.routeCode}
              onChange={(e) => setState((s) => ({ ...s, routeCode: e.target.value }))}
              style={{ fontFamily: 'monospace' }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--ds-color-text-muted, #475569)' }}>Route name *</span>
            <input required value={state.routeName} onChange={(e) => setState((s) => ({ ...s, routeName: e.target.value }))} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--ds-color-text-muted, #475569)' }}>From city</span>
            <input value={state.fromCity} onChange={(e) => setState((s) => ({ ...s, fromCity: e.target.value }))} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--ds-color-text-muted, #475569)' }}>To city</span>
            <input value={state.toCity} onChange={(e) => setState((s) => ({ ...s, toCity: e.target.value }))} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--ds-color-text-muted, #475569)' }}>Destination area (if not a single city)</span>
            <input
              value={state.destinationArea}
              onChange={(e) => setState((s) => ({ ...s, destinationArea: e.target.value }))}
              placeholder="e.g., Dead Sea Resorts"
            />
          </label>
        </div>
      </section>

      <section style={{ background: '#fff', border: '1px solid var(--ds-color-border-subtle, #E4E7EC)', borderRadius: 10, padding: '1rem' }}>
        <h3 style={{ marginTop: 0 }}>Standard timing</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--ds-color-text-muted, #475569)' }}>Distance (km)</span>
            <input
              type="number"
              step="0.1"
              value={state.standardDistanceKm}
              onChange={(e) => setState((s) => ({ ...s, standardDistanceKm: e.target.value }))}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--ds-color-text-muted, #475569)' }}>Duration (hours)</span>
            <input
              type="number"
              step="0.1"
              value={state.standardDurationHours}
              onChange={(e) => setState((s) => ({ ...s, standardDurationHours: e.target.value }))}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--ds-color-text-muted, #475569)' }}>Operational buffer (min)</span>
            <input
              type="number"
              step="5"
              value={state.operationalBufferMinutes}
              onChange={(e) => setState((s) => ({ ...s, operationalBufferMinutes: e.target.value }))}
            />
          </label>
        </div>
      </section>

      <section style={{ background: '#fff', border: '1px solid var(--ds-color-border-subtle, #E4E7EC)', borderRadius: 10, padding: '1rem' }}>
        <h3 style={{ marginTop: 0 }}>Risk flags</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.5rem' }}>
          {flagRow('longDistanceFlag', 'Long distance', 'Triggers "Long Distance Drive" confidence label')}
          {flagRow('overnightRisk', 'Overnight risk', 'Day might roll over if departure pushed late')}
          {flagRow('mountainRoadFlag', 'Mountain road', 'Weather-sensitive, slower in winter')}
          {flagRow('borderCrossingFlag', 'Border crossing', '1-3 hour unpredictable border wait')}
          {flagRow('airportRouteFlag', 'Airport route', 'Peak-hour traffic risk')}
        </div>
        <p style={{ marginTop: '0.75rem', color: 'var(--ds-color-text-muted, #475569)', fontSize: '0.85rem' }}>
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

      <section style={{ background: '#fff', border: '1px solid var(--ds-color-border-subtle, #E4E7EC)', borderRadius: 10, padding: '1rem' }}>
        <h3 style={{ marginTop: 0 }}>Canonical code &amp; review</h3>
        <p style={{ marginTop: 0, color: 'var(--ds-color-text-subtle, #667085)', fontSize: '0.85rem' }}>
          The original <code>routeCode</code> column above stays intact for legacy
          lookup compatibility. <code>canonicalRouteCode</code> is the short
          FROM_TO operational identifier ops moves to (AMM_PET, PET_WR, etc.).
          The bulk Apply action on the listing page sets these automatically;
          override here for special cases.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--ds-color-text-muted, #475569)' }}>Canonical route code</span>
            <input
              value={state.canonicalRouteCode}
              onChange={(e) => setState((s) => ({ ...s, canonicalRouteCode: e.target.value }))}
              placeholder="AMM_PET"
              style={{ fontFamily: 'monospace' }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--ds-color-text-muted, #475569)' }}>Review status</span>
            <select
              value={state.reviewStatus}
              onChange={(e) => setState((s) => ({ ...s, reviewStatus: e.target.value }))}
            >
              {REVIEW_STATUS_OPTIONS.map((opt) => (
                <option key={opt.value || 'unset'} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div
            onClick={() => setState((s) => ({ ...s, suspiciousDurationFlag: !s.suspiciousDurationFlag }))}
            role="checkbox"
            aria-checked={state.suspiciousDurationFlag}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault();
                setState((s) => ({ ...s, suspiciousDurationFlag: !s.suspiciousDurationFlag }));
              }
            }}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.5rem',
              padding: '0.6rem 0.7rem',
              border: '1px solid var(--ds-color-border-subtle, #E4E7EC)',
              borderRadius: 8,
              background: '#fff',
              cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            <input
              type="checkbox"
              checked={state.suspiciousDurationFlag}
              onChange={(e) => setState((s) => ({ ...s, suspiciousDurationFlag: e.target.checked }))}
              onClick={(e) => e.stopPropagation()}
              style={{ width: 18, height: 18, marginTop: '0.15rem', flexShrink: 0 }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--ds-color-text, #0F172A)', lineHeight: 1.3 }}>
                Suspicious duration
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--ds-color-text-subtle, #667085)', lineHeight: 1.35, marginTop: '0.15rem' }}>
                Duration looks like an excursion day length rather than realistic transfer time.
              </div>
            </div>
          </div>
        </div>
      </section>

      <section style={{ background: '#fff', border: '1px solid var(--ds-color-border-subtle, #E4E7EC)', borderRadius: 10, padding: '1rem' }}>
        <h3 style={{ marginTop: 0 }}>Notes &amp; status</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--ds-color-text-muted, #475569)' }}>Operational notes</span>
          <textarea
            rows={3}
            value={state.notes}
            onChange={(e) => setState((s) => ({ ...s, notes: e.target.value }))}
            placeholder="e.g., Construction zone between km 60-80. Restroom stop suggested at Mujib viewpoint."
          />
        </div>
        <div
          onClick={() => setState((s) => ({ ...s, isActive: !s.isActive }))}
          role="checkbox"
          aria-checked={state.isActive}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === ' ' || e.key === 'Enter') {
              e.preventDefault();
              setState((s) => ({ ...s, isActive: !s.isActive }));
            }
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            marginTop: '0.7rem',
            cursor: 'pointer',
            userSelect: 'none',
          }}
        >
          <input
            type="checkbox"
            checked={state.isActive}
            onChange={(e) => setState((s) => ({ ...s, isActive: e.target.checked }))}
            onClick={(e) => e.stopPropagation()}
            style={{ width: 18, height: 18, flexShrink: 0 }}
          />
          <span style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--ds-color-text, #0F172A)' }}>Active</span>
          <span style={{ fontSize: '0.78rem', color: 'var(--ds-color-text-subtle, #667085)' }}>(unchecked = retained for history but excluded from lookups)</span>
        </div>
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
