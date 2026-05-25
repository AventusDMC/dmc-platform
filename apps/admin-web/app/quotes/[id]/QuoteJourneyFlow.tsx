// Journey Flow Visualization — renders the trip as a horizontal city flow
// (Amman → Petra → Wadi Rum → Dead Sea) above the existing day cards.
// Server component, no fetch required — operates on the itineraries prop
// already loaded by the quote page.
//
// Design intent (Quote Journey Orchestration v1 spec):
//   * Travel-journey reading (not service stack)
//   * Subtle connectors between stops
//   * Calm commercial palette — sage/sand tones, same family as the
//     Quote Readiness panel
//   * Compact — sits at the top of the quote, doesn't displace existing
//     itinerary content
//
// City extraction is heuristic v1 — match against a known shortlist of
// destinations against the day's `title` text. Refine later once we
// have a destination model on the itinerary day.

type ItineraryDay = {
  id: string;
  dayNumber: number;
  title: string;
};

// Known Jordan destination keywords — match in priority order so
// "Wadi Rum" is detected before "Wadi" alone. Each carries a subtle
// glyph that reinforces travel identity in the flow (spec task #10:
// destination iconography hooks, no large media galleries).
const DESTINATIONS: Array<{ name: string; icon: string; rhythm: JourneyRhythm }> = [
  { name: 'Wadi Rum', icon: '🏜', rhythm: 'adventure' },
  { name: 'Dead Sea', icon: '🏖', rhythm: 'relaxation' },
  { name: 'Mount Nebo', icon: '⛰', rhythm: 'touring' },
  { name: 'Wadi Mujib', icon: '🏞', rhythm: 'adventure' },
  { name: 'Umm Qais', icon: '🏛', rhythm: 'touring' },
  { name: 'Bethany', icon: '✦', rhythm: 'touring' },
  { name: 'Beidha', icon: '✦', rhythm: 'touring' },
  { name: 'Shoubak', icon: '🏰', rhythm: 'touring' },
  { name: 'Amman', icon: '🏙', rhythm: 'touring' },
  { name: 'Petra', icon: '✦', rhythm: 'touring' },
  { name: 'Aqaba', icon: '🌊', rhythm: 'relaxation' },
  { name: 'Jerash', icon: '🏛', rhythm: 'touring' },
  { name: 'Madaba', icon: '✦', rhythm: 'touring' },
  { name: 'Kerak', icon: '🏰', rhythm: 'touring' },
  { name: 'Ajloun', icon: '🏰', rhythm: 'touring' },
];

type JourneyRhythm = 'arrival' | 'touring' | 'adventure' | 'relaxation' | 'departure';

const RHYTHM_TONE: Record<JourneyRhythm, { bg: string; text: string; label: string }> = {
  arrival: { bg: '#e6f0e6', text: '#3a5a3a', label: 'Arrival' },
  touring: { bg: '#eef3eb', text: '#5c6b50', label: 'Touring' },
  adventure: { bg: '#f5ead8', text: '#7a5a30', label: 'Adventure' },
  relaxation: { bg: '#e4eef0', text: '#3f5a60', label: 'Relaxation' },
  departure: { bg: '#e6f0e6', text: '#3a5a3a', label: 'Departure' },
};

type JourneyStop = {
  dayNumber: number;
  city: string;
  title: string;
  isNew: boolean; // first day in this city
};

function extractCity(title: string): string | null {
  const lower = String(title || '').toLowerCase();
  for (const dest of DESTINATIONS) {
    if (lower.includes(dest.name.toLowerCase())) return dest.name;
  }
  return null;
}

function destinationMeta(city: string): { icon: string; rhythm: JourneyRhythm } {
  const found = DESTINATIONS.find((d) => d.name === city);
  return found ? { icon: found.icon, rhythm: found.rhythm } : { icon: '✦', rhythm: 'touring' };
}

function buildJourney(itineraries: ItineraryDay[]): JourneyStop[] {
  const sorted = [...itineraries].sort((a, b) => a.dayNumber - b.dayNumber);
  let lastCity: string | null = null;
  const stops: JourneyStop[] = [];
  for (const day of sorted) {
    const city: string = extractCity(day.title) || lastCity || '—';
    stops.push({
      dayNumber: day.dayNumber,
      city,
      title: day.title,
      isNew: city !== lastCity,
    });
    lastCity = city;
  }
  return stops;
}

export function QuoteJourneyFlow({ itineraries }: { itineraries: ItineraryDay[] }) {
  // Empty-state: render a quiet placeholder so the feature is visible
  // even when no itinerary days exist yet (operator knows it's coming
  // once they add days to the itinerary).
  if (!itineraries || itineraries.length === 0) {
    return (
      <section
        style={{
          background: '#f5f8f5',
          border: '1px dashed #cdd7cd',
          borderRadius: 10,
          padding: '0.75rem 1rem',
          marginBottom: '1rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: '0.75rem',
          flexWrap: 'wrap',
        }}
      >
        <span
          style={{
            color: '#6b7a6b',
            fontSize: '0.72rem',
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          Journey Flow
        </span>
        <span style={{ color: '#94a395', fontSize: '0.85rem' }}>
          Add itinerary days to see the trip rendered as a city flow (Amman → Petra → Dead Sea …)
        </span>
      </section>
    );
  }
  const stops = buildJourney(itineraries);
  // Compress consecutive same-city stays into a single visual marker with
  // a night count — operator sees the journey, not Day-N noise.
  type FlowMarker = { city: string; firstDay: number; lastDay: number; nights: number };
  const markers: FlowMarker[] = [];
  for (const stop of stops) {
    const last = markers[markers.length - 1];
    if (last && last.city === stop.city) {
      last.lastDay = stop.dayNumber;
      last.nights += 1;
    } else {
      markers.push({ city: stop.city, firstDay: stop.dayNumber, lastDay: stop.dayNumber, nights: 1 });
    }
  }

  return (
    <section
      style={{
        background: '#f5f8f5',
        border: '1px solid #cdd7cd',
        borderRadius: 10,
        padding: '0.85rem 1rem',
        marginBottom: '1rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.65rem',
      }}
      aria-label="Journey flow"
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div>
          <span
            style={{
              color: '#6b7a6b',
              fontSize: '0.72rem',
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              marginRight: '0.6rem',
            }}
          >
            Journey Flow
          </span>
          <strong style={{ color: '#3a5a3a', fontSize: '0.95rem' }}>
            {markers.length === 1 ? `${markers[0].city} only` : `${markers.length} stops · ${stops.length} days`}
          </strong>
        </div>
        <span style={{ color: '#6b7a6b', fontSize: '0.75rem' }}>v1 destination heuristic</span>
      </div>

      {/* Journey rhythm strip — subtle pace tags (Arrival / Touring /
          Adventure / Relaxation / Departure) derived from the city
          rhythm metadata. De-duplicates consecutive same-rhythm tags
          so the trip reads as a sequence of moods, not noise.
          Spec task #6: elegant journey rhythm. */}
      {(() => {
        const rhythmSequence: JourneyRhythm[] = ['arrival'];
        for (const m of markers) {
          const r = destinationMeta(m.city).rhythm;
          if (rhythmSequence[rhythmSequence.length - 1] !== r) rhythmSequence.push(r);
        }
        rhythmSequence.push('departure');
        return (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', alignItems: 'center' }}>
            {rhythmSequence.map((r, i) => {
              const tone = RHYTHM_TONE[r];
              return (
                <span key={`${r}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <span
                    style={{
                      background: tone.bg,
                      color: tone.text,
                      padding: '0.15rem 0.55rem',
                      borderRadius: 4,
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                    }}
                  >
                    {tone.label}
                  </span>
                  {i < rhythmSequence.length - 1 ? (
                    <span aria-hidden style={{ color: '#cdd7cd', fontSize: '0.7rem' }}>·</span>
                  ) : null}
                </span>
              );
            })}
          </div>
        );
      })()}

      <ol
        style={{
          listStyle: 'none',
          padding: 0,
          margin: 0,
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.3rem',
          alignItems: 'center',
        }}
      >
        {/* Arrival marker — spec #1: arrival/departure markers frame the journey */}
        <li style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
          <div
            style={{
              background: '#3a5a3a',
              color: '#ffffff',
              borderRadius: 999,
              padding: '0.4rem 0.7rem',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              minWidth: '4.5rem',
            }}
            title="Trip start"
          >
            <span style={{ fontWeight: 800, fontSize: '0.85rem', lineHeight: 1.1 }}>✈ Arrival</span>
            <span style={{ fontSize: '0.68rem', opacity: 0.85, marginTop: '0.1rem' }}>Day 1</span>
          </div>
          <span aria-hidden style={{ color: '#94a395', fontSize: '1.1rem', fontWeight: 700, letterSpacing: '-0.05em' }}>→</span>
        </li>
        {markers.map((m, idx) => {
          const meta = destinationMeta(m.city);
          return (
            <li key={`${m.city}-${idx}`} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <div
                style={{
                  background: '#ffffff',
                  border: '1px solid #cdd7cd',
                  borderRadius: 999,
                  padding: '0.4rem 0.85rem',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  minWidth: '5.5rem',
                }}
                title={`Day ${m.firstDay}${m.lastDay > m.firstDay ? `–${m.lastDay}` : ''} · ${RHYTHM_TONE[meta.rhythm].label}`}
              >
                <span style={{ color: '#3a5a3a', fontWeight: 700, fontSize: '0.88rem', lineHeight: 1.1, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <span aria-hidden style={{ fontSize: '0.9rem' }}>{meta.icon}</span>
                  {m.city}
                </span>
                <span style={{ color: '#6b7a6b', fontSize: '0.7rem', marginTop: '0.1rem' }}>
                  {m.nights === 1 ? `Day ${m.firstDay}` : `${m.nights} nights`}
                </span>
              </div>
              <span aria-hidden style={{ color: '#94a395', fontSize: '1.1rem', fontWeight: 700, letterSpacing: '-0.05em' }}>→</span>
            </li>
          );
        })}
        {/* Departure marker */}
        <li style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
          <div
            style={{
              background: '#3a5a3a',
              color: '#ffffff',
              borderRadius: 999,
              padding: '0.4rem 0.7rem',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              minWidth: '4.5rem',
            }}
            title="Trip end"
          >
            <span style={{ fontWeight: 800, fontSize: '0.85rem', lineHeight: 1.1 }}>✈ Departure</span>
            <span style={{ fontSize: '0.68rem', opacity: 0.85, marginTop: '0.1rem' }}>
              Day {stops[stops.length - 1]?.dayNumber || itineraries.length}
            </span>
          </div>
        </li>
      </ol>
    </section>
  );
}
