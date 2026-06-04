// Phase 2B — small reusable chip that renders a route's timing confidence
// label + risk flag stack. Used on dispatch cards, the resource timeline,
// and conflict rows so the operator sees the same operational profile
// across every dispatch surface.

import { presentRouteTimingConfidence } from '../../lib/route-standards';

type RouteStandardSlice = {
  routeCode?: string | null;
  standardDistanceKm?: number | null;
  standardDurationHours?: number | null;
  operationalBufferMinutes?: number | null;
  longDistanceFlag?: boolean | null;
  overnightRisk?: boolean | null;
  mountainRoadFlag?: boolean | null;
  borderCrossingFlag?: boolean | null;
  airportRouteFlag?: boolean | null;
  notes?: string | null;
  // Optional pre-classified label from the backend. When omitted we
  // re-classify on the client so the chip stays self-contained.
  confidenceLabel?: string | null;
};

export function RouteConfidenceBadge({ standard, compact = false }: { standard: RouteStandardSlice | null | undefined; compact?: boolean }) {
  if (!standard) return null;
  const confidence = presentRouteTimingConfidence({
    longDistanceFlag: standard.longDistanceFlag ?? false,
    mountainRoadFlag: standard.mountainRoadFlag ?? false,
    borderCrossingFlag: standard.borderCrossingFlag ?? false,
    airportRouteFlag: standard.airportRouteFlag ?? false,
    standardDurationHours: standard.standardDurationHours ?? null,
  });

  const distance = standard.standardDistanceKm !== null && standard.standardDistanceKm !== undefined ? `${standard.standardDistanceKm} km` : null;
  const duration = standard.standardDurationHours !== null && standard.standardDurationHours !== undefined ? `${standard.standardDurationHours} h` : null;
  const buffer = standard.operationalBufferMinutes !== null && standard.operationalBufferMinutes !== undefined ? `+${standard.operationalBufferMinutes} min buffer` : null;
  const bits = compact ? [duration, buffer].filter(Boolean) : [distance, duration, buffer].filter(Boolean);

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.4rem',
        flexWrap: 'wrap',
        fontSize: compact ? '0.7rem' : '0.78rem',
      }}
      title={`${confidence.label} — ${confidence.detail}${standard.notes ? `\n${standard.notes}` : ''}`}
    >
      <span
        style={{
          background: confidence.bg,
          color: confidence.text,
          padding: '0.12rem 0.55rem',
          borderRadius: 999,
          fontSize: compact ? '0.66rem' : '0.7rem',
          fontWeight: 700,
          letterSpacing: '0.02em',
          whiteSpace: 'nowrap',
        }}
      >
        {confidence.label}
      </span>
      {bits.length > 0 ? <span style={{ color: 'var(--ds-color-text-muted, #475569)' }}>{bits.join(' · ')}</span> : null}
      {!compact && standard.notes ? <span style={{ color: '#6b7a6b' }}>· {standard.notes}</span> : null}
    </span>
  );
}
