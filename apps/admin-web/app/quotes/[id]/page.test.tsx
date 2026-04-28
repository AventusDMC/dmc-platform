import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { getDefaultProposalPreviewHref, getQuoteExportPdfHref } from './proposal-paths';

const pageSource = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');
const versionPageSource = readFileSync(new URL('./versions/[versionId]/page.tsx', import.meta.url), 'utf8');
const cssSource = readFileSync(new URL('../../globals.css', import.meta.url), 'utf8');

function expectSourceContains(source: string, fragments: string[]) {
  for (const fragment of fragments) {
    assert.ok(source.includes(fragment), `Expected source to contain: ${fragment}`);
  }
}

describe('quote detail page regression', () => {
  it('renders the redesigned quote header with key quote metadata', () => {
    expectSourceContains(pageSource, [
      '<p className="eyebrow">Quote {quoteNumberLabel}</p>',
      '<h1>{quote.title}</h1>',
      '<QuoteBuilderStatusBadge status={quote.status} expired={quoteExpired} />',
      '<div><span>Client</span><strong>{quote.company.name}</strong></div>',
      '<div><span>Contact</span><strong>{quote.contact.firstName} {quote.contact.lastName}</strong></div>',
      '<div><span>Destination</span><strong>{destination}</strong></div>',
      '<div><span>Dates</span><strong>{travelDates}</strong></div>',
      '<div><span>Pax</span><strong>{totalPax} pax</strong></div>',
      '<div><span>Revision</span><strong>Rev {quote.revisionNumber ?? 1}</strong></div>',
    ]);
  });

  it('keeps existing quote actions visible and wired to their current components/routes', () => {
    expectSourceContains(pageSource, [
      '<SaveQuoteVersionButton apiBaseUrl={ACTION_API_BASE_URL} quoteId={quote.id} />',
      '<DownloadPdfButton apiBaseUrl={ACTION_API_BASE_URL} quoteId={quote.id} />',
      'summary="Accept"',
      '<QuoteStatusForm',
      '<ConvertToBookingButton quoteId={quote.id} label="Convert" />',
      '<ConvertToBookingButton quoteId={quote.id} />',
      '<ReviseQuoteButton quoteId={quote.id} disabled={quoteCancelled} />',
      '{!quoteCancelled ? <CancelQuoteButton quoteId={quote.id} /> : null}',
      '<QuotePreviewLink quoteId={quote.id} />',
      '<ShareQuoteButton',
    ]);

    assert.equal(getQuoteExportPdfHref('/api', 'quote-123'), '/api/quotes/quote-123/export');
    assert.equal(getDefaultProposalPreviewHref('quote-123'), '/api/quotes/quote-123/proposal-v3/html');
  });

  it('prevents cancelled quotes from conversion and mutation affordances', () => {
    expectSourceContains(pageSource, [
      "const quoteCancelled = quote.status === 'CANCELLED';",
      'convertBlocked || quoteCancelled ? (',
      '<button type="button" className="secondary-button" disabled>Convert</button>',
      'Cancelled quotes cannot be converted to bookings.',
      '<ReviseQuoteButton quoteId={quote.id} disabled={quoteCancelled} />',
      '{!quoteCancelled ? <CancelQuoteButton quoteId={quote.id} /> : null}',
      'This quote is cancelled. Status changes and booking conversion are disabled.',
    ]);
  });

  it('keeps saved quote revisions read-only instead of exposing mutation or conversion actions', () => {
    expectSourceContains(versionPageSource, [
      '<p className="eyebrow">Saved Quote Version</p>',
      '<Link href={`/quotes/${id}`} className="back-link">',
      'Back to quote',
    ]);

    assert.doesNotMatch(versionPageSource, /SaveQuoteVersionButton|QuoteStatusForm|ConvertToBookingButton|ReviseQuoteButton|CancelQuoteButton/);
    assert.doesNotMatch(versionPageSource, /convert-to-booking|\/cancel|\/requote|\/versions`/);
  });

  it('keeps the redesigned tabs and workspace sections available', () => {
    expectSourceContains(pageSource, [
      "const QUOTE_DASHBOARD_TABS = [",
      "{ id: 'overview', label: 'Overview' }",
      "{ id: 'itinerary', label: 'Itinerary' }",
      "{ id: 'pricing', label: 'Pricing' }",
      "{ id: 'versions', label: 'Documents' }",
      "{ id: 'review', label: 'Internal Notes' }",
      'aria-label="Quote detail sections"',
      "activeTab === 'overview'",
      "activeTab === 'itinerary'",
      "activeTab === 'pricing'",
      "activeTab === 'versions'",
      "activeTab === 'review'",
    ]);
  });

  it('shows sell-price summary while keeping supplier cost out of client-facing exports', () => {
    expectSourceContains(pageSource, [
      '<p className="eyebrow">Internal / Admin Profit</p>',
      '<span>Total sell</span>',
      '<span>Total cost</span>',
      '<span>Gross profit</span>',
      '<span>Margin %</span>',
      "{ label: 'Price per pax', value: formatMoney(quote.pricePerPax, quote.quoteCurrency), helper: quote.pricingMode === 'SLAB' ? 'Derived from current slab setup' : 'Derived from package pricing' }",
      '<QuoteSummaryPanel',
      'totalSell={quote.totalSell}',
      'totalCost={quote.totalCost}',
    ]);

    assert.match(versionPageSource, /formatMoney\(item\.totalSell, item\.currency\)/);
    assert.doesNotMatch(versionPageSource, /supplier cost|Supplier cost|gross profit|Gross profit|margin|Margin/);
  });

  it('keeps PDF, share, and version actions pointed at existing handlers', () => {
    expectSourceContains(pageSource, [
      'apiBaseUrl={ACTION_API_BASE_URL}',
      'quoteId={quote.id}',
      'initialPublicToken={quote.publicToken}',
      'initialPublicEnabled={quote.publicEnabled}',
      'href={`/quotes/${quote.id}/versions/${version.id}`}',
      'href={`/bookings/${quote.booking.id}`}',
    ]);

    expectSourceContains(readFileSync(new URL('./SaveQuoteVersionButton.tsx', import.meta.url), 'utf8'), [
      'fetch(`${apiBaseUrl}/quotes/${quoteId}/versions`,',
      "method: 'POST'",
    ]);
    expectSourceContains(readFileSync(new URL('./preview/DownloadPdfButton.tsx', import.meta.url), 'utf8'), [
      'fetch(getQuoteExportPdfHref(apiBaseUrl, quoteId))',
      'application/pdf',
    ]);
    expectSourceContains(readFileSync(new URL('./ShareQuoteButton.tsx', import.meta.url), 'utf8'), [
      "handleLinkAction('enable-public-link'",
      "handleLinkAction('disable-public-link'",
      "handleLinkAction('regenerate-public-link'",
    ]);
  });

  it('keeps key actions available in the responsive layout', () => {
    expectSourceContains(pageSource, [
      '<AdminHeaderActions className="quote-dashboard-actions">',
      '<aside className="quote-builder-sidebar">',
      '<div className="quote-builder-sidebar-actions">',
    ]);

    expectSourceContains(cssSource, [
      '/* Quote detail layout refresh - UI only */',
      '.quote-dashboard-actions',
      '.quote-builder-layout',
      '@media (max-width: 980px)',
      '@media (max-width: 640px)',
      '.quote-dashboard-actions > *',
      'width: 100%;',
    ]);
  });
});
