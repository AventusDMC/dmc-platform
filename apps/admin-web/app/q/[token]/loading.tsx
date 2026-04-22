export default function PublicQuoteLoading() {
  return (
    <main className="page">
      <section className="panel quote-preview-page quote-client-view">
        <div className="quote-preview-hero quote-client-hero">
          <div className="quote-client-loading-card quote-client-loading-card-wide" />
          <div className="quote-client-loading-card" />
        </div>
        <div className="quote-preview-grid">
          <div className="quote-client-loading-card" />
          <div className="quote-client-loading-card" />
        </div>
        <div className="quote-client-loading-card quote-client-loading-card-tall" />
      </section>
    </main>
  );
}
