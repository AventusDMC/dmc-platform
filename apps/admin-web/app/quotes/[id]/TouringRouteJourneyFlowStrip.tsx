'use client';

import { useEffect, useState } from 'react';

// Touring Legs Phase 2A — quote display integration.
//
// Renders a quiet "journey flow" strip directly under a touring-route
// service card on the quote workspace:
//   Amman City → Madaba → Mount Nebo → Petra Visitor Center
//   Drive: 4h · Buffer: +65m · 180 km
//   [Mountain Road] [Long Distance]   ⚠ 1 route leg missing timing standard
//
// Pricing is NEVER touched by this component — it consumes the read-only
// /touring-routes/:id/legs-summary endpoint and renders text/badges only.
//
// Returns null in three fallback cases:
//   1. No touringRouteId passed
//   2. Fetch failed
//   3. Summary has zero legs (touring route hasn't been segmented yet)
// This guarantees touring routes without legs render exactly as they did
// before — the operator sees the existing supplier line and nothing more.

type LegsSummary = {
  legCount: number;
  driveLegCount: number;
  missingRouteStandardCount: number;
  totalDriveDistanceKm: number;
  totalDriveDurationHours: number;
  totalBufferMinutes: number;
  totalEstimatedStopMinutes: number;
  totalOperationalDurationHours: number;
  riskFlags: {
    longDistanceFlag: boolean;
    overnightRisk: boolean;
    mountainRoadFlag: boolean;
    borderCrossingFlag: boolean;
    airportRouteFlag: boolean;
  };
  flow: string;
};

// Small in-memory cache keyed by touring route id. The quote workspace
// often renders the same touring route multiple times (each day a
// touring leg recurs), and we don't want to thrash the API. Cache is
// per-page-load; a soft refresh resets it.
const summaryCache = new Map<string, LegsSummary>();

export function TouringRouteJourneyFlowStrip({
  touringRouteId,
}: {
  touringRouteId: string | null | undefined;
}) {
  const [summary, setSummary] = useState<LegsSummary | null>(
    touringRouteId ? summaryCache.get(touringRouteId) ?? null : null,
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!touringRouteId) {
      setSummary(null);
      return;
    }
    const cached = summaryCache.get(touringRouteId);
    if (cached) {
      setSummary(cached);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const response = await fetch(`/api/touring-routes/${touringRouteId}/legs-summary`, {
          cache: 'no-store',
        });
        if (!response.ok) return; // soft-fail — strip renders nothing
        const payload = (await response.json()) as LegsSummary;
        if (cancelled) return;
        summaryCache.set(touringRouteId, payload);
        setSummary(payload);
      } catch {
        // Soft-fail; current quote behaviour unchanged.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [touringRouteId]);

  // Fallback: no id, still loading, fetch failed, or no legs — render
  // nothing so the quote workspace behaves exactly as it did before
  // Touring Legs v1 landed.
  if (!touringRouteId) return null;
  if (loading && !summary) return null;
  if (!summary || summary.legCount === 0) return null;

  const riskChips: Array<{ label: string; tone: 'amber' | 'red' | 'blue' }> = [];
  if (summary.riskFlags.borderCrossingFlag) riskChips.push({ label: 'Border crossing', tone: 'red' });
  if (summary.riskFlags.mountainRoadFlag) riskChips.push({ label: 'Mountain road', tone: 'amber' });
  if (summary.riskFlags.longDistanceFlag) riskChips.push({ label: 'Long distance', tone: 'amber' });
  if (summary.riskFlags.airportRouteFlag) riskChips.push({ label: 'Airport sensitive', tone: 'blue' });
  if (summary.riskFlags.overnightRisk) riskChips.push({ label: 'Overnight risk', tone: 'amber' });

  // "Touring flow requires coordination" — spec's operational insight
  // when the route has any DRIVE-level risk OR multiple legs with
  // non-trivial stop time.
  const highRisk =
    summary.riskFlags.borderCrossingFlag ||
    summary.riskFlags.mountainRoadFlag ||
    summary.riskFlags.longDistanceFlag ||
    summary.totalOperationalDurationHours >= 6;

  // Numeric line — only show parts that actually have data, so empty
  // standards don't surface "Drive: 0h · 0km" noise.
  const numericParts: string[] = [];
  if (summary.totalDriveDurationHours > 0) numericParts.push(`Drive: ${summary.totalDriveDurationHours}h`);
  if (summary.totalBufferMinutes > 0) numericParts.push(`Buffer: +${summary.totalBufferMinutes}m`);
  if (summary.totalDriveDistanceKm > 0) numericParts.push(`${summary.totalDriveDistanceKm} km`);
  if (summary.totalEstimatedStopMinutes > 0) numericParts.push(`Stops: ${summary.totalEstimatedStopMinutes}m`);

  return (
    <div
      className="quote-touring-flow-strip"
      style={{
        marginTop: '0.35rem',
        padding: '0.4rem 0.55rem',
        background: '#f8fafc',
        border: '1px solid #e2e8f0',
        borderRadius: 6,
        display: 'grid',
        gap: '0.2rem',
      }}
    >
      {summary.flow ? (
        <p
          style={{
            margin: 0,
            fontSize: '0.78rem',
            color: '#334155',
            fontWeight: 600,
            lineHeight: 1.35,
          }}
        >
          {summary.flow}
        </p>
      ) : null}
      {numericParts.length > 0 ? (
        <p
          style={{
            margin: 0,
            fontSize: '0.72rem',
            color: '#64748b',
            fontVariantNumeric: 'tabular-nums',
            lineHeight: 1.4,
          }}
        >
          {numericParts.join(' · ')}
        </p>
      ) : null}
      {riskChips.length > 0 ? (
        <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', marginTop: '0.1rem' }}>
          {riskChips.map((chip) => (
            <span
              key={chip.label}
              style={{
                background:
                  chip.tone === 'red' ? '#fef2f2' : chip.tone === 'amber' ? '#fefce8' : '#eff6ff',
                color:
                  chip.tone === 'red' ? '#7c2d12' : chip.tone === 'amber' ? '#854d0e' : '#1e40af',
                border:
                  chip.tone === 'red'
                    ? '1px solid #fecaca'
                    : chip.tone === 'amber'
                      ? '1px solid #fde68a'
                      : '1px solid #bfdbfe',
                padding: '0.02rem 0.4rem',
                borderRadius: 999,
                fontSize: '0.66rem',
                fontWeight: 600,
                lineHeight: 1.4,
              }}
            >
              {chip.label}
            </span>
          ))}
        </div>
      ) : null}
      {summary.missingRouteStandardCount > 0 ? (
        <p
          style={{
            margin: '0.1rem 0 0',
            fontSize: '0.7rem',
            color: '#92400e',
            lineHeight: 1.4,
          }}
          title="Operator-only insight. The touring route includes drive legs that don't have a Route Standard yet; their drive time / distance / buffer are excluded from the totals above. Add the missing standards in /route-standards."
        >
          ⚠ {summary.missingRouteStandardCount} route leg{summary.missingRouteStandardCount === 1 ? '' : 's'} missing timing standard.
        </p>
      ) : null}
      {highRisk ? (
        <p
          style={{
            margin: '0.1rem 0 0',
            fontSize: '0.7rem',
            color: 'var(--ds-color-text-muted, #475569)',
            fontStyle: 'italic',
            lineHeight: 1.4,
          }}
        >
          Touring flow requires coordination.
        </p>
      ) : null}
    </div>
  );
}
