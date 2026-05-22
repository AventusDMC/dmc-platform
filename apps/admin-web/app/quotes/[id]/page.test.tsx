import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { getDefaultProposalPreviewHref, getQuoteExportPdfHref } from './proposal-paths';
import { formatOriginAwareExcursionName } from './excursion-origin-display';

const pageSource = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');
const loadingSource = readFileSync(new URL('./loading.tsx', import.meta.url), 'utf8');
const versionPageSource = readFileSync(new URL('./versions/[versionId]/page.tsx', import.meta.url), 'utf8');
const quotesListPageSource = readFileSync(new URL('../page.tsx', import.meta.url), 'utf8');
const quotesTableSource = readFileSync(new URL('../QuotesTable.tsx', import.meta.url), 'utf8');
const quoteServicePlannerSource = readFileSync(new URL('./QuoteServicePlanner.tsx', import.meta.url), 'utf8');
const quoteDayPlannerLayoutSource = readFileSync(new URL('./QuoteDayPlannerLayout.tsx', import.meta.url), 'utf8');
const quoteDayPlannerLayoutCssSource = readFileSync(new URL('./QuoteDayPlannerLayout.module.css', import.meta.url), 'utf8');
const quoteServiceLaneBoardCssSource = readFileSync(new URL('./QuoteServiceLaneBoard.module.css', import.meta.url), 'utf8');
const quoteItineraryWorkspaceSource = readFileSync(new URL('./QuoteItineraryWorkspace.tsx', import.meta.url), 'utf8');
const quoteItineraryWorkspaceCssSource = readFileSync(new URL('./QuoteItineraryWorkspace.module.css', import.meta.url), 'utf8');
const quoteHotelOptionSetsSource = readFileSync(new URL('./QuoteHotelOptionSets.tsx', import.meta.url), 'utf8');
const quoteHotelOptionSummarySource = readFileSync(new URL('./QuoteHotelOptionSummary.tsx', import.meta.url), 'utf8');
const quoteTransportPickerSource = readFileSync(new URL('./QuoteTransportPicker.tsx', import.meta.url), 'utf8');
const quoteItemsFormSource = readFileSync(new URL('./QuoteItemsForm.tsx', import.meta.url), 'utf8');
const quoteItemCardSource = readFileSync(new URL('./QuoteItemCard.tsx', import.meta.url), 'utf8');
const quoteSummaryPanelSource = readFileSync(new URL('./QuoteSummaryPanel.tsx', import.meta.url), 'utf8');
const quotePreviewPageSource = readFileSync(new URL('./preview/page.tsx', import.meta.url), 'utf8');
const quoteClientItineraryViewSource = readFileSync(new URL('./view/QuoteClientItineraryView.tsx', import.meta.url), 'utf8');
const quotePricingTableSource = readFileSync(new URL('./QuotePricingTable.tsx', import.meta.url), 'utf8');
const quotePassengersPanelSource = readFileSync(new URL('./QuotePassengersPanel.tsx', import.meta.url), 'utf8');
const quoteRoomingPanelSource = readFileSync(new URL('./QuoteRoomingPanel.tsx', import.meta.url), 'utf8');
const quoteAutoItineraryBuilderSource = readFileSync(new URL('./QuoteAutoItineraryBuilder.tsx', import.meta.url), 'utf8');
const convertToBookingButtonSource = readFileSync(new URL('./ConvertToBookingButton.tsx', import.meta.url), 'utf8');
const convertToBookingApiRouteSource = readFileSync(new URL('../../api/quotes/[id]/convert-to-booking/route.ts', import.meta.url), 'utf8');
const quoteReadinessSource = readFileSync(new URL('./quote-readiness.ts', import.meta.url), 'utf8');
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
  it('propagates quote start date into day-bound operational service context', () => {
    expectSourceContains(quoteItemsFormSource, [
      'const itineraryActualDate = resolveDerivedServiceDate(travelStartDate, itineraryDayNumber);',
      'const operationalNightDate = getOperationalNightDate(travelStartDate, itineraryDayNumber);',
      'const resolvedOperationalDate = serviceDate || itineraryActualDate || \'\';',
      'Day {itineraryDayNumber || \'-\'}',
      'Calendar date',
      'Operational night',
      'Quote day {summary.day.dayNumber}',
      'Date {dayActualDate}',
      'Night {dayOperationalNightDate}',
    ]);
  });

  it('auto-selects hotel season from stay date and keeps season override admin-only', () => {
    expectSourceContains(quoteItemsFormSource, [
      'const autoSelectedSeasonName = filteredSeasonRates[0]?.seasonName || \'\';',
      'seasonOverrideEnabled && canOverrideDateContext',
      'Auto season',
      'Override season',
      'sessionRole === \'admin\' || sessionRole === \'super_admin\'',
    ]);
  });

  it('filters hotel rates by date windows while keeping split-season cost calculation', () => {
    expectSourceContains(quoteItemsFormSource, [
      'isDateWithinWindow(hotelCheckInDate, rate.seasonFrom, rate.seasonTo)',
      'checkInDate: hotelCheckInDate',
      'checkOutDate: hotelCheckOutDate',
      'calculate-hotel-cost',
    ]);
  });

  it('passes itinerary operational date into transport validity lookup', () => {
    expectSourceContains(quoteItemsFormSource, [
      'travelDate: resolvedOperationalDate || undefined',
      'isTransportService || isTicketingService',
    ]);
  });

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

  it('shows quote conversion progress errors and redirects to the created booking', () => {
    expectSourceContains(convertToBookingButtonSource, [
      'onClick={handleClick}',
      "setNotice({ tone: 'info', message: 'Converting quote to booking...' });",
      "fetch(`/api/quotes/${quoteId}/convert-to-booking`",
      "credentials: 'same-origin'",
      "throw new Error(await getErrorMessage(response, 'Could not convert quote to booking.'));",
      "throw new Error('Booking conversion succeeded but the response did not include a booking id.');",
      "throw new Error('Booking conversion did not confirm that the booking was persisted.');",
      "setNotice({ tone: 'success', message: 'Booking created. Opening booking detail...' });",
      "window.location.assign(`/bookings/${booking.id}?created=1`);",
      "role={notice.tone === 'error' ? 'alert' : 'status'}",
    ]);

    expectSourceContains(convertToBookingApiRouteSource, [
      "accept: 'application/json'",
      "return proxyFetchErrorResponse(error, 'Could not reach quote conversion API.');",
    ]);
  });

  it('prevents cancelled quotes from conversion and mutation affordances', () => {
    expectSourceContains(pageSource, [
      "const quoteCancelled = quote.status === 'CANCELLED';",
      "const quoteAcceptedForConversion = quote.status === 'ACCEPTED';",
      "Accept the quote before converting to booking.",
      "Save/accept a version before converting.",
      'convertBlocked || quoteReadOnly ? (',
      '<button type="button" className="secondary-button" disabled>Convert</button>',
      'Cancelled quotes cannot be converted to bookings.',
      '<ReviseQuoteButton quoteId={quote.id} disabled={quoteReadOnly} />',
      '{!quoteReadOnly ? <CancelQuoteButton quoteId={quote.id} /> : null}',
      'This quote is cancelled. Status changes and booking conversion are disabled.',
    ]);
  });

  it('uses planner day links for readiness and warns on duplicate priced services without deleting them', () => {
    expectSourceContains(pageSource, [
      'const plannerDayIdByQuoteItemId = new Map<string, string>();',
      "plannerDayIdByQuoteItemId.set(dayItem.quoteServiceId, day.id);",
      "const isAssignedToPlannerDay = (item: Pick<QuoteItem, 'id' | 'itineraryId'>) => Boolean(item.itineraryId || plannerDayIdByQuoteItemId.has(item.id));",
      'const sharedUnassignedItems = quote.quoteItems.filter((item) => !isAssignedToPlannerDay(item));',
      'const readiness = buildQuoteReadinessModel(readinessQuote, buildStepHref);',
    ]);

    expectSourceContains(quoteReadinessSource, [
      "'possible-duplicate-priced-service'",
      'function findPossibleDuplicatePricedServices(items: QuoteReadinessItem[])',
      'Review the duplicate priced rows before conversion. This warning is non-blocking and no rows are removed automatically.',
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
      'servicePlanner={renderQuoteServicePlanner()}',
    ]);

    expectSourceContains(quoteServicePlannerSource, [
      'function ExcursionTemplateInsertPanel',
      '<h3>Add Excursion Template</h3>',
      'Required components insert in order. Optional components stay unchecked until selected.',
      'getExcursionComponentIcon(component.componentType)',
      'formatExcursionComponentDuration(component)',
      'Supplier confirmation required',
      'Voucher required',
      'quote-template-component-warning',
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
      'No operational components attached to this day.',
      'requiredMissing: requiredComponentCoverageKeys.has(key)',
      "entry.requiredMissing ? 'quote-service-check-missing' : 'quote-service-check-complete'",
      'Transport details incomplete:',
      'Activity timing missing:',
      'Operational details incomplete',
      'supplier confirmation required',
      'voucher required',
      'Missing required components',
      'Pricing warnings',
      'Timing summary',
      'Operational warnings',
      'Optional components not selected',
      'buildQuoteOperationalIntelligence(summary.day, summary.items, plannerProps.excursionTemplates)',
      '<QuoteOperationalIntelligencePanel model={operationalIntelligence} />',
    ]);
  });

  it('shows exact excursion readiness rows without mislabeling incomplete transport as missing', () => {
    expectSourceContains(quoteServicePlannerSource, [
      "if (component.componentType === 'TRANSPORT') {",
      "!item.pickupTime ? 'pickup time missing' : null",
      "!item.pickupLocation ? 'pickup location missing' : null",
      'Transport details incomplete: ${label} - ${missing.join(\', \')}',
      "if (!selected && !component.isOptional) {",
      'missingRequiredComponents.push(`${coverageKey ? OPERATIONAL_COVERAGE_LABELS[coverageKey] : component.componentType}: ${label}`);',
      'if (!selected && component.isOptional) {',
      'optionalComponentsNotSelected.push(`${coverageKey ? OPERATIONAL_COVERAGE_LABELS[coverageKey] : component.componentType}: ${label}`);',
      'const hasTemplateSignals =',
      'model.operationalDetailIssues.length > 0',
      'model.warnings.length > 0 ? (',
      'model.optionalComponentsNotSelected.length > 0 ? (',
    ]);
    assert.equal(quoteServicePlannerSource.includes('Optional components not selected</strong>\\n          {model.missingRequiredComponents.map'), false);
  });

  it('renders quote-scoped passenger management on the itinerary page', () => {
    expectSourceContains(pageSource, [
      "import type { QuotePassenger } from './QuotePassengersPanel';",
      '<QuoteItineraryWorkspace',
      'passengers: QuotePassenger[];',
      'passengers: Array.isArray(quote.passengers) ? quote.passengers : []',
      'quote={quote}',
      'totalPax={totalPax}',
    ]);

    expectSourceContains(quoteItineraryWorkspaceSource, [
      "import { QuotePassengersPanel, type QuotePassenger } from './QuotePassengersPanel';",
      'export function QuoteItineraryWorkspace',
      'quote-operational-collapsible-passengers',
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
      "import type { QuoteRoomingGroup } from './QuoteRoomingPanel';",
      'type QuoteRoomingFetchResult =',
      'async function getQuoteRooming(id: string): Promise<QuoteRoomingFetchResult>',
      "`${DATA_API_BASE_URL}/quotes/${id}/rooming`",
      'const quoteRoomingGroups = quoteRoomingResult.roomingGroups;',
      'quoteRoomingGroups={quoteRoomingGroups}',
    ]);

    expectSourceContains(quoteItineraryWorkspaceSource, [
      "import { QuoteRoomingPanel, type QuoteRoomingGroup } from './QuoteRoomingPanel';",
      'quote-operational-collapsible-rooming',
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
      'Edit Rooming',
      'Save rooming changes',
      'Cancel edit',
      'Assign passenger',
      'Unassigned passengers',
      'Critical:',
      'Occupancy review:',
      'Passenger assignment:',
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

  it('adds sticky operational summary and collapsible itinerary workspace sections', () => {
    expectSourceContains(pageSource, [
      '<QuoteItineraryWorkspace',
      'operationalSidebarTone={operationalSidebarTone}',
      'readiness={readiness}',
      'servicePlanner={renderQuoteServicePlanner()}',
      'guidedStepFooter={guidedStepFooter}',
      'quote-builder-layout-${activeTab}',
    ]);

    expectSourceContains(quoteItineraryWorkspaceSource, [
      "import styles from './QuoteItineraryWorkspace.module.css';",
      'className={`${styles.operationalSidebar} ${operationalSidebarToneClass} quote-operational-sidebar quote-operational-sidebar-${operationalSidebarTone}`}',
      'quote-itinerary-ops-layout',
      'quote-itinerary-ops-main',
      '<p className="eyebrow">Operational Readiness</p>',
      '<span>Passengers</span>',
      '<span>Rooming</span>',
      '<span>Pricing warnings</span>',
      '<span>Unresolved items</span>',
      '<span>Day coverage</span>',
      'quote-operational-collapsible-passengers',
      'quote-operational-collapsible-rooming',
    ]);

    expectSourceContains(quoteItineraryWorkspaceCssSource, [
      '.workspace',
      'grid-template-columns: minmax(0, 1fr);',
      'container-type: inline-size;',
      '.main',
      '.operationalSidebar',
      'position: static;',
      '.operationalSidebarCritical',
      '.operationalSidebarWarning',
      '.operationalSidebarReady',
      '@container (min-width: 106rem)',
      'grid-template-columns: minmax(15rem, 18rem) minmax(0, 1fr);',
      '@media (max-width: 980px)',
    ]);

    expectSourceContains(quoteServicePlannerSource, [
      "import laneStyles from './QuoteServiceLaneBoard.module.css';",
      'function QuoteServiceLaneBoard',
      'data-testid="quote-service-lane-board"',
      'function QuoteServiceLane',
      'data-testid="quote-service-lane"',
      'function QuoteServiceCard',
      'data-testid="quote-service-card"',
      'data-testid="quote-service-card-title"',
      'data-testid="quote-service-card-actions"',
      '<QuoteServiceLaneBoard',
      "import { QuoteDayPlannerDayLayout, QuoteDayPlannerLayout, getQuoteDayNavigationClassName } from './QuoteDayPlannerLayout';",
      '<QuoteDayPlannerLayout',
      'dayNavigation={',
      'className={getQuoteDayNavigationClassName()}',
      '<QuoteDayPlannerDayLayout',
      'quote-operational-collapsible-cleanup',
      'quote-operational-collapsible-excursions',
      'quote-operational-collapsible-services',
      'quote-operational-collapsible-intelligence',
      '<em>Operational flow</em>',
    ]);

    expectSourceContains(quoteServiceLaneBoardCssSource, [
      '.board',
      'grid-template-columns: repeat(auto-fit, minmax(min(100%, 28rem), 1fr));',
      'container-type: inline-size;',
      '.lane',
      '.card',
      '.titleRow',
      'grid-template-columns: minmax(16rem, 1fr) minmax(8.5rem, max-content);',
      '.cardList.cardList',
      'grid-auto-flow: row;',
      'scroll-snap-type: none;',
      '.card.card',
      '.titleCopy h5',
      'word-break: normal;',
      'overflow-wrap: normal;',
      'overflow-wrap: break-word;',
      '.actions',
      'display: flex;',
      'flex-wrap: wrap;',
      '@container (max-width: 38rem)',
    ]);

    expectSourceContains(quoteDayPlannerLayoutSource, [
      "import styles from './QuoteDayPlannerLayout.module.css';",
      'export function QuoteDayPlannerLayout',
      'className={styles.container}',
      'quote-service-planner-shell quote-service-planner-saas-grid',
      'quote-service-day-column',
      'export function QuoteDayPlannerDayLayout',
      'quote-service-day-layout quote-service-day-layout-visual',
      'quote-service-current-services quote-service-day-main',
      'export function getQuoteDayNavigationClassName',
      'quote-service-day-nav',
    ]);

    expectSourceContains(quoteDayPlannerLayoutCssSource, [
      '.container',
      'container-type: inline-size;',
      '.shell:global(.quote-service-planner-shell.quote-service-planner-saas-grid)',
      'grid-template-columns: minmax(13rem, 17.5rem) minmax(0, 1fr);',
      '.dayNavigation.dayNavigation:global(.quote-service-day-nav)',
      '.mainColumn.mainColumn:global(.quote-service-day-column)',
      '.dayLayout.dayLayout:global(.quote-service-day-layout.quote-service-day-layout-visual)',
      '.sidePanelStack',
      '@media (max-width: 980px)',
      '@container (max-width: 78rem)',
      '@media (max-width: 760px)',
    ]);

    expectSourceContains(cssSource, [
      '.quote-operational-collapsible',
      '.quote-service-planner .quote-service-lane-head span::before',
      '.quote-builder-layout-itinerary',
      'grid-template-columns: minmax(0, 1fr);',
      '@media (min-width: 2200px)',
      '.quote-dashboard-workflow,\n.quote-step-nav',
      'grid-auto-flow: column;',
      'grid-auto-columns: minmax(12rem, max-content);',
      'overflow-x: auto;',
      '.quote-dashboard-workflow-step,\n.quote-step-link',
      'min-width: 12rem;',
      'word-break: normal;',
      'text-overflow: ellipsis;',
    ]);

    assert.doesNotMatch(cssSource, /^\.quote-itinerary-ops-layout\s*\{/m);
    assert.doesNotMatch(cssSource, /^\.quote-itinerary-ops-main\s*\{/m);
    assert.doesNotMatch(cssSource, /^\.quote-operational-sidebar\s*\{/m);
    assert.doesNotMatch(cssSource, /\.quote-service-planner \.quote-service-visual-board\s*\{[^}]*display:\s*grid;/);
    assert.doesNotMatch(cssSource, /\.quote-service-planner \.quote-service-card-row\s*\{[^}]*grid-template-columns:/);
    assert.doesNotMatch(cssSource, /\.quote-service-planner \.quote-service-mini-card-title-row\s*\{[^}]*grid-template-columns:/);
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

  it('separates operator costing from client sell summary on the quote commercial panel', () => {
    expectSourceContains(quoteSummaryPanelSource, [
      '<p className="eyebrow">Commercial Summary</p>',
      '<h3>Operator and client views</h3>',
      '<p className="eyebrow">Operator / Internal Cost View</p>',
      '<p className="eyebrow">Client Proposal / Sell View</p>',
      '<span>Total cost</span>',
      '<span>Total sell</span>',
      '<span>Profit</span>',
      '<span>Margin</span>',
      '<span>Price per pax</span>',
      'Internal costing stays in the operator view only.',
    ]);
  });

  it('makes unpriced pricing warnings actionable by day and category', () => {
    expectSourceContains(quotePricingTableSource, [
      'formatPricingIssueDay(item, itineraryDays)',
      "category: item.service.category || 'Service'",
      '<p className="table-subcopy">{item.dayLabel} / {item.category}</p>',
      '<p className="table-subcopy">{item.action}</p>',
      "return 'Add supplier cost or confirm included cost.';",
      "return 'Add client sell price or mark as included intentionally.';",
    ]);

    expectSourceContains(pageSource, [
      'itineraryDays={quote.itineraries.map((day) => ({',
      'dayNumber: day.dayNumber',
      'title: day.title',
    ]);
  });

  it('adds margin intelligence to live pricing and quote item cards without repricing', () => {
    expectSourceContains(quoteServicePlannerSource, [
      'calculateProfit(item.totalSell, item.totalCost)',
      'calculateMarginPercent(item.totalSell, item.totalCost)',
      'getItemMarginWarning(item.totalSell, item.totalCost)',
      'Total cost <span className="quote-money">{formatLiveMoney(item.totalCost',
      'Profit {formatLiveMoney(itemProfit',
      'Margin {formatMarginPercent(itemMarginPercent)}',
      'getQuoteMarginWarning(summary.totalSell, summary.totalCost)',
    ]);

    expectSourceContains(quoteItemCardSource, [
      'quote-item-margin-intelligence',
      'Total sell {formatMoney(currentItem.totalSell, currentItem.currency)}',
      'Total cost {formatMoney(currentItem.totalCost, currentItem.currency)}',
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

  it('debounces hotel contract cost calculation and clears stale BB/HB request loading state', () => {
    const quoteItemsFormSource = readFileSync(new URL('./QuoteItemsForm.tsx', import.meta.url), 'utf8');
    const calculationStart = quoteItemsFormSource.indexOf('fetch(`/api/hotel-rates/calculate-hotel-cost?${requestKey}`, { signal: abortController.signal })');
    const calculationBlock = quoteItemsFormSource.slice(Math.max(0, calculationStart - 1600), calculationStart + 1800);

    expectSourceContains(quoteItemsFormSource, [
      'const hotelCostDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);',
      'const hotelCostInFlightKeyRef = useRef<string | null>(null);',
      'const hotelCostLastRequestedKeyRef = useRef<string | null>(null);',
      'const hotelCostAbortRef = useRef<AbortController | null>(null);',
      'const requestKey = params.toString();',
      'if (hotelCostInFlightKeyRef.current === requestKey) {',
      'hotelCostAbortRef.current?.abort();',
      'hotelCostDebounceRef.current = setTimeout(() => {',
      'const abortController = new AbortController();',
      '}, 400);',
      'fetch(`/api/hotel-rates/calculate-hotel-cost?${requestKey}`, { signal: abortController.signal })',
      "caughtError instanceof Error && caughtError.name === 'AbortError'",
      'if (hotelCostLastRequestedKeyRef.current !== requestKey) {',
      'setError(caughtError instanceof Error ? caughtError.message : \'Could not calculate hotel contract pricing.\');',
      'setIsLoadingHotelCost(false);',
    ]);
    assert.match(calculationBlock, /setHotelCostCalculation\(result\)/);
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
      'roomCount: usesRoomNightFields ? Number(roomCount) : undefined',
    ]);
  });

  it('renders quote item drawer fields by service type instead of generic room-night fields', () => {
    const quoteItemsFormSource = readFileSync(new URL('./QuoteItemsForm.tsx', import.meta.url), 'utf8');

    expectSourceContains(quoteItemsFormSource, [
      'Ticket pricing',
      'Pax, unit, and markup',
      'Ticket items use ticket basis and pax. Room and night fields are not used.',
      'value={ticketPricingBasis.replace(/_/g, \' \')}',
      'const usesRoomNightFields = isHotelService;',
      'roomCount: usesRoomNightFields ? Number(roomCount) : undefined',
      'nightCount: usesRoomNightFields ? Number(nightCount) : undefined',
      '{usesRoomNightFields ? (',
      'value={activityPricingBasis.replace(/_/g, \' \')}',
      "resolvedTransportPricing.pricingMode === 'capacity_unit'",
    ]);

    assert.equal(quoteItemsFormSource.includes('{hasPrimarySelection && !isTransportService && !isHotelService && !isActivityService ? ('), false);
    assert.equal(quoteItemsFormSource.includes('<input value={dayCount} onChange={(event) => setDayCount(event.target.value)} type="number" min="1" required />'), false);
  });

  it('keeps Other service selection scoped to active non-ticket service catalog rows', () => {
    const quoteItemsFormSource = readFileSync(new URL('./QuoteItemsForm.tsx', import.meta.url), 'utf8');

    expectSourceContains(quoteItemsFormSource, [
      'active?: boolean | null;',
      'isActive?: boolean | null;',
      "function isActiveSupplierService(service: Pick<SupplierService, 'active' | 'isActive'>)",
      'function isTicketingOrEntranceCatalogService(service: SupplierService)',
      'Boolean(service.ticketRateVariants?.length)',
      "taxonomyText.includes('ticket')",
      "taxonomyText.includes('entrance')",
      'function isOtherSupplierService(service: SupplierService)',
      "if (getServiceTypeKey(service) !== 'other')",
      'return !isTicketingOrEntranceCatalogService(service);',
      'function matchesPlannerServiceType(service: SupplierService, serviceType: ServiceTypeKey)',
      "if (serviceType === 'other')",
      'return isOtherSupplierService(service);',
      'services.filter((service) => matchesPlannerServiceType(service, activeServiceType))',
      'filteredServices.find((service) => service.id === serviceId)',
      'services.filter((service) => matchesPlannerServiceType(service, button.key)).length',
    ]);

    assert.equal(quoteItemsFormSource.includes('services.find((service) => service.id === serviceId)'), false);
  });

  it('reopens touring transport quote items in touring-aware edit mode', () => {
    const quoteItemsFormSource = readFileSync(new URL('./QuoteItemsForm.tsx', import.meta.url), 'utf8');
    const quoteServicePlannerSource = readFileSync(new URL('./QuoteServicePlanner.tsx', import.meta.url), 'utf8');
    const quoteServicesTableSource = readFileSync(new URL('./QuoteServicesTable.tsx', import.meta.url), 'utf8');
    const quoteItemCardSource = readFileSync(new URL('./QuoteItemCard.tsx', import.meta.url), 'utf8');

    expectSourceContains(pageSource, [
      'const sourceMetadata = (rawItem?.sourceMetadata && typeof rawItem.sourceMetadata === \'object\' ? rawItem.sourceMetadata : {})',
      'routeId: item?.routeId ?? item?.appliedVehicleRate?.routeId ?? sourceMetadata.routeId ?? null',
      'transportServiceTypeId: item?.transportServiceTypeId ?? item?.appliedVehicleRate?.serviceType?.id ?? sourceMetadata.transportServiceTypeId ?? null',
      'touringRouteId: item?.touringRouteId ?? item?.touringRoute?.id ?? item?.touringRoutePricing?.touringRouteId ?? sourceMetadata.touringRouteId ?? null',
      'touringRoutePricingId: item?.touringRoutePricingId ?? item?.touringRoutePricing?.id ?? sourceMetadata.touringRoutePricingId ?? null',
      'touringRoutePricing: item?.touringRoutePricing',
    ]);
    expectSourceContains(quoteServicePlannerSource, [
      'isImportedResolvableDraftItem',
      "submitLabel={isResolvingImportedDraft ? 'Resolve service' : 'Save service'}",
      'refreshOnSaved={!isResolvingImportedDraft}',
      "routeId: item.routeId || item.appliedVehicleRate?.routeId || ''",
      'touringRouteId: item.touringRouteId || item.touringRoute?.id || \'\'',
      'touringRoutePricingId: item.touringRoutePricingId || item.touringRoutePricing?.id || \'\'',
    ]);
    expectSourceContains(quoteItemsFormSource, [
      'refreshOnSaved = true',
      'setShowHotelRateModal(false);',
      'setPendingHotelRateSubmit(false);',
      'if (refreshOnSaved) {',
      'router.refresh();',
    ]);
    expectSourceContains(quoteServicesTableSource, [
      'touringRouteId: item.touringRouteId || item.touringRoute?.id || \'\'',
      'touringRoutePricingId: item.touringRoutePricingId || item.touringRoutePricing?.id || \'\'',
    ]);
    expectSourceContains(quoteItemCardSource, [
      'touringRouteId: currentItem.touringRouteId || currentItem.touringRoute?.id || \'\'',
      'touringRoutePricingId: currentItem.touringRoutePricingId || currentItem.touringRoutePricing?.id || \'\'',
    ]);
    expectSourceContains(quoteItemsFormSource, [
      'const [touringRouteId] = useState(initialValues?.touringRouteId || initialValues?.touringRoute?.id || \'\');',
      'const [touringRoutePricingId] = useState(initialValues?.touringRoutePricingId || initialValues?.touringRoutePricing?.id || \'\');',
      'const isTouringTransportEdit = Boolean(isTransportService && (touringRouteId || touringRoutePricingId || initialValues?.touringRoute));',
      'Touring route transport',
      'Regular transfer pricing modes are not used.',
      'touringRouteId: isTouringTransportEdit ? touringRouteId || initialValues?.touringRoute?.id || undefined : undefined',
      'touringRoutePricingId: isTouringTransportEdit ? touringRoutePricingId || initialValues?.touringRoutePricing?.id || undefined : undefined',
      'isTransportService && !isTouringTransportEdit',
    ]);
  });

  it('resolves imported hotel placeholders through a single planner-owned refresh', () => {
    const quoteItemsFormSource = readFileSync(new URL('./QuoteItemsForm.tsx', import.meta.url), 'utf8');

    expectSourceContains(quoteServicePlannerSource, [
      'function isImportedResolvableDraftItem(item: QuoteItem)',
      "submitLabel={isResolvingImportedDraft ? 'Resolve service' : 'Save service'}",
      'refreshOnSaved={!isResolvingImportedDraft}',
      'setActiveServicePanel(null);',
      'void refreshScopeItemsFromQuote().catch',
    ]);
    expectSourceContains(quoteItemsFormSource, [
      'refreshOnSaved = true',
      'setShowHotelRateModal(false);',
      'setPendingHotelRateSubmit(false);',
      'if (refreshOnSaved) {',
      'router.refresh();',
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

  it('adds excursion templates with selectable origin variants and touring route pricing', () => {
    expectSourceContains(quoteServicePlannerSource, [
      'Origin Variant',
      'Vehicle / pricing option',
      'selectedTouringRouteId',
      'selectedTouringRoutePricingId',
      'quote-origin-variant-panel',
      'isQuoteReadyOriginVariant',
      'isOriginVariantCandidate',
      'hasQuoteReadyOriginVariants',
      'No quote-ready origin variants. Link touring routes in the excursion template first.',
      'shouldBlockInsertForOriginVariantReadiness',
      'formatOriginAwareExcursionName',
      'formatExcursionTouringRoutePath',
      'formatExcursionVariantPricing',
      'selectedTouringRouteId: selectedOriginVariant?.touringRouteId || null',
      'selectedTouringRoutePricingId: selectedOriginVariantPricing?.id || null',
      'Excursion template:',
      'Departure:',
      'Route:',
    ]);
  });

  it('renders selected excursion origin variants with origin-aware quote labels', () => {
    assert.equal(
      formatOriginAwareExcursionName({
        overrideReason: 'Excursion template: Petra Guided Experience | Excursion origin variant pricing',
        touringRoute: { name: 'Aqaba Petra Full Day', startCity: 'Aqaba' },
      }),
      'Petra Guided Experience — From Aqaba',
    );

    expectSourceContains(quoteServicePlannerSource, ['getQuoteItemOriginAwareExcursionName', 'formatOriginAwareExcursionName']);
    expectSourceContains(quoteItemCardSource, ['getQuoteItemOriginAwareExcursionName']);
    expectSourceContains(quoteSummaryPanelSource, ['getQuoteItemOriginAwareExcursionName']);
    expectSourceContains(quotePreviewPageSource, ['getQuoteItemOriginAwareExcursionName']);
    expectSourceContains(quoteClientItineraryViewSource, ['getQuoteItemOriginAwareExcursionName']);
    expectSourceContains(versionPageSource, ['getQuoteItemOriginAwareExcursionName']);
  });

  it('ranks QuoteTransportPicker vehicles by pax without hiding manual overrides', () => {
    expectSourceContains(quoteTransportPickerSource, [
      "type VehicleRecommendationGroup = 'Recommended' | 'Available' | 'Too small';",
      'function getRankedVehicles(vehicles: Vehicle[], pax: number): RankedVehicle[]',
      'const fittingVehicles = vehicles.filter((vehicle) => vehicle.maxPax >= requestedPax);',
      'const recommendedCapacity = fittingVehicles.reduce<number | null>',
      "group: isRecommended ? 'Recommended' : isTooSmall ? 'Too small' : 'Available'",
      'const selectedVehicle = allVehicles.find((vehicle) => vehicle.id === selectedVehicleId) || null;',
      'const [paxInput, setPaxInput] = useState',
      'export function formatVehicleOptionLabel(entry: RankedVehicle, vehicleTypes: VehicleTypeOption[])',
      'getJordanVehicleCapacityRange',
      'standardCapacityMatch',
      'formatTransportVehicleDisplay(entry.vehicle, vehicleTypes)',
      'Pax',
      'Select vehicle / capacity',
      '{formatVehicleOptionLabel(entry, vehicleTypes)}',
      'Manual override',
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
      'const pricingCurrency = getQuoteTransportRateCurrency(selectedRate, quoteCurrency);',
      'currency: pricingCurrency,',
      'getQuoteTransportPersistedCostPreview(left.rate, requestedPax, requestedBillableDays)',
      'getQuoteTransportPersistedCostPreview(rate, pax, billableDays)',
      'dayCount: usesBillableDaysInput(selectedPricingMode) ? requestedBillableDays : 1,',
      'Supplier minimum 3 full days may apply.',
    ]);
  });

  it('separates route transfers from program disposal service areas in QuoteTransportPicker', () => {
    expectSourceContains(pageSource, ["`${API_BASE_URL}/routes?type=TRANSFER_ROUTE&limit=200`", 'Quote detail transfer routes']);
    expectSourceContains(quoteTransportPickerSource, [
      'export function formatRouteSelectionLabel(route: RouteOption)',
      'export function getQuoteTransportRouteSelectorGroups(routes: RouteOption[])',
      'function isProgramOrDisposalRouteOption(route: RouteOption)',
      'function isTouringRouteOption(route: RouteOption)',
      'const routeSelectorGroups = useMemo(() => getQuoteTransportRouteSelectorGroups(routes), [routes]);',
      'const routeTransferOptions = routeSelectorGroups.transferRoutes;',
      'const touringRouteOptions = routeSelectorGroups.touringRoutes;',
      'const serviceAreaOptions = routeSelectorGroups.serviceAreas;',
      'const [transportMode, setTransportMode] = useState<TransportSelectionMode>(\'TRANSFER_ROUTE\');',
      '<option value="TRANSFER_ROUTE">Transfer Route</option>',
      '<option value="TOURING_ROUTE">Touring Route</option>',
      '<option value="DISPOSAL">Disposal / Stationary</option>',
      '<optgroup label="Transfer Routes">',
      '<optgroup label="Touring Routes">',
      '<optgroup label="Disposal / Service Areas">',
      'Use Transfer Route for airport/city movement, Touring Route for JOR-TR operational tours, and Disposal / Stationary for service-area operations.',
      'duplicate transfer route or disposal area entries hidden',
    ]);
  });

  it('loads JOR-TR touring routes into QuoteTransportPicker with active pricing rows', () => {
    expectSourceContains(pageSource, [
      "`${API_BASE_URL}/touring-routes?active=true&transportType=TOURING_ROUTE&limit=500`",
      'Quote detail touring routes',
      "String(route.code || '').startsWith('JOR-TR-')",
      'mapTouringRouteToQuoteTransportRouteOption',
      "canonicalRouteType: 'TOURING_ROUTE'",
      "transportPickerMode: 'TOURING_ROUTE'",
      'touringRoutePricings: route.pricings || []',
    ]);

    expectSourceContains(quoteTransportPickerSource, [
      'function getTouringRouteSupplierRateRows(routes: RouteOption[]): VehicleRate[]',
      'touringRouteId: route.id',
      'touringRoutePricingId: pricing.id',
      'price: Number(pricing.baseCost || 0)',
      '...getTouringRouteSupplierRateRows(routes)',
      'getRouteCandidateRates(rates, route, now)',
      'if (isTouringRouteOption(route))',
      'rate.touringRouteId === route.id || rate.routeId === route.id',
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


  it('keeps transport pricing mode select interactive and diagnostics collapsed', () => {
    expectSourceContains(quoteTransportPickerSource, [
      'aria-label="Select pricing mode"',
      'className="quote-transport-pricing-mode-select"',
      'disabled={!selectedRoute || !selectedVehicle}',
      "pricingModesForVehicleIsEmpty ? 'No pricing modes available' : 'Select pricing mode'",
      "className=\"quote-transport-diagnostics\" aria-label=\"Transport pricing diagnostics\"",
      '<summary>Transport pricing diagnostics</summary>',
      "const SHOW_TRANSPORT_PRICING_DIAGNOSTICS = process.env.NODE_ENV !== 'production';",
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
    assert.equal(quoteTransportPickerSource.includes('disabled={!selectedRoute || !selectedVehicle || pricingModesForVehicleIsEmpty}'), false);
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
      'item.appliedVehicleRate.serviceType?.name || item.service?.serviceType?.name || item.service?.category || \'Transport\'',
      'return item.appliedVehicleRate?.serviceType?.name || item.service.serviceType?.name || item.service.category || \'Service\';',
    ]);

    expectSourceContains(readFileSync(new URL('./QuoteItemCard.tsx', import.meta.url), 'utf8'), [
      'return buildTransportServiceDisplayName(item.service?.name || null, getTransportPricingModeDisplayName(item), item.appliedVehicleRate.supplier?.name || null);',
      'const itemDisplayName = hotelItemSummary || activityCatalogName || getQuoteItemServiceName(currentItem);',
    ]);

    expectSourceContains(readFileSync(new URL('./QuoteServicesTable.tsx', import.meta.url), 'utf8'), [
      'function getQuoteItemServiceDisplayName(item: QuoteItem)',
      '<h3>{hotelItemSummary || getQuoteItemServiceDisplayName(currentItem)}</h3>',
      '{getQuoteItemServiceTypeDisplayName(currentItem)}',
    ]);
  });

  it('renders QAIA transport quote items defensively after save when transport snapshots are sparse', () => {
    expectSourceContains(quoteServicePlannerSource, [
      'function getTransportRouteDisplayName(item: QuoteItem)',
      'item.appliedVehicleRate?.serviceType?.name ||',
      "item.service?.category ||",
      "'Route to be confirmed'",
      "item.appliedVehicleRate?.vehicle?.name || 'Vehicle to be confirmed'",
      'routeName: getTransportRouteDisplayName(item)',
    ]);

    expectSourceContains(quoteItemCardSource, [
      'function getTransportRouteDisplayName(item: QuoteItem)',
      'function getTransportPricingModeDisplayName(item: QuoteItem)',
      'currentItem.appliedVehicleRate.vehicle?.name || \'Vehicle to be confirmed\'',
      '{getTransportRouteDisplayName(currentItem)}',
      '| {getTransportPricingModeDisplayName(currentItem)}',
    ]);

    expectSourceContains(quoteTransportPickerSource, [
      "route.fromPlace?.name || route.fromPlaceId || ''",
      "route.toPlace?.name || route.toPlaceId || ''",
      "route.fromPlace?.city || route.toPlace?.city || route.fromPlace?.name || route.toPlace?.name || route.name || 'Route area pending'",
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
      'const routeScopedMatch = searchPool.find((service) => supplierServiceMatchesRateRoute(service, rate));',
      'return modeMatch || serviceTypeMatch || routeScopedMatch || null;',
      'the save mapping is incomplete.',
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

  it('classifies Activity Master sourced quote items into the Activities lane without legacy supplier matching', () => {
    expectSourceContains(pageSource, [
      'activityId: item?.activityId ?? item?.activity?.id ?? null',
      'activityRateVariantId: item?.activityRateVariantId ?? null',
    ]);
    expectSourceContains(quoteReadinessSource, [
      "| 'activityId'",
      "| 'activityRateVariantId'",
      "if (item?.activityId || item?.activityRateVariantId) {\n    return 'activity';\n  }",
    ]);
    expectSourceContains(quoteServicePlannerSource, [
      "function isActivityMasterSourcedItem(item: Pick<QuoteItem, 'activityId' | 'activityRateVariantId' | 'activity'>)",
      "if (isActivityMasterSourcedItem(item)) {\n    return 'activity';\n  }",
      'isImportedResolvableDraftItem(item)',
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
      'touringRouteId: isTouringSelection ? selectedRoute.id : undefined',
      'touringRoutePricingId: isTouringSelection ? selectedRate.touringRoutePricingId || selectedRate.id : undefined',
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

  it('surfaces imported activity completion fields before booking conversion', () => {
    expectSourceContains(pageSource, [
      'collectIncompleteActivityItemLabels',
      'Incomplete Imported Activity / activity items:',
    ]);

    expectSourceContains(quoteItemCardSource, [
      'Incomplete operational details',
      'getIncompleteOperationalDetails',
      'cost/sell pricing',
      'pax count',
    ]);

    expectSourceContains(quoteItemsFormSource, [
      'isImportedActivityEdit',
      'showInlineActivityOperationalFields',
      'Complete the operational details and quote pricing below before converting this quote to a booking.',
      'Start Time',
      'End Time / Duration',
      'Pickup / Meeting Location',
      'Reconfirmation Due Date',
      'Save Activity',
      'open={useOverride || isImportedActivityEdit || activityIssues.length > 0}',
      'required={!isLegacyActivityEdit}',
    ]);
  });
});
