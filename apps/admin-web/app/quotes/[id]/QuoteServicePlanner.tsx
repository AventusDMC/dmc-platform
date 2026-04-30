'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { closestCenter, DndContext, type DragEndEvent, PointerSensor, useDroppable, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, horizontalListSortingStrategy, SortableContext, useSortable } from '@dnd-kit/sortable';
import { getErrorMessage, readJsonResponse } from '../../lib/api';
import { buildAuthHeaders } from '../../lib/auth-client';
import { RouteOption } from '../../lib/routes';
import { RowDetailsPanel } from '../../components/RowDetailsPanel';
import { QuoteAutoItineraryBuilder } from './QuoteAutoItineraryBuilder';
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
  pricingBasis?: 'PER_PERSON' | 'PER_ROOM' | null;
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
  finalCost?: number | null;
  overrideCost: number | null;
  overrideReason?: string | null;
  markupAmount?: number | null;
  sellPrice?: number | null;
  useOverride: boolean;
  currency: string;
  pricingDescription: string | null;
  jordanPassCovered?: boolean;
  jordanPassSavingsJod?: number;
  markupPercent: number;
  sortOrder?: number | null;
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
  quoteCurrency: 'USD' | 'EUR' | 'JOD';
  adults: number;
  children: number;
  roomCount: number;
  nightCount: number;
  totalCost: number;
  totalSell: number;
  pricePerPax: number;
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
  sessionRole?: 'admin' | 'viewer' | 'operations' | 'finance' | 'agent' | null;
};

type LivePricingSummary = {
  quoteCurrency: 'USD' | 'EUR' | 'JOD';
  totalCost: number;
  totalSell: number;
  pricePerPax: number;
};

type ServiceLaneDragData = {
  type: 'item' | 'lane';
  dayId: string;
  dayNumber: number;
  category: ServicePlannerCategory;
  itemId?: string;
};

type ServiceLaneOrders = Record<string, string[]>;

type QuoteItemInitialValues = {
  serviceId: string;
  quantity: string;
  markupPercent: string;
  markupAmount?: string;
  sellPrice?: string;
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
  overrideReason?: string;
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

type ScopePlannerState = {
  openDayIds: Set<string>;
  onDayOpenChange: (dayId: string, open: boolean) => void;
};

type ServiceWorkflowStep = {
  category: 'hotel' | 'transport' | 'activity' | 'meal';
  step: string;
  label: string;
  hasItem: boolean;
};

type ServiceWorkflowState = {
  hasHotel: boolean;
  hasTransport: boolean;
  hasActivity: boolean;
  recommendedCategory: ServicePlannerCategory;
  title: string;
  description: string;
  steps: ServiceWorkflowStep[];
};

type ActiveServicePanel =
  | {
      kind: 'add';
      key: string;
      optionId?: string;
      day: QuoteReadinessDay;
      category: ServicePlannerCategory;
      label: string;
      formReady?: boolean;
      selectedServiceId?: string;
      selectedHotelId?: string;
      selectedRouteId?: string;
    }
  | {
      kind: 'edit';
      key: string;
      optionId?: string;
      item: QuoteItem;
      dayNumber: number | null;
    };

type SmartSuggestionItem = {
  id: string;
  label: string;
  detail: string;
  category: ServicePlannerCategory;
  source: 'service' | 'hotel' | 'route';
  serviceId?: string;
  hotelId?: string;
  routeId?: string;
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
  { category: 'transport', label: 'Add Transport' },
  { category: 'activity', label: 'Add Activity' },
  { category: 'meal', label: 'Add Meal' },
];

const SERVICE_PLANNER_TABS: ServicePlannerCategory[] = ['hotel', 'transport', 'activity', 'meal'];
const SERVICE_PLANNER_TAB_LABELS: Record<ServicePlannerCategory, string> = {
  hotel: 'Hotel',
  transport: 'Transport',
  activity: 'Activity',
  meal: 'Meal',
  // These are unused for the planner tabs, but keep the record exhaustive.
  guide: 'Guide',
  other: 'Other',
};
const SERVICE_PLANNER_ICONS: Record<ServicePlannerCategory, string> = {
  hotel: 'H',
  transport: 'T',
  activity: 'A',
  meal: 'M',
  guide: 'G',
  other: 'O',
};

const GROUP_DAY_COMPLETENESS_RULES: Array<{ key: ServicePlannerCategory; label: string }> = [
  { key: 'hotel', label: 'Stay' },
  { key: 'transport', label: 'Transfer' },
  { key: 'activity', label: 'Experience' },
];

const FIT_DAY_COMPLETENESS_RULES: Array<{ key: ServicePlannerCategory; label: string }> = [
  { key: 'activity', label: 'Experience' },
  { key: 'transport', label: 'Transfer' },
];

function getDayCompletenessRules(quoteType: Quote['quoteType']) {
  return quoteType === 'GROUP' ? GROUP_DAY_COMPLETENESS_RULES : FIT_DAY_COMPLETENESS_RULES;
}

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
    markupAmount: item.markupAmount === null || item.markupAmount === undefined ? '' : String(item.markupAmount),
    sellPrice: item.sellPrice === null || item.sellPrice === undefined ? '' : String(item.sellPrice),
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
    overrideReason: item.overrideReason || '',
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

function buildServiceWorkflowState(items: QuoteItem[], quoteType: Quote['quoteType']): ServiceWorkflowState {
  const hasHotel = items.some((item) => getQuoteServiceCategoryKey(item.service) === 'hotel');
  const hasTransport = items.some((item) => getQuoteServiceCategoryKey(item.service) === 'transport');
  const hasActivity = items.some((item) => getQuoteServiceCategoryKey(item.service) === 'activity');
  let recommendedCategory: ServicePlannerCategory = 'hotel';
  let title = 'Start building your itinerary';
  let description = 'Begin with accommodation, then add transfer coverage and experiences.';

  if (quoteType === 'FIT') {
    if (!hasActivity) {
      recommendedCategory = 'activity';
      title = 'Start with the core experience';
      description = 'For FIT quotes, begin with the requested experience or service, then add transport only when it is included.';
    } else if (!hasTransport) {
      recommendedCategory = 'transport';
      title = 'Review transfer coverage';
      description = 'The FIT experience is started. Add transport if the quote includes private movement.';
    } else if (!hasHotel) {
      recommendedCategory = 'hotel';
      title = 'Review accommodation';
      description = 'Transport and experience coverage are started. Add accommodation if it is part of this FIT package.';
    } else {
      recommendedCategory = 'activity';
      title = 'FIT workflow started';
      description = 'Experience, transfer, and accommodation coverage are represented. Keep adding services as needed.';
    }
  } else if (!hasHotel && hasTransport && !hasActivity) {
    recommendedCategory = 'activity';
    title = 'Add experiences next';
    description = 'Transport is already in place. Add the first experience when you are ready.';
  } else if (!hasHotel) {
    recommendedCategory = 'hotel';
    title = 'Start with accommodation';
    description = 'A hotel gives the quote a clear base before transfers and experiences are layered in.';
  } else if (!hasTransport) {
    recommendedCategory = 'transport';
    title = 'Add transfer coverage';
    description = 'Accommodation is started. Add transfers next, or choose any other service if the program needs it first.';
  } else if (!hasActivity) {
    recommendedCategory = 'activity';
    title = 'Add experiences next';
    description = 'Stay and transfer coverage are in place. Add an experience to start shaping the trip content.';
  } else {
    recommendedCategory = 'activity';
    title = 'Core workflow started';
    description = 'Accommodation, transport, and experiences are all represented. Keep adding services in any order.';
  }

  return {
    hasHotel,
    hasTransport,
    hasActivity,
    recommendedCategory,
    title,
    description,
    steps: [
      { category: 'hotel', step: 'Step 1', label: 'Accommodation', hasItem: hasHotel },
      { category: 'transport', step: 'Step 2', label: 'Transport', hasItem: hasTransport },
      { category: 'activity', step: 'Step 3', label: 'Experiences', hasItem: hasActivity },
    ],
  };
}

function WorkflowProgress({ quoteId, workflow }: { quoteId: string; workflow: ServiceWorkflowState }) {
  return (
    <div className="quote-service-workflow-progress" aria-label="Quote service workflow progress">
      {workflow.steps.map((step) => (
        <Link
          key={step.category}
          href={buildQuoteWorkspaceHref(quoteId, 'services', { addCategory: step.category })}
          className={`quote-service-workflow-step${step.hasItem ? ' quote-service-workflow-step-complete' : ''}${
            workflow.recommendedCategory === step.category ? ' quote-service-workflow-step-current' : ''
          }`}
        >
          <span>{step.step}</span>
          <div className="quote-service-workflow-step-title">
            <strong>{step.label}</strong>
            {step.hasItem ? <span className="quote-service-workflow-check" aria-label={`${step.label} completed`}>✔</span> : null}
          </div>
          <em>{step.hasItem ? 'Completed' : workflow.recommendedCategory === step.category ? 'Recommended next' : 'Optional'}</em>
        </Link>
      ))}
    </div>
  );
}

function getServiceNotes(item: QuoteItem) {
  return (
    item.appliedVehicleRate?.routeName ||
    item.pickupLocation ||
    item.meetingPoint ||
    item.pricingDescription ||
    item.hotel?.name ||
    'No notes'
  );
}

function getServiceSupplierLabel(item: QuoteItem) {
  return item.hotel?.name || item.contract?.name || item.service.supplierId || 'Supplier pending';
}

function buildServiceLaneId(dayId: string, category: ServicePlannerCategory) {
  return `${dayId}::${category}`;
}

function getLaneItemIds(items: QuoteItem[], dayId: string, category: ServicePlannerCategory) {
  return items
    .filter((item) => item.itineraryId === dayId && getQuoteServiceCategoryKey(item.service) === category)
    .sort((left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0) || left.id.localeCompare(right.id))
    .map((item) => item.id);
}

function getOrderedLaneItems(items: QuoteItem[], laneOrder: string[]) {
  const itemById = new Map(items.map((item) => [item.id, item]));

  return laneOrder.map((id) => itemById.get(id)).filter((item): item is QuoteItem => Boolean(item));
}

function getServiceTypeLabel(service: SupplierService) {
  return service.serviceType?.name || service.category || service.unitType || 'Service';
}

function getSmartSuggestionCandidates(category: ServicePlannerCategory, plannerProps: QuoteServicePlannerProps): SmartSuggestionItem[] {
  if (category === 'hotel') {
    return plannerProps.hotels.slice(0, 24).map((hotel) => ({
      id: `hotel:${hotel.id}`,
      label: hotel.name,
      detail: [hotel.city, hotel.category].filter(Boolean).join(' · ') || 'Hotel',
      category,
      source: 'hotel',
      hotelId: hotel.id,
    }));
  }

  if (category === 'transport') {
    return plannerProps.routes.slice(0, 24).map((route) => ({
      id: `route:${route.id}`,
      label: route.name,
      detail: 'Transport route',
      category,
      source: 'route',
      routeId: route.id,
    }));
  }

  return plannerProps.services
    .filter((service) => getQuoteServiceCategoryKey(service) === category)
    .slice(0, 36)
    .map((service) => ({
      id: `service:${service.id}`,
      label: service.name,
      detail: `${getServiceTypeLabel(service)} · ${formatLiveMoney(service.baseCost, service.currency)}`,
      category,
      source: 'service',
      serviceId: service.id,
    }));
}

function AddServiceEditorPanel({
  category,
  label,
  plannerProps,
  optionId,
  day,
  selectedServiceId,
  selectedHotelId,
  selectedRouteId,
}: {
  category: ServicePlannerCategory;
  label: string;
  plannerProps: QuoteServicePlannerProps;
  optionId?: string;
  day: QuoteReadinessDay;
  selectedServiceId?: string;
  selectedHotelId?: string;
  selectedRouteId?: string;
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
    <>
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
        quoteType={plannerProps.quote.quoteType}
        defaultPaxCount={plannerProps.totalPax}
        defaultAdultCount={plannerProps.quote.adults}
        defaultChildCount={plannerProps.quote.children}
        defaultRoomCount={plannerProps.quote.roomCount}
        defaultNightCount={plannerProps.quote.nightCount}
        travelStartDate={plannerProps.quote.travelStartDate}
        itineraryDayNumber={day.dayNumber}
        itineraryId={day.id}
        initialServiceTypeKey={category}
        preferredServiceId={category !== 'hotel' && category !== 'transport' ? selectedServiceId || plannerProps.preferredCatalogServiceId : undefined}
        preferredHotelId={category === 'hotel' ? selectedHotelId || plannerProps.preferredCatalogHotelId : undefined}
        preferredContractId={category === 'hotel' ? plannerProps.preferredCatalogContractId : undefined}
        preferredRoomCategoryId={category === 'hotel' ? plannerProps.preferredCatalogRoomCategoryId : undefined}
        preferredMealPlan={category === 'hotel' ? plannerProps.preferredCatalogMealPlan : undefined}
        preferredOccupancyType={category === 'hotel' ? plannerProps.preferredCatalogOccupancyType : undefined}
        preferredRateCost={category === 'hotel' ? plannerProps.preferredCatalogRateCost : undefined}
        preferredRateCurrency={category === 'hotel' ? plannerProps.preferredCatalogRateCurrency : undefined}
        preferredRateNote={category === 'hotel' ? plannerProps.preferredCatalogRateNote : undefined}
        preferredRouteId={category === 'transport' ? selectedRouteId || plannerProps.preferredCatalogRouteId : undefined}
        submitLabel={label}
      />
    </>
  );
}

function SmartSuggestionsPanel({
  category,
  day,
  plannerProps,
  recentSuggestions,
  onSelect,
  onManualSelect,
}: {
  category: ServicePlannerCategory;
  day: QuoteReadinessDay;
  plannerProps: QuoteServicePlannerProps;
  recentSuggestions: SmartSuggestionItem[];
  onSelect: (item: SmartSuggestionItem) => void;
  onManualSelect: () => void;
}) {
  const [query, setQuery] = useState('');
  const candidates = getSmartSuggestionCandidates(category, plannerProps);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredCandidates = normalizedQuery
    ? candidates.filter((item) => `${item.label} ${item.detail}`.toLowerCase().includes(normalizedQuery))
    : candidates;
  const suggested = candidates.slice(0, 3);
  const recent = recentSuggestions.filter((item) => item.category === category).slice(0, 5);

  return (
    <div className="quote-smart-suggestions">
      <div className="quote-smart-suggestion-intro">
        <p className="eyebrow">Smart Suggestions</p>
        <h4>{SERVICE_PLANNER_TAB_LABELS[category]} for Day {day.dayNumber}</h4>
        <p className="detail-copy">Pick a suggestion to open the existing service form with the choice preselected.</p>
        <button type="button" className="secondary-button" onClick={onManualSelect}>
          Open blank form
        </button>
      </div>

      <SmartSuggestionSection title="Suggested for this day" items={suggested} emptyText="No suggestions available for this service type." onSelect={onSelect} />
      <SmartSuggestionSection title="Recent services" items={recent} emptyText="Recent choices will appear here as you add services." onSelect={onSelect} />

      <section className="quote-smart-suggestion-section">
        <div className="quote-smart-suggestion-section-head">
          <h5>All services</h5>
          <span>{filteredCandidates.length}</span>
        </div>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={`Search ${SERVICE_PLANNER_TAB_LABELS[category].toLowerCase()}`}
        />
        <div className="quote-smart-suggestion-list quote-smart-suggestion-list-scroll">
          {filteredCandidates.length > 0 ? (
            filteredCandidates.map((item) => <SmartSuggestionButton key={item.id} item={item} onSelect={onSelect} />)
          ) : (
            <p className="detail-copy">No matching services found.</p>
          )}
        </div>
      </section>
    </div>
  );
}

function SmartSuggestionSection({
  title,
  items,
  emptyText,
  onSelect,
}: {
  title: string;
  items: SmartSuggestionItem[];
  emptyText: string;
  onSelect: (item: SmartSuggestionItem) => void;
}) {
  return (
    <section className="quote-smart-suggestion-section">
      <div className="quote-smart-suggestion-section-head">
        <h5>{title}</h5>
        <span>{items.length}</span>
      </div>
      <div className="quote-smart-suggestion-list">
        {items.length > 0 ? (
          items.map((item) => <SmartSuggestionButton key={item.id} item={item} onSelect={onSelect} />)
        ) : (
          <p className="detail-copy">{emptyText}</p>
        )}
      </div>
    </section>
  );
}

function SmartSuggestionButton({
  item,
  onSelect,
}: {
  item: SmartSuggestionItem;
  onSelect: (item: SmartSuggestionItem) => void;
}) {
  return (
    <button type="button" className="quote-smart-suggestion-button" onClick={() => onSelect(item)}>
      <strong>{item.label}</strong>
      <span>{item.detail}</span>
    </button>
  );
}

function EditServiceEditorPanel({
  item,
  plannerProps,
  optionId,
  dayNumber,
}: {
  item: QuoteItem;
  plannerProps: QuoteServicePlannerProps;
  optionId?: string;
  dayNumber: number | null;
}) {
  return (
    <QuoteItemsForm
      apiBaseUrl={plannerProps.apiBaseUrl}
      quoteId={plannerProps.quote.id}
      itemId={item.id}
      optionId={optionId}
      blocks={plannerProps.quoteBlocks}
      services={plannerProps.services}
      transportServiceTypes={plannerProps.transportServiceTypes}
      routes={plannerProps.routes}
      hotels={plannerProps.hotels}
      hotelContracts={plannerProps.hotelContracts}
      hotelRates={plannerProps.hotelRates}
      seasons={plannerProps.seasons}
      quoteType={plannerProps.quote.quoteType}
      defaultPaxCount={plannerProps.totalPax}
      defaultAdultCount={plannerProps.quote.adults}
      defaultChildCount={plannerProps.quote.children}
      defaultRoomCount={plannerProps.quote.roomCount}
      defaultNightCount={plannerProps.quote.nightCount}
      travelStartDate={plannerProps.quote.travelStartDate}
      itineraryDayNumber={dayNumber}
      itineraryId={item.itineraryId || undefined}
      submitLabel="Save item"
      initialValues={buildQuoteItemInitialValues(item, plannerProps.totalPax, plannerProps.quote.roomCount, plannerProps.quote.nightCount)}
    />
  );
}

function AssignedServicesTable({
  dayId,
  dayNumber,
  items,
  laneOrders,
  currency,
  onEdit,
  onRemove,
  onAdd,
  deletingItemId,
}: {
  dayId: string;
  dayNumber: number;
  items: QuoteItem[];
  laneOrders: ServiceLaneOrders;
  currency: Quote['quoteCurrency'];
  onEdit: (item: QuoteItem) => void;
  onRemove: (item: QuoteItem) => void;
  onAdd: (category: ServicePlannerCategory) => void;
  deletingItemId?: string;
}) {
  const groupedCategories = SERVICE_PLANNER_TABS.map((category) => ({
    category,
    label: SERVICE_PLANNER_TAB_LABELS[category],
    items: items.filter((item) => getQuoteServiceCategoryKey(item.service) === category),
  }));

  return (
    <div className="quote-service-visual-board">
      {groupedCategories.map((group) => {
        const laneId = buildServiceLaneId(dayId, group.category);
        const laneOrder = laneOrders[laneId] || group.items.map((item) => item.id);
        const orderedItems = getOrderedLaneItems(group.items, laneOrder);

        return (
          <ServiceLane
            key={group.category}
            dayId={dayId}
            dayNumber={dayNumber}
            category={group.category}
            label={group.label}
            orderedItems={orderedItems}
            currency={currency}
            deletingItemId={deletingItemId}
            onAdd={onAdd}
            onEdit={onEdit}
            onRemove={onRemove}
          />
        );
      })}
    </div>
  );
}

function ServiceLane({
  dayId,
  dayNumber,
  category,
  label,
  orderedItems,
  currency,
  deletingItemId,
  onAdd,
  onEdit,
  onRemove,
}: {
  dayId: string;
  dayNumber: number;
  category: ServicePlannerCategory;
  label: string;
  orderedItems: QuoteItem[];
  currency: Quote['quoteCurrency'];
  deletingItemId?: string;
  onAdd: (category: ServicePlannerCategory) => void;
  onEdit: (item: QuoteItem) => void;
  onRemove: (item: QuoteItem) => void;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: buildServiceLaneId(dayId, category),
    data: {
      type: 'lane',
      dayId,
      dayNumber,
      category,
    } satisfies ServiceLaneDragData,
  });

  return (
    <section
      ref={setNodeRef}
      className={`quote-service-lane quote-service-lane-${category}${isOver ? ' quote-service-lane-drag-over' : ''}`}
    >
      <div className="quote-service-lane-head">
        <div>
          <span>{label}</span>
          <strong>{orderedItems.length}</strong>
        </div>
        <button type="button" className="quote-service-lane-add" onClick={() => onAdd(category)}>
          Add {label}
        </button>
      </div>

      {orderedItems.length === 0 ? (
        <button type="button" className="quote-service-empty-add" onClick={() => onAdd(category)}>
          <span aria-hidden="true">+</span>
          Add {label}
        </button>
      ) : (
        <SortableContext items={orderedItems.map((item) => item.id)} strategy={horizontalListSortingStrategy}>
          <div className="quote-service-card-row">
            {orderedItems.map((item) => (
              <SortableServiceCard
                key={item.id}
                item={item}
                dayId={dayId}
                dayNumber={dayNumber}
                category={category}
                currency={currency}
                deletingItemId={deletingItemId}
                onEdit={onEdit}
                onRemove={onRemove}
              />
            ))}
          </div>
        </SortableContext>
      )}
    </section>
  );
}

function formatLiveMoney(value: number, currency: string) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(value || 0);
}

function buildSortableTransform(transform: ReturnType<typeof useSortable>['transform']) {
  if (!transform) {
    return undefined;
  }

  return `translate3d(${Math.round(transform.x)}px, ${Math.round(transform.y)}px, 0) scaleX(${transform.scaleX}) scaleY(${transform.scaleY})`;
}

function SortableServiceCard({
  item,
  dayId,
  dayNumber,
  category,
  currency,
  deletingItemId,
  onEdit,
  onRemove,
}: {
  item: QuoteItem;
  dayId: string;
  dayNumber: number;
  category: ServicePlannerCategory;
  currency: Quote['quoteCurrency'];
  deletingItemId?: string;
  onEdit: (item: QuoteItem) => void;
  onRemove: (item: QuoteItem) => void;
}) {
  const { attributes, listeners, setActivatorNodeRef, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    data: {
      type: 'item',
      itemId: item.id,
      dayId,
      dayNumber,
      category,
    } satisfies ServiceLaneDragData,
  });

  return (
    <article
      ref={setNodeRef}
      className={`quote-service-mini-card quote-service-sortable-card${isDragging ? ' quote-service-sortable-card-dragging' : ''}`}
      style={{
        transform: buildSortableTransform(transform),
        transition,
      }}
    >
      <div className="quote-service-mini-card-head">
        <button
          ref={setActivatorNodeRef}
          type="button"
          className="quote-service-drag-handle"
          aria-label={`Drag ${item.hotel?.name || item.service.name}`}
          {...attributes}
          {...listeners}
        >
          <span className="quote-service-type-icon" aria-hidden="true">
            {SERVICE_PLANNER_ICONS[getQuoteServiceCategoryKey(item.service)] || 'S'}
          </span>
        </button>
        {item.service.supplierId === 'import-itinerary-system' ? <em>Unmatched</em> : null}
      </div>
      <h5>{item.hotel?.name || item.service.name}</h5>
      <p className="quote-service-card-supplier">{getServiceSupplierLabel(item)}</p>
      <strong className="quote-service-card-price">{formatLiveMoney(item.totalSell, (item.currency as Quote['quoteCurrency']) || currency)}</strong>
      <details className="quote-service-card-details">
        <summary>Details</summary>
        <p>{getServiceNotes(item)}</p>
      </details>
      <div className="quote-service-mini-card-actions">
        <button type="button" className="secondary-button" onClick={() => onEdit(item)}>
          Edit
        </button>
        <button
          type="button"
          className="secondary-button secondary-button-danger"
          onClick={() => onRemove(item)}
          disabled={deletingItemId === item.id}
        >
          {deletingItemId === item.id ? 'Removing...' : 'Remove'}
        </button>
      </div>
    </article>
  );
}

function getLivePricingSummary(quote: Quote): LivePricingSummary {
  return {
    quoteCurrency: quote.quoteCurrency,
    totalCost: quote.totalCost,
    totalSell: quote.totalSell,
    pricePerPax: quote.pricePerPax,
  };
}

function LivePricingPanel({
  apiBaseUrl,
  quote,
  showAdminMetrics,
}: {
  apiBaseUrl: string;
  quote: Quote;
  showAdminMetrics: boolean;
}) {
  const [summary, setSummary] = useState<LivePricingSummary>(() => getLivePricingSummary(quote));
  const [isRefreshing, setIsRefreshing] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const marginAmount = Number((summary.totalSell - summary.totalCost).toFixed(2));
  const marginPercent = summary.totalSell > 0 ? Number(((marginAmount / summary.totalSell) * 100).toFixed(2)) : 0;

  useEffect(() => {
    setSummary(getLivePricingSummary(quote));
  }, [quote.id, quote.pricePerPax, quote.quoteCurrency, quote.totalCost, quote.totalSell]);

  useEffect(() => {
    async function fetchLatestPricing() {
      setIsRefreshing(true);

      try {
        const response = await fetch(`${apiBaseUrl}/quotes/${quote.id}`, {
          cache: 'no-store',
        });

        if (!response.ok) {
          return;
        }

        const latestQuote = await readJsonResponse<Partial<LivePricingSummary>>(response, 'Could not refresh quote pricing.');
        setSummary((current) => ({
          quoteCurrency: latestQuote.quoteCurrency || current.quoteCurrency,
          totalCost: Number(latestQuote.totalCost ?? current.totalCost),
          totalSell: Number(latestQuote.totalSell ?? current.totalSell),
          pricePerPax: Number(latestQuote.pricePerPax ?? current.pricePerPax),
        }));
      } finally {
        setIsRefreshing(false);
      }
    }

    function handlePricingStale(event: Event) {
      const detail = (event as CustomEvent<{ quoteId?: string }>).detail;

      if (detail?.quoteId && detail.quoteId !== quote.id) {
        return;
      }

      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      debounceRef.current = setTimeout(() => {
        void fetchLatestPricing();
      }, 300);
    }

    window.addEventListener('dmc:quote-pricing-stale', handlePricingStale);

    return () => {
      window.removeEventListener('dmc:quote-pricing-stale', handlePricingStale);

      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [apiBaseUrl, quote.id]);

  return (
    <aside className="quote-live-pricing-panel" aria-live="polite">
      <div className="quote-live-pricing-head">
        <div>
          <p className="eyebrow">Live Pricing</p>
          <h3>{formatLiveMoney(summary.totalSell, summary.quoteCurrency)}</h3>
        </div>
        <span className={isRefreshing ? 'quote-live-pricing-status quote-live-pricing-status-active' : 'quote-live-pricing-status'}>
          {isRefreshing ? 'Updating' : 'Current'}
        </span>
      </div>
      <div className="quote-live-pricing-grid">
        <div>
          <span>Total sell</span>
          <strong>{formatLiveMoney(summary.totalSell, summary.quoteCurrency)}</strong>
        </div>
        {showAdminMetrics ? (
          <div>
            <span>Total cost</span>
            <strong>{formatLiveMoney(summary.totalCost, summary.quoteCurrency)}</strong>
          </div>
        ) : null}
        <div>
          <span>Price per pax</span>
          <strong>{formatLiveMoney(summary.pricePerPax, summary.quoteCurrency)}</strong>
        </div>
        {showAdminMetrics ? (
          <div>
            <span>Margin</span>
            <strong>
              {formatLiveMoney(marginAmount, summary.quoteCurrency)} ({marginPercent.toFixed(2)}%)
            </strong>
          </div>
        ) : null}
      </div>
    </aside>
  );
}

function ScopePlanner({
  scope,
  plannerProps,
  plannerState,
}: {
  scope: PlannerScope;
  plannerProps: QuoteServicePlannerProps;
  plannerState: ScopePlannerState;
}) {
  const router = useRouter();
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
  );
  const buildStepHref = (step: QuoteReadinessStep, params?: Record<string, string | null | undefined>) =>
    buildQuoteWorkspaceHref(plannerProps.routeContext.quoteId, step, params);
  const [localItems, setLocalItems] = useState<QuoteItem[]>(scope.items);
  const [laneOrders, setLaneOrders] = useState<ServiceLaneOrders>({});
  const [reorderError, setReorderError] = useState('');
  const [recentSuggestions, setRecentSuggestions] = useState<SmartSuggestionItem[]>([]);
  const readiness = buildQuoteReadinessModel(plannerProps.quote, buildStepHref);
  const daySummaries = readiness.daySummaries.map((summary) => ({
    ...summary,
    items: localItems.filter((item) => item.itineraryId === summary.day.id),
  }));
  const unassignedItems = localItems.filter((item) => !item.itineraryId);
  const unresolvedItems = localItems.filter((item) => item.service.supplierId === 'import-itinerary-system');
  const workflow = buildServiceWorkflowState(localItems, plannerProps.quote.quoteType);
  const dayCompletenessRules = getDayCompletenessRules(plannerProps.quote.quoteType);
  const [activeServicePanel, setActiveServicePanel] = useState<ActiveServicePanel | null>(null);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);
  const daysCompleted = daySummaries.filter((summary) =>
    dayCompletenessRules.every((rule) =>
      summary.items.some((item) => getQuoteServiceCategoryKey(item.service) === rule.key),
    ),
  ).length;
  const missingCoverageWarnings = daySummaries.reduce((count, summary) => {
    return (
      count +
      dayCompletenessRules.filter(
        (rule) => !summary.items.some((item) => getQuoteServiceCategoryKey(item.service) === rule.key),
      ).length
    );
  }, 0);

  useEffect(() => {
    setLocalItems(scope.items);
  }, [scope.items]);

  useEffect(() => {
    setLaneOrders((current) => {
      const next = { ...current };

      for (const summary of readiness.daySummaries) {
        for (const category of SERVICE_PLANNER_TABS) {
          const laneId = buildServiceLaneId(summary.day.id, category);
          const incomingIds = getLaneItemIds(localItems, summary.day.id, category);
          const currentIds = next[laneId] || [];
          next[laneId] = [
            ...currentIds.filter((id) => incomingIds.includes(id)),
            ...incomingIds.filter((id) => !currentIds.includes(id)),
          ];
        }
      }

      return next;
    });
  }, [localItems, plannerProps.quote.itineraries]);

  async function persistLaneOrder(dayNumber: number, category: ServicePlannerCategory, orderedItemIds: string[]) {
    if (orderedItemIds.length === 0) {
      return;
    }

    const response = await fetch(`${plannerProps.apiBaseUrl}/quotes/${plannerProps.quote.id}/items/reorder`, {
      method: 'PATCH',
      headers: buildAuthHeaders({
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify({
        day: dayNumber,
        serviceType: category,
        orderedItemIds,
      }),
    });

    if (!response.ok) {
      throw new Error(await getErrorMessage(response, 'Could not persist service order.'));
    }
  }

  async function handleServiceDragEnd(event: DragEndEvent) {
    const activeData = event.active.data.current as ServiceLaneDragData | undefined;
    const overData = event.over?.data.current as ServiceLaneDragData | undefined;

    if (!activeData?.itemId || !overData) {
      return;
    }

    if (activeData.category !== overData.category) {
      setReorderError('Move services within the same service type lane.');
      return;
    }

    const sourceLaneId = buildServiceLaneId(activeData.dayId, activeData.category);
    const targetLaneId = buildServiceLaneId(overData.dayId, overData.category);
    const sourceOrder = laneOrders[sourceLaneId] || getLaneItemIds(localItems, activeData.dayId, activeData.category);
    const targetOrder = laneOrders[targetLaneId] || getLaneItemIds(localItems, overData.dayId, overData.category);
    const activeId = activeData.itemId;

    if (sourceLaneId === targetLaneId) {
      const oldIndex = sourceOrder.indexOf(activeId);
      const newIndex = sourceOrder.indexOf(String(event.over?.id || ''));

      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) {
        return;
      }

      const nextOrder = arrayMove(sourceOrder, oldIndex, newIndex);
      const previousLaneOrders = laneOrders;
      setReorderError('');
      setLaneOrders((current) => ({ ...current, [sourceLaneId]: nextOrder }));

      try {
        await persistLaneOrder(activeData.dayNumber, activeData.category, nextOrder);
      } catch (caughtError) {
        setLaneOrders(previousLaneOrders);
        setReorderError(caughtError instanceof Error ? caughtError.message : 'Could not persist service order.');
      }

      return;
    }

    const sourceNextOrder = sourceOrder.filter((id) => id !== activeId);
    const targetWithoutActive = targetOrder.filter((id) => id !== activeId);
    const targetIndex = overData.itemId ? targetWithoutActive.indexOf(overData.itemId) : -1;
    const insertIndex = targetIndex >= 0 ? targetIndex : targetWithoutActive.length;
    const targetNextOrder = [
      ...targetWithoutActive.slice(0, insertIndex),
      activeId,
      ...targetWithoutActive.slice(insertIndex),
    ];
    const previousItems = localItems;
    const previousLaneOrders = laneOrders;

    setReorderError('');
    setLocalItems((current) =>
      current.map((item) => (item.id === activeId ? { ...item, itineraryId: overData.dayId } : item)),
    );
    setLaneOrders((current) => ({
      ...current,
      [sourceLaneId]: sourceNextOrder,
      [targetLaneId]: targetNextOrder,
    }));

    try {
      const response = await fetch(`${plannerProps.apiBaseUrl}/quotes/${plannerProps.quote.id}/items/${activeId}/move`, {
        method: 'PATCH',
        headers: buildAuthHeaders({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          day: overData.dayNumber,
          serviceType: overData.category,
        }),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not move quote service.'));
      }

      await persistLaneOrder(activeData.dayNumber, activeData.category, sourceNextOrder);
      await persistLaneOrder(overData.dayNumber, overData.category, targetNextOrder);
    } catch (caughtError) {
      setLocalItems(previousItems);
      setLaneOrders(previousLaneOrders);
      setReorderError(caughtError instanceof Error ? caughtError.message : 'Could not move quote service.');
    }
  }

  function openAddPanel(day: QuoteReadinessDay, category: ServicePlannerCategory) {
    const action = DAY_WORKFLOW_ACTIONS.find((entry) => entry.category === category);

    setActiveServicePanel({
      kind: 'add',
      key: `${scope.optionId || 'base'}:${day.id}:${category}`,
      optionId: scope.optionId,
      day,
      category,
      label: action?.label || `Add ${SERVICE_PLANNER_TAB_LABELS[category] || category}`,
    });
  }

  function openAddFormFromSuggestion(item: SmartSuggestionItem) {
    setRecentSuggestions((current) => [item, ...current.filter((entry) => entry.id !== item.id)].slice(0, 8));
    setActiveServicePanel((current) => {
      if (!current || current.kind !== 'add') {
        return current;
      }

      return {
        ...current,
        key: `${current.optionId || 'base'}:${current.day.id}:${current.category}:${item.id}`,
        formReady: true,
        selectedServiceId: item.serviceId,
        selectedHotelId: item.hotelId,
        selectedRouteId: item.routeId,
      };
    });
  }

  function openManualAddForm() {
    setActiveServicePanel((current) => {
      if (!current || current.kind !== 'add') {
        return current;
      }

      return {
        ...current,
        key: `${current.optionId || 'base'}:${current.day.id}:${current.category}:manual`,
        formReady: true,
        selectedServiceId: undefined,
        selectedHotelId: undefined,
        selectedRouteId: undefined,
      };
    });
  }

  function returnToSmartSuggestions() {
    setActiveServicePanel((current) => {
      if (!current || current.kind !== 'add') {
        return current;
      }

      return {
        ...current,
        key: `${current.optionId || 'base'}:${current.day.id}:${current.category}:suggestions`,
        formReady: false,
        selectedServiceId: undefined,
        selectedHotelId: undefined,
        selectedRouteId: undefined,
      };
    });
  }

  async function handleRemoveItem(item: QuoteItem) {
    const displayName = item.hotel?.name || item.service.name;

    if (!window.confirm(`Remove ${displayName}?`)) {
      return;
    }

    setDeletingItemId(item.id);

    try {
      const deletePath = scope.optionId
        ? `/quotes/${plannerProps.quote.id}/options/${scope.optionId}/items/${item.id}`
        : `/quotes/${plannerProps.quote.id}/items/${item.id}`;
      const response = await fetch(`${plannerProps.apiBaseUrl}${deletePath}`, {
        method: 'DELETE',
        headers: buildAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not remove quote service.'));
      }

      if (activeServicePanel?.kind === 'edit' && activeServicePanel.item.id === item.id) {
        setActiveServicePanel(null);
      }

      window.dispatchEvent(new CustomEvent('dmc:quote-pricing-stale', { detail: { quoteId: plannerProps.quote.id } }));
      router.refresh();
    } catch (caughtError) {
      window.alert(caughtError instanceof Error ? caughtError.message : 'Could not remove quote service.');
    } finally {
      setDeletingItemId(null);
    }
  }

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
            <span>Accommodation</span>
            <strong>{workflow.hasHotel ? 'Started' : 'Missing'}</strong>
          </div>
          <div>
            <span>Transport</span>
            <strong>{workflow.hasTransport ? 'Started' : 'Missing'}</strong>
          </div>
          <div>
            <span>Experiences</span>
            <strong>{workflow.hasActivity ? 'Started' : 'Missing'}</strong>
          </div>
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

      {daySummaries.length === 0 ? (
        <article className="workspace-day-card quote-service-day-card">
          <div className="workspace-day-header">
            <div>
              <p className="workspace-day-kicker">Day plan</p>
              <h3>Generate itinerary days from nights to start.</h3>
              <p className="workspace-day-copy">Use the Auto Builder above to create the Base Program days, then add services inside each day card.</p>
            </div>
          </div>
        </article>
      ) : null}

      <div className="quote-service-planner-shell">
        <div className="quote-service-day-column">
          {reorderError ? <p className="form-error">{reorderError}</p> : null}
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleServiceDragEnd}>
      {daySummaries.map((summary) => {
        const completeness = dayCompletenessRules.map((rule) => ({
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
          <RowDetailsPanel
            key={summary.day.id}
            id={`planner-day-${summary.day.id}`}
            summary={dayHeading}
            description={daySubtitle}
            open={plannerState.openDayIds.has(summary.day.id)}
            onOpenChange={(isOpen) => plannerState.onDayOpenChange(summary.day.id, isOpen)}
            className={`workspace-day-card quote-service-day-card${plannerProps.focusedDayId === summary.day.id ? ' quote-service-day-card-focused' : ''}`}
            bodyClassName="quote-service-day-panel-body"
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

            <div className="quote-service-day-layout quote-service-day-layout-visual">
              <section className="quote-service-current-services quote-service-day-main">
                <div className="workspace-section-head">
                  <div>
                    <p className="eyebrow">Assigned Services</p>
                    <h4>{currentServicesCount > 0 ? `${currentServicesCount} service${currentServicesCount === 1 ? '' : 's'} planned` : 'Build this day visually'}</h4>
                  </div>
                </div>
                <AssignedServicesTable
                  dayId={summary.day.id}
                  dayNumber={summary.day.dayNumber}
                  items={summary.items}
                  laneOrders={laneOrders}
                  currency={plannerProps.quote.quoteCurrency}
                  deletingItemId={deletingItemId || undefined}
                  onAdd={(category) => openAddPanel(summary.day, category)}
                  onEdit={(item) =>
                    setActiveServicePanel({
                      kind: 'edit',
                      key: `${scope.optionId || 'base'}:${item.id}:edit`,
                      optionId: scope.optionId,
                      item,
                      dayNumber: summary.day.dayNumber,
                    })
                  }
                  onRemove={handleRemoveItem}
                />
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
                  <section className="quote-service-side-section quote-service-suggestions-section" hidden>
                    <div className="workspace-section-head">
                      <div>
                        <p className="eyebrow">Suggested Next Steps</p>
                        <h4>Fill the obvious gaps</h4>
                      </div>
                    </div>
                    <div className="quote-service-suggestions">
                      {summary.suggestions.map((suggestion) => {
                        const label = DAY_WORKFLOW_ACTIONS.find((action) => action.category === suggestion.category)?.label || `Add ${suggestion.category}`;

                        return (
                          <button
                            key={suggestion.id}
                            type="button"
                            className="quote-service-suggestion-button"
                            onClick={() =>
                              setActiveServicePanel({
                                kind: 'add',
                                key: `${scope.optionId || 'base'}:${summary.day.id}:${suggestion.category}`,
                                optionId: scope.optionId,
                                day: summary.day,
                                category: suggestion.category,
                                label,
                                formReady: false,
                              })
                            }
                          >
                            <strong>{suggestion.title}</strong>
                            <span>{suggestion.description}</span>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                ) : null}
            </div>
          </RowDetailsPanel>
        );
      })}
          </DndContext>
        </div>

        <aside className="quote-service-editor-panel">
          <LivePricingPanel apiBaseUrl={plannerProps.apiBaseUrl} quote={plannerProps.quote} showAdminMetrics={plannerProps.sessionRole === 'admin'} />
          <div className="quote-service-editor-panel-head">
            <div>
              <p className="eyebrow">Add/Edit Service</p>
              <h3>
                {activeServicePanel?.kind === 'add'
                  ? `${activeServicePanel.label} to Day ${activeServicePanel.day.dayNumber}`
                  : activeServicePanel?.kind === 'edit'
                    ? `Edit ${activeServicePanel.item.service.name}`
                    : 'Select a day action'}
              </h3>
            </div>
            {activeServicePanel ? (
              <button type="button" className="secondary-button" onClick={() => setActiveServicePanel(null)}>
                Close
              </button>
            ) : null}
          </div>

          {activeServicePanel ? (
            <div className="quote-service-editor-tabs" role="tablist" aria-label="Service categories">
              {SERVICE_PLANNER_TABS.map((tabCategory) => {
                const tabAction = DAY_WORKFLOW_ACTIONS.find((a) => a.category === tabCategory);
                if (!tabAction) {
                  return null;
                }

                const activeCategory =
                  activeServicePanel.kind === 'add'
                    ? activeServicePanel.category
                    : getQuoteServiceCategoryKey(activeServicePanel.item.service);
                const active = activeCategory === tabCategory;
                const tabDay =
                  activeServicePanel.kind === 'add'
                    ? activeServicePanel.day
                    : plannerProps.quote.itineraries.find((day) => day.id === activeServicePanel.item.itineraryId) ||
                      plannerProps.quote.itineraries[0];

                return (
                  <button
                    key={tabCategory}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    className={active ? 'quote-service-editor-tab quote-service-editor-tab-active' : 'quote-service-editor-tab'}
                    onClick={() => {
                      if (!tabDay) {
                        return;
                      }

                      setActiveServicePanel({
                        kind: 'add',
                        key: `${scope.optionId || 'base'}:${tabDay.id}:${tabCategory}`,
                        optionId: scope.optionId,
                        day: tabDay,
                        category: tabCategory,
                        label: tabAction.label,
                        formReady: false,
                      });
                    }}
                  >
                    {SERVICE_PLANNER_TAB_LABELS[tabCategory]}
                  </button>
                );
              })}
            </div>
          ) : null}

          {activeServicePanel?.kind === 'add' && !activeServicePanel.formReady ? (
            <SmartSuggestionsPanel
              category={activeServicePanel.category}
              day={activeServicePanel.day}
              plannerProps={plannerProps}
              recentSuggestions={recentSuggestions}
              onSelect={openAddFormFromSuggestion}
              onManualSelect={openManualAddForm}
            />
          ) : activeServicePanel?.kind === 'add' ? (
            <div key={activeServicePanel.key}>
              <button type="button" className="secondary-button quote-smart-back-button" onClick={returnToSmartSuggestions}>
                Change selection
              </button>
              <AddServiceEditorPanel
                category={activeServicePanel.category}
                label={activeServicePanel.label}
                plannerProps={plannerProps}
                optionId={activeServicePanel.optionId}
                day={activeServicePanel.day}
                selectedServiceId={activeServicePanel.selectedServiceId}
                selectedHotelId={activeServicePanel.selectedHotelId}
                selectedRouteId={activeServicePanel.selectedRouteId}
              />
            </div>
          ) : activeServicePanel?.kind === 'edit' ? (
            <EditServiceEditorPanel
              item={activeServicePanel.item}
              plannerProps={plannerProps}
              optionId={activeServicePanel.optionId}
              dayNumber={activeServicePanel.dayNumber}
            />
          ) : (
            <div className="quote-service-empty-state">
              <strong>Select a service type to begin</strong>
              <p>Choose Add Hotel, Transport, Activity, or Meal from a day card.</p>
            </div>
          )}
        </aside>
      </div>

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
  const [localItineraries, setLocalItineraries] = useState(props.quote.itineraries);
  const [openDayIds, setOpenDayIds] = useState<Set<string>>(() => new Set(props.quote.itineraries.map((day) => day.id)));
  const [selectedScopeId, setSelectedScopeId] = useState('shared');
  const itineraryDays = localItineraries;
  const plannerQuote = { ...props.quote, itineraries: localItineraries };
  const quoteIdRef = useRef(props.quote.id);
  const scopes: PlannerScope[] = [
    {
      id: 'shared',
      label: 'Base Program',
      items: plannerQuote.quoteItems,
    },
    ...plannerQuote.quoteOptions.map((option) => ({
      id: option.id,
      label: option.name,
      items: option.quoteItems,
      optionId: option.id,
    })),
  ];

  useEffect(() => {
    const quoteChanged = quoteIdRef.current !== props.quote.id;
    const savedDayIds = props.quote.itineraries.map((day) => day.id);

    if (quoteChanged) {
      quoteIdRef.current = props.quote.id;
    }

    setLocalItineraries((currentItineraries) => {
      if (quoteChanged || props.quote.itineraries.length > 0) {
        return props.quote.itineraries;
      }

      return currentItineraries;
    });

    if (props.quote.itineraries.length > 0) {
      setSelectedScopeId('shared');
    }

    setOpenDayIds((currentOpenDayIds) => {
      if (quoteChanged) {
        return new Set(savedDayIds);
      }

      const nextOpenDayIds = new Set(currentOpenDayIds);
      savedDayIds.forEach((dayId) => nextOpenDayIds.add(dayId));
      return nextOpenDayIds;
    });
  }, [props.quote.id, props.quote.itineraries]);

  useEffect(() => {
    function handleDaysReady(event: Event) {
      const detail = (event as CustomEvent<{ quoteId?: string; days?: QuoteReadinessDay[] }>).detail;

      if (detail?.quoteId !== props.quote.id || !Array.isArray(detail.days)) {
        return;
      }

      setLocalItineraries(detail.days);
      setOpenDayIds(new Set(detail.days.map((day) => day.id)));
      setSelectedScopeId('shared');
    }

    window.addEventListener('dmc:quote-itinerary-days-ready', handleDaysReady);
    return () => window.removeEventListener('dmc:quote-itinerary-days-ready', handleDaysReady);
  }, [props.quote.id]);

  function handleDayOpenChange(dayId: string, open: boolean) {
    setOpenDayIds((currentOpenDayIds) => {
      const nextOpenDayIds = new Set(currentOpenDayIds);

      if (open) {
        nextOpenDayIds.add(dayId);
      } else {
        nextOpenDayIds.delete(dayId);
      }

      return nextOpenDayIds;
    });
  }

  const plannerState: ScopePlannerState = {
    openDayIds,
    onDayOpenChange: handleDayOpenChange,
  };

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
        <QuoteAutoItineraryBuilder
          apiBaseUrl={props.apiBaseUrl}
          quote={plannerQuote}
          services={props.services}
          transportServiceTypes={props.transportServiceTypes}
          routes={props.routes}
          hotels={props.hotels}
          hotelContracts={props.hotelContracts}
          hotelRates={props.hotelRates}
          totalPax={props.totalPax}
        />
        <div className="workspace-tab-list" role="tablist" aria-label="Quote service planner scopes">
          <button
            type="button"
            className={`workspace-tab-label${selectedScopeId === 'shared' ? ' workspace-tab-label-active' : ''}`}
            onClick={() => {
              setSelectedScopeId('shared');
            }}
          >
            Base Program
          </button>
          {scopes
            .filter((scope) => scope.id !== 'shared')
            .map((scope) => (
              <span key={scope.id}>
                <input
                  type="radio"
                  id={`planner-${scope.id}`}
                  name="quote-service-planner"
                  checked={selectedScopeId === scope.id}
                  onChange={() => setSelectedScopeId(scope.id)}
                  className="workspace-tab-input"
                />
                <label htmlFor={`planner-${scope.id}`} className="workspace-tab-label">
                  {scope.label}
                </label>
              </span>
            ))}
        </div>
      </div>

      <div className="workspace-tab-panels">
        <section className="workspace-panel-shared quote-base-program-panel-open" data-locked={itineraryDays.length === 0 ? 'true' : 'false'}>
          <div id="quote-base-program-days">
            <ScopePlanner scope={scopes[0]} plannerProps={{ ...props, quote: plannerQuote }} plannerState={plannerState} />
          </div>
        </section>
        {scopes
          .filter((scope) => scope.id !== 'shared')
          .map((scope) => (
            <section key={scope.id} className={`workspace-tab-panel workspace-panel-${scope.id}`}>
              <ScopePlanner scope={scope} plannerProps={{ ...props, quote: plannerQuote }} plannerState={plannerState} />
            </section>
          ))}
      </div>
    </section>
  );
}
