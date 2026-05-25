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
// "Wadi Rum" is detected before "Wadi" alone.
const DESTINATIONS = [
  'Amman',
  'Petra',
  'Wadi Rum',
  'Dead Sea',
  'Aqaba',
  'Jerash',
  'Madaba',
  'Mount Nebo',
  'Kerak',
  'Ajloun',
  'Umm Qais',
  'Bethany',
  'Beidha',
  'Shoubak',
  'Wadi Mujib',
];

type JourneyStop = {
  dayNumber: number;
  city: string;
  title: string;
  isNew: boolean; // first day in this city
};

function extractCity(title: string): string | null {
  const lower = String(title || '').toLowerCase();
  for (const dest of DESTINATIONS) {
    if (lower.includes(dest.toLowerCase())) return dest;
  }
  return null;
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
  if (!itineraries || itineraries.length === 0) return null;
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
        {markers.map((m, idx) => (
          <li key={`${m.city}-${idx}`} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <div
              style={{
                background: '#ffffff',
                border: '1px solid #cdd7cd',
                borderRadius: 999,
                padding: '0.4rem 0.8rem',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                minWidth: '5rem',
              }}
              title={`Day ${m.firstDay}${m.lastDay > m.firstDay ? `–${m.lastDay}` : ''}`}
            >
              <span style={{ color: '#3a5a3a', fontWeight: 700, fontSize: '0.88rem', lineHeight: 1.1 }}>
                {m.city}
              </span>
              <span style={{ color: '#6b7a6b', fontSize: '0.7rem', marginTop: '0.1rem' }}>
                {m.nights === 1 ? `Day ${m.firstDay}` : `${m.nights} nights`}
              </span>
            </div>
            {idx < markers.length - 1 ? (
              <span
                aria-hidden
                style={{
                  color: '#94a395',
                  fontSize: '1.1rem',
                  fontWeight: 700,
                  letterSpacing: '-0.05em',
                }}
              >
                →
              </span>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
