'use client';

import Link from 'next/link';
import { RouteOption } from '../../lib/routes';
import { RowDetailsPanel } from '../../components/RowDetailsPanel';
import { QuoteItemCard } from './QuoteItemCard';
import { QuoteItemsForm } from './QuoteItemsForm';
import { QuoteUnresolvedBatchActions } from './QuoteUnresolvedBatchActions';
import {
  buildQuoteWorkspaceHref,
  buildQuoteReadinessModel,
  getQuoteServiceCategoryKey,
  type QuoteReadinessDay,
  type QuoteReadinessItem,
  type QuoteReadinessQuote,
  type QuoteReadinessStep,
  type QuoteReadinessSuggestion,
  type ServicePlannerCategory,
} from './quote-readiness';

type SupplierService = {
  id: string;
  supplierId: string;
  name: string;
  category: string;
  serviceTypeId?: string | null;
  serviceType?: {
    id: string;
    name: string;
    code: string | null;
    isActive: boolean;
  } | null;
  unitType: string;
  baseCost: number;
  currency: string;
};

type Hotel = {
  id: string;
  name: string;
  city: string;
  category: string;
  hotelCategoryId?: string | null;
  roomCategories: {
    id: string;
    name: string;
    code: string | null;
    isActive: boolean;
  }[];
};

type HotelContract = {
  id: string;
  hotelId: string;
  name: string;
  currency: string;
  validFrom: string;
  validTo: string;
  hotel: {
    id: string;
    name: string;
  };
};

type TransportServiceType = {
  id: string;
  name: string;
  code: string;
};

type QuoteBlock = {
  id: string;
  name: string;
  type: 'ITINERARY_DAY' | 'SERVICE_BLOCK';
  title: string;
  description: string | null;
  defaultServiceId: string | null;
  defaultServiceTypeId: string | null;
  defaultCategory: string | null;
  defaultCost: number | null;
  defaultSell: number | null;
  defaultService?: SupplierService | null;
  defaultServiceType?: {
    id: string;
    name: string;
    code: string | null;
    isActive: boolean;
  } | null;
};

type HotelRate = {
  id: string;
  contractId: string;
  seasonName: string;
  roomCategoryId: string;
  occupancyType: 'SGL' | 'DBL' | 'TPL';
  mealPlan: 'BB' | 'HB' | 'FB';
  currency: string;
  cost: number;
  roomCategory: {
    id: string;
    name: string;
    code: string | null;
  };
};

type QuoteItem = Omit<QuoteReadinessItem, 'service' | 'hotel'> & {
  service: SupplierService;
  hotel: {
    name: string;
  } | null;
  quantity: number;
  roomCount: number | null;
  nightCount: number | null;
  dayCount: number | null;
  baseCost: number;
  overrideCost: number | null;
  useOverride: boolean;
  currency: string;
  pricingDescription: string | null;
  markupPercent: number;
  appliedVehicleRate: {
    id: string;
    routeId: string | null;
    routeName: string;
    vehicle: {
      name: string;
    };
    serviceType: {
      id: string;
      name: string;
      code: string;
    };
  } | null;
  contract: {
    name: string;
  } | null;
  roomCategory: {
    name: string;
  } | null;
  hotelId: string | null;
  contractId: string | null;
  seasonId: string | null;
  seasonName: string | null;
  roomCategoryId: string | null;
  occupancyType: 'SGL' | 'DBL' | 'TPL' | null;
  mealPlan: 'BB' | 'HB' | 'FB' | null;
};

type Quote = Omit<QuoteReadinessQuote, 'itineraries' | 'quoteItems' | 'quoteOptions'> & {
  adults: number;
  children: number;
  roomCount: number;
  nightCount: number;
  travelStartDate: string | null;
  itineraries: QuoteReadinessDay[];
  quoteItems: QuoteItem[];
  quoteOptions: Array<{
    id: string;
    name: string;
    quoteItems: QuoteItem[];
  }>;
};

type QuoteServicePlannerProps = {
  apiBaseUrl: string;
  quote: Quote;
  quoteBlocks: QuoteBlock[];
  services: SupplierService[];
  transportServiceTypes: TransportServiceType[];
  routes: RouteOption[];
  hotels: Hotel[];
  hotelContracts: HotelContract[];
  hotelRates: HotelRate[];
  seasons: Array<{
    id: string;
    name: string;
  }>;
  totalPax: number;
  routeContext: {
    quoteId: string;
  };
  focusedDayId?: string;
  initialAddCategory?: ServicePlannerCategory;
  preferredCatalogServiceId?: string;
  preferredCatalogHotelId?: string;
  preferredCatalogContractId?: string;
  preferredCatalogRoomCategoryId?: string;
  preferredCatalogMealPlan?: 'RO' | 'BB' | 'HB' | 'FB' | 'AI';
  preferredCatalogOccupancyType?: 'SGL' | 'DBL' | 'TPL';
  preferredCatalogRateCost?: string;
  preferredCatalogRateCurrency?: string;
  preferredCatalogRateNote?: string;
  preferredCatalogRouteId?: string;
};

type QuoteItemInitialValues = {
  serviceId: string;
  quantity: string;
  markupPercent: string;
  paxCount: string;
  participantCount: string;
  adultCount: string;
  childCount: string;
  roomCount: string;
  nightCount: string;
  dayCount: string;
  serviceDate: string;
  startTime: string;
  pickupTime: string;
  pickupLocation: string;
  meetingPoint: string;
  reconfirmationRequired: boolean;
  reconfirmationDueAt: string;
  baseCost: string;
  overrideCost: string;
  useOverride: boolean;
  transportServiceTypeId: string;
  routeId: string;
  routeName: string;
  hotelId: string;
  contractId: string;
  seasonId: string;
  seasonName: string;
  roomCategoryId: string;
  occupancyType: 'SGL' | 'DBL' | 'TPL';
  mealPlan: 'BB' | 'HB' | 'FB';
  guideType: 'local' | 'escort';
  guideDuration: 'half_day' | 'full_day';
  overnight: 'no' | 'yes';
};

type PlannerScope = {
  id: string;
  label: string;
  items: QuoteItem[];
  optionId?: string;
};

const CATEGORY_LABELS: Record<ServicePlannerCategory, string> = {
  hotel: 'Stay',
  transport: 'Transfer',
  guide: 'Guide',
  activity: 'Experience',
  meal: 'Meals',
  other: 'Other',
};

const DAY_WORKFLOW_ACTIONS: Array<{ category: ServicePlannerCategory; label: string }> = [
  { category: 'hotel', label: 'Add Hotel' },
  { category: 'transport', label: 'Add Transfer' },
  { category: 'activity', label: 'Add Experience' },
  { category: 'meal', label: 'Add Meal' },
];

const DAY_COMPLETENESS_RULES: Array<{ key: ServicePlannerCategory; label: string }> = [
  { key: 'hotel', label: 'Stay' },
  { key: 'transport', label: 'Transfer' },
  { key: 'activity', label: 'Experience' },
];

function formatDayHeading(day: QuoteReadinessDay, inferredCity?: string | null) {
  const dayLabel = `Day ${String(day.dayNumber).padStart(2, '0')}`;
  const locationLabel = inferredCity || day.title || `Day ${day.dayNumber}`;
  return `${dayLabel} — ${locationLabel}`;
}

function parseGuideInitialValues(pricingDescription: string | null) {
  const normalized = pricingDescription?.toLowerCase() || '';

  return {
    guideType: normalized.includes('escort') ? ('escort' as const) : ('local' as const),
    guideDuration: normalized.includes('half day') ? ('half_day' as const) : ('full_day' as const),
    overnight: normalized.includes('overnight: yes') ? ('yes' as const) : ('no' as const),
  };
}

function buildQuoteItemInitialValues(item: QuoteItem, totalPax: number, roomCount: number, nightCount: number): QuoteItemInitialValues {
  const guideValues = parseGuideInitialValues(item.pricingDescription);

  return {
    serviceId: item.service.id,
    quantity: String(item.quantity),
    markupPercent: String(item.markupPercent),
    paxCount: String(item.paxCount ?? totalPax),
    participantCount: String(item.participantCount ?? totalPax),
    adultCount: String(item.adultCount ?? 0),
    childCount: String(item.childCount ?? 0),
    roomCount: String(item.roomCount ?? roomCount),
    nightCount: String(item.nightCount ?? nightCount),
    dayCount: String(item.dayCount ?? 1),
    serviceDate: item.serviceDate ? item.serviceDate.slice(0, 10) : '',
    startTime: item.startTime || '',
    pickupTime: item.pickupTime || '',
    pickupLocation: item.pickupLocation || '',
    meetingPoint: item.meetingPoint || '',
    reconfirmationRequired: item.reconfirmationRequired,
    reconfirmationDueAt: item.reconfirmationDueAt ? item.reconfirmationDueAt.slice(0, 16) : '',
    baseCost: String(item.baseCost),
    overrideCost: item.overrideCost === null ? '' : String(item.overrideCost),
    useOverride: item.useOverride,
    transportServiceTypeId: item.appliedVehicleRate?.serviceType.id || '',
    routeId: item.appliedVehicleRate?.routeId || '',
    routeName: item.appliedVehicleRate?.routeName || '',
    hotelId: item.hotelId || '',
    contractId: item.contractId || '',
    seasonId: item.seasonId || '',
    seasonName: item.seasonName || '',
    roomCategoryId: item.roomCategoryId || '',
    occupancyType: item.occupancyType || 'DBL',
    mealPlan: item.mealPlan || 'BB',
    guideType: guideValues.guideType,
    guideDuration: guideValues.guideDuration,
    overnight: guideValues.overnight,
  };
}

function PlannerSuggestionAction({
  suggestion,
  apiBaseUrl,
  quote,
  quoteBlocks,
  services,
  transportServiceTypes,
  routes,
  hotels,
  hotelContracts,
  hotelRates,
  seasons,
  totalPax,
  optionId,
  itineraryDay,
}: {
  suggestion: QuoteReadinessSuggestion;
  apiBaseUrl: string;
  quote: Quote;
  quoteBlocks: QuoteBlock[];
  services: SupplierService[];
  transportServiceTypes: TransportServiceType[];
  routes: QuoteServicePlannerProps['routes'];
  hotels: Hotel[];
  hotelContracts: HotelContract[];
  hotelRates: HotelRate[];
  seasons: QuoteServicePlannerProps['seasons'];
  totalPax: number;
  optionId?: string;
  itineraryDay: QuoteReadinessDay;
}) {
  return (
    <RowDetailsPanel
      summary={suggestion.title}
      description={suggestion.description}
      className="operations-row-details quote-service-suggestion-panel"
      bodyClassName="operations-row-details-body"
      groupId={`quote-service-suggestions-${optionId || 'base'}-${itineraryDay.id}`}
    >
      <QuoteItemsForm
        apiBaseUrl={apiBaseUrl}
        quoteId={quote.id}
        optionId={optionId}
        blocks={quoteBlocks}
        services={services}
        transportServiceTypes={transportServiceTypes}
        routes={routes}
        hotels={hotels}
        hotelContracts={hotelContracts}
        hotelRates={hotelRates}
        seasons={seasons}
        defaultPaxCount={totalPax}
        defaultAdultCount={quote.adults}
        defaultChildCount={quote.children}
        defaultRoomCount={quote.roomCount}
        defaultNightCount={quote.nightCount}
        travelStartDate={quote.travelStartDate}
        itineraryDayNumber={itineraryDay.dayNumber}
        itineraryId={itineraryDay.id}
        initialServiceTypeKey={suggestion.category}
        submitLabel={`Add ${suggestion.category}`}
      />
    </RowDetailsPanel>
  );
}

function renderItemGroup(
  category: ServicePlannerCategory,
  items: QuoteItem[],
  props: Omit<QuoteServicePlannerProps, 'buildStepHref'>,
  optionId?: string,
) {
  if (items.length === 0) {
    return null;
  }

  return (
    <section key={category} className="quote-service-category-group">
      <div className="workspace-section-head quote-service-group-head">
        <div>
          <h4>{CATEGORY_LABELS[category]}</h4>
        </div>
        <span className="page-tab-badge">{items.length}</span>
      </div>

      <div className="section-stack">
        {items.map((item) => (
          <QuoteItemCard
            key={item.id}
            apiBaseUrl={props.apiBaseUrl}
            quote={props.quote}
            item={item}
            quoteBlocks={props.quoteBlocks}
            services={props.services}
            transportServiceTypes={props.transportServiceTypes}
            routes={props.routes}
            hotels={props.hotels}
            hotelContracts={props.hotelContracts}
            hotelRates={props.hotelRates}
            seasons={props.seasons}
            totalPax={props.totalPax}
            optionId={optionId}
            initialValues={buildQuoteItemInitialValues(item, props.totalPax, props.quote.roomCount, props.quote.nightCount)}
          />
        ))}
      </div>
    </section>
  );
}

function DayWorkflowAction({
  category,
  label,
  plannerProps,
  optionId,
  day,
}: {
  category: ServicePlannerCategory;
  label: string;
  plannerProps: QuoteServicePlannerProps;
  optionId?: string;
  day: QuoteReadinessDay;
}) {
  const returnTo = buildQuoteWorkspaceHref(plannerProps.routeContext.quoteId, 'services', {
    day: day.id,
    addCategory: category,
  });
  const browseHref =
    category === 'hotel'
      ? `/hotels?tab=hotels&returnTo=${encodeURIComponent(returnTo)}`
      : category === 'transport'
        ? `/transport?tab=routes&returnTo=${encodeURIComponent(returnTo)}`
        : `/catalog?tab=services&returnTo=${encodeURIComponent(returnTo)}&type=${encodeURIComponent(category)}`;

  return (
    <RowDetailsPanel
      summary={label}
      description={`Add a ${label.toLowerCase().replace('add ', '')} service to Day ${day.dayNumber}.`}
      defaultOpen={plannerProps.focusedDayId === day.id && plannerProps.initialAddCategory === category}
      className="operations-row-details quote-service-day-action"
      bodyClassName="operations-row-details-body"
      groupId={`quote-service-day-action-${optionId || 'base'}-${day.id}-${category}`}
    >
      <div className="quote-service-catalog-link">
        <span>Need to browse the catalog first?</span>
        <Link href={browseHref} className="secondary-button">
          Browse {category === 'hotel' ? 'Hotels' : category === 'transport' ? 'Transport' : 'Experiences'}
        </Link>
      </div>
      <QuoteItemsForm
        apiBaseUrl={plannerProps.apiBaseUrl}
        quoteId={plannerProps.quote.id}
        optionId={optionId}
        blocks={plannerProps.quoteBlocks}
        services={plannerProps.services}
        transportServiceTypes={plannerProps.transportServiceTypes}
        routes={plannerProps.routes}
        hotels={plannerProps.hotels}
        hotelContracts={plannerProps.hotelContracts}
        hotelRates={plannerProps.hotelRates}
        seasons={plannerProps.seasons}
        defaultPaxCount={plannerProps.totalPax}
        defaultAdultCount={plannerProps.quote.adults}
        defaultChildCount={plannerProps.quote.children}
        defaultRoomCount={plannerProps.quote.roomCount}
        defaultNightCount={plannerProps.quote.nightCount}
        travelStartDate={plannerProps.quote.travelStartDate}
        itineraryDayNumber={day.dayNumber}
        itineraryId={day.id}
        initialServiceTypeKey={category}
        preferredServiceId={category !== 'hotel' && category !== 'transport' ? plannerProps.preferredCatalogServiceId : undefined}
        preferredHotelId={category === 'hotel' ? plannerProps.preferredCatalogHotelId : undefined}
        preferredContractId={category === 'hotel' ? plannerProps.preferredCatalogContractId : undefined}
        preferredRoomCategoryId={category === 'hotel' ? plannerProps.preferredCatalogRoomCategoryId : undefined}
        preferredMealPlan={category === 'hotel' ? plannerProps.preferredCatalogMealPlan : undefined}
        preferredOccupancyType={category === 'hotel' ? plannerProps.preferredCatalogOccupancyType : undefined}
        preferredRateCost={category === 'hotel' ? plannerProps.preferredCatalogRateCost : undefined}
        preferredRateCurrency={category === 'hotel' ? plannerProps.preferredCatalogRateCurrency : undefined}
        preferredRateNote={category === 'hotel' ? plannerProps.preferredCatalogRateNote : undefined}
        preferredRouteId={category === 'transport' ? plannerProps.preferredCatalogRouteId : undefined}
        submitLabel={label}
      />
    </RowDetailsPanel>
  );
}

function ScopePlanner({
  scope,
  plannerProps,
}: {
  scope: PlannerScope;
  plannerProps: QuoteServicePlannerProps;
}) {
  const buildStepHref = (step: QuoteReadinessStep, params?: Record<string, string | null | undefined>) =>
    buildQuoteWorkspaceHref(plannerProps.routeContext.quoteId, step, params);
  const readiness = buildQuoteReadinessModel(plannerProps.quote, buildStepHref);
  const daySummaries = readiness.daySummaries.map((summary) => ({
    ...summary,
    items: scope.items.filter((item) => item.itineraryId === summary.day.id),
  }));
  const unassignedItems = scope.items.filter((item) => !item.itineraryId);
  const unresolvedItems = scope.items.filter((item) => item.service.supplierId === 'import-itinerary-system');
  const daysCompleted = daySummaries.filter((summary) =>
    DAY_COMPLETENESS_RULES.every((rule) =>
      summary.items.some((item) => getQuoteServiceCategoryKey(item.service) === rule.key),
    ),
  ).length;
  const missingCoverageWarnings = daySummaries.reduce((count, summary) => {
    return (
      count +
      DAY_COMPLETENESS_RULES.filter(
        (rule) => !summary.items.some((item) => getQuoteServiceCategoryKey(item.service) === rule.key),
      ).length
    );
  }, 0);

  return (
    <div className="section-stack">
      <section className="workspace-section quote-service-workflow-summary">
        <div className="workspace-section-head">
          <div>
            <p className="eyebrow">Workflow Summary</p>
            <h3>Build the trip day by day</h3>
          </div>
        </div>
        <div className="quote-preview-total-list">
          <div>
            <span>Days completed</span>
            <strong>
              {daysCompleted}/{daySummaries.length}
            </strong>
          </div>
          <div>
            <span>Missing service warnings</span>
            <strong>{missingCoverageWarnings}</strong>
          </div>
          <div>
            <span>Unresolved imported rows</span>
            <strong>{unresolvedItems.length}</strong>
          </div>
          <div>
            <span>Unassigned services</span>
            <strong>{unassignedItems.length}</strong>
          </div>
        </div>
      </section>

      <QuoteUnresolvedBatchActions
        apiBaseUrl={plannerProps.apiBaseUrl}
        quoteId={plannerProps.quote.id}
        optionId={scope.optionId}
        items={unresolvedItems}
        days={plannerProps.quote.itineraries}
        services={plannerProps.services}
        scopeLabel={scope.label}
      />

      {daySummaries.map((summary) => {
        const itemsByCategory = {
          hotel: summary.items.filter((item) => getQuoteServiceCategoryKey(item.service) === 'hotel'),
          transport: summary.items.filter((item) => getQuoteServiceCategoryKey(item.service) === 'transport'),
          guide: summary.items.filter((item) => getQuoteServiceCategoryKey(item.service) === 'guide'),
          activity: summary.items.filter((item) => getQuoteServiceCategoryKey(item.service) === 'activity'),
          meal: summary.items.filter((item) => getQuoteServiceCategoryKey(item.service) === 'meal'),
          other: summary.items.filter((item) => getQuoteServiceCategoryKey(item.service) === 'other'),
        };
        const completeness = DAY_COMPLETENESS_RULES.map((rule) => ({
          ...rule,
          complete: summary.items.some((item) => getQuoteServiceCategoryKey(item.service) === rule.key),
        }));
        const currentServicesCount = summary.items.length;
        const dayHeading = formatDayHeading(summary.day, summary.inferredCity);
        const daySubtitle =
          summary.day.description ||
          (summary.inferredCity && summary.day.title && summary.day.title !== summary.inferredCity
            ? summary.day.title
            : 'Build the day by adding the core services on the right.');

        return (
          <article
            key={summary.day.id}
            id={`planner-day-${summary.day.id}`}
            className={`workspace-day-card quote-service-day-card${plannerProps.focusedDayId === summary.day.id ? ' quote-service-day-card-focused' : ''}`}
          >
            <div className="workspace-day-header">
              <div>
                <p className="workspace-day-kicker">Build the day step by step</p>
                <h3>{dayHeading}</h3>
                <p className="workspace-day-copy">{daySubtitle}</p>
              </div>
              <div className="quote-service-day-meta">
                <span className="page-tab-badge">Services {currentServicesCount}</span>
                <span className="page-tab-badge">Complete {summary.completionPercent}%</span>
                {summary.unpricedCount > 0 ? <span className="page-tab-badge page-tab-badge-warning">Unpriced {summary.unpricedCount}</span> : null}
                {summary.unresolvedCount > 0 ? <span className="page-tab-badge">Unresolved {summary.unresolvedCount}</span> : null}
              </div>
            </div>

            <div className="quote-service-day-layout">
              <section className="quote-service-current-services quote-service-day-main">
                <div className="workspace-section-head">
                  <div>
                    <p className="eyebrow">Assigned Services</p>
                    <h4>{currentServicesCount > 0 ? `${currentServicesCount} service${currentServicesCount === 1 ? '' : 's'} planned` : 'No services added yet'}</h4>
                  </div>
                </div>
                {currentServicesCount === 0 ? (
                  <div className="quote-service-empty-state">
                    <strong>Nothing has been assigned to this day yet.</strong>
                    <p>Start with hotel, transfer, and experience coverage using the actions on the right.</p>
                  </div>
                ) : null}
                <div className="quote-service-category-grid">
                  {(['hotel', 'transport', 'guide', 'activity', 'meal', 'other'] as ServicePlannerCategory[]).map((category) =>
                    renderItemGroup(category, itemsByCategory[category], plannerProps, scope.optionId),
                  )}
                </div>
              </section>

              <aside className="quote-service-day-side">
                <section className="quote-service-day-workflow quote-service-side-section">
                  <div className="workspace-section-head">
                    <div>
                      <p className="eyebrow">Add Services</p>
                      <h4>Build this day</h4>
                    </div>
                  </div>
                  <div className="quote-service-day-actions">
                    {DAY_WORKFLOW_ACTIONS.map((action) => (
                      <DayWorkflowAction
                        key={action.category}
                        category={action.category}
                        label={action.label}
                        plannerProps={plannerProps}
                        optionId={scope.optionId}
                        day={summary.day}
                      />
                    ))}
                  </div>
                </section>

                <section className="quote-service-side-section">
                  <div className="workspace-section-head">
                    <div>
                      <p className="eyebrow">Completeness</p>
                      <h4>What still needs coverage?</h4>
                    </div>
                  </div>
                  <div className="quote-service-day-checklist">
                    {completeness.map((item) => (
                      <div key={item.key} className={`quote-service-check ${item.complete ? 'quote-service-check-complete' : 'quote-service-check-missing'}`}>
                        <span>{item.label}</span>
                        <strong>{item.complete ? 'Added' : 'Missing'}</strong>
                      </div>
                    ))}
                  </div>
                </section>

                {summary.suggestions.length > 0 ? (
                  <section className="quote-service-side-section">
                    <div className="workspace-section-head">
                      <div>
                        <p className="eyebrow">Suggested Next Steps</p>
                        <h4>Fill the obvious gaps</h4>
                      </div>
                    </div>
                    <div className="quote-service-suggestions">
                      {summary.suggestions.map((suggestion) => (
                        <PlannerSuggestionAction
                          key={suggestion.id}
                          suggestion={suggestion}
                          apiBaseUrl={plannerProps.apiBaseUrl}
                          quote={plannerProps.quote}
                          quoteBlocks={plannerProps.quoteBlocks}
                          services={plannerProps.services}
                          transportServiceTypes={plannerProps.transportServiceTypes}
                          routes={plannerProps.routes}
                          hotels={plannerProps.hotels}
                          hotelContracts={plannerProps.hotelContracts}
                          hotelRates={plannerProps.hotelRates}
                          seasons={plannerProps.seasons}
                          totalPax={plannerProps.totalPax}
                          optionId={scope.optionId}
                          itineraryDay={summary.day}
                        />
                      ))}
                    </div>
                  </section>
                ) : null}
              </aside>
            </div>
          </article>
        );
      })}

      {unassignedItems.length > 0 ? (
        <article className="workspace-day-card quote-service-day-card">
          <div className="workspace-day-header">
            <div>
              <p className="workspace-day-kicker">Unassigned</p>
              <h3>Services not linked to a day</h3>
              <p className="workspace-day-copy">Assign these rows to itinerary days so they appear in the day-by-day operating plan.</p>
            </div>
            <span className="quote-ui-badge quote-ui-badge-warning">{unassignedItems.length}</span>
          </div>

          <div className="section-stack">
            {unassignedItems.map((item) => (
              <QuoteItemCard
                key={item.id}
                apiBaseUrl={plannerProps.apiBaseUrl}
                quote={plannerProps.quote}
                item={item}
                quoteBlocks={plannerProps.quoteBlocks}
                services={plannerProps.services}
                transportServiceTypes={plannerProps.transportServiceTypes}
                routes={plannerProps.routes}
                hotels={plannerProps.hotels}
                hotelContracts={plannerProps.hotelContracts}
                hotelRates={plannerProps.hotelRates}
                seasons={plannerProps.seasons}
                totalPax={plannerProps.totalPax}
                optionId={scope.optionId}
                initialValues={buildQuoteItemInitialValues(item, plannerProps.totalPax, plannerProps.quote.roomCount, plannerProps.quote.nightCount)}
              />
            ))}
          </div>
        </article>
      ) : null}
    </div>
  );
}

export function QuoteServicePlanner(props: QuoteServicePlannerProps) {
  const scopes: PlannerScope[] = [
    {
      id: 'shared',
      label: 'Base Program',
      items: props.quote.quoteItems,
    },
    ...props.quote.quoteOptions.map((option) => ({
      id: option.id,
      label: option.name,
      items: option.quoteItems,
      optionId: option.id,
    })),
  ];

  const tabStyles = scopes
    .filter((scope) => scope.id !== 'shared')
    .map(
      (scope) =>
        `.workspace-tabs:has(#planner-${scope.id}:checked) label[for="planner-${scope.id}"] { background: var(--accent); border-color: var(--accent); color: white; } .workspace-tabs:has(#planner-${scope.id}:checked) .workspace-panel-${scope.id} { display: block; }`,
    )
    .join(' ');

  return (
    <section className="workspace-tabs quote-service-planner">
      <style>{tabStyles}</style>
        <div className="workspace-tab-header">
          <div className="workspace-section-head">
            <div>
              <p className="eyebrow">Service Planner</p>
              <h2>Build the trip service by service, day by day</h2>
            </div>
          </div>
          <p className="detail-copy">
          Use each day card below to complete the trip step by step. Add the core services first, then review what is still missing before pricing.
          </p>
        {props.focusedDayId ? (
          <p className="form-helper">
            Focused day mode is active. Use the highlighted day card below to complete the targeted operating task.
          </p>
        ) : null}
        <div className="workspace-tab-list" role="tablist" aria-label="Quote service planner scopes">
          <input type="radio" id="planner-shared" name="quote-service-planner" defaultChecked className="workspace-tab-input" />
          <label htmlFor="planner-shared" className="workspace-tab-label">
            Base Program
          </label>
          {scopes
            .filter((scope) => scope.id !== 'shared')
            .map((scope) => (
              <span key={scope.id}>
                <input type="radio" id={`planner-${scope.id}`} name="quote-service-planner" className="workspace-tab-input" />
                <label htmlFor={`planner-${scope.id}`} className="workspace-tab-label">
                  {scope.label}
                </label>
              </span>
            ))}
        </div>
      </div>

      <div className="workspace-tab-panels">
        <section className="workspace-tab-panel workspace-panel-shared">
          <ScopePlanner scope={scopes[0]} plannerProps={props} />
        </section>
        {scopes
          .filter((scope) => scope.id !== 'shared')
          .map((scope) => (
            <section key={scope.id} className={`workspace-tab-panel workspace-panel-${scope.id}`}>
              <ScopePlanner scope={scope} plannerProps={props} />
            </section>
          ))}
      </div>
    </section>
  );
}
