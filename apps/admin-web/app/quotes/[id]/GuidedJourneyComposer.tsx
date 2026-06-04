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
  recommendationScore?: number;
  recommendationReasons?: string[];
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

// ----- Experience suggestion types (v2B) -----
type MoodCategory =
  | 'CULTURE'
  | 'ADVENTURE'
  | 'RELIGIOUS'
  | 'RELAXATION'
  | 'FAMILY'
  | 'WELLNESS'
  | 'FOOD_LOCAL';

const MOOD_LABELS: Record<MoodCategory, string> = {
  CULTURE: 'Culture',
  ADVENTURE: 'Adventure',
  RELIGIOUS: 'Religious',
  RELAXATION: 'Relaxation',
  FAMILY: 'Family',
  WELLNESS: 'Wellness',
  FOOD_LOCAL: 'Food & Local Experience',
};

const MOOD_ICONS: Record<MoodCategory, string> = {
  CULTURE: '🏛',
  ADVENTURE: '🧭',
  RELIGIOUS: '🕊',
  RELAXATION: '🌿',
  FAMILY: '👪',
  WELLNESS: '💆',
  FOOD_LOCAL: '🍲',
};

type SuggestedExperience = {
  id: string;
  name: string;
  description: string | null;
  city: string;
  experienceType: string | null;
  moodCategory: string | null;
  effectiveMood: MoodCategory;
  durationMinutes: number | null;
  durationHours: number | null;
  operationalIntensity: 'RELAXED' | 'MODERATE' | 'INTENSE' | null;
  familyFriendly: boolean;
  religiousSignificance: boolean;
  premiumExperienceFlag: boolean;
  popularWithGroups: boolean;
  operationalConfidenceLabel: string;
  recommendationScore?: number;
  recommendationReasons?: string[];
  notes: string[];
};

type DestinationExperienceSuggestions = {
  destination: string;
  matchedAreaCode: string | null;
  byMood: Partial<Record<MoodCategory, SuggestedExperience[]>>;
  totalExperienceCount: number;
  hasAnyExperiences: boolean;
  fallbackHint: string | null;
};

type ExperienceSuggestionsResponse = {
  destinations: string[];
  suggestions: DestinationExperienceSuggestions[];
  highlights: SuggestedExperience[];
  notes: string[];
};

// ----- Transport suggestion types (v2C) -----
type VehicleClass = 'SEDAN' | 'MINIVAN' | 'COASTER' | 'BUS';

type LegOverlayKey =
  | 'AIRPORT_TIMING'
  | 'MOUNTAIN_ROAD'
  | 'LONG_DISTANCE'
  | 'BORDER_CROSSING'
  | 'DESERT_LOGISTICS'
  | 'OVERNIGHT_TRANSITION';

type LegTransportInsight = {
  fromCity: string;
  toCity: string;
  canonicalCode: string | null;
  overlays: Array<{
    key: LegOverlayKey;
    label: string;
    tone: 'amber' | 'red' | 'blue';
  }>;
  driveHours: number | null;
  distanceKm: number | null;
};

type TransportRecommendation = {
  vehicleClass: VehicleClass;
  label: string;
  icon: string;
  seatRange: string;
  typicalExample: string;
  luggageNote: string;
  recommendationLine: string;
  preferredOperationalChoice: boolean;
  comfortNotes: string[];
  operationalConfidenceLabel: 'Operationally smooth' | 'Moderate coordination' | 'High coordination required';
};

type TransportSuggestionsResponse = {
  paxCount: number;
  destinations: string[];
  recommendation: TransportRecommendation | null;
  legs: LegTransportInsight[];
  pacing: {
    label:
      | 'Comfortable pacing'
      | 'Long-distance touring day'
      | 'High coordination transfer day'
      | 'Tight luggage capacity';
    tone: 'calm' | 'balanced' | 'intense';
    explanation: string;
  };
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

  // v2C — transport suggestions for the journey. paxCount comes from
  // the quote header (adults + children). Same soft-fail semantics.
  const [transportData, setTransportData] = useState<TransportSuggestionsResponse | null>(null);
  const [transportLoading, setTransportLoading] = useState(false);
  const paxCount = (quote.adults || 0) + (quote.children || 0);
  useEffect(() => {
    if (destinations.length === 0 && !quote.arrivalCity) {
      setTransportData(null);
      return;
    }
    let cancelled = false;
    setTransportLoading(true);
    (async () => {
      try {
        const response = await fetch('/api/quotes/guided/transport-suggestions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            arrivalCity: quote.arrivalCity ?? null,
            destinations,
            paxCount,
          }),
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.message || `Transport suggestions failed (${response.status})`);
        if (!cancelled) setTransportData(payload as TransportSuggestionsResponse);
      } catch {
        if (!cancelled) setTransportData(null);
      } finally {
        if (!cancelled) setTransportLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [quote.arrivalCity, destinations.join('|'), paxCount]);

  // v2B — experience suggestions per destination, fetched independently.
  // Same soft-fail semantics as hotels: if this call errors the rest of
  // the panel still renders.
  const [experienceData, setExperienceData] = useState<ExperienceSuggestionsResponse | null>(null);
  const [experiencesLoading, setExperiencesLoading] = useState(false);
  useEffect(() => {
    if (destinations.length === 0) {
      setExperienceData(null);
      return;
    }
    let cancelled = false;
    setExperiencesLoading(true);
    (async () => {
      try {
        const response = await fetch('/api/quotes/guided/experience-suggestions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ destinations }),
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.message || `Experience suggestions failed (${response.status})`);
        if (!cancelled) setExperienceData(payload as ExperienceSuggestionsResponse);
      } catch {
        if (!cancelled) setExperienceData(null);
      } finally {
        if (!cancelled) setExperiencesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [destinations.join('|')]);

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
        background: 'var(--ds-color-canvas, #F8FAFC)',
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
              color: 'var(--ds-color-text-muted, #475569)',
              fontSize: '0.7rem',
              fontWeight: 700,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              margin: 0,
            }}
          >
            Journey Composer · Guided Mode
          </p>
          <h2 style={{ margin: '0.25rem 0 0', fontSize: '1.4rem', color: 'var(--ds-color-text, #0F172A)' }}>
            {destinations.length === 0
              ? 'Start by adding destinations to your itinerary.'
              : destinations.length === 1
                ? `Building a single-destination journey in ${destinations[0]}.`
                : `Building a ${destinations.length}-city journey.`}
          </h2>
          <p style={{ margin: '0.3rem 0 0', color: 'var(--ds-color-text-muted, #475569)', fontSize: '0.92rem' }}>
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

      {/* Section 5 — Suggested Experiences per destination (v2B) */}
      <SuggestedExperiencesSection
        experienceData={experienceData}
        loading={experiencesLoading}
        destinations={destinations}
        quoteId={quote.id}
      />

      {/* Section 6 — Suggested Transport (v2C) */}
      <SuggestedTransportSection
        transportData={transportData}
        loading={transportLoading}
        paxCount={paxCount}
        quoteId={quote.id}
      />

      {/* Section 7 — Quote readiness checklist */}
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
          color: 'var(--ds-color-text-muted, #475569)',
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
          color: 'var(--ds-color-text-muted, #475569)',
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
      <p style={{ margin: '0.5rem 0 0', color: 'var(--ds-color-text-muted, #475569)', fontSize: '0.88rem', lineHeight: 1.45 }}>
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
          color: 'var(--ds-color-text-muted, #475569)',
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
            <p style={{ margin: 0, color: 'var(--ds-color-text, #0F172A)', fontWeight: 600, fontSize: '0.92rem' }}>
              {s.destination}
              {s.matchedAreaCode ? (
                <span
                  style={{
                    marginLeft: '0.4rem',
                    background: '#f1f5f9',
                    color: 'var(--ds-color-text-muted, #475569)',
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
                    background: 'var(--ds-color-canvas, #F8FAFC)',
                    border: '1px solid #e2e8f0',
                    borderRadius: 8,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, color: 'var(--ds-color-text, #0F172A)', fontSize: '0.88rem' }}>
                      <code style={{ fontSize: '0.78rem', color: 'var(--ds-color-text-muted, #475569)', marginRight: '0.35rem' }}>
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
          color: 'var(--ds-color-text-muted, #475569)',
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
        <p style={{ margin: 0, color: 'var(--ds-color-text, #0F172A)', fontWeight: 600, fontSize: '0.88rem' }}>{item.label}</p>
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
              color: 'var(--ds-color-text-muted, #475569)',
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
            background: 'var(--ds-color-canvas, #F8FAFC)',
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
        <p style={{ margin: 0, fontWeight: 600, fontSize: '0.92rem', color: 'var(--ds-color-text, #0F172A)' }}>{group.destination}</p>
        {group.matchedAreaCode ? (
          <span
            style={{
              background: '#f1f5f9',
              color: 'var(--ds-color-text-muted, #475569)',
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
                    color: 'var(--ds-color-text-muted, #475569)',
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
        background: 'var(--ds-color-canvas, #F8FAFC)',
        border: '1px solid #e2e8f0',
        borderRadius: 8,
        padding: '0.55rem 0.7rem',
        display: 'grid',
        gap: '0.3rem',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.5rem', flexWrap: 'wrap' }}>
        <p style={{ margin: 0, color: 'var(--ds-color-text, #0F172A)', fontSize: '0.92rem', fontWeight: 600 }}>{hotel.name}</p>
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
        {typeof hotel.recommendationScore === 'number' ? (
          <span
            style={{
              background: '#f0fdf4',
              color: '#15803d',
              border: '1px solid #bbf7d0',
              padding: '0.05rem 0.45rem',
              borderRadius: 999,
              fontSize: '0.68rem',
              fontWeight: 700,
            }}
            title="Recommendation score — higher suggestions rank first"
          >
            ★ {hotel.recommendationScore}
          </span>
        ) : null}
      </div>
      {hotel.recommendationReasons && hotel.recommendationReasons.length > 0 ? (
        <p style={{ margin: 0, color: '#15803d', fontSize: '0.74rem' }}>
          Why recommended: {hotel.recommendationReasons.join(' · ')}
        </p>
      ) : null}
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

// ---------------------------------------------------------------------------
// v2B — Suggested Experiences section
// ---------------------------------------------------------------------------

function SuggestedExperiencesSection({
  experienceData,
  loading,
  destinations,
  quoteId,
}: {
  experienceData: ExperienceSuggestionsResponse | null;
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
              color: 'var(--ds-color-text-muted, #475569)',
              fontSize: '0.7rem',
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              margin: 0,
            }}
          >
            Suggested experiences
          </p>
          <p style={{ margin: '0.2rem 0 0', color: '#64748b', fontSize: '0.82rem' }}>
            Per destination, grouped by travel mood — Culture, Adventure, Religious, Relaxation,
            Family, Wellness, Food & Local. Each card shows duration, intensity, and operational
            confidence. Adding experiences happens on the Activities tab — the link on each card
            jumps you there with the activity pre-selected.
          </p>
        </div>
        <a
          href={`/quotes/${quoteId}?tab=services`}
          style={{
            padding: '0.35rem 0.7rem',
            border: '1px solid #cbd5e1',
            borderRadius: 8,
            background: 'var(--ds-color-canvas, #F8FAFC)',
            color: '#0c4a6e',
            fontSize: '0.78rem',
            fontWeight: 600,
            textDecoration: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          Open standard activity selector →
        </a>
      </div>

      {loading && !experienceData ? (
        <p style={{ marginTop: '0.6rem', color: '#64748b', fontSize: '0.85rem' }}>
          Reading activities catalog for these destinations…
        </p>
      ) : null}

      {!loading && !experienceData ? (
        <p style={{ marginTop: '0.6rem', color: '#64748b', fontSize: '0.85rem' }}>
          Could not load experience suggestions. Open the standard activity selector to search by name.
        </p>
      ) : null}

      {experienceData && experienceData.highlights.length > 0 ? (
        <ExperienceHighlightsStrip highlights={experienceData.highlights} quoteId={quoteId} />
      ) : null}

      {experienceData ? (
        <div style={{ marginTop: '0.7rem', display: 'grid', gap: '1rem' }}>
          {experienceData.suggestions.map((destSugg) => (
            <DestinationExperienceGroup
              key={destSugg.destination}
              group={destSugg}
              quoteId={quoteId}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ExperienceHighlightsStrip({
  highlights,
  quoteId,
}: {
  highlights: SuggestedExperience[];
  quoteId: string;
}) {
  return (
    <div
      style={{
        marginTop: '0.7rem',
        padding: '0.7rem 0.85rem',
        background: '#f0f9ff',
        border: '1px solid #bae6fd',
        borderRadius: 10,
      }}
    >
      <p
        style={{
          color: '#0c4a6e',
          fontSize: '0.7rem',
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          margin: 0,
        }}
      >
        Top experiences for this journey
      </p>
      <div style={{ display: 'grid', gap: '0.4rem', marginTop: '0.45rem' }}>
        {highlights.map((exp) => (
          <ExperienceCard key={exp.id} exp={exp} quoteId={quoteId} compact />
        ))}
      </div>
    </div>
  );
}

function DestinationExperienceGroup({
  group,
  quoteId,
}: {
  group: DestinationExperienceSuggestions;
  quoteId: string;
}) {
  // Render moods in a stable order that matches the spec list.
  const moodOrder: MoodCategory[] = [
    'CULTURE',
    'ADVENTURE',
    'RELIGIOUS',
    'RELAXATION',
    'FAMILY',
    'WELLNESS',
    'FOOD_LOCAL',
  ];
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem', marginBottom: '0.4rem' }}>
        <p style={{ margin: 0, fontWeight: 600, fontSize: '0.92rem', color: 'var(--ds-color-text, #0F172A)' }}>{group.destination}</p>
        {group.matchedAreaCode ? (
          <span
            style={{
              background: '#f1f5f9',
              color: 'var(--ds-color-text-muted, #475569)',
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
          {group.totalExperienceCount} experience{group.totalExperienceCount === 1 ? '' : 's'}
        </span>
      </div>
      {!group.hasAnyExperiences ? (
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
            `No activities matched "${group.destination}". Use the standard activity selector to search.`}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '0.55rem' }}>
          {moodOrder.map((mood) => {
            const list = group.byMood[mood] || [];
            if (list.length === 0) return null;
            return (
              <div key={mood}>
                <p
                  style={{
                    margin: '0 0 0.3rem',
                    color: 'var(--ds-color-text-muted, #475569)',
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                  }}
                >
                  <span aria-hidden style={{ marginRight: '0.3rem' }}>{MOOD_ICONS[mood]}</span>
                  {MOOD_LABELS[mood]}
                </p>
                <div style={{ display: 'grid', gap: '0.4rem' }}>
                  {list.map((exp) => (
                    <ExperienceCard key={exp.id} exp={exp} quoteId={quoteId} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ExperienceCard({
  exp,
  quoteId,
  compact,
}: {
  exp: SuggestedExperience;
  quoteId: string;
  compact?: boolean;
}) {
  const intensityColors: Record<NonNullable<SuggestedExperience['operationalIntensity']>, { bg: string; text: string }> = {
    RELAXED: { bg: '#ecfdf3', text: '#067647' },
    MODERATE: { bg: '#eff6ff', text: '#1e40af' },
    INTENSE: { bg: '#fef3c7', text: '#854d0e' },
  };
  const confidenceTone =
    exp.operationalConfidenceLabel === 'Operationally confident'
      ? { bg: '#ecfdf3', text: '#067647', border: '#abefc6' }
      : exp.operationalConfidenceLabel === 'Specialist coordination'
        ? { bg: '#fff7ed', text: '#7c2d12', border: '#fed7aa' }
        : { bg: '#eff6ff', text: '#1e40af', border: '#bfdbfe' };
  const durationLabel =
    exp.durationHours != null
      ? `${exp.durationHours} h`
      : exp.durationMinutes != null
        ? `${exp.durationMinutes} min`
        : null;
  return (
    <div
      style={{
        background: 'var(--ds-color-canvas, #F8FAFC)',
        border: '1px solid #e2e8f0',
        borderRadius: 8,
        padding: '0.55rem 0.7rem',
        display: 'grid',
        gap: '0.3rem',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.5rem', flexWrap: 'wrap' }}>
        <p style={{ margin: 0, color: 'var(--ds-color-text, #0F172A)', fontSize: '0.92rem', fontWeight: 600 }}>
          {exp.premiumExperienceFlag ? <span aria-hidden style={{ marginRight: '0.25rem' }}>✨</span> : null}
          {exp.name}
        </p>
        <a
          href={`/quotes/${quoteId}?tab=services&activityId=${encodeURIComponent(exp.id)}`}
          style={{
            color: '#0c4a6e',
            fontSize: '0.78rem',
            fontWeight: 600,
            textDecoration: 'none',
            whiteSpace: 'nowrap',
          }}
          title="Open in Advanced Workspace's Activities tab"
        >
          Add in Activities tab →
        </a>
      </div>
      {!compact && exp.description ? (
        <p style={{ margin: 0, color: 'var(--ds-color-text-muted, #475569)', fontSize: '0.82rem', lineHeight: 1.4 }}>
          {exp.description.length > 180 ? `${exp.description.slice(0, 180)}…` : exp.description}
        </p>
      ) : null}
      <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', alignItems: 'center' }}>
        {durationLabel ? (
          <span
            style={{
              background: '#f1f5f9',
              color: 'var(--ds-color-text-muted, #475569)',
              padding: '0.05rem 0.4rem',
              borderRadius: 999,
              fontSize: '0.68rem',
              fontWeight: 600,
            }}
          >
            {durationLabel}
          </span>
        ) : null}
        {exp.operationalIntensity ? (
          <span
            style={{
              background: intensityColors[exp.operationalIntensity].bg,
              color: intensityColors[exp.operationalIntensity].text,
              padding: '0.05rem 0.4rem',
              borderRadius: 999,
              fontSize: '0.68rem',
              fontWeight: 600,
            }}
          >
            {exp.operationalIntensity.charAt(0) + exp.operationalIntensity.slice(1).toLowerCase()} pace
          </span>
        ) : null}
        <span
          style={{
            background: confidenceTone.bg,
            color: confidenceTone.text,
            border: `1px solid ${confidenceTone.border}`,
            padding: '0.05rem 0.45rem',
            borderRadius: 999,
            fontSize: '0.68rem',
            fontWeight: 600,
          }}
        >
          {exp.operationalConfidenceLabel}
        </span>
        {exp.familyFriendly ? (
          <span
            style={{ background: '#fef3c7', color: '#854d0e', padding: '0.05rem 0.4rem', borderRadius: 999, fontSize: '0.68rem', fontWeight: 600 }}
            title="Family-friendly"
          >
            👪 Family
          </span>
        ) : null}
        {exp.religiousSignificance ? (
          <span
            style={{ background: '#eef2ff', color: '#3730a3', padding: '0.05rem 0.4rem', borderRadius: 999, fontSize: '0.68rem', fontWeight: 600 }}
            title="Religious significance"
          >
            🕊 Religious
          </span>
        ) : null}
        {exp.popularWithGroups ? (
          <span
            style={{ background: '#f0f9ff', color: '#0c4a6e', padding: '0.05rem 0.4rem', borderRadius: 999, fontSize: '0.68rem', fontWeight: 600 }}
          >
            Popular with groups
          </span>
        ) : null}
      </div>
      {!compact && exp.recommendationReasons && exp.recommendationReasons.length > 0 ? (
        <p style={{ margin: 0, color: '#15803d', fontSize: '0.74rem' }}>
          Why recommended: {exp.recommendationReasons.join(' · ')}
        </p>
      ) : null}
      {!compact && exp.notes.length > 0 ? (
        <p style={{ margin: 0, color: '#64748b', fontSize: '0.78rem' }}>
          {exp.notes.join(' · ')}
        </p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// v2C — Suggested Transport section
// ---------------------------------------------------------------------------

function SuggestedTransportSection({
  transportData,
  loading,
  paxCount,
  quoteId,
}: {
  transportData: TransportSuggestionsResponse | null;
  loading: boolean;
  paxCount: number;
  quoteId: string;
}) {
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
              color: 'var(--ds-color-text-muted, #475569)',
              fontSize: '0.7rem',
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              margin: 0,
            }}
          >
            Suggested transport
          </p>
          <p style={{ margin: '0.2rem 0 0', color: '#64748b', fontSize: '0.82rem' }}>
            Vehicle sizing based on pax count + journey rhythm. Per-leg overlays surface route-specific
            risks (airport timing, mountain road, border crossing, desert logistics). Booking happens
            on the Transport tab — the link below jumps you there.
          </p>
        </div>
        <a
          href={`/quotes/${quoteId}?tab=transport`}
          style={{
            padding: '0.35rem 0.7rem',
            border: '1px solid #cbd5e1',
            borderRadius: 8,
            background: 'var(--ds-color-canvas, #F8FAFC)',
            color: '#0c4a6e',
            fontSize: '0.78rem',
            fontWeight: 600,
            textDecoration: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          Open standard transport selector →
        </a>
      </div>

      {loading && !transportData ? (
        <p style={{ marginTop: '0.6rem', color: '#64748b', fontSize: '0.85rem' }}>
          Reading routes + risk overlays for this journey…
        </p>
      ) : null}

      {paxCount === 0 ? (
        <p style={{ marginTop: '0.6rem', color: '#854d0e', fontSize: '0.82rem' }}>
          Pax count is 0 — fill in adults / children on the overview tab to unlock the vehicle recommendation.
        </p>
      ) : null}

      {transportData && transportData.recommendation ? (
        <div style={{ marginTop: '0.7rem', display: 'grid', gap: '0.75rem' }}>
          <TransportRecommendationCard recommendation={transportData.recommendation} paxCount={transportData.paxCount} />

          <TransportPacingCard pacing={transportData.pacing} />

          {transportData.legs.length > 0 ? (
            <div>
              <p
                style={{
                  color: 'var(--ds-color-text-muted, #475569)',
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  margin: '0 0 0.4rem',
                }}
              >
                Per-leg route confidence
              </p>
              <div style={{ display: 'grid', gap: '0.4rem' }}>
                {transportData.legs.map((leg, idx) => (
                  <LegOverlayRow key={`${leg.fromCity}-${leg.toCity}-${idx}`} leg={leg} />
                ))}
              </div>
            </div>
          ) : null}

          {transportData.notes.length > 0 ? (
            <ul style={{ margin: 0, paddingLeft: '1.25rem', color: '#64748b', fontSize: '0.82rem' }}>
              {transportData.notes.map((note, i) => (
                <li key={i}>{note}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {transportData && !transportData.recommendation && paxCount > 0 ? (
        <p style={{ marginTop: '0.6rem', color: '#854d0e', fontSize: '0.82rem' }}>
          Pax count {paxCount} is above the 45-seat coach capacity — split the group across multiple vehicles via the standard selector.
        </p>
      ) : null}
    </div>
  );
}

function TransportRecommendationCard({
  recommendation,
  paxCount,
}: {
  recommendation: TransportRecommendation;
  paxCount: number;
}) {
  const confidenceColors: Record<TransportRecommendation['operationalConfidenceLabel'], { bg: string; text: string; border: string }> = {
    'Operationally smooth': { bg: '#ecfdf3', text: '#067647', border: '#abefc6' },
    'Moderate coordination': { bg: '#eff6ff', text: '#1e40af', border: '#bfdbfe' },
    'High coordination required': { bg: '#fef3c7', text: '#854d0e', border: '#fde68a' },
  };
  const cc = confidenceColors[recommendation.operationalConfidenceLabel];
  return (
    <div
      style={{
        background: 'var(--ds-color-canvas, #F8FAFC)',
        border: '1px solid #e2e8f0',
        borderRadius: 10,
        padding: '0.85rem 1rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.85rem' }}>
        <div style={{ fontSize: '2.2rem', lineHeight: 1, flexShrink: 0 }} aria-hidden>
          {recommendation.icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.55rem', flexWrap: 'wrap' }}>
            <p style={{ margin: 0, color: 'var(--ds-color-text, #0F172A)', fontSize: '1.05rem', fontWeight: 700 }}>
              {recommendation.label}
            </p>
            <span style={{ color: '#64748b', fontSize: '0.82rem' }}>{recommendation.seatRange}</span>
            {recommendation.preferredOperationalChoice ? (
              <span
                style={{
                  background: '#fef3c7',
                  color: '#854d0e',
                  border: '1px solid #fde68a',
                  padding: '0.05rem 0.5rem',
                  borderRadius: 999,
                  fontSize: '0.68rem',
                  fontWeight: 700,
                }}
                title="Sweet-spot pax fit with no extreme journey legs — strongest operator-preferred match for this journey."
              >
                ⭐ Preferred operational choice
              </span>
            ) : null}
          </div>
          <p style={{ margin: '0.15rem 0 0', color: 'var(--ds-color-text-muted, #475569)', fontSize: '0.85rem' }}>
            Recommended for: <strong>{recommendation.recommendationLine}</strong>
          </p>
          <p style={{ margin: '0.2rem 0 0', color: '#64748b', fontSize: '0.78rem' }}>
            Typical examples: {recommendation.typicalExample}
          </p>
          <p style={{ margin: '0.25rem 0 0', color: 'var(--ds-color-text-muted, #475569)', fontSize: '0.78rem' }}>
            {recommendation.luggageNote}
          </p>
          <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginTop: '0.45rem' }}>
            <span
              style={{
                background: cc.bg,
                color: cc.text,
                border: `1px solid ${cc.border}`,
                padding: '0.1rem 0.55rem',
                borderRadius: 999,
                fontSize: '0.72rem',
                fontWeight: 700,
              }}
            >
              {recommendation.operationalConfidenceLabel === 'Operationally smooth' ? '🟢 ' :
                recommendation.operationalConfidenceLabel === 'Moderate coordination' ? '🔵 ' : '🟡 '}
              {recommendation.operationalConfidenceLabel}
            </span>
            <span style={{ color: '#64748b', fontSize: '0.72rem' }}>
              {paxCount} pax
            </span>
          </div>
          {recommendation.comfortNotes.length > 0 ? (
            <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.25rem', color: 'var(--ds-color-text-muted, #475569)', fontSize: '0.82rem', lineHeight: 1.45 }}>
              {recommendation.comfortNotes.map((note, i) => (
                <li key={i}>{note}</li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function TransportPacingCard({ pacing }: { pacing: TransportSuggestionsResponse['pacing'] }) {
  const tone = {
    calm: { bg: '#ecfdf3', text: '#067647', border: '#abefc6' },
    balanced: { bg: '#eff6ff', text: '#1e40af', border: '#bfdbfe' },
    intense: { bg: '#fef3c7', text: '#854d0e', border: '#fde68a' },
  }[pacing.tone];
  return (
    <div
      style={{
        background: '#fff',
        border: `1px solid ${tone.border}`,
        borderRadius: 8,
        padding: '0.55rem 0.75rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.55rem' }}>
        <span
          style={{
            background: tone.bg,
            color: tone.text,
            padding: '0.1rem 0.55rem',
            borderRadius: 999,
            fontSize: '0.78rem',
            fontWeight: 700,
          }}
        >
          {pacing.label}
        </span>
      </div>
      <p style={{ margin: '0.4rem 0 0', color: 'var(--ds-color-text-muted, #475569)', fontSize: '0.82rem', lineHeight: 1.45 }}>
        {pacing.explanation}
      </p>
    </div>
  );
}

function LegOverlayRow({ leg }: { leg: LegTransportInsight }) {
  const overlayColors = {
    blue: { bg: '#eff6ff', text: '#1e40af', border: '#bfdbfe' },
    amber: { bg: '#fef3c7', text: '#854d0e', border: '#fde68a' },
    red: { bg: '#fee2e2', text: '#7c2d12', border: '#fca5a5' },
  };
  return (
    <div
      style={{
        background: 'var(--ds-color-canvas, #F8FAFC)',
        border: '1px solid #e2e8f0',
        borderRadius: 8,
        padding: '0.5rem 0.7rem',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.5rem', flexWrap: 'wrap' }}>
        <p style={{ margin: 0, color: 'var(--ds-color-text, #0F172A)', fontSize: '0.88rem', fontWeight: 600 }}>
          {leg.fromCity} → {leg.toCity}
          {leg.canonicalCode ? (
            <code
              style={{
                marginLeft: '0.4rem',
                background: '#f1f5f9',
                color: 'var(--ds-color-text-muted, #475569)',
                padding: '0.05rem 0.35rem',
                borderRadius: 4,
                fontSize: '0.74rem',
              }}
            >
              {leg.canonicalCode}
            </code>
          ) : null}
        </p>
        {leg.driveHours != null ? (
          <span style={{ color: '#64748b', fontSize: '0.76rem' }}>
            {leg.driveHours}h
            {leg.distanceKm != null ? ` · ${leg.distanceKm} km` : ''}
          </span>
        ) : null}
      </div>
      {leg.overlays.length > 0 ? (
        <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', marginTop: '0.3rem' }}>
          {leg.overlays.map((o) => {
            const c = overlayColors[o.tone];
            return (
              <span
                key={o.key}
                style={{
                  background: c.bg,
                  color: c.text,
                  border: `1px solid ${c.border}`,
                  padding: '0.05rem 0.45rem',
                  borderRadius: 999,
                  fontSize: '0.68rem',
                  fontWeight: 600,
                }}
              >
                {o.label}
              </span>
            );
          })}
        </div>
      ) : (
        <p style={{ margin: '0.2rem 0 0', color: '#94a3b8', fontSize: '0.76rem' }}>
          Standard transfer · no special operational notes
        </p>
      )}
    </div>
  );
}
