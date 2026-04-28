import Link from 'next/link';

export default function QuoteDetailLoading() {
  return (
    <main className="page">
      <section className="panel workspace-panel">
        <div className="quote-dashboard-header">
          <div>
            <p className="eyebrow">Quote Detail</p>
            <h1>Loading quote</h1>
            <p className="detail-copy">Preparing the quote workspace.</p>
          </div>
          <Link href="/quotes" className="secondary-button">
            Back to quotes
          </Link>
        </div>

        <section className="quote-builder-layout">
          <div className="quote-builder-main">
            <article className="detail-card">
              <p className="eyebrow">Loading</p>
              <p className="detail-copy">Quote details are loading.</p>
            </article>
          </div>
          <aside className="quote-builder-sidebar">
            <article className="workspace-sidebar-card">
              <p className="eyebrow">Summary</p>
              <p className="detail-copy">Pricing and status will appear shortly.</p>
            </article>
          </aside>
        </section>
      </section>
    </main>
  );
}
