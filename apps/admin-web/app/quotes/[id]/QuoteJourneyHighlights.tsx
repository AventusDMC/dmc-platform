// Journey Highlights — pulls the "experiences" out of the quote items
// (activities + excursions) and surfaces them as a calm summary card
// above the workflow stepper. Spec task #3: visually separate core
// experiences from operational detail.
//
// Server component, no fetch needed — operates on quoteItems already
// loaded by the quote page. Activity name is the key field; items
// without a recognisable experience name (pure transfers, hotel rows,
// meal services) are filtered out.

type QuoteItemLike = {
  id: string;
  activity?: { name: string } | null;
  // Some items carry their experience name via different fields depending
  // on whether they came from the activity catalogue, an excursion
  // template, or a manual line. Read defensively.
  pricingDescription?: string | null;
};

export function QuoteJourneyHighlights({ items }: { items: QuoteItemLike[] }) {
  if (!items || items.length === 0) return null;

  // Filter to items that look like experiences (have an activity name).
  // De-dupe by display name so "Petra Full Day" doesn't appear 3 times
  // because it was sold to 3 different rate variants.
  const seen = new Set<string>();
  const highlights: Array<{ name: string }> = [];
  for (const item of items) {
    const name = item.activity?.name?.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    highlights.push({ name });
  }

  if (highlights.length === 0) return null;

  return (
    <section
      style={{
        background: '#fbf9f4',
        border: '1px solid #e8dcc4',
        borderRadius: 10,
        padding: '0.85rem 1rem',
        marginBottom: '1rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.55rem',
      }}
      aria-label="Journey highlights"
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.6rem', flexWrap: 'wrap' }}>
        <span
          style={{
            color: '#8b7a55',
            fontSize: '0.72rem',
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          Journey Highlights
        </span>
        <strong style={{ color: '#6b5933', fontSize: '0.92rem' }}>
          {highlights.length} core experience{highlights.length === 1 ? '' : 's'}
        </strong>
      </div>
      <ul
        style={{
          listStyle: 'none',
          padding: 0,
          margin: 0,
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.4rem',
        }}
      >
        {highlights.slice(0, 12).map((h, i) => (
          <li
            key={i}
            style={{
              background: '#ffffff',
              border: '1px solid #e8dcc4',
              borderRadius: 999,
              padding: '0.3rem 0.7rem',
              color: '#6b5933',
              fontSize: '0.82rem',
              fontWeight: 600,
            }}
          >
            ✦ {h.name}
          </li>
        ))}
        {highlights.length > 12 ? (
          <li style={{ color: '#8b7a55', fontSize: '0.82rem', alignSelf: 'center' }}>
            + {highlights.length - 12} more
          </li>
        ) : null}
      </ul>
    </section>
  );
}
