'use client';

type PublicQuoteErrorProps = {
  error: Error;
  reset: () => void;
};

export default function PublicQuoteError({ error, reset }: PublicQuoteErrorProps) {
  return (
    <main className="page">
      <section className="panel quote-preview-page quote-client-view">
        <div className="detail-card quote-client-error-card">
          <p className="eyebrow">Shared Quote</p>
          <h1 className="section-title">Unable to load this proposal</h1>
          <p className="detail-copy">{error.message || 'The shared quote could not be opened right now.'}</p>
          <div className="table-action-row">
            <button type="button" className="secondary-button" onClick={reset}>
              Try again
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
