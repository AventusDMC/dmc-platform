import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const quotePageSource = readFileSync(new URL('./[id]/page.tsx', import.meta.url), 'utf8');
const quoteItemCardSource = readFileSync(new URL('./[id]/QuoteItemCard.tsx', import.meta.url), 'utf8');
const quotePlannerSource = readFileSync(new URL('./[id]/QuoteServicePlanner.tsx', import.meta.url), 'utf8');
const quoteAutoItineraryBuilderSource = readFileSync(new URL('./[id]/QuoteAutoItineraryBuilder.tsx', import.meta.url), 'utf8');
const quoteItineraryTabSource = readFileSync(new URL('./[id]/QuoteItineraryTab.tsx', import.meta.url), 'utf8');
const quoteVersionPageSource = readFileSync(new URL('./[id]/versions/[versionId]/page.tsx', import.meta.url), 'utf8');
const bookingPageSource = readFileSync(new URL('../bookings/[id]/page.tsx', import.meta.url), 'utf8');
const bookingCssSource = readFileSync(new URL('../globals.css', import.meta.url), 'utf8');

function expectSourceContains(source: string, fragments: string[]) {
  for (const fragment of fragments) {
    assert.ok(source.includes(fragment), `Expected source to contain: ${fragment}`);
  }
}

describe('activities quote and booking UI integration regression', () => {
  it('renders catalog-backed activity items ahead of free-text service fallback on quote detail', () => {
    expectSourceContains(quotePageSource, [
      'activityId: item?.activityId ?? item?.activity?.id ?? null',
      'activity: item?.activity',
      'durationMinutes: item.activity.durationMinutes ?? null',
      'active: item.activity.active',
    ]);

    expectSourceContains(quoteItemCardSource, [
      'const activityCatalogName = currentItem.activity?.name?.trim() || \'\';',
      'const activityCatalogDescription = currentItem.activity?.description?.trim() || \'\';',
      'const itemDisplayName = hotelItemSummary || activityCatalogName || currentItem.service.name;',
      'data-activity-id={currentItem.activityId || currentItem.activity?.id || undefined}',
      '<h4>{itemDisplayName}</h4>',
      'activityCatalogDescription ||',
    ]);
  });

  it('keeps backward-compatible activity rendering for existing quote items without activityId', () => {
    expectSourceContains(quotePageSource, [
      'function isActivityQuoteItem(item: Pick<QuoteItem, \'service\'>)',
      "normalized.includes('activity')",
      "normalized.includes('tour')",
      "normalized.includes('excursion')",
      "normalized.includes('experience')",
      "normalized.includes('sightseeing')",
    ]);

    expectSourceContains(quoteItemCardSource, [
      'currentItem.service.name',
      'currentItem.pricingDescription ||',
      'function isExternalPackageItem(item: Pick<QuoteItem, \'service\'>)',
      'isExternalPackageCategory(item.service.serviceType?.code || item.service.serviceType?.name || item.service.category)',
    ]);
  });

  it('keeps quote activity pricing visible while client-facing versions hide supplier cost', () => {
    expectSourceContains(quoteItemCardSource, [
      '<strong>{formatMoney(currentItem.totalSell, currentItem.currency)}</strong>',
      'Supplier cost {formatMoney(currentItem.costBaseAmount || 0, currentItem.costCurrency)}',
      'Profit {formatMoney(marginMetrics.profit, currentItem.currency)}',
    ]);

    assert.match(quoteVersionPageSource, /formatMoney\(item\.totalSell, item\.currency\)/);
    assert.doesNotMatch(quoteVersionPageSource, /supplier cost|Supplier cost|costBaseAmount|externalNetCost|margin|Margin/);
  });

  it('keeps activity add/edit affordances and existing quote service handlers wired', () => {
    expectSourceContains(quotePlannerSource, [
      "{ category: 'activity', label: 'Add Activity' }",
      'preferredServiceId={category !== \'hotel\' && category !== \'transport\' ? plannerProps.preferredCatalogServiceId : undefined}',
      '<QuoteItemsForm',
      '<QuoteItemCard',
    ]);
    expectSourceContains(quotePageSource, ['sessionRole={session?.role || null}']);

    expectSourceContains(quoteItemCardSource, [
      'handleAssign(serviceId: string)',
      'fetch(`${apiBaseUrl}/quotes/${quote.id}/items/${item.id}/assign-service`,',
      "method: 'PATCH'",
    ]);
  });

  it('keeps Base Program expanded after itinerary generation and refresh', () => {
    expectSourceContains(quotePlannerSource, [
      'const itineraryDays = localItineraries;',
      'return currentItineraries;',
      "setSelectedScopeId('shared');",
      'className={`workspace-tab-label${selectedScopeId === \'shared\' ? \' workspace-tab-label-active\' : \'\'}`}',
      '<section className="workspace-panel-shared quote-base-program-panel-open" data-locked={itineraryDays.length === 0 ? \'true\' : \'false\'}>',
      '<div id="quote-base-program-days">',
      "{ category: 'hotel', label: 'Add Hotel' }",
      "{ category: 'transport', label: 'Add Transport' }",
      "{ category: 'activity', label: 'Add Activity' }",
      "{ category: 'meal', label: 'Add Meal' }",
    ]);
    assert.doesNotMatch(quotePlannerSource, /baseProgramOpen|setBaseProgramOpen|id="planner-shared"|checked=\{selectedScopeId === 'shared'|workspace-tab-panel workspace-panel-shared/);
  });

  it('keeps assign-service controls unlocked after Apply Itinerary refreshes', () => {
    expectSourceContains(quoteAutoItineraryBuilderSource, [
      'Apply Itinerary',
      'notifySavedDaysReady(savedDays);',
      'router.refresh();',
    ]);

    expectSourceContains(quotePlannerSource, [
      'setLocalItineraries(detail.days);',
      "setSelectedScopeId('shared');",
      'return currentItineraries;',
      'data-locked={itineraryDays.length === 0 ? \'true\' : \'false\'}',
      '<section className="workspace-panel-shared quote-base-program-panel-open"',
    ]);

    expectSourceContains(quoteItineraryTabSource, [
      '<p className="eyebrow">Assign services</p>',
      '<h3>Add existing quote service</h3>',
      '<QuoteItineraryDayItemForm apiBaseUrl={apiBaseUrl} dayId={day.id} services={assignableServices} />',
    ]);

    assert.doesNotMatch(bookingCssSource, /workspace-tabs:has\(#tab-shared:checked\) \.workspace-panel-shared/);
  });

  it('keeps QuoteServicePlanner day service layout compact and full width', () => {
    expectSourceContains(bookingCssSource, [
      '.quote-service-planner .workspace-day-card',
      '.quote-service-day-actions',
      'grid-template-columns: repeat(4, minmax(0, 1fr));',
      '.quote-service-day-action[open]',
      'grid-column: 1 / -1;',
      '.quote-service-day-action .service-type-buttons',
      'display: none;',
      '.quote-service-planner .quote-service-day-layout',
      'grid-template-columns: 1fr;',
      '.quote-service-planner .quote-item-row-main > p:nth-of-type(n + 3)',
    ]);
  });

  it('shows converted activity services on booking itinerary with activityId preserved', () => {
    expectSourceContains(bookingPageSource, [
      'activityId?: string | null;',
      'activity?: {',
      'data-activity-id={service.activityId || service.activity?.id || undefined}',
      '<strong>{service.activity?.name || service.description}</strong>',
      '{service.activity?.description ? <p>{service.activity.description}</p> : null}',
      "<p>{getBookingServiceTimeLabel(service) || 'Timing pending'}</p>",
      "<p>{service.supplierName || 'Supplier unassigned'}</p>",
    ]);
  });

  it('keeps activity booking operations assignable without removing controls', () => {
    expectSourceContains(bookingPageSource, [
      '<option value="ACTIVITY">Activity</option>',
      'renderSupplierOptions(suppliers, service.supplierId)',
      '<input type="text" name="assignedTo"',
      '<input type="time" name="pickupTime"',
      '<input type="text" name="notes"',
      'service.activity?.name || service.description',
      '<button type="submit">Generate Voucher</button>',
    ]);
  });

  it('keeps activity documents visible without leaking supplier cost in document areas', () => {
    expectSourceContains(bookingPageSource, [
      '<p className="eyebrow">Activity Vouchers</p>',
      'Open activity vouchers',
      'href={`/api/vouchers/${voucher.id}/pdf`}',
      '<button type="submit">Issue</button>',
    ]);

    const documentsSection = bookingPageSource.slice(
      bookingPageSource.indexOf("activeTab === 'documents'"),
      bookingPageSource.indexOf("activeTab === 'rooming'"),
    );
    assert.doesNotMatch(documentsSection, /totalCost|totalSell|margin|Margin|costBaseAmount|supplierCost/);
  });

  it('keeps inactive and missing-catalog activities renderable through fallbacks', () => {
    expectSourceContains(quoteItemCardSource, [
      'active?: boolean;',
      'activityCatalogName || currentItem.service.name',
      'activityCatalogDescription ||',
    ]);
    expectSourceContains(bookingPageSource, [
      'active?: boolean;',
      'service.activity?.name || service.description',
      'formatOperationType(service.operationType || service.serviceType)',
    ]);
  });

  it('keeps permission and responsive protections around activity workflows', () => {
    expectSourceContains(quotePlannerSource, ['const showAdminMetrics = props.sessionRole === \'admin\';']);
    expectSourceContains(quotePageSource, ['sessionRole={session?.role || null}', 'activeTab === \'services\'']);
    expectSourceContains(bookingPageSource, [
      'const allowedTransitions = getAllowedBookingStatusTransitions(booking.status);',
      'allowedTransitions.includes',
      'operationType === \'EXTERNAL_PACKAGE\'',
    ]);
    expectSourceContains(bookingCssSource, [
      '.booking-dashboard-service-grid',
      '.booking-dashboard-service-card',
      '@media (max-width: 1180px)',
      '@media (max-width: 720px)',
      '@media (max-width: 640px)',
    ]);
  });
});
