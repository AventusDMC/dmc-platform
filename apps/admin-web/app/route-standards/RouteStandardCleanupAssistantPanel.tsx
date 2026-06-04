'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

// Route Standards Auto-Cleanup Assistant v1.
//
// Surfaces every Route Standard tagged with its classification, points
// out non-movement rows (activities, touring programs, round-trips,
// multi-stops) that shouldn't live in the Route Standards table, and
// offers safe bulk actions:
//   1. Deactivate non-route rows (soft only — sets isActive=false)
//   2. Apply high-confidence timing suggestions to movement legs that
//      are missing distance/duration
//   3. Export the full classification as an .xlsx report
//
// Safety guards (mirrored on the backend):
//   - VERIFIED and source=MANUAL rows are never auto-changed
//   - UNKNOWN_REVIEW + MOVEMENT_LEG are skipped by bulk-deactivate
//   - Rows with existing timing are skipped by bulk-apply-timing
//   - Soft delete only — operator can reactivate; audit + legacy
//     routeCode preserved

type Classification = 'MOVEMENT_LEG' | 'TOURING_PROGRAM' | 'ACTIVITY_EXPERIENCE' | 'ROUND_TRIP_PROGRAM' | 'MULTI_STOP_FLOW' | 'UNKNOWN_REVIEW';
type RecommendedAction = 'KEEP_AS_ROUTE_STANDARD' | 'DEACTIVATE_FROM_ROUTE_STANDARDS' | 'CONVERT_TO_TOURING_ROUTE' | 'CONVERT_TO_ACTIVITY' | 'CONVERT_TO_EXCURSION_TEMPLATE' | 'NEEDS_HUMAN_REVIEW';

type TimingSuggestion = {
  distanceKm: number | null;
  durationHours: number | null;
  bufferMinutes: number | null;
  flags: {
    longDistanceFlag: boolean;
    overnightRisk: boolean;
    mountainRoadFlag: boolean;
    borderCrossingFlag: boolean;
    airportRouteFlag: boolean;
  };
  source: 'jordan_backbone' | 'reverse_route' | 'none';
  confidence: 'high' | 'reverse_inherited' | 'estimated' | 'needs_review';
  reason: string;
};

type ClassifiedRow = {
  id: string;
  routeCode: string;
  canonicalRouteCode: string | null;
  routeName: string;
  fromCity: string | null;
  toCity: string | null;
  standardDistanceKm: number | null;
  standardDurationHours: number | null;
  operationalBufferMinutes: number | null;
  isActive: boolean;
  reviewStatus: string | null;
  source: string | null;
  suspicious: boolean;
  suspiciousReason: string | null;
  isProtected: boolean;
  hasTiming: boolean;
  classification: Classification;
  recommendedAction: RecommendedAction;
  classificationReason: string;
  classificationConfidence: 'high' | 'medium' | 'low';
  timingSuggestion: TimingSuggestion | null;
};

type ClassificationResponse = {
  rows: ClassifiedRow[];
  counters: {
    total: number;
    active: number;
    movementLegs: number;
    touringPrograms: number;
    activities: number;
    roundTripPrograms: number;
    multiStopFlows: number;
    unknownReview: number;
    suspiciousMovement: number;
    movementMissingTiming: number;
    timingSuggestionsHighConfidence: number;
    timingSuggestionsReverse: number;
  };
};

type FilterMode =
  | 'all'
  | 'non_movement'
  | 'activity'
  | 'touring'
  | 'round_trip'
  | 'multi_stop'
  | 'unknown'
  | 'suspicious'
  | 'movement_missing_timing';

const FILTER_OPTIONS: Array<{ value: FilterMode; label: string }> = [
  { value: 'all', label: 'All rows' },
  { value: 'non_movement', label: 'Non-route rows (activities, tours, round-trips, multi-stops)' },
  { value: 'activity', label: 'Activities only' },
  { value: 'touring', label: 'Touring programs only' },
  { value: 'round_trip', label: 'Round-trip programs only' },
  { value: 'multi_stop', label: 'Multi-stop flows only' },
  { value: 'unknown', label: 'Unknown — needs review' },
  { value: 'suspicious', label: 'Suspicious movement durations' },
  { value: 'movement_missing_timing', label: 'Movement legs missing timing' },
];

const CLASSIFICATION_LABELS: Record<Classification, string> = {
  MOVEMENT_LEG: 'Movement leg',
  TOURING_PROGRAM: 'Touring program',
  ACTIVITY_EXPERIENCE: 'Activity / experience',
  ROUND_TRIP_PROGRAM: 'Round-trip program',
  MULTI_STOP_FLOW: 'Multi-stop flow',
  UNKNOWN_REVIEW: 'Unknown',
};

const CLASSIFICATION_COLORS: Record<Classification, { bg: string; text: string; border: string }> = {
  MOVEMENT_LEG: { bg: '#ecfdf3', text: '#067647', border: '#abefc6' },
  TOURING_PROGRAM: { bg: '#fef3c7', text: '#7c2d12', border: '#fcd34d' },
  ACTIVITY_EXPERIENCE: { bg: '#ede9fe', text: '#5b21b6', border: '#c4b5fd' },
  ROUND_TRIP_PROGRAM: { bg: '#fff7ed', text: '#7c2d12', border: '#fed7aa' },
  MULTI_STOP_FLOW: { bg: '#e0e7ff', text: '#3730a3', border: '#a5b4fc' },
  UNKNOWN_REVIEW: { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1' },
};

const RECOMMENDED_ACTION_LABELS: Record<RecommendedAction, string> = {
  KEEP_AS_ROUTE_STANDARD: 'Keep as Route Standard',
  DEACTIVATE_FROM_ROUTE_STANDARDS: 'Deactivate',
  CONVERT_TO_TOURING_ROUTE: 'Convert to Touring Route',
  CONVERT_TO_ACTIVITY: 'Convert to Activity',
  CONVERT_TO_EXCURSION_TEMPLATE: 'Convert to Excursion Template',
  NEEDS_HUMAN_REVIEW: 'Needs human review',
};

export function RouteStandardCleanupAssistantPanel() {
  const router = useRouter();
  const [data, setData] = useState<ClassificationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<FilterMode>('non_movement');
  const [resultBanner, setResultBanner] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/route-standards/cleanup/classification', { cache: 'no-store' });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message || `Classification failed (${response.status})`);
      setData(payload as ClassificationResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load cleanup classification');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const filteredRows = useMemo(() => {
    if (!data) return [] as ClassifiedRow[];
    return data.rows.filter((r) => {
      switch (filter) {
        case 'all':
          return true;
        case 'non_movement':
          return (
            r.classification === 'TOURING_PROGRAM' ||
            r.classification === 'ACTIVITY_EXPERIENCE' ||
            r.classification === 'ROUND_TRIP_PROGRAM' ||
            r.classification === 'MULTI_STOP_FLOW'
          );
        case 'activity':
          return r.classification === 'ACTIVITY_EXPERIENCE';
        case 'touring':
          return r.classification === 'TOURING_PROGRAM';
        case 'round_trip':
          return r.classification === 'ROUND_TRIP_PROGRAM';
        case 'multi_stop':
          return r.classification === 'MULTI_STOP_FLOW';
        case 'unknown':
          return r.classification === 'UNKNOWN_REVIEW';
        case 'suspicious':
          return r.suspicious;
        case 'movement_missing_timing':
          return r.classification === 'MOVEMENT_LEG' && r.isActive && !r.hasTiming;
        default:
          return true;
      }
    });
  }, [data, filter]);

  async function bulkDeactivate() {
    if (!data) return;
    const candidates = data.rows.filter(
      (r) =>
        r.isActive &&
        !r.isProtected &&
        (r.classification === 'TOURING_PROGRAM' ||
          r.classification === 'ACTIVITY_EXPERIENCE' ||
          r.classification === 'ROUND_TRIP_PROGRAM' ||
          r.classification === 'MULTI_STOP_FLOW'),
    );
    if (candidates.length === 0) {
      setResultBanner('No clearly non-route rows to deactivate.');
      return;
    }
    if (
      !confirm(
        `Deactivate ${candidates.length} non-route row${candidates.length === 1 ? '' : 's'} from Route Standards? ` +
          `Soft delete only — rows stay queryable + can be reactivated. VERIFIED and MANUAL rows are skipped.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    setResultBanner(null);
    try {
      const response = await fetch('/api/route-standards/cleanup/deactivate-non-route', { method: 'POST' });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message || `Deactivate failed (${response.status})`);
      setResultBanner(
        `Deactivated ${payload.deactivatedCount} non-route row${payload.deactivatedCount === 1 ? '' : 's'}` +
          (payload.skippedProtectedCount > 0
            ? `; ${payload.skippedProtectedCount} VERIFIED/MANUAL row${payload.skippedProtectedCount === 1 ? '' : 's'} skipped.`
            : '.'),
      );
      await refresh();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bulk deactivate failed');
    } finally {
      setBusy(false);
    }
  }

  async function bulkApplyTiming() {
    if (!data) return;
    const candidates = data.rows.filter(
      (r) =>
        r.classification === 'MOVEMENT_LEG' &&
        !r.isProtected &&
        !r.hasTiming &&
        r.timingSuggestion &&
        (r.timingSuggestion.confidence === 'high' || r.timingSuggestion.confidence === 'reverse_inherited'),
    );
    if (candidates.length === 0) {
      setResultBanner('No high-confidence timing suggestions to apply.');
      return;
    }
    if (
      !confirm(
        `Apply timing to ${candidates.length} movement leg${candidates.length === 1 ? '' : 's'}? ` +
          `Only fills missing distance/duration/buffer + risk flags. Rows with existing timing or VERIFIED/MANUAL are skipped.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    setResultBanner(null);
    try {
      const response = await fetch('/api/route-standards/cleanup/apply-timing-bulk', { method: 'POST' });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message || `Apply timing failed (${response.status})`);
      setResultBanner(
        `Applied timing to ${payload.appliedCount} movement leg${payload.appliedCount === 1 ? '' : 's'} from the Jordan operational backbone + reverse-route inheritance.`,
      );
      await refresh();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bulk apply timing failed');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <section
        style={{
          background: '#f7f9fb',
          border: '1px solid #d8e0eb',
          borderRadius: 10,
          padding: '0.85rem 1rem',
          marginBottom: '1rem',
        }}
      >
        <p style={{ color: 'var(--ds-color-text-muted, #475569)', fontSize: '0.85rem', margin: 0 }}>Loading cleanup classification…</p>
      </section>
    );
  }

  if (!data) {
    return (
      <section
        style={{
          background: '#fef2f2',
          border: '1px solid #fca5a5',
          borderRadius: 10,
          padding: '0.85rem 1rem',
          marginBottom: '1rem',
        }}
      >
        <p className="form-error" style={{ margin: 0 }}>{error || 'No classification data available.'}</p>
      </section>
    );
  }

  return (
    <section
      style={{
        background: '#f7f9fb',
        border: '1px solid #d8e0eb',
        borderRadius: 10,
        padding: '1rem',
        marginBottom: '1rem',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 280 }}>
          <p
            style={{
              color: 'var(--ds-color-text-muted, #475569)',
              fontSize: '0.72rem',
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              margin: 0,
            }}
          >
            Route Standards Cleanup Assistant
          </p>
          <p style={{ margin: '0.2rem 0 0', color: 'var(--ds-color-text-muted, #475569)', fontSize: '0.85rem' }}>
            Classifies every Route Standard into one of six buckets so you can deactivate
            non-route rows safely and fill timing on real movement legs from the Jordan
            operational backbone + reverse-route inheritance. VERIFIED and MANUAL rows are
            never auto-changed; deletes are soft and reversible.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          <a
            href="/api/route-standards/cleanup/report"
            className="secondary-button"
            style={{ fontSize: '0.85rem', textDecoration: 'none' }}
          >
            Export .xlsx report
          </a>
        </div>
      </div>

      {/* Counter strip */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '0.5rem',
          marginTop: '0.75rem',
        }}
      >
        <Counter label="Movement legs" value={data.counters.movementLegs} tone="good" />
        <Counter label="Touring programs" value={data.counters.touringPrograms} tone="warn" />
        <Counter label="Activities" value={data.counters.activities} tone="warn" />
        <Counter label="Round-trip programs" value={data.counters.roundTripPrograms} tone="warn" />
        <Counter label="Multi-stop flows" value={data.counters.multiStopFlows} tone="warn" />
        <Counter label="Unknown — review" value={data.counters.unknownReview} tone="info" />
        <Counter label="Suspicious durations" value={data.counters.suspiciousMovement} tone="warn" />
        <Counter label="Movement missing timing" value={data.counters.movementMissingTiming} tone="info" />
      </div>

      {/* Bulk actions */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.75rem', alignItems: 'center' }}>
        <button
          type="button"
          className="primary-button"
          onClick={bulkDeactivate}
          disabled={busy}
          title="Deactivate touring programs, activities, round-trip programs, and multi-stop flows. VERIFIED and MANUAL skipped."
        >
          Deactivate all clearly non-route rows
        </button>
        <button
          type="button"
          className="secondary-button"
          onClick={bulkApplyTiming}
          disabled={busy}
          title="Fill distance/duration/buffer on movement legs missing timing. Only applies high-confidence (Jordan backbone) and reverse-route inherited suggestions."
        >
          Apply high-confidence timing suggestions
          {data.counters.timingSuggestionsHighConfidence + data.counters.timingSuggestionsReverse > 0
            ? ` (${data.counters.timingSuggestionsHighConfidence + data.counters.timingSuggestionsReverse})`
            : ''}
        </button>
      </div>

      {resultBanner ? (
        <p
          style={{
            margin: '0.5rem 0 0',
            background: 'var(--ds-color-success-surface, #ECFDF3)',
            color: 'var(--ds-color-success, #067647)',
            border: '1px solid var(--ds-color-success-border, #ABEFC6)',
            borderRadius: 6,
            padding: '0.5rem 0.7rem',
            fontSize: '0.85rem',
          }}
        >
          {resultBanner}
        </p>
      ) : null}
      {error ? <p className="form-error" style={{ marginTop: '0.5rem' }}>{error}</p> : null}

      {/* Filter + table */}
      <div style={{ marginTop: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <label style={{ fontSize: '0.78rem', color: 'var(--ds-color-text-muted, #475569)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          Filter:
          <select value={filter} onChange={(e) => setFilter(e.target.value as FilterMode)}>
            {FILTER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
        <span style={{ color: 'var(--ds-color-text-subtle, #667085)', fontSize: '0.78rem' }}>
          {filteredRows.length} of {data.counters.total} rows shown
        </span>
      </div>

      <div style={{ overflowX: 'auto', marginTop: '0.5rem' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
          <thead>
            <tr style={{ background: 'var(--ds-color-surface-soft, #F9FAFB)', textAlign: 'left' }}>
              <th style={{ padding: '0.4rem 0.5rem', borderBottom: '1px solid #e4e7ec' }}>Code</th>
              <th style={{ padding: '0.4rem 0.5rem', borderBottom: '1px solid #e4e7ec' }}>Name</th>
              <th style={{ padding: '0.4rem 0.5rem', borderBottom: '1px solid #e4e7ec' }}>Classification</th>
              <th style={{ padding: '0.4rem 0.5rem', borderBottom: '1px solid #e4e7ec' }}>Reason</th>
              <th style={{ padding: '0.4rem 0.5rem', borderBottom: '1px solid #e4e7ec' }}>Recommended</th>
              <th style={{ padding: '0.4rem 0.5rem', borderBottom: '1px solid #e4e7ec' }}>Timing suggestion</th>
              <th style={{ padding: '0.4rem 0.5rem', borderBottom: '1px solid #e4e7ec' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row) => (
              <CleanupRow key={row.id} row={row} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CleanupRow({ row }: { row: ClassifiedRow }) {
  const colors = CLASSIFICATION_COLORS[row.classification];
  return (
    <tr style={{ borderBottom: '1px solid #f2f4f7', background: row.isActive ? 'transparent' : '#fafafa' }}>
      <td style={{ padding: '0.4rem 0.5rem', fontFamily: 'monospace', fontSize: '0.78rem' }}>
        <strong>{row.routeCode}</strong>
        {row.canonicalRouteCode && row.canonicalRouteCode !== row.routeCode ? (
          <span style={{ marginLeft: '0.35rem', color: '#7a5c2e' }}>→ {row.canonicalRouteCode}</span>
        ) : null}
      </td>
      <td style={{ padding: '0.4rem 0.5rem' }}>{row.routeName}</td>
      <td style={{ padding: '0.4rem 0.5rem' }}>
        <span
          style={{
            background: colors.bg,
            color: colors.text,
            border: `1px solid ${colors.border}`,
            padding: '0.05rem 0.45rem',
            borderRadius: 999,
            fontSize: '0.7rem',
            fontWeight: 600,
            whiteSpace: 'nowrap',
          }}
        >
          {CLASSIFICATION_LABELS[row.classification]}
        </span>
      </td>
      <td style={{ padding: '0.4rem 0.5rem', color: 'var(--ds-color-text-muted, #475569)', fontSize: '0.78rem' }}>
        {row.classificationReason}
        {row.suspicious ? (
          <div style={{ color: '#7c2d12', fontSize: '0.72rem', marginTop: '0.15rem' }}>⚠ {row.suspiciousReason}</div>
        ) : null}
      </td>
      <td style={{ padding: '0.4rem 0.5rem', color: 'var(--ds-color-text-muted, #475569)', fontSize: '0.78rem' }}>
        {RECOMMENDED_ACTION_LABELS[row.recommendedAction]}
      </td>
      <td style={{ padding: '0.4rem 0.5rem', fontSize: '0.78rem' }}>
        {row.timingSuggestion ? <TimingSuggestionCell suggestion={row.timingSuggestion} /> : (
          <span style={{ color: 'var(--ds-color-text-faint, #94A3B8)' }}>—</span>
        )}
      </td>
      <td style={{ padding: '0.4rem 0.5rem', fontSize: '0.72rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
          <span style={{ color: row.isActive ? 'var(--ds-color-success, #067647)' : 'var(--ds-color-text-faint, #94A3B8)' }}>
            {row.isActive ? 'Active' : 'Inactive'}
          </span>
          {row.reviewStatus ? <span style={{ color: 'var(--ds-color-text-muted, #475569)' }}>{row.reviewStatus}</span> : null}
          {row.source === 'MANUAL' ? <span style={{ color: '#7a5c2e' }}>MANUAL</span> : null}
          {row.isProtected ? <span style={{ color: 'var(--ds-color-success, #067647)' }}>Protected</span> : null}
        </div>
      </td>
    </tr>
  );
}

function TimingSuggestionCell({ suggestion }: { suggestion: TimingSuggestion }) {
  const parts: string[] = [];
  if (suggestion.distanceKm != null) parts.push(`${suggestion.distanceKm} km`);
  if (suggestion.durationHours != null) parts.push(`${suggestion.durationHours} h`);
  if (suggestion.bufferMinutes != null) parts.push(`+${suggestion.bufferMinutes} min`);
  const confidenceColors = {
    high: { bg: '#ecfdf3', text: '#067647', border: '#abefc6', label: 'High' },
    reverse_inherited: { bg: '#f0f9ff', text: '#0c4a6e', border: '#bae6fd', label: 'Reverse-inherited' },
    estimated: { bg: '#fef3c7', text: '#7c2d12', border: '#fcd34d', label: 'Estimated' },
    needs_review: { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1', label: 'Needs review' },
  }[suggestion.confidence];
  return (
    <div>
      <span style={{ color: 'var(--ds-color-text, #0F172A)' }}>{parts.length > 0 ? parts.join(' · ') : '—'}</span>
      {(suggestion.flags.mountainRoadFlag || suggestion.flags.borderCrossingFlag || suggestion.flags.airportRouteFlag || suggestion.flags.longDistanceFlag) ? (
        <div style={{ display: 'flex', gap: '0.2rem', flexWrap: 'wrap', marginTop: '0.15rem' }}>
          {suggestion.flags.mountainRoadFlag ? <Chip>Mountain</Chip> : null}
          {suggestion.flags.borderCrossingFlag ? <Chip>Border</Chip> : null}
          {suggestion.flags.airportRouteFlag ? <Chip>Airport</Chip> : null}
          {suggestion.flags.longDistanceFlag ? <Chip>Long</Chip> : null}
        </div>
      ) : null}
      <div
        style={{
          display: 'inline-block',
          marginTop: '0.15rem',
          background: confidenceColors.bg,
          color: confidenceColors.text,
          border: `1px solid ${confidenceColors.border}`,
          padding: '0.02rem 0.4rem',
          borderRadius: 999,
          fontSize: '0.65rem',
          fontWeight: 600,
        }}
      >
        {confidenceColors.label}
      </div>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        background: '#fefce8',
        color: '#854d0e',
        border: '1px solid #fde68a',
        padding: '0.02rem 0.35rem',
        borderRadius: 999,
        fontSize: '0.62rem',
        fontWeight: 600,
      }}
    >
      {children}
    </span>
  );
}

function Counter({ label, value, tone }: { label: string; value: number; tone: 'good' | 'warn' | 'info' }) {
  const colors = {
    good: { bg: '#ecfdf3', text: '#067647', border: '#abefc6' },
    warn: { bg: '#fef3c7', text: '#7c2d12', border: '#fcd34d' },
    info: { bg: '#f0f9ff', text: '#0c4a6e', border: '#bae6fd' },
  }[tone];
  const highlight = value > 0;
  return (
    <div
      style={{
        background: highlight ? colors.bg : '#fafdff',
        border: highlight ? `1px solid ${colors.border}` : '1px solid #eef2f6',
        borderRadius: 8,
        padding: '0.45rem 0.6rem',
      }}
    >
      <p
        style={{
          margin: 0,
          color: highlight ? colors.text : 'var(--ds-color-text-faint, #94A3B8)',
          fontSize: '0.65rem',
          textTransform: 'uppercase',
          fontWeight: 700,
          letterSpacing: '0.05em',
        }}
      >
        {label}
      </p>
      <p
        style={{
          margin: '0.1rem 0 0',
          fontSize: '1.25rem',
          fontWeight: 700,
          color: highlight ? colors.text : 'var(--ds-color-text-faint, #94A3B8)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </p>
    </div>
  );
}
