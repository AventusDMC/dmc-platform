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
const quoteHotelOptionSetsSource = readFileSync(new URL('./QuoteHotelOptionSets.tsx', import.meta.url), 'utf8');
const quoteHotelOptionSummarySource = readFileSync(new URL('./QuoteHotelOptionSummary.tsx', import.meta.url), 'utf8');
const quoteTransportPickerSource = readFileSync(new URL('./QuoteTransportPicker.tsx', import.meta.url), 'utf8');
const quoteItemCardSource = readFileSync(new URL('./QuoteItemCard.tsx', import.meta.url), 'utf8');
const quotePassengersPanelSource = readFileSync(new URL('./QuotePassengersPanel.tsx', import.meta.url), 'utf8');
const quoteRoomingPanelSource = readFileSync(new URL('./QuoteRoomingPanel.tsx', import.meta.url), 'utf8');
const quoteAutoItineraryBuilderSource = readFileSync(new URL('./QuoteAutoItineraryBuilder.tsx', import.meta.url), 'utf8');
const cancelQuoteButtonSource = readFileSync(new URL('./CancelQuoteButton.tsx', import.meta.url), 'utf8');
const inlineEntityActionsSource = readFileSync(new URL('../../components/InlineEntityActions.tsx', import.meta.url), 'utf8');
const rowDetailsPanelSource = readFileSync(new URL('../../components/RowDetailsPanel.tsx', import.meta.url), 'utf8');
const quoteDetailApiRouteSource = readFileSync(new URL('../../api/quotes/[id]/route.ts', import.meta.url), 'utf8');
const quoteExcursionExpandApiRouteSource = readFileSync(new URL('../../api/quotes/[id]/excursion-templates/[templateId]/expand/route.ts', import.meta.url), 'utf8');
const quoteCancelApiRouteSource = readFileSync(new URL('../../api/quotes/[id]/cancel/route.ts', import.meta.url), 'utf8');
const transportPricingModesSource = readFileSync(new URL('../../lib/transport-pricing-modes.ts', import.meta.url), 'utf8');
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
      "{ id: 'overview', label: 'Setup', helper: 'Basic client, dates, pax, currency' }",
      "{ id: 'itinerary', label: 'Itinerary', helper: 'Build day-by-day program' }",
      "{ id: 'hotels', label: 'Hotels', helper: 'Choose hotel options' }",
      "{ id: 'transport', label: 'Transport', helper: 'Select routes, vehicles, suppliers' }",
      "{ id: 'services', label: 'Meals & Services', helper: 'Add lunches, guides, entrances, activities' }",
      "{ id: 'pricing', label: 'Pricing', helper: 'Review cost, sell, margin' }",
      "{ id: 'proposal', label: 'Proposal', helper: 'Preview and export client proposal' }",
      'aria-label="Quote detail sections"',
      "activeTab === 'overview'",
      "activeTab === 'itinerary'",
      "activeTab === 'hotels'",
      "activeTab === 'transport'",
      "activeTab === 'services'",
      "activeTab === 'pricing'",
      "activeTab === 'proposal'",
      "activeTab === 'versions'",
      "activeTab === 'review'",
    ]);
  });

  it('defers heavy hotel planning data until the hotels workflow needs it', () => {
    expectSourceContains(pageSource, [
      'const shouldLoadHotelPlanningData =',
      "activeTab === 'itinerary'",
      "activeTab === 'hotels'",
      "resolvedSearchParams?.addCategory === 'hotel'",
      'resolvedSearchParams?.catalogHotelId',
      "shouldLoadHotelPlanningData ? safeQuoteDetailFetch('hotels', [] as Hotel[], getHotels) : skippedQuoteDetailFetch('hotels', [] as Hotel[])",
      "skippedQuoteDetailFetch('hotel contracts', [] as HotelContract[])",
      "shouldLoadHotelPlanningData ? safeQuoteDetailFetch('hotel rates', [] as HotelRate[], getHotelRates) : skippedQuoteDetailFetch('hotel rates', [] as HotelRate[])",
      "const shouldLoadHotelCategories = activeTab === 'pricing';",
      "skippedQuoteDetailFetch('hotel categories', [] as HotelCategoryOption[])",
    ]);
  });

  it('wires excursion templates into the quote service planner without auto-selecting optional components', () => {
    expectSourceContains(pageSource, [
      'async function getExcursionTemplates()',
      "safeQuoteDetailFetch('excursion templates', [] as ExcursionTemplate[], getExcursionTemplates)",
      'const excursionTemplates = excursionTemplatesResult.data;',
      'excursionTemplates={excursionTemplates}',
    ]);

    expectSourceContains(quoteServicePlannerSource, [
      'function ExcursionTemplateInsertPanel',
      '<h3>Add Excursion Template</h3>',
      'Required components insert in order. Optional components stay unchecked until selected.',
      'serviceDate={getItineraryDayServiceDate(plannerProps.quote, summary.day)}',
      'onInserted={refreshScopeItemsFromQuote}',
      'selectedOptionalComponentIds: Array.from(selectedOptionalComponentIds)',
      'serviceDate,',
      'component.isOptional ? (',
      'checked={checked}',
      "window.dispatchEvent(new CustomEvent('dmc:quote-services-stale'",
      'No active excursion templates are available.',
    ]);

    expectSourceContains(quoteExcursionExpandApiRouteSource, [
      '/quotes/${encodeURIComponent(id)}/excursion-templates/${encodeURIComponent(templateId)}/expand',
      'buildActorHeaders(request)',
      'Could not reach API server while adding excursion template to quote.',
    ]);
  });

  it('renders read-only operational intelligence in the quote itinerary day planner', () => {
    expectSourceContains(pageSource, [
      'excursionTemplateId: item?.excursionTemplateId ?? null',
      'excursionTemplateComponentId: item?.excursionTemplateComponentId ?? null',
      'excursionTemplateComponentOptional: item?.excursionTemplateComponentOptional ?? null',
    ]);

    expectSourceContains(quoteServicePlannerSource, [
      'function buildQuoteOperationalIntelligence',
      'function QuoteOperationalIntelligencePanel',
      '<h4>Day readiness overview</h4>',
      'Missing required components',
      'Pricing warnings',
      'Timing summary',
      'Operational warnings',
      'Optional components not selected',
      'buildQuoteOperationalIntelligence(summary.day, summary.items, plannerProps.excursionTemplates)',
      '<QuoteOperationalIntelligencePanel model={operationalIntelligence} />',
    ]);
  });

  it('renders quote-scoped passenger management on the itinerary page', () => {
    expectSourceContains(pageSource, [
      "import { QuotePassengersPanel, type QuotePassenger } from './QuotePassengersPanel';",
      'passengers: QuotePassenger[];',
      'passengers: Array.isArray(quote.passengers) ? quote.passengers : []',
      '<QuotePassengersPanel',
      'expectedPax={totalPax}',
      'passengers={quote.passengers}',
    ]);

    expectSourceContains(quotePassengersPanelSource, [
      'Quote passenger list',
      'Passenger records',
      'Expected pax',
      'Add passenger',
      'Update passenger',
      'Remove',
      '`${apiBaseUrl}/quotes/${quoteId}/passengers`',
      '`${apiBaseUrl}/quotes/${quoteId}/passengers/${editingPassengerId}`',
      '`${apiBaseUrl}/quotes/${quoteId}/passengers/${passenger.id}`',
    ]);
  });

  it('renders manual quote rooming foundation on the itinerary page', () => {
    expectSourceContains(pageSource, [
      "import { QuoteRoomingPanel, type QuoteRoomingGroup } from './QuoteRoomingPanel';",
      'type QuoteRoomingFetchResult =',
      'async function getQuoteRooming(id: string): Promise<QuoteRoomingFetchResult>',
      "`${DATA_API_BASE_URL}/quotes/${id}/rooming`",
      'const quoteRoomingGroups = quoteRoomingResult.roomingGroups;',
      '<QuoteRoomingPanel',
      'roomingGroups={quoteRoomingGroups}',
      'singleSupplement={quote.singleSupplement}',
    ]);

    expectSourceContains(quoteRoomingPanelSource, [
      'Rooming foundation',
      'Manual rooming by itinerary day and hotel stay.',
      'Operational intelligence',
      'Rooming readiness',
      'SGL count',
      'DBL count',
      'Triple count',
      'Single supplement review:',
      'Exportable rooming summary',
      'Rooming list view',
      'Create room group',
      'Assign passenger',
      'Unassigned passengers',
      'function getOccupancyCapacity',
      'function formatOccupancyCount',
      'function buildRoomingOperationalIntelligence',
      'Empty room group',
      'Incomplete occupancy',
      'Over-capacity',
      '`${apiBaseUrl}/quotes/${quoteId}/rooming`',
      '`${apiBaseUrl}/quotes/${quoteId}/rooming/${group.id}/assignments`',
      '`${apiBaseUrl}/quotes/${quoteId}/rooming/${group.id}/assignments/${quotePassengerId}`',
      '`${apiBaseUrl}/quotes/${quoteId}/rooming/${group.id}`',
    ]);
  });

  it('loads hotel catalog data for Add Confirmed Hotel Stay from the itinerary drawer', () => {
    expectSourceContains(pageSource, [
      "activeTab === 'itinerary'",
      "shouldLoadHotelPlanningData ? safeQuoteDetailFetch('hotels', [] as Hotel[], getHotels) : skippedQuoteDetailFetch('hotels', [] as Hotel[])",
      "shouldLoadHotelPlanningData",
      "safeQuoteDetailFetch('hotel contracts', [] as HotelContract[], getHotelContracts)",
      "safeQuoteDetailFetch('hotel rates', [] as HotelRate[], getHotelRates)",
      "return adminPageFetchJson<HotelRate[]>(`${DATA_API_BASE_URL}/hotel-rates`, 'Quote detail hotel rates', {",
      'hotels={hotels}',
    ]);
    assert.doesNotMatch(pageSource, /async function getHotelRates\(contractId/);
    assert.doesNotMatch(pageSource, /hotel-rates\?contractId/);
  });

  it('uses hotel option set pills as ID-based navigation to editable sections', () => {
    expectSourceContains(quoteHotelOptionSetsSource, [
      'const [selectedOptionSetId, setSelectedOptionSetId]',
      'function selectOptionSet(optionSetId: string)',
      'setSelectedOptionSetId(optionSetId);',
      'document.getElementById(getOptionSetSectionId(optionSetId))',
      "section?.scrollIntoView({ behavior: 'smooth', block: 'start' });",
      'section?.focus({ preventScroll: true });',
      'aria-controls={getOptionSetSectionId(optionSet.id)}',
      'onClick={() => selectOptionSet(optionSet.id)}',
      'isSelected={optionSet.id === selectedOptionSetId}',
      'Editing: {optionSet.name}',
      'Add accommodation option',
      'const [editingHotelOptionId, setEditingHotelOptionId] = useState',
      'function startEditingHotelAlternative(option: QuoteHotelOption)',
      'function updateHotelAlternative()',
      'method: \'PATCH\'',
      'setEditingHotelOptionId(option.id);',
      'buildHotelAlternativePayload(editForm)',
      '<button className="compact-button" type="button" onClick={() => startEditingHotelAlternative(option)}>Edit</button>',
      '<input type="number" min="1" value={editForm.nights}',
      '<textarea value={editForm.notes}',
    ]);

    expectSourceContains(cssSource, [
      '.quote-hotel-option-set-nav',
      '.quote-hotel-option-set-pill-active',
      '.quote-hotel-option-set-editor-selected',
      '.quote-hotel-option-set-editor-dimmed',
    ]);
  });

  it('renders proposal hotel option sets as grouped hotel cards with fact sheet details', () => {
    expectSourceContains(quoteHotelOptionSummarySource, [
      "option.kind === 'HOTEL_OPTION_SET'",
      'getHotelOptionSetLabel(option.name)',
      "'4\\u2605 STD'",
      "'4\\u2605 DLX'",
      "'Custom hotel set'",
      'quote-hotel-city-group',
      'quote-hotel-card',
      'quote-hotel-card-primary',
      'Recommended',
      'Alternative',
      'getHotelName(hotelOption)',
      'getHotelCity(hotelOption)',
      'getRoomLabel(hotelOption)',
      'getMealPlanLabel(hotelOption)',
      'getNightsLabel(hotelOption)',
      'factSheet.shortDescription',
      'factSheet.highlightsJson',
      'factSheet.amenitiesJson',
      'Accommodation options to be confirmed.',
    ]);

    expectSourceContains(cssSource, [
      '.quote-hotel-option-set',
      '.quote-hotel-option-set-std',
      '.quote-hotel-option-set-dlx',
      '.quote-hotel-option-set-custom',
      '.quote-hotel-meta-grid',
      '.quote-hotel-facts',
      '.quote-hotel-amenity-list',
      'break-inside: avoid;',
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
      'const quoteProfit = calculateProfit(quote.totalSell, quote.totalCost);',
      'const quoteMarginWarning = getQuoteMarginWarning(quote.totalSell, quote.totalCost);',
    ]);

    assert.match(versionPageSource, /formatMoney\(item\.totalSell, item\.currency\)/);
    assert.doesNotMatch(versionPageSource, /supplier cost|Supplier cost|gross profit|Gross profit|margin|Margin/);
  });

  it('adds margin intelligence to live pricing and quote item cards without repricing', () => {
    expectSourceContains(quoteServicePlannerSource, [
      'calculateProfit(item.totalSell, item.totalCost)',
      'calculateMarginPercent(item.totalSell, item.totalCost)',
      'getItemMarginWarning(item.totalSell, item.totalCost)',
      'Sell {formatLiveMoney(item.totalSell',
      'Cost {formatLiveMoney(item.totalCost',
      'Profit {formatLiveMoney(itemProfit',
      'Margin {formatMarginPercent(itemMarginPercent)}',
      'getQuoteMarginWarning(summary.totalSell, summary.totalCost)',
    ]);

    expectSourceContains(quoteItemCardSource, [
      'quote-item-margin-intelligence',
      'Sell {formatMoney(currentItem.totalSell, currentItem.currency)}',
      'Cost {formatMoney(currentItem.totalCost, currentItem.currency)}',
      'Profit {formatMoney(marginMetrics.profit, currentItem.currency)}',
      'Margin {formatMarginPercent(marginMetrics.marginPercent)}',
      'getItemMarginWarning(currentItem.totalSell, currentItem.totalCost)',
      "marginWarning === 'Loss' ? 'quote-ui-badge-error' : 'quote-ui-badge-warning'",
    ]);
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
      "{ category: 'hotel', label: 'Add Confirmed Hotel Stay' }",
      "{ category: 'transport', label: 'Add Transport' }",
      "{ category: 'activity', label: 'Add Activity' }",
      "{ category: 'meal', label: 'Add Meal' }",
      "{ category: 'externalPackage', label: 'Add External Country Package' }",
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
      'const expectedDayCount = getAutoItineraryDayCount(quote.nightCount);',
      '.filter((day) => day.isActive && day.dayNumber <= expectedDayCount)',
      'const [localItineraries, setLocalItineraries] = useState(incomingPlannerDays);',
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
      'const expectedDays = draft.days.slice(0, expectedGeneratedDayCount);',
      'await deactivateExtraGeneratedDays(expectedDays.length);',
      'buildItineraryDayPayload(day)',
      'setMessage(buildItineraryApplyMessage(expectedDays.length, createdDayCount));',
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
      'className="quote-service-editor-panel"',
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

  it('preserves a hotel catalog service id when editing saved hotel room counts', () => {
    const quoteItemsFormSource = readFileSync(new URL('./QuoteItemsForm.tsx', import.meta.url), 'utf8');

    expectSourceContains(quoteItemsFormSource, [
      'const initialItemServiceTypeKey = hasInitialExternalPackage',
      ': initialValues?.hotelId',
      ": 'hotel'",
      ': initialServiceTypeKey || (isEditing ? initialItemServiceTypeKey : null);',
      'const resolvedHotelServiceId =',
      'selectedService?.id || filteredServices[0]?.id || serviceId',
      "throw new Error('Hotel catalog service not found for this stay.');",
      'serviceId: isTransportService ? resolvedTransportServiceId : resolvedHotelServiceId',
      'roomCount: isTransportService || isGuideService || isMealService || isExternalPackageService ? undefined : Number(roomCount)',
    ]);
  });

  it('keeps Smart Transport Picker suggestions to the smallest fitting capacity', () => {
    const quoteItemsFormSource = readFileSync(new URL('./QuoteItemsForm.tsx', import.meta.url), 'utf8');

    expectSourceContains(quoteItemsFormSource, [
      'function getSmartTransportSuggestions',
      'const fittingCandidates = candidates.filter((candidate) => getTransportCandidateCapacity(candidate) >= pax);',
      'const sortedCandidates = [...fittingCandidates].sort((left, right) => compareTransportCandidates(left, right, pax));',
      'const smallestFittingCapacity = sortedCandidates[0] ? getTransportCandidateCapacity(sortedCandidates[0]) : null;',
      'getTransportCandidateCapacity(candidate) === smallestFittingCapacity',
      '.slice(0, maxSuggestions)',
      'const sortedCandidates = getSmartTransportSuggestions(normalizedCandidates, currentPax, 3);',
    ]);
  });

  it('ranks QuoteTransportPicker vehicles by pax without hiding manual overrides', () => {
    expectSourceContains(quoteTransportPickerSource, [
      "type VehicleRecommendationGroup = 'Recommended' | 'Available' | 'Too small';",
      'function getRankedVehicles(vehicles: Vehicle[], pax: number): RankedVehicle[]',
      'const fittingVehicles = vehicles.filter((vehicle) => vehicle.maxPax >= requestedPax);',
      'const recommendedCapacity = fittingVehicles.reduce<number | null>',
      "group: isTooSmall ? 'Too small' : isRecommended ? 'Recommended' : 'Available'",
      'const selectedVehicle = allVehicles.find((vehicle) => vehicle.id === selectedVehicleId) || null;',
      'const [paxInput, setPaxInput] = useState',
      'export function formatVehicleOptionLabel(entry: RankedVehicle, vehicleTypes: VehicleTypeOption[])',
      'formatTransportVehicleDisplay(entry.vehicle, vehicleTypes)',
      'Pax',
      'Select vehicle / capacity',
      '{formatVehicleOptionLabel(entry, vehicleTypes)}',
      'disabled={entry.isTooSmall}',
      'Too small',
    ]);
  });

  it('uses a route vehicle type and pricing mode dependent supplier rate dropdown', () => {
    expectSourceContains(quoteTransportPickerSource, [
      'function formatSupplierRateOptionLabel(',
      'export function isGeneralTransportRouteRate(rate: VehicleRate)',
      'function getRouteCandidateRates(rates: VehicleRate[], route: RouteOption, now = new Date())',
      'const routeCandidateRates = getRouteCandidateRates(loadedSupplierRates, selectedRoute);',
      'const routeScopedRates = routeCandidateRates.filter(',
      'No supplier rate found for this route, vehicle type, and pricing mode. Add one in Transport → Supplier Rate Cards.',
      'disabled={!selectedRoute || !selectedVehicle || !selectedPricingMode || supplierRateMatches.length === 0}',
      '{formatSupplierRateOptionLabel(match, suppliers, vehicleTypes, selectedRoute, requestedPax, requestedBillableDays)}',
    ]);
  });

  it('previews transport selected prices with the persisted quote-item cost path', () => {
    expectSourceContains(quoteTransportPickerSource, [
      'export function getQuoteTransportRateUnitCost(rate: VehicleRate)',
      'export function getQuoteTransportRateUnitCount(rate: VehicleRate, pax: number)',
      'export function getQuoteTransportRateBillableDays(rate: VehicleRate, selectedDays = 1)',
      'export function getQuoteTransportPersistedCostPreview(rate: VehicleRate, pax: number, selectedDays = 1)',
      'return Number((unitCost * unitCount * billableDays).toFixed(2));',
      'const [billableDaysInput, setBillableDaysInput] = useState(\'1\');',
      'const requestedBillableDays = Math.max(1, Math.floor(Number(billableDaysInput) || 1));',
      'const costPrice = selectedRate && selectedRateHasCost ? getQuoteTransportPersistedCostPreview(selectedRate, requestedPax, requestedBillableDays) : 0;',
      'getQuoteTransportPersistedCostPreview(left.rate, requestedPax, requestedBillableDays)',
      'getQuoteTransportPersistedCostPreview(rate, pax, billableDays)',
      'dayCount: usesBillableDaysInput(selectedPricingMode) ? requestedBillableDays : 1,',
      'Supplier minimum 3 full days may apply.',
    ]);
  });

  it('separates route transfers from program disposal service areas in QuoteTransportPicker', () => {
    expectSourceContains(quoteTransportPickerSource, [
      'function formatRouteSelectionLabel(route: RouteOption)',
      'function isProgramOrDisposalRouteOption(route: RouteOption)',
      'const routeTransferOptions = useMemo',
      'const serviceAreaOptions = useMemo',
      '<optgroup label="Route transfers">',
      '<optgroup label="Program / disposal service areas">',
      'Use route transfers for point-to-point movement. Use service areas for disposal modes like Full Day, Half Day, and Day Tour.',
    ]);
  });

  it('includes locally saved manual supplier rate cards in QuoteTransportPicker matching', () => {
    expectSourceContains(quoteTransportPickerSource, [
      'readManualSupplierRateCards',
      'MANUAL_SUPPLIER_RATE_CARDS_CHANGED_EVENT',
      'const [manualSupplierRateCards, setManualSupplierRateCards] = useState<VehicleRate[]>([]);',
      'setManualSupplierRateCards(normalizeSupplierRateRows(readManualSupplierRateCards()));',
      'window.addEventListener(MANUAL_SUPPLIER_RATE_CARDS_CHANGED_EVENT, loadManualSupplierRateCards);',
      '() => [...manualSupplierRateCards, ...normalizeSupplierRateRows(supplierRateCards)]',
    ]);
  });

  it('keeps QuoteTransportPicker pricing modes on full active rate rows with canonical vehicle fallback', () => {
    expectSourceContains(pageSource, [
      "`${API_BASE_URL}/vehicle-rates`",
      'normalizeTransportSupplierRateRows(payload)',
    ]);
    assert.equal(pageSource.includes('/vehicle-rates/summary'), false);

    expectSourceContains(quoteTransportPickerSource, [
      'export function getAvailableTransportPricingModesForSelection',
      'isActiveValidTransportRate(rate, now)',
      'getCanonicalRateVehicleType(rate, vehicleTypes)',
      'selectedCanonicalVehicleType',
      'selectedVehicleId',
      'pricingMode?: string | null',
      'deriveTransportPricingMode(rate)',
      'routeMatchingRowsCount',
      'legacyVehicleTypes',
      'supportedPricingModes',
      'disposalRateMatchesSelectedServiceArea',
      'requestedPax',
      'getTransportPricingModeOptionLabel',
      'Full Day - minimum 3 days',
      'pricingModesForVehicle.map((mode)',
    ]);
  });


  it('shows visible transport pricing diagnostics when pricing modes are empty', () => {
    expectSourceContains(quoteTransportPickerSource, [
      'aria-label="Transport pricing diagnostics"',
      '<strong>Transport pricing diagnostics</strong>',
      'Vehicle rates loaded: {noPricingModesDiagnostics.vehicleRatesLoaded}',
      'Rows for this route: {noPricingModesDiagnostics.routeMatchingRowsCount}',
      'Legacy labels for route:',
      'Active/valid rows: {noPricingModesDiagnostics.activeValidRowsCount}',
      'Pricing modes found:',
      'rejectedReasonCounts.map((entry)',
      "rejectForMode(pricingMode, 'route/service area mismatch')",
      "rejectForMode(pricingMode, 'vehicle/capacity mismatch')",
      '`Full Day ${reason}`',
      "reject('missing pricingMode')",
    ]);
  });

  it('saves and displays transport items with pricing-mode specific supplier service labels', () => {
    const quoteItemsFormSource = readFileSync(new URL('./QuoteItemsForm.tsx', import.meta.url), 'utf8');

    expectSourceContains(quoteItemsFormSource, [
      'function inferSupplierServiceTransportPricingMode(service: SupplierService): TransportPricingMode | null',
      'function findSupplierServiceForTransportSelection',
      'findSupplierServiceForTransportSelection(filteredServices, candidate)',
      'findSupplierServiceForTransportSelection(filteredServices, selectedTransportCandidate || resolvedTransportPricing)?.id || \'\'',
      'No generic fallback transport item was saved.',
      "return 'Extra KM';",
      "return 'Driver Overnight';",
      "return 'Full Day';",
    ]);

    expectSourceContains(quoteServicePlannerSource, [
      'getTransportSupplierDisplayName(item)',
      'function cleanTransportSupplierBase(value: string | null | undefined)',
      'function isUuidLike(value: string)',
      'formatTransportVehicleDisplay({',
      'Service Area:',
    ]);

    expectSourceContains(pageSource, [
      'return buildTransportServiceDisplayName(item.service.name, item.appliedVehicleRate.serviceType.name, item.appliedVehicleRate.supplier?.name || null);',
      'return item.appliedVehicleRate?.serviceType?.name || item.service.serviceType?.name || item.service.category || \'Service\';',
    ]);

    expectSourceContains(readFileSync(new URL('./QuoteItemCard.tsx', import.meta.url), 'utf8'), [
      'return buildTransportServiceDisplayName(item.service?.name || null, item.appliedVehicleRate.serviceType.name, item.appliedVehicleRate.supplier?.name || null);',
      'const itemDisplayName = hotelItemSummary || activityCatalogName || getQuoteItemServiceName(currentItem);',
    ]);

    expectSourceContains(readFileSync(new URL('./QuoteServicesTable.tsx', import.meta.url), 'utf8'), [
      'function getQuoteItemServiceDisplayName(item: QuoteItem)',
      '<h3>{hotelItemSummary || getQuoteItemServiceDisplayName(currentItem)}</h3>',
      '{getQuoteItemServiceTypeDisplayName(currentItem)}',
    ]);
  });

  it('does not fall back to a generic transport service when no real rate mapping exists', () => {
    const quoteItemsFormSource = readFileSync(new URL('./QuoteItemsForm.tsx', import.meta.url), 'utf8');
    const quoteTransportPickerSource = readFileSync(new URL('./QuoteTransportPicker.tsx', import.meta.url), 'utf8');

    expectSourceContains(quoteItemsFormSource, [
      'const matchingService = findSupplierServiceForTransportSelection(filteredServices, candidate);',
      'setServiceId(\'\');',
      'Transport rate found, but no matching transport catalog service exists for this supplier/pricing mode.',
      'No generic fallback transport item was saved.',
    ]);
    assert.equal(quoteItemsFormSource.includes("filteredServices.find((service) => getServiceTypeKey(service) === 'transport')"), false);
    assert.equal(quoteItemsFormSource.includes('searchPool[0] ||'), false);
    assert.equal(quoteTransportPickerSource.includes('return modeMatch || searchPool[0] || null;'), false);
    expectSourceContains(quoteTransportPickerSource, [
      'const serviceTypeMatch = searchPool.find((service) => service.serviceTypeId === rate.serviceType?.id);',
      'return modeMatch || serviceTypeMatch || null;',
      'Could not resolve the selected supplier service and pricing mode for this transport rate.',
    ]);
  });

  it('keeps existing non-transport quote item save payloads unchanged during transport fallback cleanup', () => {
    const quoteItemsFormSource = readFileSync(new URL('./QuoteItemsForm.tsx', import.meta.url), 'utf8');

    expectSourceContains(quoteItemsFormSource, [
      'const resolvedHotelServiceId =',
      'selectedService?.id || filteredServices[0]?.id || serviceId',
      'if (isHotelService && !resolvedHotelServiceId) {',
      'serviceId: isTransportService ? resolvedTransportServiceId : resolvedHotelServiceId',
      'activityId: isActivityService && activityId ? activityId : undefined',
      'ticketRateVariantId: isTicketingService && ticketRateVariantId ? ticketRateVariantId : undefined',
    ]);
  });

  it('persists route-first transport picker selections instead of rendering local preview cards', () => {
    const quotesServiceSource = readFileSync(new URL('../../../../api/src/quotes/quotes.service.ts', import.meta.url), 'utf8');

    expectSourceContains(quoteTransportPickerSource, [
      'quoteId: string;',
      'itineraryId: string;',
      'services: SupplierService[];',
      'transportServiceTypes: TransportServiceType[];',
      'async function handleAddTransport()',
      "fetch(`${apiBaseUrl}/quotes/${quoteId}/items`,",
      'serviceId: service.id',
      'itineraryId,',
      'transportServiceTypeId,',
      'transportVehicleId: selectedVehicle.id',
      "setSelectedRouteId('');",
      "{isSavingTransport ? 'Saving Transport...' : 'Add Transport'}",
    ]);

    assert.equal(quoteTransportPickerSource.includes('type TransportLine ='), false);
    assert.equal(quoteTransportPickerSource.includes('setLines('), false);

    expectSourceContains(quoteServicePlannerSource, [
      'quoteId={plannerProps.quote.id}',
      'itineraryId={summary.day.id}',
      'services={plannerProps.services}',
      'transportServiceTypes={plannerProps.transportServiceTypes}',
      'onSaved={(item) => handleEditorItemSaved(item as QuoteItem)}',
      'void refreshScopeItemsFromQuote().catch',
    ]);

    expectSourceContains(quotesServiceSource, [
      'const displayVehicleRate = await this.transportPricingService.findMatchingRate({',
      'appliedVehicleRateId = displayVehicleRate.id;',
      'transportUnitCostMultiplier = selectedDays;',
      "transportPricingDescriptionParts.push('Supplier minimum 3 full days may apply');",
      'supplierCostBaseAmount = baseCost;',
      'supplierCostCurrency = currency;',
    ]);
    assert.equal(quotesServiceSource.includes('Daily FD minimum applied'), false);
    assert.equal(quotesServiceSource.includes('Math.max(selectedDays, 3)'), false);

    expectSourceContains(quoteServicePlannerSource, [
      '<button type="button" className="secondary-button" onClick={() => onEdit(item)}>',
      "{detachingContractItemId === item.id ? 'Detaching...' : 'Detach contract'}",
      'onDetachContract={handleDetachContract}',
      '{deletingItemId === item.id ? \'Removing...\' : \'Remove\'}',
      'onRemove={handleRemoveItem}',
    ]);
  });

  it('derives point-to-point pricing mode for legacy transfer supplier rate rows', () => {
    expectSourceContains(transportPricingModesSource, [
      "privatetransfer: 'Point-to-Point'",
      "transfers: 'Point-to-Point'",
      "routetransfer: 'Point-to-Point'",
      "daytour: 'Day Tour'",
      "fittouring: 'Day Tour'",
      'export function deriveTransportPricingMode',
      "return 'Point-to-Point';",
    ]);

    expectSourceContains(quoteTransportPickerSource, [
      'deriveTransportPricingMode(rate)',
      'Supported normalized modes:',
      "reject('missing pricingMode')",
    ]);
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
