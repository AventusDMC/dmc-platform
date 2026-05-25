'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

// 7-step linear wizard. Step 1 + Step 2 are real (form + city picker).
// Steps 3-6 are scaffolded with friendly placeholder content + Continue
// buttons. Step 7 hands off to /quotes/new with the collected state in
// URL params so the advanced workspace can pre-fill.

type StepKey = 1 | 2 | 3 | 4 | 5 | 6 | 7;

const STEPS: Array<{ id: StepKey; label: string; description: string }> = [
  { id: 1, label: 'Trip Setup', description: 'Arrival, dates, pax, style' },
  { id: 2, label: 'Journey Structure', description: 'Cities & nights' },
  { id: 3, label: 'Hotels', description: 'Recommended accommodations' },
  { id: 4, label: 'Experiences', description: 'Activities per destination' },
  { id: 5, label: 'Transport', description: 'Transfer flow' },
  { id: 6, label: 'Pricing Review', description: 'Margin & confidence' },
  { id: 7, label: 'Generate', description: 'Finalise the proposal' },
];

const TRAVEL_STYLES = ['Comfort', 'Premium', 'Luxury', 'Budget-conscious'] as const;
const BUDGET_LEVELS = ['Standard', 'Mid-range', 'High-end', 'Ultra-premium'] as const;
const MARKETS = ['Europe', 'North America', 'GCC', 'Asia', 'Latin America', 'Other'] as const;

const CITY_LIBRARY: Array<{ name: string; icon: string; suggestedNights: number; rhythm: string }> = [
  { name: 'Amman', icon: '🏙', suggestedNights: 2, rhythm: 'Touring base' },
  { name: 'Petra', icon: '✦', suggestedNights: 2, rhythm: 'Heritage' },
  { name: 'Wadi Rum', icon: '🏜', suggestedNights: 1, rhythm: 'Adventure' },
  { name: 'Dead Sea', icon: '🏖', suggestedNights: 1, rhythm: 'Relaxation' },
  { name: 'Aqaba', icon: '🌊', suggestedNights: 2, rhythm: 'Coastal' },
  { name: 'Jerash', icon: '🏛', suggestedNights: 1, rhythm: 'Heritage' },
  { name: 'Madaba', icon: '✦', suggestedNights: 1, rhythm: 'Heritage' },
  { name: 'Mount Nebo', icon: '⛰', suggestedNights: 1, rhythm: 'Heritage' },
];

type TripSetup = {
  arrivalCity: string;
  arrivalDate: string;
  departureDate: string;
  adults: number;
  children: number;
  market: string;
  budgetLevel: string;
  travelStyle: string;
};

type JourneyCity = { name: string; nights: number };

export function GuidedQuoteBuilder() {
  const [step, setStep] = useState<StepKey>(1);
  const [trip, setTrip] = useState<TripSetup>({
    arrivalCity: 'Amman',
    arrivalDate: '',
    departureDate: '',
    adults: 2,
    children: 0,
    market: '',
    budgetLevel: '',
    travelStyle: '',
  });
  // Empty default — user builds the journey explicitly in Step 2. Hardcoded
  // defaults previously leaked into the footer counts before the user had
  // even reached Step 2 (Amman 2 + Petra 2 = 4 nights appeared even when
  // dates implied 9 nights).
  const [journey, setJourney] = useState<JourneyCity[]>([]);

  const totalPax = trip.adults + trip.children;
  const totalNights = journey.reduce((s, c) => s + c.nights, 0);
  // Compute trip duration from dates as the operator's "target" night count
  // — shown alongside configured nights so the discrepancy is visible.
  const tripNights = (() => {
    if (!trip.arrivalDate || !trip.departureDate) return null;
    const a = new Date(trip.arrivalDate).getTime();
    const d = new Date(trip.departureDate).getTime();
    if (!Number.isFinite(a) || !Number.isFinite(d) || d <= a) return null;
    return Math.round((d - a) / (24 * 60 * 60 * 1000));
  })();
  const stepIdx = STEPS.findIndex((s) => s.id === step);
  const canGoNext = step < 7;
  const canGoBack = step > 1;

  // Build the handoff URL — when the user hits "Generate", we route to
  // the advanced workspace with the collected setup as query params.
  // The existing /quotes/new can pre-fill from these (or this PR can
  // just deep-link with hints for v1).
  const handoffHref = useMemo(() => {
    const params = new URLSearchParams();
    params.set('source', 'guided');
    params.set('arrivalCity', trip.arrivalCity);
    params.set('arrivalDate', trip.arrivalDate);
    params.set('departureDate', trip.departureDate);
    params.set('adults', String(trip.adults));
    params.set('children', String(trip.children));
    params.set('market', trip.market);
    params.set('budget', trip.budgetLevel);
    params.set('style', trip.travelStyle);
    params.set('cities', journey.map((c) => `${c.name}:${c.nights}`).join(','));
    return `/quotes/new?${params.toString()}`;
  }, [trip, journey]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Progress strip */}
      <section
        style={{
          background: '#ffffff',
          border: '1px solid #e4e7ec',
          borderRadius: 10,
          padding: '0.75rem 1rem',
          display: 'flex',
          gap: '0.4rem',
          flexWrap: 'wrap',
        }}
        aria-label="Builder progress"
      >
        {STEPS.map((s, i) => {
          const isActive = s.id === step;
          const isComplete = i < stepIdx;
          const tone = isActive
            ? { bg: '#175cd3', text: '#ffffff', border: '#175cd3' }
            : isComplete
            ? { bg: '#ecfdf3', text: '#067647', border: '#12b76a' }
            : { bg: '#fafbfc', text: '#475467', border: '#d0d5dd' };
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setStep(s.id)}
              style={{
                background: tone.bg,
                color: tone.text,
                border: `1px solid ${tone.border}`,
                padding: '0.45rem 0.85rem',
                borderRadius: 999,
                fontWeight: 700,
                fontSize: '0.78rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
              }}
            >
              <span style={{ fontVariantNumeric: 'tabular-nums', opacity: 0.85 }}>{s.id}</span>
              <span>{s.label}</span>
            </button>
          );
        })}
      </section>

      {/* Step content */}
      <section
        style={{
          background: '#ffffff',
          border: '1px solid #e4e7ec',
          borderRadius: 12,
          padding: '1.25rem 1.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
        }}
      >
        <header>
          <p style={{ margin: 0, color: '#667085', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Step {step} of 7
          </p>
          <h2 style={{ margin: '0.2rem 0 0', color: '#101828' }}>{STEPS[stepIdx].label}</h2>
          <p style={{ margin: '0.3rem 0 0', color: '#667085', fontSize: '0.92rem' }}>{STEPS[stepIdx].description}</p>
        </header>

        {step === 1 ? <Step1TripSetup trip={trip} setTrip={setTrip} /> : null}
        {step === 2 ? <Step2Journey journey={journey} setJourney={setJourney} tripNights={tripNights} totalNights={totalNights} /> : null}
        {step === 3 ? <Step3Hotels journey={journey} /> : null}
        {step === 4 ? <ScaffoldStep title="Suggested Experiences" detail="In v2, this will group activities by destination (Petra, Wadi Rum, Dead Sea, Jerash …) and surface the most popular guided experiences per city." /> : null}
        {step === 5 ? <ScaffoldStep title="Transport Suggestions" detail="In v2, the platform will auto-propose a transfer flow based on the journey (Amman → Petra → Wadi Rum → …) using the existing transport-pricing rules. Operationally safe routing by default — no manual route configuration required." /> : null}
        {step === 6 ? <Step6Review trip={trip} journey={journey} totalPax={totalPax} totalNights={totalNights} /> : null}
        {step === 7 ? <Step7Generate handoffHref={handoffHref} totalPax={totalPax} totalNights={totalNights} journey={journey} /> : null}

        {/* Navigation */}
        <footer style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', borderTop: '1px solid #f2f4f7', paddingTop: '0.85rem', marginTop: '0.5rem' }}>
          <button
            type="button"
            onClick={() => canGoBack && setStep((step - 1) as StepKey)}
            disabled={!canGoBack}
            style={{
              background: '#ffffff',
              color: canGoBack ? '#175cd3' : '#98a2b3',
              border: `1px solid ${canGoBack ? '#84caff' : '#d0d5dd'}`,
              padding: '0.5rem 1rem',
              borderRadius: 8,
              fontWeight: 600,
              cursor: canGoBack ? 'pointer' : 'not-allowed',
            }}
          >
            ← Back
          </button>
          <span style={{ color: '#667085', fontSize: '0.85rem' }}>
            {totalPax} pax · {journey.length} stop{journey.length === 1 ? '' : 's'}
            {' · '}
            {tripNights != null && tripNights !== totalNights ? (
              <span>
                {totalNights || 0}/{tripNights} nights configured
              </span>
            ) : (
              <span>{totalNights || '—'} nights</span>
            )}
          </span>
          {canGoNext ? (
            <button
              type="button"
              onClick={() => setStep((step + 1) as StepKey)}
              style={{
                background: '#175cd3',
                color: '#ffffff',
                border: '1px solid #175cd3',
                padding: '0.5rem 1rem',
                borderRadius: 8,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Continue →
            </button>
          ) : (
            <span style={{ width: '5rem' }} />
          )}
        </footer>
      </section>

      {/* Quiet operational confidence indicator (per spec #7) */}
      <ConfidenceIndicator totalPax={totalPax} journeyLength={journey.length} totalNights={totalNights} />
    </div>
  );
}

function Step1TripSetup({ trip, setTrip }: { trip: TripSetup; setTrip: (next: TripSetup) => void }) {
  const update = (patch: Partial<TripSetup>) => setTrip({ ...trip, ...patch });
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
      <Field label="Arrival city">
        <input value={trip.arrivalCity} onChange={(e) => update({ arrivalCity: e.target.value })} placeholder="Amman" />
      </Field>
      <Field label="Arrival date">
        <input type="date" value={trip.arrivalDate} onChange={(e) => update({ arrivalDate: e.target.value })} />
      </Field>
      <Field label="Departure date">
        <input type="date" value={trip.departureDate} onChange={(e) => update({ departureDate: e.target.value })} />
      </Field>
      <Field label="Adults">
        <input type="number" min={1} value={trip.adults} onChange={(e) => update({ adults: Math.max(1, Number(e.target.value) || 1) })} />
      </Field>
      <Field label="Children">
        <input type="number" min={0} value={trip.children} onChange={(e) => update({ children: Math.max(0, Number(e.target.value) || 0) })} />
      </Field>
      <Field label="Source market">
        <select value={trip.market} onChange={(e) => update({ market: e.target.value })}>
          <option value="">Select…</option>
          {MARKETS.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </Field>
      <Field label="Budget level">
        <select value={trip.budgetLevel} onChange={(e) => update({ budgetLevel: e.target.value })}>
          <option value="">Select…</option>
          {BUDGET_LEVELS.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
      </Field>
      <Field label="Travel style">
        <select value={trip.travelStyle} onChange={(e) => update({ travelStyle: e.target.value })}>
          <option value="">Select…</option>
          {TRAVEL_STYLES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </Field>
    </div>
  );
}

function Step2Journey({
  journey,
  setJourney,
  tripNights,
  totalNights,
}: {
  journey: JourneyCity[];
  setJourney: (next: JourneyCity[]) => void;
  tripNights: number | null;
  totalNights: number;
}) {
  const addCity = (city: typeof CITY_LIBRARY[number]) => {
    if (journey.find((c) => c.name === city.name)) return;
    setJourney([...journey, { name: city.name, nights: city.suggestedNights }]);
  };
  const removeCity = (name: string) => setJourney(journey.filter((c) => c.name !== name));
  const updateNights = (name: string, nights: number) => setJourney(journey.map((c) => (c.name === name ? { ...c, nights: Math.max(0, nights) } : c)));
  const moveUp = (idx: number) => {
    if (idx === 0) return;
    const next = [...journey];
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
    setJourney(next);
  };
  const moveDown = (idx: number) => {
    if (idx >= journey.length - 1) return;
    const next = [...journey];
    [next[idx + 1], next[idx]] = [next[idx], next[idx + 1]];
    setJourney(next);
  };

  // Surface the trip duration so the operator has a target to fill toward.
  // Calm tone — sage when matched, sand when over/under, dashed neutral
  // when dates aren't set yet.
  const nightsBanner = (() => {
    if (tripNights == null) {
      return { bg: '#fafbfc', border: '#d0d5dd', text: '#667085', text2: 'Set arrival + departure dates in Step 1 to see the target.' };
    }
    if (totalNights === tripNights) {
      return { bg: '#f5f8f5', border: '#cdd7cd', text: '#3a5a3a', text2: `Matches the trip duration (${tripNights} nights).` };
    }
    const diff = totalNights - tripNights;
    const word = diff > 0 ? 'over' : 'under';
    return {
      bg: '#fbf9f4',
      border: '#e8dcc4',
      text: '#6b5933',
      text2: `${Math.abs(diff)} night${Math.abs(diff) === 1 ? '' : 's'} ${word} the trip duration of ${tripNights}.`,
    };
  })();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div
        style={{
          background: nightsBanner.bg,
          border: `1px solid ${nightsBanner.border}`,
          borderRadius: 8,
          padding: '0.55rem 0.85rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: '0.75rem',
          flexWrap: 'wrap',
        }}
      >
        <strong style={{ color: nightsBanner.text, fontSize: '0.9rem' }}>
          {tripNights == null
            ? 'Trip duration · pending'
            : `Journey nights: ${totalNights}${tripNights != null ? ` / ${tripNights} target` : ''}`}
        </strong>
        <span style={{ color: nightsBanner.text, fontSize: '0.8rem', opacity: 0.85 }}>{nightsBanner.text2}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        <p style={{ margin: 0, color: '#475467', fontSize: '0.85rem' }}>
          Add cities in the order the guests will travel. Recommended night counts are pre-filled — adjust to match the trip duration.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
          {CITY_LIBRARY.map((c) => {
            const added = Boolean(journey.find((j) => j.name === c.name));
            return (
              <button
                key={c.name}
                type="button"
                onClick={() => (added ? removeCity(c.name) : addCity(c))}
                style={{
                  background: added ? '#3a5a3a' : '#ffffff',
                  color: added ? '#ffffff' : '#3a5a3a',
                  border: `1px solid ${added ? '#3a5a3a' : '#cdd7cd'}`,
                  padding: '0.4rem 0.75rem',
                  borderRadius: 999,
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                }}
              >
                <span aria-hidden>{c.icon}</span>
                <span>{c.name}</span>
                <span style={{ opacity: 0.7, fontSize: '0.72rem' }}>· {c.rhythm}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
        <h3 style={{ margin: 0, fontSize: '0.95rem' }}>Selected journey ({journey.length} stop{journey.length === 1 ? '' : 's'})</h3>
        {journey.length === 0 ? (
          <p style={{ color: '#667085', fontSize: '0.85rem', margin: 0 }}>Pick at least one city above to start building the trip.</p>
        ) : (
          <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {journey.map((c, idx) => {
              const lib = CITY_LIBRARY.find((l) => l.name === c.name);
              return (
                <li key={c.name} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', background: '#f5f8f5', border: '1px solid #cdd7cd', borderRadius: 8, padding: '0.5rem 0.75rem' }}>
                  <span style={{ fontWeight: 700, color: '#6b7a6b', fontVariantNumeric: 'tabular-nums', minWidth: '1.5rem' }}>{idx + 1}.</span>
                  <span style={{ fontSize: '1.05rem' }} aria-hidden>{lib?.icon || '✦'}</span>
                  <strong style={{ color: '#3a5a3a', flex: 1 }}>{c.name}</strong>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', color: '#475467' }}>
                    Nights:
                    <input type="number" min={0} value={c.nights} onChange={(e) => updateNights(c.name, Number(e.target.value) || 0)} style={{ width: '4rem' }} />
                  </label>
                  <button type="button" onClick={() => moveUp(idx)} disabled={idx === 0} style={navBtn(idx === 0)}>↑</button>
                  <button type="button" onClick={() => moveDown(idx)} disabled={idx >= journey.length - 1} style={navBtn(idx >= journey.length - 1)}>↓</button>
                  <button type="button" onClick={() => removeCity(c.name)} style={{ ...navBtn(false), color: '#b42318', borderColor: '#f04438' }}>✕</button>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}

function navBtn(disabled: boolean) {
  return {
    background: '#ffffff',
    color: disabled ? '#98a2b3' : '#475467',
    border: `1px solid ${disabled ? '#e4e7ec' : '#d0d5dd'}`,
    padding: '0.25rem 0.55rem',
    borderRadius: 6,
    fontWeight: 700,
    fontSize: '0.78rem',
    cursor: disabled ? 'not-allowed' : 'pointer',
  } as const;
}

type HotelOption = { id: string; name: string; city: string; category: string };

function Step3Hotels({ journey }: { journey: JourneyCity[] }) {
  const [hotels, setHotels] = useState<HotelOption[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/hotels', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: HotelOption[]) => {
        if (!cancelled) setHotels(Array.isArray(data) ? data : []);
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message || String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (journey.length === 0) {
    return (
      <div
        style={{
          background: '#fbf9f4',
          border: '1px dashed #e8dcc4',
          borderRadius: 10,
          padding: '1.25rem 1.5rem',
          textAlign: 'center',
          color: '#6b5933',
        }}
      >
        <strong>Add cities in Step 2 first</strong>
        <p style={{ margin: '0.4rem 0 0', fontSize: '0.88rem' }}>
          Recommendations group hotels by the cities you've chosen for the journey.
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ background: '#fef3f2', border: '1px solid #f04438', borderRadius: 10, padding: '1rem', color: '#b42318' }}>
        Could not load hotel catalogue: {error}
      </div>
    );
  }
  if (hotels === null) {
    return <p style={{ color: '#667085', fontSize: '0.9rem' }}>Loading hotel catalogue…</p>;
  }

  const byCity = new Map<string, HotelOption[]>();
  for (const h of hotels) {
    const city = (h.city || '').trim();
    if (!city) continue;
    byCity.set(city, [...(byCity.get(city) || []), h]);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <p style={{ margin: 0, color: '#475467', fontSize: '0.85rem' }}>
        Hotels from the platform catalogue, grouped by the cities in your journey. Operator picks during the final advanced workspace step.
      </p>
      {journey.map((j) => {
        // Match case-insensitive, allow partial (e.g. "Mount Nebo" matching "Madaba/Nebo region").
        const matches = [...byCity.entries()]
          .filter(([city]) => city.toLowerCase().includes(j.name.toLowerCase()) || j.name.toLowerCase().includes(city.toLowerCase()))
          .flatMap(([, list]) => list)
          .slice(0, 6);
        return (
          <div
            key={j.name}
            style={{
              background: '#f5f8f5',
              border: '1px solid #cdd7cd',
              borderRadius: 10,
              padding: '0.75rem 1rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.75rem' }}>
              <strong style={{ color: '#3a5a3a', fontSize: '0.95rem' }}>{j.name}</strong>
              <span style={{ color: '#6b7a6b', fontSize: '0.78rem' }}>
                {j.nights} night{j.nights === 1 ? '' : 's'} · {matches.length} hotel{matches.length === 1 ? '' : 's'} in catalogue
              </span>
            </div>
            {matches.length === 0 ? (
              <p style={{ margin: 0, color: '#94a395', fontSize: '0.85rem' }}>
                No hotels matching "{j.name}" in the catalogue. Add hotels via Product Catalog → Hotels.
              </p>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                {matches.map((h) => (
                  <li
                    key={h.id}
                    style={{
                      background: '#ffffff',
                      border: '1px solid #cdd7cd',
                      borderRadius: 6,
                      padding: '0.4rem 0.7rem',
                      fontSize: '0.85rem',
                      color: '#3a5a3a',
                    }}
                  >
                    <strong style={{ fontWeight: 600 }}>{h.name}</strong>
                    {h.category ? <span style={{ color: '#6b7a6b', marginLeft: '0.4rem', fontSize: '0.78rem' }}>· {h.category}</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
      <p style={{ margin: 0, color: '#94a395', fontSize: '0.75rem', fontStyle: 'italic' }}>
        Operator finalises hotel selection in the advanced workspace at Step 7. Supplier reliability scoring lands in v2.
      </p>
    </div>
  );
}

function ScaffoldStep({ title, detail }: { title: string; detail: string }) {
  return (
    <div
      style={{
        background: '#fafbfc',
        border: '1px dashed #d0d5dd',
        borderRadius: 10,
        padding: '1.25rem 1.5rem',
        textAlign: 'center',
      }}
    >
      <strong style={{ color: '#475467', fontSize: '1rem' }}>{title}</strong>
      <p style={{ margin: '0.5rem 0 0', color: '#667085', fontSize: '0.88rem', maxWidth: '40rem', marginLeft: 'auto', marginRight: 'auto' }}>
        {detail}
      </p>
      <p style={{ margin: '0.75rem 0 0', color: '#98a2b3', fontSize: '0.78rem', fontStyle: 'italic' }}>
        v1 scaffold — click Continue to proceed. The advanced workspace at the end lets you configure this fully.
      </p>
    </div>
  );
}

function Step6Review({ trip, journey, totalPax, totalNights }: { trip: TripSetup; journey: JourneyCity[]; totalPax: number; totalNights: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
      <div
        style={{
          background: '#f5f8f5',
          border: '1px solid #cdd7cd',
          borderRadius: 10,
          padding: '1rem',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '0.6rem',
        }}
      >
        <Stat label="Pax" value={totalPax} />
        <Stat label="Nights" value={totalNights} />
        <Stat label="Stops" value={journey.length} />
        <Stat label="Style" value={trip.travelStyle || 'Standard'} />
        <Stat label="Budget" value={trip.budgetLevel || '—'} />
        <Stat label="Market" value={trip.market || '—'} />
      </div>
      <p style={{ color: '#667085', fontSize: '0.85rem', margin: 0 }}>
        Pricing breakdown will populate in v2 once recommendation steps land. For now, complete the quote in the advanced workspace on the next step
        — the engine will compute totals, margin, and operational confidence from the data you've already entered.
      </p>
    </div>
  );
}

function Step7Generate({ handoffHref, totalPax, totalNights, journey }: { handoffHref: string; totalPax: number; totalNights: number; journey: JourneyCity[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', alignItems: 'flex-start' }}>
      <div
        style={{
          background: '#ecfdf3',
          border: '1px solid #12b76a',
          borderRadius: 10,
          padding: '1rem 1.25rem',
          color: '#067647',
        }}
      >
        <strong style={{ fontSize: '1rem' }}>Trip outline ready.</strong>
        <p style={{ margin: '0.3rem 0 0', fontSize: '0.88rem' }}>
          {totalPax} pax · {totalNights} nights · {journey.map((c) => c.name).join(' → ')}
        </p>
      </div>
      <p style={{ color: '#475467', fontSize: '0.9rem', margin: 0 }}>
        Click <strong>Open in Advanced Workspace</strong> to finalise pricing, configure suppliers, and generate the client-ready proposal. Your
        guided-builder inputs travel through as URL hints so the advanced workspace can pre-fill where possible.
      </p>
      <Link
        href={handoffHref}
        style={{
          background: '#175cd3',
          color: '#ffffff',
          padding: '0.65rem 1.25rem',
          borderRadius: 10,
          fontWeight: 700,
          fontSize: '0.95rem',
          textDecoration: 'none',
        }}
      >
        Open in Advanced Workspace →
      </Link>
    </div>
  );
}

function ConfidenceIndicator({ totalPax, journeyLength, totalNights }: { totalPax: number; journeyLength: number; totalNights: number }) {
  // Heuristic confidence: simple thresholds. v2 will pull from the
  // QuoteIntelligence service after the quote is created.
  let label = 'Smooth Logistics Flow';
  let tone = { bg: '#f5f8f5', text: '#3a5a3a', border: '#cdd7cd' };
  if (journeyLength >= 5 || totalNights >= 10 || totalPax >= 20) {
    label = 'High Coordination Required';
    tone = { bg: '#fbf6ea', text: '#8b5e34', border: '#e8d5a8' };
  } else if (journeyLength >= 3 || totalNights >= 6 || totalPax >= 8) {
    label = 'Moderate Coordination';
    tone = { bg: '#fbf9f4', text: '#6b5933', border: '#e8dcc4' };
  }
  return (
    <section
      style={{
        background: tone.bg,
        border: `1px solid ${tone.border}`,
        borderRadius: 10,
        padding: '0.6rem 0.9rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        gap: '0.75rem',
        flexWrap: 'wrap',
      }}
    >
      <span style={{ color: tone.text, fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        Operational Confidence
      </span>
      <strong style={{ color: tone.text, fontSize: '0.95rem' }}>{label}</strong>
      <span style={{ color: tone.text, fontSize: '0.78rem', opacity: 0.85 }}>
        Heuristic based on pax + stops + nights. Refined once recommendation steps are wired.
      </span>
    </section>
  );
}

function Field({ label, children }: { label: string; children: any }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
      <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#475467', letterSpacing: '0.05em', textTransform: 'uppercase' }}>{label}</span>
      {children}
    </label>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
      <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#6b7a6b', letterSpacing: '0.04em', textTransform: 'uppercase' }}>{label}</span>
      <strong style={{ fontSize: '1.15rem', color: '#3a5a3a' }}>{value}</strong>
    </div>
  );
}
