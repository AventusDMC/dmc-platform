'use client';

import { useEffect, useMemo, useState } from 'react';

// Guided Quote Builder Maturity Phase v2 — Journey Composer panel.
//
// Read-only orchestration view designed for junior/intermediate staff:
// shows the journey flow, suggests proven Touring Routes per destination,
// surfaces operational pacing intelligence, and renders a readiness
// checklist. NEVER touches pricing, never auto-edits the quote.
//
// Operator actions stay in the existing advanced workspace — the
// "Switch to Advanced Workspace" button is always one click away. This
// panel is purely supportive: it tells junior staff what they're
// building before they commit.

type Quote = {
  id: string;
  arrivalCity?: string | null;
  travelStartDate?: string | null;
  nightCount?: number | null;
  adults?: number;
  children?: number;
  itineraries?: Array<{
    id: string;
    dayNumber: number;
    title: string | null;
  }>;
  quoteItems?: Array<{
    id: string;
    serviceType?: string | null;
    sellPriceTotal?: number | null;
    confirmationReference?: string | null;
    touringRouteId?: string | null;
    hotelId?: string | null;
  }>;
};

type SuggestedTouringRoute = {
  id: string;
  code: string;
  name: string;
  durationDays: number | null;
  region: string | null;
  estimatedDriveHours: number | null;
  estimatedDistanceKm: number | null;
  longDistance: boolean;
  mountainRoad: boolean;
};

type GuidedSuggestion = {
  destination: string;
  matchedAreaCode: string | null;
  suggestedTouringRoutes: SuggestedTouringRoute[];
  legToNext: {
    canonicalCode: string | null;
    distanceKm: number | null;
    durationHours: number | null;
    bufferMinutes: number | null;
    riskFlags: {
      longDistanceFlag: boolean;
      mountainRoadFlag: boolean;
      borderCrossingFlag: boolean;
      airportRouteFlag: boolean;
    };
  } | null;
};

type GuidedSuggestionsResponse = {
  arrivalCity: string | null;
  destinations: string[];
  suggestions: GuidedSuggestion[];
  pacing: {
    label: string;
    tone: 'calm' | 'balanced' | 'intense';
    totalDriveHours: number;
    longestSingleLegHours: number;
    longLegCount: number;
    explanation: string;
  };
  notes: string[];
};

// ----- Hotel suggestion types (v2A) -----
type CommercialTier = 'Luxury' | 'Standard' | 'Budget';
type OperationalConfidence =
  | 'Operationally smooth'
  | 'Moderate coordination'
  | 'Seasonal pressure'
  | 'Remote logistics';

type SuggestedHotel = {
  id: string;
  name: string;
  city: string;
  category: string;
  tier: CommercialTier;
  hasActiveContract: boolean;
  recommendedMealPlan: {
    code: 'BB' | 'HB' | 'FB';
    label: string;
    reason: string;
  };
  operationalConfidence: OperationalConfidence;
  notes: string[];
};

type DestinationHotelSuggestions = {
  destination: string;
  matchedAreaCode: string | null;
  tiers: Record<CommercialTier, SuggestedHotel[]>;
  totalHotelCount: number;
  hasAnySuggestions: boolean;
  fallbackHint: string | null;
};

type HotelSuggestionsResponse = {
  destinations: string[];
  suggestions: DestinationHotelSuggestions[];
  notes: string[];
};

export function GuidedJourneyComposer({
  quote,
  advancedWorkspaceUrl,
}: {
  quote: Quote;
  // URL that takes the operator back to the advanced service planner
  // (typically the same page with ?step=itinerary).
  advancedWorkspaceUrl: string;
}) {
  // Derive the destination list from the quote's itineraries. Junior
  // staff will see the cities they've already added to the itinerary;
  // the panel doesn't write the itinerary, just reads it.
  const destinations = useMemo(() => {
    const fromItineraries = (quote.itineraries || [])
      .slice()
      .sort((a, b) => (a.dayNumber || 0) - (b.dayNumber || 0))
      .map((d) => d.title || '')
      .filter(Boolean);
    // Dedupe consecutive duplicates ("Day 2: Petra" + "Day 3: Petra")
    const out: string[] = [];
    for (const d of fromItineraries) {
      if (out.length === 0 || out[out.length - 1] !== d) out.push(d);
    }
    return out;
  }, [quote.itineraries]);

  const [data, setData] = useState<GuidedSuggestionsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (destinations.length === 0) {
      setData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const response = await fetch('/api/quotes/guided/suggestions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            arrivalCity: quote.arrivalCity ?? null,
            destinations,
          }),
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.message || `Suggestions failed (${response.status})`);
        if (!cancelled) setData(payload as GuidedSuggestionsResponse);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load suggestions');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [quote.arrivalCity, destinations.join('|')]);

  // v2A — hotel suggestions per destination, fetched independently so
  // the journey-flow + pacing data shows even if hotels fail to load.
  const [hotelData, setHotelData] = useState<HotelSuggestionsResponse | null>(null);
  const [hotelsLoading, setHotelsLoading] = useState(false);
  useEffect(() => {
    if (destinations.length === 0) {
      setHotelData(null);
      return;
    }
    let cancelled = false;
    setHotelsLoading(true);
    (async () => {
      try {
        const response = await fetch('/api/quotes/guided/hotel-suggestions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ destinations }),
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.message || `Hotel suggestions failed (${response.status})`);
        if (!cancelled) setHotelData(payload as HotelSuggestionsResponse);
      } catch {
        // Soft-fail — the rest of the panel still renders. The fallback
        // section below shows a "use the hotel selector" link when no
        // data is available.
        if (!cancelled) setHotelData(null);
      } finally {
        if (!cancelled) setHotelsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [destinations.join('|')]);

  // Quote readiness — pure derivation from quote state, no API hit.
  const readiness = computeQuoteReadiness(quote);

  return (
    <section
      style={{
        background: '#f8fafc',
        border: '1px solid #e2e8f0',
        borderRadius: 12,
        padding: '1.25rem',
        display: 'grid',
        gap: '1rem',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 280 }}>
          <p
            style={{
              color: '#475569',
              fontSize: '0.7rem',
              fontWeight: 700,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              margin: 0,
            }}
          >
            Journey Composer · Guided Mode
          </p>
          <h2 style={{ margin: '0.25rem 0 0', fontSize: '1.4rem', color: '#0f172a' }}>
            {destinations.length === 0
              ? 'Start by adding destinations to your itinerary.'
              : destinations.length === 1
                ? `Building a single-destination journey in ${destinations[0]}.`
                : `Building a ${destinations.length}-city journey.`}
          </h2>
          <p style={{ margin: '0.3rem 0 0', color: '#475569', fontSize: '0.92rem' }}>
            A step-by-step view of your travel journey. Suggested touring routes, operational pacing,
            and a readiness checklist — all read-only. Switch to the Advanced Workspace any time to
            edit services directly.
          </p>
        </div>
        <a
          href={advancedWorkspaceUrl}
          style={{
            padding: '0.55rem 0.95rem',
            border: '1px solid #0c4a6e',
            borderRadius: 8,
            background: '#fff',
            color: '#0c4a6e',
            fontSize: '0.88rem',
            fontWeight: 600,
            textDecoration: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          Switch to Advanced Workspace →
        </a>
      </div>

      {/* Section 1 — Journey flow visualization */}
      <JourneyFlowSection destinations={destinations} quote={quote} />

      {/* Section 2 — Pacing intelligence */}
      {loading ? (
        <p style={{ color: '#64748b', fontSize: '0.88rem', margin: 0 }}>Reading suggestions…</p>
      ) : null}
      {error ? <p className="form-error">{error}</p> : null}
      {data ? <PacingSection pacing={data.pacing} notes={data.notes} /> : null}

      {/* Section 3 — Suggested Touring Routes per destination */}
      {data ? <SuggestedTouringRoutesSection suggestions={data.suggestions} /> : null}

      {/* Section 4 — Suggested Hotels per destination (v2A) */}
      <SuggestedHotelsSection
        hotelData={hotelData}
        loading={hotelsLoading}
        destinations={destinations}
        // Hotel cards link into the Hotels tab on the advanced workspace
        // (with the quote id and the hotelId in the URL). v2A does NOT
        // auto-insert into a quote day — that requires the existing
        // add-hotel flow which carries occupancy / room category /
        // contract resolution logic the spec asked us to preserve.
        quoteId={quote.id}
      />

      {/* Section 5 — Quote readiness checklist */}
      <ReadinessSection readiness={readiness} />

      <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.78rem', textAlign: 'center' }}>
        Guided mode is read-only. To add services, override pricing, or edit dispatch, switch to the
        Advanced Workspace.
      </p>
    </section>
  );
}

function JourneyFlowSection({ destinations, quote }: { destinations: string[]; quote: Quote }) {
  if (destinations.length === 0) {
    return (
      <div
        style={{
          background: '#fff',
          border: '1px dashed #cbd5e1',
          borderRadius: 10,
          padding: '1.5rem',
          textAlign: 'center',
          color: '#64748b',
        }}
      >
        Add destinations from the Itinerary tab. They'll appear here as a journey flow.
      </div>
    );
  }
  const startLabel = quote.arrivalCity || 'Arrival';
  const nights = quote.nightCount;
  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid #e2e8f0',
        borderRadius: 10,
        padding: '1rem 1.1rem',
      }}
    >
      <p
        style={{
          color: '#475569',
          fontSize: '0.7rem',
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          margin: 0,
        }}
      >
        Journey flow
      </p>
      <div
        style={{
          display: 'flex',
          gap: '0.45rem',
          flexWrap: 'wrap',
          alignItems: 'center',
          marginTop: '0.5rem',
        }}
      >
        <FlowNode label={startLabel} tone="anchor" />
        {destinations.map((d, i) => (
          <span key={`${d}-${i}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}>
            <span style={{ color: '#94a3b8' }}>→</span>
            <FlowNode label={d} />
          </span>
        ))}
      </div>
      {nights ? (
        <p style={{ margin: '0.55rem 0 0', color: '#64748b', fontSize: '0.85rem' }}>
          {nights} night{nights === 1 ? '' : 's'} total · {quote.adults || 0} adult{quote.adults === 1 ? '' : 's'}
          {quote.children ? ` + ${quote.children} child${quote.children === 1 ? '' : 'ren'}` : ''}
        </p>
      ) : null}
    </div>
  );
}

function FlowNode({ label, tone }: { label: string; tone?: 'anchor' }) {
  const isAnchor = tone === 'anchor';
  return (
    <span
      style={{
        padding: '0.4rem 0.75rem',
        background: isAnchor ? '#e0f2fe' : '#f1f5f9',
        border: `1px solid ${isAnchor ? '#7dd3fc' : '#cbd5e1'}`,
        color: isAnchor ? '#075985' : '#334155',
        borderRadius: 999,
        fontSize: '0.88rem',
        fontWeight: 600,
      }}
    >
      {label}
    </span>
  );
}

function PacingSection({ pacing, notes }: { pacing: GuidedSuggestionsResponse['pacing']; notes: string[] }) {
  const toneColors = {
    calm: { bg: '#ecfdf3', text: '#067647', border: '#abefc6' },
    balanced: { bg: '#eff6ff', text: '#1e40af', border: '#bfdbfe' },
    intense: { bg: '#fef3c7', text: '#854d0e', border: '#fde68a' },
  }[pacing.tone];
  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid #e2e8f0',
        borderRadius: 10,
        padding: '1rem 1.1rem',
      }}
    >
      <p
        style={{
          color: '#475569',
          fontSize: '0.7rem',
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          margin: 0,
        }}
      >
        Operational pacing
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
        <span
          style={{
            padding: '0.3rem 0.7rem',
            background: toneColors.bg,
            border: `1px solid ${toneColors.border}`,
            color: toneColors.text,
            borderRadius: 999,
            fontSize: '0.9rem',
            fontWeight: 700,
          }}
        >
          {pacing.label}
        </span>
        <span style={{ color: '#64748b', fontSize: '0.85rem', fontVariantNumeric: 'tabular-nums' }}>
          {pacing.totalDriveHours}h total drive · longest leg {pacing.longestSingleLegHours}h
        </span>
      </div>
      <p style={{ margin: '0.5rem 0 0', color: '#475569', fontSize: '0.88rem', lineHeight: 1.45 }}>
        {pacing.explanation}
      </p>
      {notes.length > 0 ? (
        <ul style={{ margin: '0.55rem 0 0', paddingLeft: '1.25rem', color: '#64748b', fontSize: '0.82rem' }}>
          {notes.map((note, i) => (
            <li key={i}>{note}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function SuggestedTouringRoutesSection({ suggestions }: { suggestions: GuidedSuggestion[] }) {
  const withSuggestions = suggestions.filter((s) => s.suggestedTouringRoutes.length > 0);
  if (withSuggestions.length === 0) {
    return null;
  }
  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid #e2e8f0',
        borderRadius: 10,
        padding: '1rem 1.1rem',
      }}
    >
      <p
        style={{
          color: '#475569',
          fontSize: '0.7rem',
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          margin: 0,
        }}
      >
        Suggested touring routes
      </p>
      <p style={{ margin: '0.2rem 0 0.55rem', color: '#64748b', fontSize: '0.82rem' }}>
        Proven operational flows the operations team already runs. Add them from the Advanced Workspace
        if any match what you're building.
      </p>
      <div style={{ display: 'grid', gap: '0.7rem' }}>
        {withSuggestions.map((s) => (
          <div key={s.destination}>
            <p style={{ margin: 0, color: '#0f172a', fontWeight: 600, fontSize: '0.92rem' }}>
              {s.destination}
              {s.matchedAreaCode ? (
                <span
                  style={{
                    marginLeft: '0.4rem',
                    background: '#f1f5f9',
                    color: '#475569',
                    padding: '0.05rem 0.4rem',
                    borderRadius: 999,
                    fontSize: '0.68rem',
                    fontFamily: 'monospace',
                  }}
                >
                  {s.matchedAreaCode}
                </span>
              ) : null}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', marginTop: '0.35rem' }}>
              {s.suggestedTouringRoutes.map((tr) => (
                <div
                  key={tr.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    gap: '0.6rem',
                    padding: '0.45rem 0.65rem',
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: 8,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, color: '#0f172a', fontSize: '0.88rem' }}>
                      <code style={{ fontSize: '0.78rem', color: '#475569', marginRight: '0.35rem' }}>
                        {tr.code}
                      </code>
                      {tr.name}
                    </p>
                    <p style={{ margin: '0.1rem 0 0', color: '#64748b', fontSize: '0.78rem' }}>
                      {tr.durationDays ? `${tr.durationDays}-day · ` : ''}
                      {tr.region ? `${tr.region} · ` : ''}
                      {tr.estimatedDriveHours != null ? `${tr.estimatedDriveHours}h drive` : ''}
                      {tr.estimatedDistanceKm != null ? ` · ${tr.estimatedDistanceKm} km` : ''}
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {tr.mountainRoad ? <SmallChip>Mountain</SmallChip> : null}
                    {tr.longDistance ? <SmallChip>Long</SmallChip> : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SmallChip({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        background: '#fefce8',
        color: '#854d0e',
        border: '1px solid #fde68a',
        padding: '0.05rem 0.4rem',
        borderRadius: 999,
        fontSize: '0.7rem',
        fontWeight: 600,
      }}
    >
      {children}
    </span>
  );
}

type ReadinessItem = {
  label: string;
  status: 'done' | 'partial' | 'pending';
  detail: string;
};

function computeQuoteReadiness(quote: Quote): {
  pricing: ReadinessItem;
  operations: ReadinessItem;
  proposal: ReadinessItem;
} {
  const items = quote.quoteItems || [];
  const itemsWithSell = items.filter((i) => (i.sellPriceTotal ?? 0) > 0);
  const itemsTotal = items.length;
  const pricing: ReadinessItem =
    itemsTotal === 0
      ? { label: 'Pricing review', status: 'pending', detail: 'No services added yet.' }
      : itemsWithSell.length === itemsTotal
        ? { label: 'Pricing review', status: 'done', detail: `All ${itemsTotal} service${itemsTotal === 1 ? '' : 's'} priced.` }
        : {
            label: 'Pricing review',
            status: 'partial',
            detail: `${itemsWithSell.length} of ${itemsTotal} service${itemsTotal === 1 ? '' : 's'} priced.`,
          };

  const itemsWithConfirmation = items.filter((i) => i.confirmationReference);
  const operations: ReadinessItem =
    itemsTotal === 0
      ? { label: 'Operational readiness', status: 'pending', detail: 'No services to confirm yet.' }
      : itemsWithConfirmation.length === 0
        ? { label: 'Operational readiness', status: 'pending', detail: 'No supplier confirmations on file.' }
        : itemsWithConfirmation.length === itemsTotal
          ? { label: 'Operational readiness', status: 'done', detail: `All ${itemsTotal} service${itemsTotal === 1 ? '' : 's'} confirmed by suppliers.` }
          : {
              label: 'Operational readiness',
              status: 'partial',
              detail: `${itemsWithConfirmation.length} of ${itemsTotal} service${itemsTotal === 1 ? '' : 's'} confirmed.`,
            };

  // Proposal readiness — we can't see proposal state here, but we can
  // infer rough readiness from itinerary days vs night count.
  const itinDays = quote.itineraries?.length || 0;
  const nights = quote.nightCount ?? 0;
  const proposal: ReadinessItem =
    itinDays === 0
      ? { label: 'Proposal readiness', status: 'pending', detail: 'No itinerary days yet.' }
      : nights > 0 && itinDays >= nights + 1
        ? { label: 'Proposal readiness', status: 'done', detail: `Itinerary covers all ${nights} night${nights === 1 ? '' : 's'}.` }
        : {
            label: 'Proposal readiness',
            status: 'partial',
            detail: `${itinDays} itinerary day${itinDays === 1 ? '' : 's'} drafted${nights > 0 ? ` for ${nights} night${nights === 1 ? '' : 's'}` : ''}.`,
          };

  return { pricing, operations, proposal };
}

function ReadinessSection({ readiness }: { readiness: ReturnType<typeof computeQuoteReadiness> }) {
  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid #e2e8f0',
        borderRadius: 10,
        padding: '1rem 1.1rem',
      }}
    >
      <p
        style={{
          color: '#475569',
          fontSize: '0.7rem',
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          margin: 0,
        }}
      >
        Quote readiness
      </p>
      <div style={{ display: 'grid', gap: '0.4rem', marginTop: '0.55rem' }}>
        <ReadinessRow item={readiness.pricing} />
        <ReadinessRow item={readiness.operations} />
        <ReadinessRow item={readiness.proposal} />
      </div>
    </div>
  );
}

function ReadinessRow({ item }: { item: ReadinessItem }) {
  const icon = item.status === 'done' ? '✓' : item.status === 'partial' ? '◐' : '○';
  const color = item.status === 'done' ? '#067647' : item.status === 'partial' ? '#854d0e' : '#94a3b8';
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.55rem' }}>
      <span style={{ color, fontSize: '1rem', fontWeight: 700, width: '1.1rem' }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, color: '#0f172a', fontWeight: 600, fontSize: '0.88rem' }}>{item.label}</p>
        <p style={{ margin: 0, color: '#64748b', fontSize: '0.82rem' }}>{item.detail}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// v2A — Suggested Hotels section
// ---------------------------------------------------------------------------

function SuggestedHotelsSection({
  hotelData,
  loading,
  destinations,
  quoteId,
}: {
  hotelData: HotelSuggestionsResponse | null;
  loading: boolean;
  destinations: string[];
  quoteId: string;
}) {
  if (destinations.length === 0) return null;
  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid #e2e8f0',
        borderRadius: 10,
        padding: '1rem 1.1rem',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.5rem', flexWrap: 'wrap' }}>
        <div>
          <p
            style={{
              color: '#475569',
              fontSize: '0.7rem',
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              margin: 0,
            }}
          >
            Suggested hotels
          </p>
          <p style={{ margin: '0.2rem 0 0', color: '#64748b', fontSize: '0.82rem' }}>
            Per destination, grouped by commercial tier. Each card shows the recommended meal plan,
            operational confidence, and short notes. Adding hotels happens in the Advanced Workspace —
            the link on each card jumps you there with the hotel pre-selected.
          </p>
        </div>
        <a
          href={`/quotes/${quoteId}?tab=hotels`}
          style={{
            padding: '0.35rem 0.7rem',
            border: '1px solid #cbd5e1',
            borderRadius: 8,
            background: '#f8fafc',
            color: '#0c4a6e',
            fontSize: '0.78rem',
            fontWeight: 600,
            textDecoration: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          Open standard hotel selector →
        </a>
      </div>

      {loading && !hotelData ? (
        <p style={{ marginTop: '0.6rem', color: '#64748b', fontSize: '0.85rem' }}>
          Reading hotel catalog for these destinations…
        </p>
      ) : null}

      {!loading && !hotelData ? (
        <p style={{ marginTop: '0.6rem', color: '#64748b', fontSize: '0.85rem' }}>
          Could not load hotel suggestions. Open the standard hotel selector to search by name or city.
        </p>
      ) : null}

      {hotelData ? (
        <div style={{ marginTop: '0.7rem', display: 'grid', gap: '1rem' }}>
          {hotelData.suggestions.map((destSugg) => (
            <DestinationHotelGroup key={destSugg.destination} group={destSugg} quoteId={quoteId} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function DestinationHotelGroup({
  group,
  quoteId,
}: {
  group: DestinationHotelSuggestions;
  quoteId: string;
}) {
  const tiers: Array<{ key: CommercialTier; label: string; chipBg: string; chipText: string }> = [
    { key: 'Luxury', label: 'Luxury', chipBg: '#eef2ff', chipText: '#3730a3' },
    { key: 'Standard', label: 'Standard', chipBg: '#ecfdf3', chipText: '#067647' },
    { key: 'Budget', label: 'Budget', chipBg: '#fff7ed', chipText: '#854d0e' },
  ];
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem', marginBottom: '0.4rem' }}>
        <p style={{ margin: 0, fontWeight: 600, fontSize: '0.92rem', color: '#0f172a' }}>{group.destination}</p>
        {group.matchedAreaCode ? (
          <span
            style={{
              background: '#f1f5f9',
              color: '#475569',
              padding: '0.05rem 0.4rem',
              borderRadius: 999,
              fontSize: '0.68rem',
              fontFamily: 'monospace',
            }}
          >
            {group.matchedAreaCode}
          </span>
        ) : null}
        <span style={{ marginLeft: 'auto', color: '#94a3b8', fontSize: '0.75rem' }}>
          {group.totalHotelCount} hotel{group.totalHotelCount === 1 ? '' : 's'}
        </span>
      </div>
      {!group.hasAnySuggestions ? (
        <div
          style={{
            padding: '0.55rem 0.7rem',
            background: '#fefce8',
            border: '1px solid #fde68a',
            borderRadius: 8,
            color: '#854d0e',
            fontSize: '0.82rem',
          }}
        >
          {group.fallbackHint ||
            `No hotels matched "${group.destination}". Use the standard hotel selector to search.`}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '0.5rem' }}>
          {tiers.map(({ key, label, chipBg, chipText }) =>
            group.tiers[key].length > 0 ? (
              <div key={key}>
                <p
                  style={{
                    margin: '0 0 0.3rem',
                    color: '#475569',
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                  }}
                >
                  {label}
                </p>
                <div style={{ display: 'grid', gap: '0.4rem' }}>
                  {group.tiers[key].map((hotel) => (
                    <HotelCard key={hotel.id} hotel={hotel} quoteId={quoteId} tierChip={{ bg: chipBg, text: chipText, label }} />
                  ))}
                </div>
              </div>
            ) : null,
          )}
        </div>
      )}
    </div>
  );
}

function HotelCard({
  hotel,
  quoteId,
  tierChip,
}: {
  hotel: SuggestedHotel;
  quoteId: string;
  tierChip: { bg: string; text: string; label: string };
}) {
  const confidenceColors: Record<OperationalConfidence, { bg: string; text: string; border: string }> = {
    'Operationally smooth': { bg: '#ecfdf3', text: '#067647', border: '#abefc6' },
    'Moderate coordination': { bg: '#eff6ff', text: '#1e40af', border: '#bfdbfe' },
    'Seasonal pressure': { bg: '#fef3c7', text: '#854d0e', border: '#fde68a' },
    'Remote logistics': { bg: '#fff7ed', text: '#7c2d12', border: '#fed7aa' },
  };
  const cc = confidenceColors[hotel.operationalConfidence];
  return (
    <div
      style={{
        background: '#f8fafc',
        border: '1px solid #e2e8f0',
        borderRadius: 8,
        padding: '0.55rem 0.7rem',
        display: 'grid',
        gap: '0.3rem',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.5rem', flexWrap: 'wrap' }}>
        <p style={{ margin: 0, color: '#0f172a', fontSize: '0.92rem', fontWeight: 600 }}>{hotel.name}</p>
        <a
          href={`/quotes/${quoteId}?tab=hotels&hotelId=${encodeURIComponent(hotel.id)}`}
          style={{
            color: '#0c4a6e',
            fontSize: '0.78rem',
            fontWeight: 600,
            textDecoration: 'none',
            whiteSpace: 'nowrap',
          }}
          title="Open in Advanced Workspace's Hotels tab"
        >
          Add in Hotels tab →
        </a>
      </div>
      <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <span
          style={{
            background: tierChip.bg,
            color: tierChip.text,
            padding: '0.05rem 0.4rem',
            borderRadius: 999,
            fontSize: '0.68rem',
            fontWeight: 700,
          }}
        >
          {hotel.category || tierChip.label}
        </span>
        <span
          style={{
            background: cc.bg,
            color: cc.text,
            border: `1px solid ${cc.border}`,
            padding: '0.05rem 0.45rem',
            borderRadius: 999,
            fontSize: '0.68rem',
            fontWeight: 600,
          }}
        >
          {hotel.operationalConfidence}
        </span>
        <span
          style={{
            background: '#eef2ff',
            color: '#3730a3',
            padding: '0.05rem 0.4rem',
            borderRadius: 999,
            fontSize: '0.68rem',
            fontWeight: 600,
          }}
          title={hotel.recommendedMealPlan.reason}
        >
          Meal plan: {hotel.recommendedMealPlan.code} recommended
        </span>
      </div>
      {hotel.notes.length > 0 ? (
        <p style={{ margin: 0, color: '#64748b', fontSize: '0.78rem' }}>
          {hotel.notes.join(' · ')}
        </p>
      ) : null}
      {!hotel.hasActiveContract ? (
        <p style={{ margin: 0, color: '#854d0e', fontSize: '0.74rem' }}>
          ⚠ No active contract on file — supplier may need confirmation before booking.
        </p>
      ) : null}
    </div>
  );
}
