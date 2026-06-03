// App-wide route fallback skeleton. Every admin page is force-dynamic (a full
// server render per navigation against a remote backend), so transitions can
// take a second or more on higher-latency connections. Without a loading
// boundary the browser shows nothing and the tab can read as "unresponsive".
// Next renders this instantly during the wait for any route that doesn't define
// its own loading.tsx, so navigation always feels responsive. Routes with a
// more specific loading.tsx (e.g. quotes list, quote detail) override this.

export default function AppLoading() {
  return (
    <main className="page" aria-busy="true">
      <section className="panel workspace-panel">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', padding: '0.5rem 0' }}>
          <p className="eyebrow">Loading</p>
          <h2 style={{ margin: 0 }}>One moment…</h2>
          <p className="detail-copy">Fetching the latest data.</p>
        </div>
      </section>
    </main>
  );
}
