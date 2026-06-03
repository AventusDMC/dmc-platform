// Instant route skeleton for the quotes LIST. The page is force-dynamic, so a
// navigation here waits on the server render (data fetch + the user's network
// round-trip). Without a loading.tsx the browser shows nothing and feels frozen
// ("page unresponsive"); this paints immediately so the navigation feels snappy.

function SkeletonBar({ width, height = 12 }: { width: string; height?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'block',
        width,
        height,
        borderRadius: 6,
        background: 'var(--ds-color-border, #E2E8F0)',
        opacity: 0.55,
      }}
    />
  );
}

export default function QuotesListLoading() {
  return (
    <main className="page" aria-busy="true">
      <section className="panel workspace-panel">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.4rem', padding: '0.25rem 0' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <p className="eyebrow">Sales</p>
            <h2 style={{ margin: 0 }}>Quotes</h2>
            <p className="detail-copy">Loading quotes…</p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {Array.from({ length: 8 }).map((_, index) => (
              <div
                key={index}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '2.2fr 1.6fr 1.3fr 0.9fr 1.6fr',
                  gap: '1.25rem',
                  alignItems: 'center',
                  padding: '0.85rem 0',
                  borderBottom: '1px solid var(--ds-color-border, #E2E8F0)',
                }}
              >
                <SkeletonBar width="72%" height={14} />
                <SkeletonBar width="60%" />
                <SkeletonBar width="55%" />
                <SkeletonBar width="44%" />
                <SkeletonBar width="82%" />
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
