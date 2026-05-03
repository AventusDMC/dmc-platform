'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { closestCenter, DndContext, type DragEndEvent, PointerSensor, useDroppable, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { getErrorMessage, readJsonResponse } from '../../lib/api';
import { buildAuthHeaders } from '../../lib/auth-client';
import { calculateMarginPercent, calculateProfit, formatMarginPercent, getItemMarginWarning, getQuoteMarginWarning } from '../../lib/financials';
import { RouteOption } from '../../lib/routes';
import { DayNavigation, DrawerPanel } from '../../components/ui';
import { QuoteAutoItineraryBuilder } from './QuoteAutoItineraryBuilder';
import { QuoteItemCard } from './QuoteItemCard';
import { QuoteItemsForm } from './QuoteItemsForm';
import { QuoteUnresolvedBatchActions } from './QuoteUnresolvedBatchActions';
import { getExternalPackagePricingBasisForService, type ExternalPackageFormState } from './external-package-ui';
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
  createdAt?: string;
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

type PlannerItineraryDayItem = {
  quoteServiceId: string;
  isActive: boolean;
};

type PlannerItineraryDay = {
  id: string;
  dayNumber: number;
  title: string;
  notes?: string | null;
  description?: string | null;
  isActive: boolean;
  dayItems: PlannerItineraryDayItem[];
};

type PlannerItineraryResponse = {
  quoteId: string;
  days: PlannerItineraryDay[];
};

type DayTimelineItem = {
  id: string;
  time: string;
  title: string;
  description: string;
};

type ParsedDayContent = {
  description: string;
  timeline: DayTimelineItem[];
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
  externalPackageCountry?: string | null;
  externalPackageName?: string | null;
  externalSupplierName?: string | null;
  externalStartDay?: number | null;
  externalEndDay?: number | null;
  externalStartDate?: string | null;
  externalEndDate?: string | null;
  externalPricingBasis?: 'PER_PERSON' | 'PER_GROUP' | string | null;
  externalNetCost?: number | null;
  externalIncludes?: string | null;
  externalExcludes?: string | null;
  externalInternalNotes?: string | null;
  externalClientDescription?: string | null;
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
  quoteItinerary?: PlannerItineraryResponse;
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
  externalPackage?: ExternalPackageFormState;
};

type PlannerScope = {
  id: string;
  label: string;
  items: QuoteItem[];
  optionId?: string;
};

type ScopePlannerState = {
  openDayIds: Set<string>;
  activeDayId: string | null;
  onDayOpenChange: (dayId: string, open: boolean) => void;
  onActiveDayChange: (dayId: string) => void;
};

type ServiceWorkflowStep = {
  category: ServicePlannerCategory;
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
  createdAt?: string;
  catalogRank: number;
};

const CATEGORY_LABELS: Record<ServicePlannerCategory, string> = {
  hotel: 'Stay',
  transport: 'Transfer',
  guide: 'Guide',
  activity: 'Experience',
  meal: 'Meals',
  externalPackage: 'External Package',
  other: 'Other',
};

const DAY_WORKFLOW_ACTIONS: Array<{ category: ServicePlannerCategory; label: string }> = [
  { category: 'hotel', label: 'Add Hotel' },
  { category: 'transport', label: 'Add Transport' },
  { category: 'activity', label: 'Add Activity' },
  { category: 'meal', label: 'Add Meal' },
  { category: 'externalPackage', label: 'Add External Package' },
];

const SERVICE_PLANNER_TABS: ServicePlannerCategory[] = ['hotel', 'transport', 'activity', 'meal', 'externalPackage'];
const SERVICE_PLANNER_TAB_LABELS: Record<ServicePlannerCategory, string> = {
  hotel: 'Hotel',
  transport: 'Transport',
  activity: 'Activity',
  meal: 'Meal',
  externalPackage: 'External Package',
  // These are unused for the planner tabs, but keep the record exhaustive.
  guide: 'Guide',
  other: 'Other',
};
const SERVICE_PLANNER_ICONS: Record<ServicePlannerCategory, string> = {
  hotel: 'H',
  transport: 'T',
  activity: 'A',
  meal: 'M',
  externalPackage: 'P',
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
  return `${dayLabel} - ${locationLabel}`;
}

function parseGuideInitialValues(pricingDescription: string | null) {
  const normalized = pricingDescription?.toLowerCase() || '';

  return {
    guideType: normalized.includes('escort') ? ('escort' as const) : ('local' as const),
    guideDuration: normalized.includes('half day') ? ('half_day' as const) : ('full_day' as const),
    overnight: normalized.includes('overnight: yes') ? ('yes' as const) : ('no' as const),
  };
}

function toDateInputValue(value: string | null | undefined) {
  return value ? value.slice(0, 10) : '';
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
    externalPackage: {
      packageName: item.externalPackageName || item.service.name || '',
      country: item.externalPackageCountry || '',
      supplierName: item.externalSupplierName || '',
      startDay: item.externalStartDay !== null && item.externalStartDay !== undefined ? String(item.externalStartDay) : '',
      endDay: item.externalEndDay !== null && item.externalEndDay !== undefined ? String(item.externalEndDay) : '',
      startDate: toDateInputValue(item.externalStartDate),
      endDate: toDateInputValue(item.externalEndDate),
      pricingBasis: item.externalPricingBasis === 'PER_GROUP' ? 'PER_GROUP' : 'PER_PERSON',
      netCost: item.externalNetCost !== null && item.externalNetCost !== undefined ? String(item.externalNetCost) : '',
      currency: item.currency || 'USD',
      includes: item.externalIncludes || '',
      excludes: item.externalExcludes || '',
      internalNotes: item.externalInternalNotes || '',
      clientItineraryText: item.externalClientDescription || '',
    },
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
    item.externalClientDescription ||
    item.externalPackageCountry ||
    item.appliedVehicleRate?.routeName ||
    item.pickupLocation ||
    item.meetingPoint ||
    item.pricingDescription ||
    item.hotel?.name ||
    'No notes'
  );
}

function getServiceSupplierLabel(item: QuoteItem) {
  return item.externalSupplierName || item.hotel?.name || item.contract?.name || item.service.supplierId || 'Supplier pending';
}

function isExternalPackageItem(item: QuoteItem) {
  return getQuoteServiceCategoryKey(item.service) === 'externalPackage';
}

function getExternalPackageName(item: QuoteItem) {
  return item.externalPackageName || item.service.name || 'External package';
}

function getExternalPackageDayRange(item: QuoteItem, fallbackDayNumber?: number | null) {
  const startDay = item.externalStartDay ?? fallbackDayNumber ?? null;
  const endDay = item.externalEndDay ?? startDay;

  if (!startDay || !endDay) {
    return null;
  }

  return {
    startDay,
    endDay,
    label: startDay === endDay ? `Day ${startDay}` : `Day ${startDay}-${endDay}`,
  };
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

function parseDayContent(value: string | null | undefined): ParsedDayContent {
  const raw = String(value || '').replace(/\r\n/g, '\n').trim();
  const timelineMatch = raw.match(/\n{0,2}Timeline:\s*\n/i);
  const description = (timelineMatch ? raw.slice(0, timelineMatch.index).trim() : raw).trim();
  const timelineText = timelineMatch ? raw.slice((timelineMatch.index || 0) + timelineMatch[0].length).trim() : '';
  const timeline = timelineText
    .split('\n')
    .map((line, index) => {
      const cleaned = line.replace(/^[-*]\s*/, '').trim();

      if (!cleaned) {
        return null;
      }

      const parts = cleaned.split('|').map((part) => part.trim());
      const [time = '', title = '', itemDescription = ''] = parts;

      return {
        id: `timeline-${index}-${time}-${title}`.replace(/[^a-z0-9-]/gi, '-'),
        time,
        title: title || cleaned,
        description: itemDescription,
      };
    })
    .filter((item): item is DayTimelineItem => Boolean(item && item.title));

  return { description, timeline };
}

function serializeDayContent(description: string, timeline: DayTimelineItem[]) {
  const narrative = description.trim();
  const timelineLines = timeline
    .filter((item) => item.time.trim() || item.title.trim() || item.description.trim())
    .map((item) => `- ${item.time.trim()} | ${item.title.trim()} | ${item.description.trim()}`);

  return [narrative, timelineLines.length > 0 ? ['Timeline:', ...timelineLines].join('\n') : '']
    .filter(Boolean)
    .join('\n\n');
}

function getPlannerDays(quote: Quote, quoteItinerary?: PlannerItineraryResponse): QuoteReadinessDay[] {
  const quoteItineraryDays = (quoteItinerary?.days || [])
    .filter((day) => day.isActive)
    .sort((left, right) => left.dayNumber - right.dayNumber)
    .map((day) => ({
      id: day.id,
      dayNumber: day.dayNumber,
      title: day.title || `Day ${day.dayNumber}`,
      description: day.description || day.notes || null,
    }));

  return quoteItineraryDays.length > 0 ? quoteItineraryDays : quote.itineraries;
}

function getPlannerDayAssignmentMap(quoteItinerary?: PlannerItineraryResponse) {
  const assignments = new Map<string, string>();

  for (const day of quoteItinerary?.days || []) {
    if (!day.isActive) {
      continue;
    }

    for (const item of day.dayItems || []) {
      if (item.isActive && item.quoteServiceId) {
        assignments.set(item.quoteServiceId, day.id);
      }
    }
  }

  return assignments;
}

function applyPlannerDayAssignments(items: QuoteItem[], quoteItinerary?: PlannerItineraryResponse): QuoteItem[] {
  const assignments = getPlannerDayAssignmentMap(quoteItinerary);

  if (assignments.size === 0) {
    return items;
  }

  return items.map((item) => {
    const itineraryId = assignments.get(item.id);
    return itineraryId ? { ...item, itineraryId } : item;
  });
}

function getOrderedLaneItems(items: QuoteItem[], laneOrder: string[]) {
  const itemById = new Map(items.map((item) => [item.id, item]));

  return laneOrder.map((id) => itemById.get(id)).filter((item): item is QuoteItem => Boolean(item));
}

function getServiceTypeLabel(service: SupplierService) {
  return service.serviceType?.name || service.category || service.unitType || 'Service';
}

function normalizeSuggestionText(value: string | null | undefined) {
  return (value || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
}

function getSuggestionLocationTerms(day: QuoteReadinessDay) {
  const genericTerms = new Set(['day', 'overnight', 'arrival', 'departure', 'city', 'tour', 'trip', 'stay', 'the', 'and', 'from', 'to']);
  const text = normalizeSuggestionText(`${day.title || ''} ${day.description || ''}`);

  return Array.from(new Set(text.split(/\s+/).filter((term) => term.length >= 3 && !/^\d+$/.test(term) && !genericTerms.has(term)))).slice(0, 8);
}

function getAllPlannerItems(quote: Quote) {
  return [...quote.quoteItems, ...quote.quoteOptions.flatMap((option) => option.quoteItems)];
}

function getQuoteUsageCounts(quote: Quote) {
  const counts = new Map<string, number>();

  for (const item of getAllPlannerItems(quote)) {
    const keys = [item.service.id, item.hotelId ? `hotel:${item.hotelId}` : null, item.appliedVehicleRate?.routeId ? `route:${item.appliedVehicleRate.routeId}` : null].filter(
      (key): key is string => Boolean(key),
    );

    keys.forEach((key) => counts.set(key, (counts.get(key) || 0) + 1));
  }

  return counts;
}

function getSuggestionUsageScore(item: SmartSuggestionItem, usageCounts: Map<string, number>) {
  return Math.max(
    item.serviceId ? usageCounts.get(item.serviceId) || 0 : 0,
    item.hotelId ? usageCounts.get(`hotel:${item.hotelId}`) || 0 : 0,
    item.routeId ? usageCounts.get(`route:${item.routeId}`) || 0 : 0,
  );
}

function getSuggestionLocationScore(item: SmartSuggestionItem, terms: string[]) {
  if (terms.length === 0) {
    return 0;
  }

  const haystack = normalizeSuggestionText(`${item.label} ${item.detail}`);
  return terms.reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0);
}

function compareSmartSuggestions(left: SmartSuggestionItem, right: SmartSuggestionItem, usageCounts: Map<string, number>) {
  const usageDelta = getSuggestionUsageScore(right, usageCounts) - getSuggestionUsageScore(left, usageCounts);

  if (usageDelta !== 0) {
    return usageDelta;
  }

  const leftTime = left.createdAt ? new Date(left.createdAt).getTime() : 0;
  const rightTime = right.createdAt ? new Date(right.createdAt).getTime() : 0;

  if (leftTime !== rightTime) {
    return rightTime - leftTime;
  }

  return left.catalogRank - right.catalogRank || left.label.localeCompare(right.label);
}

function getSmartSuggestionCandidates(category: ServicePlannerCategory, plannerProps: QuoteServicePlannerProps): SmartSuggestionItem[] {
  const usageCounts = getQuoteUsageCounts(plannerProps.quote);
  if (category === 'hotel') {
    return plannerProps.hotels
      .map((hotel, index) => ({
        id: `hotel:${hotel.id}`,
        label: hotel.name,
        detail: [hotel.city, hotel.category].filter(Boolean).join(' - ') || 'Hotel',
        category,
        source: 'hotel' as const,
        hotelId: hotel.id,
        catalogRank: index,
      }))
      .sort((left, right) => compareSmartSuggestions(left, right, usageCounts));
  }

  if (category === 'transport') {
    return plannerProps.routes
      .map((route, index) => ({
        id: `route:${route.id}`,
        label: route.name,
        detail: 'Transport route',
        category,
        source: 'route' as const,
        routeId: route.id,
        catalogRank: index,
      }))
      .sort((left, right) => compareSmartSuggestions(left, right, usageCounts));
  }

  return plannerProps.services
    .filter((service) => getQuoteServiceCategoryKey(service) === category)
    .map((service, index) => ({
      id: `service:${service.id}`,
      label: service.name,
      detail: `${getServiceTypeLabel(service)} - ${formatLiveMoney(service.baseCost, service.currency)}`,
      category,
      source: 'service' as const,
      serviceId: service.id,
      createdAt: service.createdAt,
      catalogRank: index,
    }))
    .sort((left, right) => compareSmartSuggestions(left, right, usageCounts));
}

function getSuggestedForDay(category: ServicePlannerCategory, day: QuoteReadinessDay, plannerProps: QuoteServicePlannerProps) {
  const candidates = getSmartSuggestionCandidates(category, plannerProps);
  const terms = getSuggestionLocationTerms(day);
  const usageCounts = getQuoteUsageCounts(plannerProps.quote);
  const ranked = candidates
    .map((item) => ({
      item,
      locationScore: getSuggestionLocationScore(item, terms),
      usageScore: getSuggestionUsageScore(item, usageCounts),
    }))
    .sort((left, right) => right.locationScore - left.locationScore || right.usageScore - left.usageScore || compareSmartSuggestions(left.item, right.item, usageCounts));
  const locationMatches = ranked.filter((entry) => entry.locationScore > 0).map((entry) => entry.item);

  return (locationMatches.length > 0 ? locationMatches : ranked.map((entry) => entry.item)).slice(0, 5);
}

function getUsedInQuoteSuggestions(category: ServicePlannerCategory, plannerProps: QuoteServicePlannerProps) {
  const used = new Map<string, SmartSuggestionItem>();

  for (const item of getAllPlannerItems(plannerProps.quote)) {
    if (getQuoteServiceCategoryKey(item.service) !== category) {
      continue;
    }

    if (category === 'hotel' && item.hotelId) {
      used.set(`hotel:${item.hotelId}`, {
        id: `hotel:${item.hotelId}`,
        label: item.hotel?.name || item.service.name,
        detail: item.contract?.name || 'Used in this quote',
        category,
        source: 'hotel',
        hotelId: item.hotelId,
        catalogRank: 0,
      });
    } else if (category === 'transport' && item.appliedVehicleRate?.routeId) {
      used.set(`route:${item.appliedVehicleRate.routeId}`, {
        id: `route:${item.appliedVehicleRate.routeId}`,
        label: item.appliedVehicleRate.routeName || item.service.name,
        detail: item.appliedVehicleRate.serviceType.name || 'Used in this quote',
        category,
        source: 'route',
        routeId: item.appliedVehicleRate.routeId,
        catalogRank: 0,
      });
    } else {
      used.set(`service:${item.service.id}`, {
        id: `service:${item.service.id}`,
        label: item.service.name,
        detail: `${getServiceTypeLabel(item.service)} - used in this quote`,
        category,
        source: 'service',
        serviceId: item.service.id,
        createdAt: item.service.createdAt,
        catalogRank: 0,
      });
    }
  }

  return Array.from(used.values()).slice(0, 6);
}

function findDefaultPlannerService(category: ServicePlannerCategory, plannerProps: QuoteServicePlannerProps, suggestion: SmartSuggestionItem) {
  if (suggestion.serviceId) {
    return plannerProps.services.find((service) => service.id === suggestion.serviceId) || null;
  }

  return plannerProps.services.find((service) => getQuoteServiceCategoryKey(service) === category) || null;
}

function buildQuickAddPayload(
  item: SmartSuggestionItem,
  day: QuoteReadinessDay,
  category: ServicePlannerCategory,
  plannerProps: QuoteServicePlannerProps,
) {
  const service = findDefaultPlannerService(category, plannerProps, item);

  if (!service) {
    throw new Error(`No ${SERVICE_PLANNER_TAB_LABELS[category].toLowerCase()} catalog service is available for quick add.`);
  }

  const payload: Record<string, unknown> = {
    serviceId: service.id,
    itineraryId: day.id,
    quantity: 1,
    paxCount: Math.max(1, plannerProps.totalPax || 1),
    markupPercent: 20,
    overrideCost: null,
    overrideReason: null,
    useOverride: false,
    markupAmount: null,
    sellPrice: null,
  };

  if (category === 'hotel') {
    const hotelId = item.hotelId;
    const contract = hotelId ? plannerProps.hotelContracts.find((entry) => entry.hotelId === hotelId) : null;
    const rate = contract ? plannerProps.hotelRates.find((entry) => entry.contractId === contract.id) : null;

    if (!hotelId || !contract || !rate) {
      throw new Error('Choose Configure to select a hotel contract and room rate before adding this hotel.');
    }

    payload.hotelId = hotelId;
    payload.contractId = contract.id;
    payload.seasonName = rate.seasonName;
    payload.roomCategoryId = rate.roomCategoryId;
    payload.occupancyType = rate.occupancyType;
    payload.mealPlan = rate.mealPlan;
    payload.roomCount = Math.max(1, plannerProps.quote.roomCount || 1);
    payload.nightCount = Math.max(1, plannerProps.quote.nightCount || 1);
  } else if (category === 'transport') {
    const transportServiceType = plannerProps.transportServiceTypes[0];

    if (!transportServiceType || !item.routeId) {
      throw new Error('Choose Configure to select a route and transport type before adding this transport.');
    }

    payload.transportServiceTypeId = transportServiceType.id;
    payload.routeId = item.routeId;
  } else if (category === 'meal') {
    payload.customServiceName = item.label;
    payload.unitCost = service.baseCost;
    payload.pricingBasis = 'PER_PERSON';
    payload.currency = service.currency;
  } else if (category === 'externalPackage') {
    const country = item.label.match(/\b(?:in|for)\s+([A-Z][A-Za-z\s]+)$/)?.[1]?.trim() || service.name.replace(/external package/i, '').trim() || 'External destination';
    const pricingBasis = getExternalPackagePricingBasisForService(service);
    payload.country = country;
    payload.supplierName = service.supplierId || null;
    payload.packageName = service.name;
    payload.pricingBasis = pricingBasis;
    payload.netCost = Number(service.baseCost || 0);
    payload.currency = service.currency;
    payload.clientDescription = item.label || service.name;
  }

  return payload;
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
  onSaved,
}: {
  category: ServicePlannerCategory;
  label: string;
  plannerProps: QuoteServicePlannerProps;
  optionId?: string;
  day: QuoteReadinessDay;
  selectedServiceId?: string;
  selectedHotelId?: string;
  selectedRouteId?: string;
  onSaved?: (item: QuoteItem) => void;
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
        itineraryDayTitle={day.title}
        itineraryDayDescription={day.description}
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
        onSaved={(item) => onSaved?.(item as QuoteItem)}
      />
    </>
  );
}

function SmartSuggestionsPanel({
  category,
  day,
  plannerProps,
  onQuickAdd,
  onConfigure,
  onManualSelect,
  quickAddPendingId,
}: {
  category: ServicePlannerCategory;
  day: QuoteReadinessDay;
  plannerProps: QuoteServicePlannerProps;
  onQuickAdd: (item: SmartSuggestionItem) => void;
  onConfigure: (item: SmartSuggestionItem) => void;
  onManualSelect: () => void;
  quickAddPendingId?: string | null;
}) {
  const [query, setQuery] = useState('');
  const candidates = getSmartSuggestionCandidates(category, plannerProps);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredCandidates = normalizedQuery
    ? candidates.filter((item) => `${item.label} ${item.detail}`.toLowerCase().includes(normalizedQuery))
    : candidates;
  const suggested = getSuggestedForDay(category, day, plannerProps);
  const usedInQuote = getUsedInQuoteSuggestions(category, plannerProps);

  return (
    <div className="quote-smart-suggestions">
      <div className="quote-smart-suggestion-intro">
        <p className="eyebrow">Smart Suggestions</p>
        <h4>{SERVICE_PLANNER_TAB_LABELS[category]} for Day {day.dayNumber}</h4>
        <p className="detail-copy">Click a suggestion to add it with smart defaults, or configure it first when details matter.</p>
        <button type="button" className="secondary-button" onClick={onManualSelect}>
          Advanced / Configure before adding
        </button>
      </div>

      <SmartSuggestionSection
        title="Suggested for this day"
        items={suggested}
        emptyText="No suggestions available for this service type."
        onQuickAdd={onQuickAdd}
        onConfigure={onConfigure}
        quickAddPendingId={quickAddPendingId}
      />
      <SmartSuggestionSection
        title="Used in this quote"
        items={usedInQuote}
        emptyText="Services used elsewhere in this quote will appear here."
        onQuickAdd={onQuickAdd}
        onConfigure={onConfigure}
        quickAddPendingId={quickAddPendingId}
      />

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
            filteredCandidates.map((item) => (
              <SmartSuggestionButton
                key={item.id}
                item={item}
                onQuickAdd={onQuickAdd}
                onConfigure={onConfigure}
                quickAddPendingId={quickAddPendingId}
              />
            ))
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
  onQuickAdd,
  onConfigure,
  quickAddPendingId,
}: {
  title: string;
  items: SmartSuggestionItem[];
  emptyText: string;
  onQuickAdd: (item: SmartSuggestionItem) => void;
  onConfigure: (item: SmartSuggestionItem) => void;
  quickAddPendingId?: string | null;
}) {
  return (
    <section className="quote-smart-suggestion-section">
      <div className="quote-smart-suggestion-section-head">
        <h5>{title}</h5>
        <span>{items.length}</span>
      </div>
      <div className="quote-smart-suggestion-list">
        {items.length > 0 ? (
          items.map((item) => (
            <SmartSuggestionButton
              key={item.id}
              item={item}
              onQuickAdd={onQuickAdd}
              onConfigure={onConfigure}
              quickAddPendingId={quickAddPendingId}
            />
          ))
        ) : (
          <p className="detail-copy">{emptyText}</p>
        )}
      </div>
    </section>
  );
}

function SmartSuggestionButton({
  item,
  onQuickAdd,
  onConfigure,
  quickAddPendingId,
}: {
  item: SmartSuggestionItem;
  onQuickAdd: (item: SmartSuggestionItem) => void;
  onConfigure: (item: SmartSuggestionItem) => void;
  quickAddPendingId?: string | null;
}) {
  const isPending = quickAddPendingId === item.id;

  return (
    <div className="quote-smart-suggestion-choice">
      <button type="button" className="quote-smart-suggestion-button" onClick={() => onQuickAdd(item)} disabled={Boolean(quickAddPendingId)}>
        <strong>{item.label}</strong>
        <span>{isPending ? 'Adding...' : item.detail}</span>
      </button>
      <button type="button" className="quote-smart-suggestion-configure" onClick={() => onConfigure(item)} disabled={Boolean(quickAddPendingId)}>
        Configure
      </button>
    </div>
  );
}

function EditServiceEditorPanel({
  item,
  plannerProps,
  optionId,
  dayNumber,
  onSaved,
}: {
  item: QuoteItem;
  plannerProps: QuoteServicePlannerProps;
  optionId?: string;
  dayNumber: number | null;
  onSaved?: (item: QuoteItem) => void;
}) {
  const itineraryDay = item.itineraryId ? plannerProps.quote.itineraries.find((day) => day.id === item.itineraryId) ?? null : null;

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
      itineraryDayTitle={itineraryDay?.title ?? null}
      itineraryDayDescription={itineraryDay?.description ?? null}
      itineraryId={item.itineraryId || undefined}
      initialServiceTypeKey={getQuoteServiceCategoryKey(item.service)}
      submitLabel="Save item"
      initialValues={buildQuoteItemInitialValues(item, plannerProps.totalPax, plannerProps.quote.roomCount, plannerProps.quote.nightCount)}
      onSaved={(savedItem) => onSaved?.(savedItem as QuoteItem)}
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
  recentlyAddedItemId,
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
  recentlyAddedItemId?: string;
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
            recentlyAddedItemId={recentlyAddedItemId}
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
  recentlyAddedItemId,
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
  recentlyAddedItemId?: string;
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
      </div>

      {orderedItems.length === 0 ? (
        <button type="button" className="quote-service-empty-add" onClick={() => onAdd(category)}>
          <span aria-hidden="true">+</span>
          Add {label}
        </button>
      ) : (
        <SortableContext items={orderedItems.map((item) => item.id)} strategy={verticalListSortingStrategy}>
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
                recentlyAddedItemId={recentlyAddedItemId}
                onEdit={onEdit}
                onRemove={onRemove}
              />
            ))}
          </div>
        </SortableContext>
      )}
      {orderedItems.length > 0 ? (
        <button type="button" className="quote-service-lane-add quote-service-lane-add-bottom" onClick={() => onAdd(category)}>
          Add {label}
        </button>
      ) : null}
    </section>
  );
}

function formatLiveMoney(value: number | null | undefined, currency: string) {
  const numericValue = Number(value);
  const safeValue = Number.isFinite(numericValue) ? numericValue : 0;

  return `${currency || 'USD'} ${safeValue.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
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
  recentlyAddedItemId,
  onEdit,
  onRemove,
}: {
  item: QuoteItem;
  dayId: string;
  dayNumber: number;
  category: ServicePlannerCategory;
  currency: Quote['quoteCurrency'];
  deletingItemId?: string;
  recentlyAddedItemId?: string;
  onEdit: (item: QuoteItem) => void;
  onRemove: (item: QuoteItem) => void;
}) {
  const isExternalPackage = isExternalPackageItem(item);
  const externalRange = isExternalPackage ? getExternalPackageDayRange(item, dayNumber) : null;
  const displayName = isExternalPackage ? getExternalPackageName(item) : item.hotel?.name || item.service.name;
  const itemProfit = calculateProfit(item.totalSell, item.totalCost);
  const itemMarginPercent = calculateMarginPercent(item.totalSell, item.totalCost);
  const itemMarginWarning = getItemMarginWarning(item.totalSell, item.totalCost);
  const itemCurrency = (item.currency as Quote['quoteCurrency']) || currency;

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
      className={`quote-service-mini-card quote-service-sortable-card${isExternalPackage ? ' quote-service-mini-card-external-package' : ''}${isDragging ? ' quote-service-sortable-card-dragging' : ''}${recentlyAddedItemId === item.id ? ' quote-service-mini-card-added' : ''}`}
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
          aria-label={`Drag ${displayName}`}
          {...attributes}
          {...listeners}
        >
          <span className="quote-service-type-icon" aria-hidden="true">
            {SERVICE_PLANNER_ICONS[getQuoteServiceCategoryKey(item.service)] || 'S'}
          </span>
        </button>
        {isExternalPackage && externalRange ? <span className="quote-service-day-range-badge">{externalRange.label}</span> : null}
        {item.service.supplierId === 'import-itinerary-system' ? <em>Unmatched</em> : null}
      </div>
      <div className="quote-service-mini-card-main">
        <div className="quote-service-mini-card-title-row">
          <div className="quote-service-mini-card-title-copy">
            <span>{SERVICE_PLANNER_TAB_LABELS[category]}</span>
            <h5>{displayName}</h5>
          </div>
          <strong className="quote-service-card-price">{formatLiveMoney(item.totalSell, itemCurrency)}</strong>
        </div>
        <p className="quote-service-card-supplier">
          {isExternalPackage ? `Partner: ${getServiceSupplierLabel(item)}` : getServiceSupplierLabel(item)}
        </p>
      </div>
      {isExternalPackage ? (
        <div className="quote-service-external-package-meta">
          <span>Multi-day partner package</span>
          {externalRange ? <strong>Spans {externalRange.label}</strong> : null}
          <em>{item.externalPackageCountry || 'Country pending'}</em>
        </div>
      ) : null}
      <div className="quote-service-card-pricing-summary">
        <span>Cost <span className="quote-money">{formatLiveMoney(item.totalCost, itemCurrency)}</span></span>
        <span>Profit <span className="quote-money">{formatLiveMoney(itemProfit, itemCurrency)}</span></span>
        <span>Margin <span className="quote-money">{formatMarginPercent(itemMarginPercent)}</span></span>
        {isExternalPackage ? (
          <span>{item.externalPricingBasis === 'PER_GROUP' ? 'Per group' : 'Per person'}</span>
        ) : null}
        {itemMarginWarning ? <em className={`quote-ui-badge ${itemMarginWarning === 'Loss' ? 'quote-ui-badge-error' : 'quote-ui-badge-warning'}`}>{itemMarginWarning}</em> : null}
      </div>
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

function getActiveServiceDrawerTitle(activeServicePanel: ActiveServicePanel | null) {
  if (!activeServicePanel) {
    return 'Service editor';
  }

  if (activeServicePanel.kind === 'add') {
    return `${activeServicePanel.label} - Day ${activeServicePanel.day.dayNumber}`;
  }

  return `${activeServicePanel.item.service.name} - Day ${activeServicePanel.dayNumber || 'Unassigned'}`;
}

function getActiveServiceDrawerDescription(activeServicePanel: ActiveServicePanel | null) {
  if (!activeServicePanel) {
    return 'Focused editing panel';
  }

  if (activeServicePanel.kind === 'add') {
    return `${SERVICE_PLANNER_TAB_LABELS[activeServicePanel.category]} setup for ${activeServicePanel.day.title || `Day ${activeServicePanel.day.dayNumber}`}.`;
  }

  return `${getServiceTypeLabel(activeServicePanel.item.service)} service details, supplier context, and pricing.`;
}

function ActiveServiceDrawerFinancials({
  activeServicePanel,
  currency,
}: {
  activeServicePanel: ActiveServicePanel;
  currency: Quote['quoteCurrency'];
}) {
  if (activeServicePanel.kind !== 'edit') {
    return (
      <div className="quote-drawer-financial-summary">
        <div>
          <span>Cost</span>
          <strong>Awaiting inputs</strong>
        </div>
        <div>
          <span>Sell</span>
          <strong>Awaiting inputs</strong>
        </div>
        <div>
          <span>Margin</span>
          <strong>Pending save</strong>
        </div>
      </div>
    );
  }

  const item = activeServicePanel.item;
  const itemCurrency = (item.currency as Quote['quoteCurrency']) || currency;
  const marginAmount = calculateProfit(item.totalSell, item.totalCost);
  const marginPercent = calculateMarginPercent(item.totalSell, item.totalCost);

  return (
    <div className="quote-drawer-financial-summary">
      <div>
        <span>Cost</span>
        <strong>{formatLiveMoney(item.totalCost, itemCurrency)}</strong>
      </div>
      <div>
        <span>Sell</span>
        <strong>{formatLiveMoney(item.totalSell, itemCurrency)}</strong>
      </div>
      <div>
        <span>Margin</span>
        <strong>
          {formatLiveMoney(marginAmount, itemCurrency)} / {formatMarginPercent(marginPercent)}
        </strong>
      </div>
    </div>
  );
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
  const marginAmount = calculateProfit(summary.totalSell, summary.totalCost);
  const marginPercent = calculateMarginPercent(summary.totalSell, summary.totalCost);
  const quoteMarginWarning = getQuoteMarginWarning(summary.totalSell, summary.totalCost);
  const marginTone = marginAmount < 0 ? 'risk' : marginPercent < 15 ? 'watch' : 'good';

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
          <h3>Decision summary</h3>
        </div>
        <span className={isRefreshing ? 'quote-live-pricing-status quote-live-pricing-status-active' : 'quote-live-pricing-status'}>
          {isRefreshing ? 'Updating' : 'Current'}
        </span>
      </div>
      <div className={`quote-live-pricing-profit quote-live-pricing-profit-${marginTone}`}>
        <span>Profit</span>
        <strong>{formatLiveMoney(showAdminMetrics ? marginAmount : summary.totalSell, summary.quoteCurrency)}</strong>
        <em>{showAdminMetrics ? `${formatMarginPercent(marginPercent)} margin` : 'Total sell'}</em>
        {showAdminMetrics && quoteMarginWarning ? <span className={`quote-ui-badge ${quoteMarginWarning === 'Loss' ? 'quote-ui-badge-error' : 'quote-ui-badge-warning'}`}>{quoteMarginWarning}</span> : null}
      </div>
      <div className="quote-live-pricing-list">
        <div className="quote-live-pricing-row">
          <span>Total sell</span>
          <strong>{formatLiveMoney(summary.totalSell, summary.quoteCurrency)}</strong>
        </div>
        {showAdminMetrics ? (
          <div className="quote-live-pricing-row">
            <span>Total cost</span>
            <strong>{formatLiveMoney(summary.totalCost, summary.quoteCurrency)}</strong>
          </div>
        ) : null}
        {showAdminMetrics ? (
          <div className="quote-live-pricing-row">
            <span>Profit</span>
            <strong className={`quote-live-pricing-margin quote-live-pricing-margin-${marginTone}`}>{formatLiveMoney(marginAmount, summary.quoteCurrency)}</strong>
          </div>
        ) : null}
        {showAdminMetrics ? (
          <div className="quote-live-pricing-row">
            <span>Margin %</span>
            <strong className={`quote-live-pricing-margin quote-live-pricing-margin-${marginTone}`}>{formatMarginPercent(marginPercent)}</strong>
          </div>
        ) : null}
      </div>
    </aside>
  );
}

function DayNarrativePanel({
  day,
  value,
  error,
  onDescriptionEdit,
  onTimelineEdit,
  onTimelineAdd,
}: {
  day: QuoteReadinessDay;
  value: string;
  error: string;
  onDescriptionEdit: () => void;
  onTimelineEdit: (item: DayTimelineItem, index: number) => void;
  onTimelineAdd: () => void;
}) {
  const parsed = parseDayContent(value);
  const hasDescription = parsed.description.trim().length > 0;

  return (
    <section className="quote-day-narrative-panel">
      <div className="workspace-section-head">
        <div>
          <p className="eyebrow">Day Description</p>
          <h4>Client-facing narrative</h4>
        </div>
        <button type="button" className="secondary-button" onClick={onDescriptionEdit}>
          Edit
        </button>
      </div>
      {hasDescription ? (
        <p className="quote-day-description-copy">{parsed.description}</p>
      ) : (
        <button type="button" className="quote-day-empty-content" onClick={onDescriptionEdit}>
          Add a client-facing description for Day {day.dayNumber}.
        </button>
      )}
      {error ? <p className="form-error">{error}</p> : null}

      <div className="quote-day-timeline-panel">
        <div className="quote-day-timeline-head">
          <div>
            <p className="eyebrow">Timeline</p>
            <h4>Optional schedule</h4>
          </div>
          <button type="button" className="secondary-button" onClick={onTimelineAdd}>
            Add item
          </button>
        </div>
        {parsed.timeline.length > 0 ? (
          <div className="quote-day-timeline-list">
            {parsed.timeline.map((item, index) => (
              <button key={`${item.id}-${index}`} type="button" className="quote-day-timeline-item" onClick={() => onTimelineEdit(item, index)}>
                <span>{item.time || 'Time'}</span>
                <strong>{item.title}</strong>
                {item.description ? <em>{item.description}</em> : null}
              </button>
            ))}
          </div>
        ) : (
          <p className="form-helper">No timeline items yet.</p>
        )}
      </div>
    </section>
  );
}

function DayDescriptionDrawer({
  item,
  isSaving,
  onChange,
  onSave,
}: {
  item: { day: QuoteReadinessDay; draft: string } | null;
  isSaving: boolean;
  onChange: (draft: string) => void;
  onSave: () => void;
}) {
  return (
    <DrawerPanel
      open={Boolean(item)}
      title="Day description"
      description="Client-facing day narrative"
      onClose={onSave}
      closeLabel={isSaving ? 'Saving...' : 'Save'}
      className="quote-timeline-drawer"
    >
      {item ? (
        <div className="quote-timeline-drawer-form">
          <label>
            Description
            <textarea
              className="quote-day-description-textarea"
              value={item.draft}
              onChange={(event) => onChange(event.target.value)}
              placeholder={`Describe Day ${item.day.dayNumber} for the client proposal.`}
            />
          </label>
          <div className="quote-timeline-drawer-actions">
            <button type="button" className="primary-button" onClick={onSave} disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save description'}
            </button>
          </div>
        </div>
      ) : null}
    </DrawerPanel>
  );
}

function TimelineItemDrawer({
  item,
  onChange,
  onSave,
  onRemove,
}: {
  item: { day: QuoteReadinessDay; index: number; draft: DayTimelineItem } | null;
  onChange: (draft: DayTimelineItem) => void;
  onSave: () => void;
  onRemove: () => void;
}) {
  return (
    <DrawerPanel
      open={Boolean(item)}
      title="Timeline item"
      description="Edit the optional day schedule item."
      onClose={onSave}
      closeLabel="Done"
      className="quote-timeline-drawer"
    >
      {item ? (
        <div className="quote-timeline-drawer-form">
          <label>
            Time
            <input value={item.draft.time} onChange={(event) => onChange({ ...item.draft, time: event.target.value })} placeholder="09:00" />
          </label>
          <label>
            Title
            <input value={item.draft.title} onChange={(event) => onChange({ ...item.draft, title: event.target.value })} placeholder="Visit Jerash" />
          </label>
          <label>
            Description
            <textarea
              value={item.draft.description}
              onChange={(event) => onChange({ ...item.draft, description: event.target.value })}
              placeholder="Optional detail for this schedule item."
            />
          </label>
          <div className="quote-timeline-drawer-actions">
            <button type="button" className="primary-button" onClick={onSave}>
              Done
            </button>
            <button type="button" className="secondary-button secondary-button-danger" onClick={onRemove}>
              Remove
            </button>
          </div>
        </div>
      ) : null}
    </DrawerPanel>
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
  const [dayContentDrafts, setDayContentDrafts] = useState<Record<string, string>>({});
  const [savingDayId, setSavingDayId] = useState<string | null>(null);
  const [dayContentError, setDayContentError] = useState('');
  const [activeDayDescription, setActiveDayDescription] = useState<{ day: QuoteReadinessDay; draft: string } | null>(null);
  const [activeTimelineItem, setActiveTimelineItem] = useState<{ day: QuoteReadinessDay; index: number; draft: DayTimelineItem } | null>(null);
  const [quickAddPendingId, setQuickAddPendingId] = useState<string | null>(null);
  const [recentlyAddedItemId, setRecentlyAddedItemId] = useState<string | null>(null);
  const editorPanelRef = useRef<HTMLDivElement | null>(null);
  const scrollToEditorPanelKeyRef = useRef<string | null>(null);
  const readiness = buildQuoteReadinessModel(plannerProps.quote, buildStepHref);
  const daySummaries = readiness.daySummaries.map((summary) => ({
    ...summary,
    day: {
      ...summary.day,
      description: dayContentDrafts[summary.day.id] ?? summary.day.description,
    },
    items: localItems.filter((item) => item.itineraryId === summary.day.id),
  }));
  const unassignedItems = localItems.filter((item) => !item.itineraryId);
  const unresolvedItems = localItems.filter((item) => item.service.supplierId === 'import-itinerary-system');
  const workflow = buildServiceWorkflowState(localItems, plannerProps.quote.quoteType);
  const dayCompletenessRules = getDayCompletenessRules(plannerProps.quote.quoteType);
  const [activeServicePanel, setActiveServicePanel] = useState<ActiveServicePanel | null>(null);
  const [highlightedEditorPanelKey, setHighlightedEditorPanelKey] = useState<string | null>(null);
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
  const activeDaySummary =
    daySummaries.find((summary) => summary.day.id === plannerState.activeDayId) ||
    daySummaries[0] ||
    null;

  useEffect(() => {
    setLocalItems(scope.items);
  }, [scope.items]);

  useEffect(() => {
    setDayContentDrafts({});
    setDayContentError('');
    setActiveDayDescription(null);
    setActiveTimelineItem(null);
  }, [plannerProps.quote.id, scope.optionId]);

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

  async function refreshScopeItemsFromQuote() {
    const [quoteResponse, itineraryResponse] = await Promise.all([
      fetch(`${plannerProps.apiBaseUrl}/quotes/${plannerProps.quote.id}`, {
        headers: buildAuthHeaders(),
        cache: 'no-store',
      }),
      fetch(`${plannerProps.apiBaseUrl}/quotes/${plannerProps.quote.id}/itinerary`, {
        headers: buildAuthHeaders(),
        cache: 'no-store',
      }),
    ]);

    if (!quoteResponse.ok) {
      throw new Error(await getErrorMessage(quoteResponse, 'Could not refresh quote services.'));
    }

    const latestQuote = await readJsonResponse<Quote>(quoteResponse, 'Could not read refreshed quote services.');
    const latestItinerary = itineraryResponse.ok
      ? await readJsonResponse<PlannerItineraryResponse>(itineraryResponse, 'Could not read refreshed itinerary services.')
      : plannerProps.quoteItinerary;
    const latestItems = scope.optionId
      ? latestQuote.quoteOptions.find((option) => option.id === scope.optionId)?.quoteItems || []
      : latestQuote.quoteItems;

    setLocalItems(applyPlannerDayAssignments(latestItems, latestItinerary));
  }

  async function saveDayContent(day: QuoteReadinessDay, contentOverride?: string) {
    const nextContent = contentOverride ?? dayContentDrafts[day.id] ?? day.description ?? '';

    setSavingDayId(day.id);
    setDayContentError('');

    try {
      const response = await fetch(`${plannerProps.apiBaseUrl}/itinerary/day/${day.id}`, {
        method: 'PATCH',
        headers: buildAuthHeaders({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          dayNumber: day.dayNumber,
          title: day.title,
          notes: nextContent,
        }),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not save day description.'));
      }

      router.refresh();
      return true;
    } catch (caughtError) {
      setDayContentError(caughtError instanceof Error ? caughtError.message : 'Could not save day description.');
      return false;
    } finally {
      setSavingDayId((current) => (current === day.id ? null : current));
    }
  }

  function setDayContent(dayId: string, value: string) {
    setDayContentDrafts((current) => ({
      ...current,
      [dayId]: value,
    }));
  }

  function getDayContent(day: QuoteReadinessDay) {
    return dayContentDrafts[day.id] ?? day.description ?? '';
  }

  function buildTimelineContent(day: QuoteReadinessDay, index: number, draft: DayTimelineItem | null) {
    const parsed = parseDayContent(getDayContent(day));
    const nextTimeline = [...parsed.timeline];

    if (draft) {
      nextTimeline[index] = draft;
    } else {
      nextTimeline.splice(index, 1);
    }

    return serializeDayContent(parsed.description, nextTimeline);
  }

  function handleEditorItemSaved(savedItem: QuoteItem) {
    setLocalItems((current) => {
      if (!savedItem?.id) {
        return current;
      }

      const fallbackItineraryId =
        activeServicePanel?.kind === 'add'
          ? activeServicePanel.day.id
          : activeServicePanel?.kind === 'edit'
            ? activeServicePanel.item.itineraryId
            : null;
      const nextItem = {
        ...savedItem,
        itineraryId: savedItem.itineraryId || fallbackItineraryId,
      };

      return [...current.filter((item) => item.id !== nextItem.id), nextItem];
    });

    if (savedItem?.id && activeServicePanel?.kind === 'add') {
      const laneId = buildServiceLaneId(activeServicePanel.day.id, activeServicePanel.category);
      setLaneOrders((current) => ({
        ...current,
        [laneId]: [
          ...(current[laneId] || getLaneItemIds(localItems, activeServicePanel.day.id, activeServicePanel.category)).filter((id) => id !== savedItem.id),
          savedItem.id,
        ],
      }));
      setRecentlyAddedItemId(savedItem.id);
      window.setTimeout(() => setRecentlyAddedItemId((current) => (current === savedItem.id ? null : current)), 1800);
    }

    setActiveServicePanel(null);
    void refreshScopeItemsFromQuote().catch((caughtError) => {
      setReorderError(caughtError instanceof Error ? caughtError.message : 'Quote item was saved, but the service lane could not refresh.');
    });
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
      current.map((item) => {
        if (item.id !== activeId) {
          return item;
        }

        if (!isExternalPackageItem(item)) {
          return { ...item, itineraryId: overData.dayId };
        }

        const currentStartDay = item.externalStartDay ?? activeData.dayNumber;
        const currentEndDay = item.externalEndDay ?? currentStartDay;
        const duration = Math.max(0, currentEndDay - currentStartDay);

        return {
          ...item,
          itineraryId: overData.dayId,
          externalStartDay: overData.dayNumber,
          externalEndDay: overData.dayNumber + duration,
        };
      }),
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
      window.dispatchEvent(new CustomEvent('dmc:quote-pricing-stale', { detail: { quoteId: plannerProps.quote.id } }));
      void refreshScopeItemsFromQuote();
    } catch (caughtError) {
      setLocalItems(previousItems);
      setLaneOrders(previousLaneOrders);
      setReorderError(caughtError instanceof Error ? caughtError.message : 'Could not move quote service.');
    }
  }

  function openAddPanel(day: QuoteReadinessDay, category: ServicePlannerCategory) {
    const action = DAY_WORKFLOW_ACTIONS.find((entry) => entry.category === category);
    const panelKey = `${scope.optionId || 'base'}:${day.id}:${day.dayNumber}:${category}:manual`;

    setQuickAddPendingId(null);
    setReorderError('');
    plannerState.onActiveDayChange(day.id);
    plannerState.onDayOpenChange(day.id, true);
    scrollToEditorPanelKeyRef.current = panelKey;
    setActiveServicePanel({
      kind: 'add',
      key: panelKey,
      optionId: scope.optionId,
      day,
      category,
      label: action?.label || `Add ${SERVICE_PLANNER_TAB_LABELS[category] || category}`,
      formReady: true,
      selectedServiceId: undefined,
      selectedHotelId: undefined,
      selectedRouteId: undefined,
    });
  }

  useEffect(() => {
    if (!activeServicePanel || scrollToEditorPanelKeyRef.current !== activeServicePanel.key) {
      return;
    }

    const panelKey = activeServicePanel.key;
    let secondFrame: number | null = null;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        const editorPanel = editorPanelRef.current;

        if (!editorPanel || scrollToEditorPanelKeyRef.current !== panelKey) {
          return;
        }

        editorPanel.scrollTop = 0;
        editorPanel.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
        editorPanel.focus({ preventScroll: true });
        setHighlightedEditorPanelKey(panelKey);
        scrollToEditorPanelKeyRef.current = null;
      });
    });

    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame !== null) {
        window.cancelAnimationFrame(secondFrame);
      }
    };
  }, [activeServicePanel]);

  useEffect(() => {
    if (!highlightedEditorPanelKey) {
      return;
    }

    const timeoutId = window.setTimeout(() => setHighlightedEditorPanelKey(null), 1200);
    return () => window.clearTimeout(timeoutId);
  }, [highlightedEditorPanelKey]);

  function openAddFormFromSuggestion(item: SmartSuggestionItem) {
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

  async function quickAddSuggestion(item: SmartSuggestionItem) {
    if (!activeServicePanel || activeServicePanel.kind !== 'add' || quickAddPendingId) {
      return;
    }

    setQuickAddPendingId(item.id);
    setReorderError('');

    try {
      const payload = buildQuickAddPayload(item, activeServicePanel.day, activeServicePanel.category, plannerProps);
      const endpoint = activeServicePanel.optionId
        ? `${plannerProps.apiBaseUrl}/quotes/${plannerProps.quote.id}/options/${activeServicePanel.optionId}/items`
        : `${plannerProps.apiBaseUrl}/quotes/${plannerProps.quote.id}/items`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: buildAuthHeaders({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not quick add service.'));
      }

      const createdItem = await readJsonResponse<QuoteItem>(response, 'Could not read quick-added service.');
      const optimisticItem = {
        ...createdItem,
        itineraryId: createdItem.itineraryId || activeServicePanel.day.id,
      };
      const laneId = buildServiceLaneId(activeServicePanel.day.id, activeServicePanel.category);

      setLocalItems((current) => [...current.filter((entry) => entry.id !== optimisticItem.id), optimisticItem]);
      setLaneOrders((current) => ({
        ...current,
        [laneId]: [
          ...(current[laneId] || getLaneItemIds(localItems, activeServicePanel.day.id, activeServicePanel.category)).filter((id) => id !== optimisticItem.id),
          optimisticItem.id,
        ],
      }));
      setRecentlyAddedItemId(optimisticItem.id);
      setActiveServicePanel(null);
      window.dispatchEvent(new CustomEvent('dmc:quote-pricing-stale', { detail: { quoteId: plannerProps.quote.id } }));
      await refreshScopeItemsFromQuote();
      window.setTimeout(() => setRecentlyAddedItemId((current) => (current === optimisticItem.id ? null : current)), 1800);
      router.refresh();
    } catch (caughtError) {
      setReorderError(caughtError instanceof Error ? caughtError.message : 'Could not quick add service.');
    } finally {
      setQuickAddPendingId(null);
    }
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
      <section className="workspace-section quote-service-workflow-summary app-card">
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

      <div className="quote-service-planner-shell quote-service-planner-saas-grid">
        <DayNavigation
          className="quote-service-day-nav"
          title={`${scope.label} days`}
          activeId={activeDaySummary?.day.id}
          onSelect={plannerState.onActiveDayChange}
          items={daySummaries.map((summary) => {
            const dayTotalSell = summary.items.reduce((total, item) => total + Number(item.totalSell || 0), 0);
            const warning =
              summary.unpricedCount > 0 || summary.unresolvedCount > 0 ? (
                <>
                  {summary.unpricedCount > 0 ? `${summary.unpricedCount} unpriced` : null}
                  {summary.unpricedCount > 0 && summary.unresolvedCount > 0 ? ' / ' : null}
                  {summary.unresolvedCount > 0 ? `${summary.unresolvedCount} unresolved` : null}
                </>
              ) : null;

            return {
              id: summary.day.id,
              label: formatDayHeading(summary.day, summary.inferredCity),
              helper: `${summary.items.length} service${summary.items.length === 1 ? '' : 's'} / ${summary.completionPercent}% complete`,
              total: dayTotalSell > 0 ? formatLiveMoney(dayTotalSell, plannerProps.quote.quoteCurrency) : null,
              warning,
            };
          })}
        />
        <div className="quote-service-day-column">
          {reorderError ? <p className="form-error">{reorderError}</p> : null}
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleServiceDragEnd}>
      {activeDaySummary ? (() => {
        const summary = activeDaySummary;
        const completeness = dayCompletenessRules.map((rule) => ({
          ...rule,
          complete: summary.items.some((item) => getQuoteServiceCategoryKey(item.service) === rule.key),
        }));
        const currentServicesCount = summary.items.length;
        const dayHeading = formatDayHeading(summary.day, summary.inferredCity);
        const dayNarrative = parseDayContent(summary.day.description).description;
        const daySubtitle =
          dayNarrative ||
          (summary.inferredCity && summary.day.title && summary.day.title !== summary.inferredCity
            ? summary.day.title
            : 'Build the day by adding the core services below.');

        return (
          <article
            key={summary.day.id}
            id={`planner-day-${summary.day.id}`}
            className={`workspace-day-card quote-service-day-card quote-service-day-card-active app-card${plannerProps.focusedDayId === summary.day.id ? ' quote-service-day-card-focused' : ''}`}
          >
            <div className="quote-service-day-panel-body">
            <div className="workspace-day-header">
              <div>
                <p className="workspace-day-kicker quote-service-day-kicker">
                  <span className="quote-service-day-label">Day {String(summary.day.dayNumber).padStart(2, '0')}</span>
                  <span>Itinerary Builder</span>
                </p>
                <h3>{dayHeading}</h3>
                <p className="workspace-day-copy">{daySubtitle}</p>
              </div>
              <div className="quote-service-day-meta">
                <span className="page-tab-badge">Services {currentServicesCount}</span>
                <span className="page-tab-badge">Complete {summary.completionPercent}%</span>
                {summary.unpricedCount > 0 ? <span className="page-tab-badge page-tab-badge-warning">Unpriced {summary.unpricedCount}</span> : null}
                {summary.unresolvedCount > 0 ? <span className="page-tab-badge">Unresolved {summary.unresolvedCount}</span> : null}
                <button type="button" className="primary-button quote-service-add-primary" onClick={() => openAddPanel(summary.day, dayCompletenessRules[0]?.key || 'activity')}>
                  + Add Service
                </button>
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
                  recentlyAddedItemId={recentlyAddedItemId || undefined}
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
                <DayNarrativePanel
                  day={summary.day}
                  value={getDayContent(summary.day)}
                  error={dayContentError}
                  onDescriptionEdit={() => {
                    const parsed = parseDayContent(getDayContent(summary.day));
                    setActiveDayDescription({ day: summary.day, draft: parsed.description });
                  }}
                  onTimelineAdd={() => {
                    const parsed = parseDayContent(getDayContent(summary.day));
                    const draft = { id: `timeline-${Date.now()}`, time: '', title: '', description: '' };
                    setActiveTimelineItem({ day: summary.day, index: parsed.timeline.length, draft });
                  }}
                  onTimelineEdit={(item, index) => setActiveTimelineItem({ day: summary.day, index, draft: item })}
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
                      {summary.suggestions.map((suggestion) => (
                          <button
                            key={suggestion.id}
                            type="button"
                            className="quote-service-suggestion-button"
                            onClick={() =>
                              openAddPanel(summary.day, suggestion.category)
                            }
                          >
                            <strong>{suggestion.title}</strong>
                            <span>{suggestion.description}</span>
                          </button>
                      ))}
                    </div>
                  </section>
                ) : null}
            </div>
            </div>
          </article>
        );
      })() : null}
          </DndContext>

        </div>
      </div>

      <DayDescriptionDrawer
        item={activeDayDescription}
        isSaving={activeDayDescription ? savingDayId === activeDayDescription.day.id : false}
        onChange={(draft) => setActiveDayDescription((current) => (current ? { ...current, draft } : current))}
        onSave={() => {
          if (!activeDayDescription) {
            return;
          }

          const parsed = parseDayContent(getDayContent(activeDayDescription.day));
          const nextContent = serializeDayContent(activeDayDescription.draft, parsed.timeline);
          setDayContent(activeDayDescription.day.id, nextContent);
          void saveDayContent(activeDayDescription.day, nextContent).then((saved) => {
            if (saved) {
              setActiveDayDescription(null);
            }
          });
        }}
      />

      <TimelineItemDrawer
        item={activeTimelineItem}
        onChange={(draft) => {
          setActiveTimelineItem((current) => (current ? { ...current, draft } : current));
        }}
        onSave={() => {
          if (!activeTimelineItem) {
            return;
          }

          const nextContent = buildTimelineContent(activeTimelineItem.day, activeTimelineItem.index, activeTimelineItem.draft);
          setDayContent(activeTimelineItem.day.id, nextContent);
          void saveDayContent(activeTimelineItem.day, nextContent).then((saved) => {
            if (saved) {
              setActiveTimelineItem(null);
            }
          });
        }}
        onRemove={() => {
          if (activeTimelineItem) {
            const nextContent = buildTimelineContent(activeTimelineItem.day, activeTimelineItem.index, null);
            setDayContent(activeTimelineItem.day.id, nextContent);
            void saveDayContent(activeTimelineItem.day, nextContent).then((saved) => {
              if (saved) {
                setActiveTimelineItem(null);
              }
            });
          }
        }}
      />

      <DrawerPanel
        open={Boolean(activeServicePanel)}
        title={getActiveServiceDrawerTitle(activeServicePanel)}
        description={getActiveServiceDrawerDescription(activeServicePanel)}
        onClose={() => setActiveServicePanel(null)}
        closeLabel="Cancel"
        className="quote-service-editor-drawer"
      >
        {activeServicePanel ? (
          <div
            ref={editorPanelRef}
            className="quote-service-editor-panel quote-service-editor-panel-drawer"
            tabIndex={-1}
            data-highlight={highlightedEditorPanelKey === activeServicePanel.key ? 'true' : undefined}
          >
            <section className="quote-drawer-section quote-drawer-section-pricing">
              <header className="quote-drawer-section-head">
                <div>
                  <p className="eyebrow">Pricing</p>
                  <h3>Cost, sell, and margin</h3>
                </div>
              </header>
              <LivePricingPanel apiBaseUrl={plannerProps.apiBaseUrl} quote={plannerProps.quote} showAdminMetrics={plannerProps.sessionRole === 'admin'} />
              <ActiveServiceDrawerFinancials activeServicePanel={activeServicePanel} currency={plannerProps.quote.quoteCurrency} />
            </section>

            <section className="quote-drawer-section quote-drawer-section-details">
              <header className="quote-drawer-section-head">
                <div>
                  <p className="eyebrow">Details</p>
                  <h3>Service fields</h3>
                </div>
              </header>

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

                        setQuickAddPendingId(null);
                        setReorderError('');
                        plannerState.onActiveDayChange(tabDay.id);
                        plannerState.onDayOpenChange(tabDay.id, true);
                        const panelKey = `${scope.optionId || 'base'}:${tabDay.id}:${tabDay.dayNumber}:${tabCategory}:manual`;
                        scrollToEditorPanelKeyRef.current = panelKey;
                        setActiveServicePanel({
                          kind: 'add',
                          key: panelKey,
                          optionId: scope.optionId,
                          day: tabDay,
                          category: tabCategory,
                          label: tabAction.label,
                          formReady: true,
                        });
                      }}
                    >
                      {SERVICE_PLANNER_TAB_LABELS[tabCategory]}
                    </button>
                  );
                })}
              </div>

              {activeServicePanel.kind === 'add' && !activeServicePanel.formReady ? (
                <SmartSuggestionsPanel
                  key={activeServicePanel.key}
                  category={activeServicePanel.category}
                  day={activeServicePanel.day}
                  plannerProps={plannerProps}
                  onQuickAdd={quickAddSuggestion}
                  onConfigure={openAddFormFromSuggestion}
                  onManualSelect={openManualAddForm}
                  quickAddPendingId={quickAddPendingId}
                />
              ) : activeServicePanel.kind === 'add' ? (
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
                    onSaved={handleEditorItemSaved}
                  />
                </div>
              ) : (
                <EditServiceEditorPanel
                  item={activeServicePanel.item}
                  plannerProps={plannerProps}
                  optionId={activeServicePanel.optionId}
                  dayNumber={activeServicePanel.dayNumber}
                  onSaved={handleEditorItemSaved}
                />
              )}
            </section>
          </div>
        ) : null}
      </DrawerPanel>

      {unassignedItems.length > 0 ? (
        <article className="workspace-day-card quote-service-day-card app-card">
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
  const incomingPlannerDays = getPlannerDays(props.quote, props.quoteItinerary);
  const [localItineraries, setLocalItineraries] = useState(incomingPlannerDays);
  const [openDayIds, setOpenDayIds] = useState<Set<string>>(() => {
    const focusedDay = props.focusedDayId ? incomingPlannerDays.find((day) => day.id === props.focusedDayId) : null;
    const defaultDay = focusedDay || incomingPlannerDays[0] || null;
    return new Set(defaultDay ? [defaultDay.id] : []);
  });
  const [activeDayId, setActiveDayId] = useState<string | null>(() => {
    const focusedDay = props.focusedDayId ? incomingPlannerDays.find((day) => day.id === props.focusedDayId) : null;
    return (focusedDay || incomingPlannerDays[0] || null)?.id || null;
  });
  const [selectedScopeId, setSelectedScopeId] = useState('shared');
  const itineraryDays = localItineraries;
  const plannerQuote = {
    ...props.quote,
    itineraries: localItineraries,
    quoteItems: applyPlannerDayAssignments(props.quote.quoteItems, props.quoteItinerary),
    quoteOptions: props.quote.quoteOptions.map((option) => ({
      ...option,
      quoteItems: applyPlannerDayAssignments(option.quoteItems, props.quoteItinerary),
    })),
  };

  useEffect(() => {
    if (!props.focusedDayId) {
      return;
    }

    setOpenDayIds((current) => {
      if (current.has(props.focusedDayId as string)) {
        return current;
      }

      return new Set([...current, props.focusedDayId as string]);
    });
    setActiveDayId(props.focusedDayId);
  }, [props.focusedDayId]);
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
    const nextPlannerDays = getPlannerDays(props.quote, props.quoteItinerary);
    const savedDayIds = nextPlannerDays.map((day) => day.id);

    if (quoteChanged) {
      quoteIdRef.current = props.quote.id;
    }

    setLocalItineraries((currentItineraries) => {
      if (quoteChanged || nextPlannerDays.length > 0) {
        return nextPlannerDays;
      }

      return currentItineraries;
    });

    if (nextPlannerDays.length > 0) {
      setSelectedScopeId('shared');
    }

    setOpenDayIds((currentOpenDayIds) => {
      if (quoteChanged) {
        return new Set(savedDayIds[0] ? [props.focusedDayId || savedDayIds[0]] : []);
      }

      const nextOpenDayIds = new Set(currentOpenDayIds);
      if (props.focusedDayId || savedDayIds[0]) {
        nextOpenDayIds.add(props.focusedDayId || savedDayIds[0]);
      }
      return nextOpenDayIds;
    });
    setActiveDayId((currentActiveDayId) => {
      if (props.focusedDayId && savedDayIds.includes(props.focusedDayId)) {
        return props.focusedDayId;
      }

      if (currentActiveDayId && savedDayIds.includes(currentActiveDayId)) {
        return currentActiveDayId;
      }

      return savedDayIds[0] || null;
    });
  }, [props.focusedDayId, props.quote, props.quoteItinerary]);

  useEffect(() => {
    function handleDaysReady(event: Event) {
      const detail = (event as CustomEvent<{ quoteId?: string; days?: QuoteReadinessDay[] }>).detail;

      if (detail?.quoteId !== props.quote.id || !Array.isArray(detail.days)) {
        return;
      }

      setLocalItineraries(detail.days);
      setOpenDayIds(new Set(detail.days[0] ? [detail.days[0].id] : []));
      setActiveDayId(detail.days[0]?.id || null);
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

  function handleActiveDayChange(dayId: string) {
    setActiveDayId(dayId);
    setOpenDayIds(new Set([dayId]));
  }

  const plannerState: ScopePlannerState = {
    openDayIds,
    activeDayId,
    onDayOpenChange: handleDayOpenChange,
    onActiveDayChange: handleActiveDayChange,
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
