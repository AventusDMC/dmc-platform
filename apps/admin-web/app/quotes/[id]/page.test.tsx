import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { getDefaultProposalPreviewHref, getQuoteExportPdfHref } from './proposal-paths';

const pageSource = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');
const loadingSource = readFileSync(new URL('./loading.tsx', import.meta.url), 'utf8');
const versionPageSource = readFileSync(new URL('./versions/[versionId]/page.tsx', import.meta.url), 'utf8');
const quotesListPageSource = readFileSync(new URL('../page.tsx', import.meta.url), 'utf8');
const quotesTableSource = readFileSync(new URL('../QuotesTable.tsx', import.meta.url), 'utf8');
const quoteServicePlannerSource = readFileSync(new URL('./QuoteServicePlanner.tsx', import.meta.url), 'utf8');
const quoteAutoItineraryBuilderSource = readFileSync(new URL('./QuoteAutoItineraryBuilder.tsx', import.meta.url), 'utf8');
const cancelQuoteButtonSource = readFileSync(new URL('./CancelQuoteButton.tsx', import.meta.url), 'utf8');
const inlineEntityActionsSource = readFileSync(new URL('../../components/InlineEntityActions.tsx', import.meta.url), 'utf8');
const rowDetailsPanelSource = readFileSync(new URL('../../components/RowDetailsPanel.tsx', import.meta.url), 'utf8');
const quoteDetailApiRouteSource = readFileSync(new URL('../../api/quotes/[id]/route.ts', import.meta.url), 'utf8');
const quoteCancelApiRouteSource = readFileSync(new URL('../../api/quotes/[id]/cancel/route.ts', import.meta.url), 'utf8');
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
      '<InlineEntityActions',
      'apiBaseUrl={ACTION_API_BASE_URL}',
      '<QuotesForm',
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

  it('loads quote detail defensively when optional related data fails', () => {
    expectSourceContains(pageSource, [
      'Promise.allSettled',
      'safeQuoteDetailFetch',
      'isNextRedirectError(error)',
      'withQuoteDetailTimeout',
      'QUOTE_DETAIL_OPTIONAL_FETCH_TIMEOUT_MS',
      "safeQuoteDetailFetch('services', [] as SupplierService[], getServices)",
      "safeQuoteDetailFetch('hotel rates', [] as HotelRate[], getHotelRates)",
      "safeQuoteDetailFetch('quote blocks', [] as QuoteBlock[], getQuoteBlocks)",
      "Quote could not be loaded",
      'Service catalog could not be loaded. Existing quote services are still visible.',
      'Itinerary details could not be loaded. Showing quote detail without itinerary data.',
      'Saved quote versions could not be loaded.',
    ]);
  });

  it('renders a route-level loading state and friendly retryable error state', () => {
    expectSourceContains(loadingSource, [
      '<h1>Loading quote</h1>',
      'Quote details are loading.',
      'Back to quotes',
    ]);

    expectSourceContains(pageSource, [
      '<Link href={`/quotes/${id}`} className="primary-button">',
      'Retry',
      'This quote was not found or is no longer available.',
    ]);
  });

  it('quote list links open valid quote detail URLs', () => {
    expectSourceContains(quotesTableSource, [
      '<Link href={`/quotes/${quote.id}`} className="compact-button">',
      '<Link href={`/quotes/${quote.id}?tab=overview`} className="compact-button">',
    ]);
  });

  it('adds quote services from day cards without creating duplicate itinerary days', () => {
    expectSourceContains(quoteServicePlannerSource, [
      'Add services to each day to build your itinerary.',
      "{ category: 'hotel', label: 'Add Hotel' }",
      "{ category: 'transport', label: 'Add Transport' }",
      "{ category: 'activity', label: 'Add Activity' }",
      "{ category: 'meal', label: 'Add Meal' }",
      'itineraryDayNumber={day.dayNumber}',
      'itineraryId={day.id}',
      'className={`workspace-tab-label${selectedScopeId === \'shared\' ? \' workspace-tab-label-active\' : \'\'}`}',
      "setSelectedScopeId('shared');",
      'Generate itinerary days from nights to start.',
    ]);

    assert.doesNotMatch(quoteServicePlannerSource, /<AddServiceLauncher|function AddServiceLauncher|AutoCreateDayOne/);
    assert.doesNotMatch(quoteServicePlannerSource, /Creating Day 1 before opening the service form|Could not create Day 1|Day 1 will be created automatically/);
  });

  it('opens Base Program by default and refreshes generated days without a manual reload', () => {
    expectSourceContains(cssSource, [
      '.workspace-tab-label-active',
      '.quote-service-planner .quote-base-program-panel-open',
    ]);

    expectSourceContains(quoteServicePlannerSource, [
      'const [localItineraries, setLocalItineraries] = useState(props.quote.itineraries);',
      'const [openDayIds, setOpenDayIds] = useState<Set<string>>(() => new Set(props.quote.itineraries.map((day) => day.id)));',
      "const [selectedScopeId, setSelectedScopeId] = useState('shared');",
      'const itineraryDays = localItineraries;',
      'return currentItineraries;',
      "window.addEventListener('dmc:quote-itinerary-days-ready', handleDaysReady);",
      'setOpenDayIds(new Set(detail.days.map((day) => day.id)));',
      "setSelectedScopeId('shared');",
      'className={`workspace-tab-label${selectedScopeId === \'shared\' ? \' workspace-tab-label-active\' : \'\'}`}',
      '<section className="workspace-panel-shared quote-base-program-panel-open" data-locked={itineraryDays.length === 0 ? \'true\' : \'false\'}>',
      "checked={selectedScopeId === scope.id}",
      '<div id="quote-base-program-days">',
      'plannerProps={{ ...props, quote: plannerQuote }} plannerState={plannerState}',
    ]);
    assert.doesNotMatch(quoteServicePlannerSource, /baseProgramOpen|setBaseProgramOpen|id="planner-shared"|checked=\{selectedScopeId === 'shared'|workspace-tab-panel workspace-panel-shared/);

    expectSourceContains(quoteAutoItineraryBuilderSource, [
      'async function applyItinerary(draft: PreviewDraft)',
      'await applyItinerary(draft);',
      "Generate & Save Draft Itinerary",
      "Generating & Saving...",
      "window.dispatchEvent(new CustomEvent('dmc:quote-itinerary-days-ready', { detail: { quoteId: quote.id, days } }));",
      "document.querySelector('#quote-base-program-days, .quote-service-day-card')?.scrollIntoView",
      'setMessage(buildItineraryApplyMessage(draft.days.length, createdDayCount));',
      'router.refresh();',
    ]);
  });

  it('keeps day service editors interactive after itinerary generation refreshes planner state', () => {
    expectSourceContains(rowDetailsPanelSource, [
      'open?: boolean;',
      'onOpenChange?: (open: boolean) => void;',
      'const isControlled = open !== undefined;',
      'onOpenChange?.(current.open);',
      '{...(isControlled ? { open } : defaultOpen ? { open: true } : {})}',
      'onToggle={handleToggle}',
    ]);
    assert.doesNotMatch(rowDetailsPanelSource, /open=\{defaultOpen\}/);

    expectSourceContains(quoteServicePlannerSource, [
      'className={`workspace-tab-label${selectedScopeId === \'shared\' ? \' workspace-tab-label-active\' : \'\'}`}',
      "setSelectedScopeId('shared');",
      'const [activeServicePanel, setActiveServicePanel] = useState<ActiveServicePanel | null>(null);',
      'open={plannerState.openDayIds.has(summary.day.id)}',
      'onOpenChange={(isOpen) => plannerState.onDayOpenChange(summary.day.id, isOpen)}',
      'id={`planner-day-${summary.day.id}`}',
      'items: scope.items.filter((item) => item.itineraryId === summary.day.id),',
      '<aside className="quote-service-editor-panel">',
      '<table className="quote-service-assigned-table">',
      'setActiveServicePanel({',
      '<strong>Select a service type to begin</strong>',
      'itineraryId={day.id}',
      'submitLabel={label}',
    ]);
    assert.doesNotMatch(quoteServicePlannerSource, /defaultOpen=\{plannerProps\.focusedDayId === day\.id|openServiceEditorKey|quote-service-day-action`\}/);

    expectSourceContains(readFileSync(new URL('./QuoteItemsForm.tsx', import.meta.url), 'utf8'), [
      'const endpoint = optionId',
      'fetch(logFetchUrl(endpoint),',
      'itineraryId,',
      "notifyQuotePricingChanged(quoteId);",
      'router.refresh();',
    ]);

    expectSourceContains(readFileSync(new URL('../../api/quotes/[id]/items/route.ts', import.meta.url), 'utf8'), [
      "method: 'POST'",
      '...buildActorHeaders(request)',
      'return forwardProxyJsonResponse(response);',
    ]);
  });

  it('debounces hotel contract cost calculation and avoids cancelled duplicate requests', () => {
    const quoteItemsFormSource = readFileSync(new URL('./QuoteItemsForm.tsx', import.meta.url), 'utf8');
    const calculationStart = quoteItemsFormSource.indexOf('fetch(`/api/hotel-rates/calculate-hotel-cost?${requestKey}`)');
    const calculationBlock = quoteItemsFormSource.slice(Math.max(0, calculationStart - 1600), calculationStart + 1800);

    expectSourceContains(quoteItemsFormSource, [
      'const hotelCostDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);',
      'const hotelCostInFlightKeyRef = useRef<string | null>(null);',
      'const hotelCostLastRequestedKeyRef = useRef<string | null>(null);',
      'const requestKey = params.toString();',
      'if (hotelCostInFlightKeyRef.current === requestKey || hotelCostLastRequestedKeyRef.current === requestKey) {',
      'hotelCostDebounceRef.current = setTimeout(() => {',
      '}, 400);',
      'fetch(`/api/hotel-rates/calculate-hotel-cost?${requestKey}`)',
      'if (hotelCostLastRequestedKeyRef.current !== requestKey) {',
    ]);
    assert.doesNotMatch(calculationBlock, /AbortController|signal:|controller\.abort|AbortError/);
  });

  it('routes quote list and detail mutations through admin-web API proxies', () => {
    expectSourceContains(quotesListPageSource, [
      "const ACTION_API_BASE_URL = '/api';",
      '<QuotesTable apiBaseUrl={ACTION_API_BASE_URL}',
    ]);

    expectSourceContains(pageSource, [
      '<InlineEntityActions',
      'apiBaseUrl={ACTION_API_BASE_URL}',
      'deleteSuccessHref="/quotes"',
      '<QuotesForm',
      '<SupportTextForm',
    ]);

    expectSourceContains(quotesTableSource, [
      'fetch(`${apiBaseUrl}/quotes/${quote.id}`,',
      "method: 'DELETE'",
      "router.push('/quotes');",
      'setError(caughtError instanceof Error ? caughtError.message :',
    ]);
    expectSourceContains(inlineEntityActionsSource, [
      'fetch(logFetchUrl(`${apiBaseUrl}${deletePath}`),',
      "method: 'DELETE'",
      'headers: buildAuthHeaders()',
      'router.push(deleteSuccessHref);',
      'setError(caughtError instanceof Error ? caughtError.message',
    ]);
    expectSourceContains(cancelQuoteButtonSource, [
      'fetch(`/api/quotes/${quoteId}/cancel`,',
      "method: 'POST'",
      'headers: buildAuthHeaders()',
      "router.push('/quotes');",
      'setError(caughtError instanceof Error ? caughtError.message',
    ]);
    expectSourceContains(quoteDetailApiRouteSource, [
      'export async function DELETE',
      "method: 'DELETE'",
      'headers: buildActorHeaders(request)',
      "redirect: 'manual'",
    ]);
    expectSourceContains(quoteCancelApiRouteSource, [
      'export async function POST',
      'headers: buildActorHeaders(request)',
      "redirect: 'manual'",
    ]);

    assert.doesNotMatch(quotesTableSource, /NEXT_PUBLIC_API_URL|dmcapi-production|railway\.app/i);
    assert.doesNotMatch(pageSource, /apiBaseUrl=\{API_BASE_URL\}/);
    assert.doesNotMatch(`${quotesTableSource}\n${cancelQuoteButtonSource}\n${inlineEntityActionsSource}`, /admin\/dashboard|router\.push\(["']\/admin\/dashboard["']\)/);
  });
});
