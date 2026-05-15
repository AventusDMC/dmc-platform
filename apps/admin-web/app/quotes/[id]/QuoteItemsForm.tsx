'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RouteCombobox } from '../../components/RouteCombobox';
import { getErrorMessage, logFetchUrl, readJsonResponse } from '../../lib/api';
import { buildAuthHeaders } from '../../lib/auth-client';
import { RouteOption } from '../../lib/routes';
import { deriveTransportPricingMode, normalizeTransportPricingMode, TransportPricingMode } from '../../lib/transport-pricing-modes';
import { formatRouteLabel, formatServiceTypeLabel, formatSupplierName } from '../../lib/transport-formatters';
import { formatTransportVehicleDisplay } from '../../lib/transport-vehicles';
import { getPlannerCategoryForService, normalizeServiceTaxonomyText } from '../../lib/service-taxonomy';
import { QuoteHotelRateDraftRow, QuoteHotelRateModal } from './QuoteHotelRateModal';
import {
  buildExternalPackagePayload,
  createEmptyExternalPackageFormState,
  createExternalPackagePricingMatrixRow,
  EXTERNAL_PACKAGE_PRICING_BASIS_OPTIONS,
  ExternalPackageFormState,
  ExternalPackagePricingMatrixRow,
  ExternalPackagePricingBasis,
  getExternalPackageCalculatedCost,
  getExternalPackagePricingBasisForService,
  validateExternalPackageFormState,
} from './external-package-ui';

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
  ticketRateVariants?: TicketRateVariant[] | null;
};

type SupportedQuoteCurrency = 'USD' | 'JOD' | 'EUR' | 'ILS';

type TicketRateVariant = {
  id: string;
  label: string;
  costPrice: number;
  sellPrice?: number | null;
  currency: string;
  pricingBasis: 'PER_PERSON' | 'PER_GROUP' | 'PER_DAY';
  includedInJordanPass?: boolean | null;
  notes?: string | null;
  active: boolean;
  sortOrder?: number | null;
};

const FX_TO_USD: Record<SupportedQuoteCurrency, number> = {
  USD: 1,
  EUR: 1.08,
  JOD: 1.41,
  ILS: 0.27,
};

function normalizeQuoteCurrency(value: string | null | undefined): SupportedQuoteCurrency {
  const currency = String(value || '').trim().toUpperCase();

  return currency in FX_TO_USD ? (currency as SupportedQuoteCurrency) : 'USD';
}

function convertQuoteMoney(amount: number, fromCurrency: string | null | undefined, toCurrency: string | null | undefined) {
  const from = normalizeQuoteCurrency(fromCurrency);
  const to = normalizeQuoteCurrency(toCurrency);

  if (from === to) {
    return Number(amount.toFixed(2));
  }

  return Number(((amount * FX_TO_USD[from]) / FX_TO_USD[to]).toFixed(2));
}

type ActivityCatalogItem = {
  id: string;
  name: string;
  description: string | null;
  supplierCompanyId: string;
  supplierCompany?: {
    id: string;
    name: string;
    city?: string | null;
    country?: string | null;
  } | null;
  pricingBasis: 'PER_PERSON' | 'PER_GROUP';
  costPrice: number;
  sellPrice: number;
  durationMinutes: number | null;
  currency?: string | null;
  active: boolean;
  rateVariants?: ActivityRateVariant[] | null;
};

type ActivityRateVariant = {
  id: string;
  name: string;
  supplierCompanyId?: string | null;
  durationMinutes: number | null;
  pricingBasis: 'PER_PERSON' | 'PER_GROUP';
  currency: string;
  costPrice: number;
  sellPrice: number;
  minPax?: number | null;
  maxPax?: number | null;
  maxPaxPerUnit: number | null;
  capacityPricing?: boolean | null;
  active: boolean;
  notes?: string | null;
};

type Hotel = {
  id: string;
  name: string;
  city?: string;
  category?: string;
  roomCategories?: {
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
  ratePolicies?: Array<{
    policyType: string;
    appliesTo?: string | null;
    ageFrom?: number | null;
    ageTo?: number | null;
    amount?: number | null;
    percent?: number | null;
    currency?: string | null;
    pricingBasis?: 'PER_PERSON' | 'PER_ROOM';
    mealPlan?: string | null;
    notes?: string | null;
  }> | null;
  supplements?: Array<{
    id: string;
    roomCategoryId?: string | null;
    type: string;
    chargeBasis: string;
    amount: number;
    currency: string;
    mealPlan?: string | null;
    isMandatory?: boolean | null;
    isActive?: boolean | null;
    notes?: string | null;
  }> | null;
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

type Season = {
  id: string;
  name: string;
};

type TransportServiceType = {
  id: string;
  name: string;
  code: string;
  classification?: TransportServiceClassification;
};
type TransportServiceClassification = 'ROUTE_TRANSFER' | 'FULL_DAY' | 'HALF_DAY' | 'DAILY_PACKAGE' | 'ADD_ON';

type QuoteType = 'FIT' | 'GROUP';
type VehicleCategory = 'CAR' | 'VAN' | 'MINIBUS' | 'BUS' | 'COACH' | 'LIMO';

type TransportPricingCandidate = {
  vehicleRateId?: string | null;
  routeId: string | null;
  routeName: string;
  classification?: TransportServiceClassification;
  currency: string;
  price: number;
  unitCount: number | null;
  pricingMode: 'per_vehicle' | 'capacity_unit';
  unitCapacity: number | null;
  vehicle: {
    id: string;
    name: string;
    vehicleType?: string | null;
    maxPax: number;
  };
  serviceType: {
    id: string;
    name: string;
    code: string;
    classification?: TransportServiceClassification;
  };
  supplier?: {
    id: string | null;
    name: string;
  };
};

type TransportPricingAddOn = {
  rateId: string;
  serviceTypeId: string;
  name: string;
  addOnType: 'DRIVER_OVERNIGHT' | 'STATIONARY_WAITING' | 'OTHER';
  supplierId: string | null;
  supplierName: string;
  vehicleId: string;
  vehicleName: string;
  unitCapacity: number;
  unitCost: number;
  currency: string;
  defaultQuantity: number;
};

type TransportPricingRuleSummary = {
  id: string;
  routeId: string;
  transportServiceTypeId: string;
  isActive: boolean;
};

type ResolvedTransportPricing = {
  vehicleRateId?: string | null;
  routeId?: string | null;
  routeName: string;
  currency: string;
  price: number;
  unitCount: number | null;
  pricingMode?: 'per_vehicle' | 'capacity_unit';
  unitCapacity?: number | null;
  discountedBaseCost?: number;
  vehicle: {
    id: string;
    name: string;
    vehicleType?: string | null;
    maxPax: number;
  };
  serviceType: {
    id: string;
    name: string;
    code: string;
    classification?: TransportServiceClassification;
  };
  supplier?: {
    id: string | null;
    name: string;
  };
  candidates?: TransportPricingCandidate[];
  optionalAddOns?: TransportPricingAddOn[];
};

type HotelCostCalculation = {
  baseCost?: number;
  supplementCost?: number;
  totalCost: number;
  totalSell?: number;
  profit?: number;
  margin?: number;
  nights: number;
  breakdown: Array<{
    date: string;
    adultsCost?: number;
    childrenCost?: number;
    supplementsCost?: number;
    cost: number;
    lines?: Array<{
      kind: string;
      label: string;
      basis: string;
      unitAmount: number;
      quantity: number;
      total: number;
    }>;
    warnings?: string[];
  }>;
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
  defaultService?: {
    id: string;
    name: string;
    category: string;
    serviceType?: {
      id: string;
      name: string;
      code: string | null;
      isActive: boolean;
    } | null;
    unitType: string;
    baseCost: number;
    currency: string;
  } | null;
  defaultServiceType?: {
    id: string;
    name: string;
    code: string | null;
    isActive: boolean;
  } | null;
};

type QuoteItemInitialValues = {
  serviceId: string;
  activityId?: string;
  activityRateVariantId?: string;
  ticketRateVariantId?: string;
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
  overrideReason?: string;
  markupAmount?: string;
  sellPrice?: string;
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

type HotelRateReference = {
  contractId: string;
  roomCategoryId: string;
  roomCategoryLabel: string;
  mealPlan: string;
  occupancyType: string;
  cost: string;
  currency: string;
  note: string;
};

type QuoteItemsFormProps = {
  apiBaseUrl: string;
  quoteId: string;
  itemId?: string;
  optionId?: string;
  blocks?: QuoteBlock[];
  services: SupplierService[];
  activities?: ActivityCatalogItem[];
  transportServiceTypes: TransportServiceType[];
  routes: RouteOption[];
  hotels: Hotel[];
  hotelContracts: HotelContract[];
  hotelRates: HotelRate[];
  seasons: Season[];
  quoteType?: QuoteType;
  quoteCurrency?: string;
  defaultPaxCount: number;
  defaultAdultCount: number;
  defaultChildCount: number;
  defaultRoomCount: number;
  defaultNightCount: number;
  travelStartDate?: string | null;
  itineraryDayNumber?: number | null;
  itineraryDayTitle?: string | null;
  itineraryDayDescription?: string | null;
  itineraryId?: string;
  initialServiceTypeKey?: ServiceTypeKey | null;
  preferredServiceId?: string;
  preferredActivityId?: string;
  preferredHotelId?: string;
  preferredContractId?: string;
  preferredRoomCategoryId?: string;
  preferredMealPlan?: 'RO' | 'BB' | 'HB' | 'FB' | 'AI';
  preferredOccupancyType?: 'SGL' | 'DBL' | 'TPL';
  preferredRateCost?: string;
  preferredRateCurrency?: string;
  preferredRateNote?: string;
  preferredRouteId?: string;
  submitLabel?: string;
  initialValues?: QuoteItemInitialValues;
  onSaved?: (item: any) => void;
  onCancel?: () => void;
};

function inferSupplierServiceTransportPricingMode(service: SupplierService): TransportPricingMode | null {
  const directMode =
    normalizeTransportPricingMode(service.name) ||
    deriveTransportPricingMode({
      serviceType: service.serviceType
        ? {
            name: service.serviceType.name,
            code: service.serviceType.code,
          }
        : null,
    });

  if (directMode) {
    return directMode;
  }

  const text = service.name.toLowerCase();

  if (/\bextra\s*(km|kilometer|kilometre)|per\s*km\b/.test(text)) {
    return 'Extra KM';
  }

  if (/\bdriver\s*overnight|overnight\s*driver\b/.test(text)) {
    return 'Driver Overnight';
  }

  if (/\bstationary|waiting\b/.test(text)) {
    return 'Stationary / Waiting';
  }

  if (/\bday\s*tour|sightseeing\s*day|fit\s*touring\b/.test(text)) {
    return 'Day Tour';
  }

  if (/\bhalf\s*day\b/.test(text)) {
    return 'Half Day';
  }

  if (/\bfull\s*day|daily\s*fd|daily\s*package|minimum\s*3\b/.test(text)) {
    return 'Full Day';
  }

  return null;
}

function getTransportCandidatePricingMode(candidate: TransportPricingCandidate | ResolvedTransportPricing): TransportPricingMode | null {
  return deriveTransportPricingMode({
    pricingMode: 'pricingMode' in candidate ? candidate.pricingMode || null : null,
    routeName: candidate.routeName,
    serviceType: candidate.serviceType,
  });
}

function findSupplierServiceForTransportSelection(
  services: SupplierService[],
  candidate: TransportPricingCandidate | ResolvedTransportPricing | null,
) {
  if (!candidate) {
    return null;
  }

  const transportServices = services.filter((service) => getServiceTypeKey(service) === 'transport');
  const targetPricingMode = getTransportCandidatePricingMode(candidate);
  const supplierId = candidate.supplier?.id || null;
  const supplierScopedServices = supplierId
    ? transportServices.filter((service) => service.supplierId === supplierId)
    : transportServices;
  const searchPool = supplierScopedServices.length > 0 ? supplierScopedServices : transportServices;
  const pricingModeMatchedService = targetPricingMode
    ? searchPool.find((service) => inferSupplierServiceTransportPricingMode(service) === targetPricingMode)
    : null;

  return (
    pricingModeMatchedService ||
    searchPool.find((service) => service.serviceTypeId === candidate.serviceType.id) ||
    null
  );
}

function notifyQuotePricingChanged(quoteId: string) {
  window.dispatchEvent(new CustomEvent('dmc:quote-pricing-stale', { detail: { quoteId } }));
}

function getVehicleCategory(vehicleName: string, maxPax: number): VehicleCategory {
  const normalized = vehicleName.toLowerCase();

  if (normalized.includes('limo') || normalized.includes('v-class') || normalized.includes('staria')) {
    return 'LIMO';
  }

  if (normalized.includes('car') || normalized.includes('sedan')) {
    return 'CAR';
  }

  if (normalized.includes('van') || normalized.includes('sprinter') || normalized.includes('h350') || maxPax <= 12) {
    return maxPax >= 8 ? 'MINIBUS' : 'VAN';
  }

  if (normalized.includes('coaster') || maxPax <= 20) {
    return 'MINIBUS';
  }

  if (normalized.includes('coach') || normalized.includes('grand star') || maxPax >= 29) {
    return maxPax >= 40 ? 'COACH' : 'BUS';
  }

  return maxPax >= 20 ? 'BUS' : 'VAN';
}

function getRecommendedVehicleCategories(quoteType: QuoteType, pax: number): VehicleCategory[] {
  if (quoteType === 'FIT') {
    if (pax <= 3) {
      return ['CAR', 'LIMO'];
    }

    if (pax <= 7) {
      return ['VAN'];
    }

    return ['VAN', 'MINIBUS'];
  }

  if (pax >= 10) {
    return ['BUS', 'COACH'];
  }

  if (pax >= 8) {
    return ['MINIBUS'];
  }

  return ['VAN', 'MINIBUS'];
}

function isRecommendedVehicleCategory(quoteType: QuoteType, pax: number, category: VehicleCategory) {
  return getRecommendedVehicleCategories(quoteType, pax).includes(category);
}

function getTransportCandidateCapacity(candidate: Pick<TransportPricingCandidate, 'unitCapacity' | 'vehicle'>) {
  return candidate.unitCapacity && candidate.unitCapacity > 0 ? candidate.unitCapacity : candidate.vehicle.maxPax;
}

function compareTransportCandidates(left: TransportPricingCandidate, right: TransportPricingCandidate, pax: number) {
  const leftCapacity = getTransportCandidateCapacity(left);
  const rightCapacity = getTransportCandidateCapacity(right);
  const leftSupplier = formatSupplierName(left.supplier?.name, left.supplier?.id);
  const rightSupplier = formatSupplierName(right.supplier?.name, right.supplier?.id);

  return (
    leftCapacity - rightCapacity ||
    left.price - right.price ||
    leftSupplier.localeCompare(rightSupplier) ||
    left.vehicle.name.localeCompare(right.vehicle.name)
  );
}

function getSmartTransportSuggestions<T extends TransportPricingCandidate>(candidates: T[], pax: number, maxSuggestions = 3) {
  const fittingCandidates = candidates.filter((candidate) => getTransportCandidateCapacity(candidate) >= pax);
  const sortedCandidates = [...fittingCandidates].sort((left, right) => compareTransportCandidates(left, right, pax));
  const smallestFittingCapacity = sortedCandidates[0] ? getTransportCandidateCapacity(sortedCandidates[0]) : null;

  return sortedCandidates
    .filter((candidate) => smallestFittingCapacity === null || getTransportCandidateCapacity(candidate) === smallestFittingCapacity)
    .slice(0, maxSuggestions);
}

const SERVICE_TYPE_BUTTONS = [
  { key: 'hotel', label: 'Add Confirmed Hotel Stay' },
  { key: 'transport', label: 'Add Transport' },
  { key: 'guide', label: 'Add Guide' },
  { key: 'activity', label: 'Add Activity' },
  { key: 'ticketing', label: 'Add Ticket / Entrance' },
  { key: 'meal', label: 'Add Meal' },
  { key: 'externalPackage', label: 'Add External Country Package' },
  { key: 'other', label: 'Add Other' },
] as const;

const GUIDE_RATES = {
  local: {
    half_day: 80,
    full_day: 120,
  },
  escort: {
    half_day: 140,
    full_day: 200,
  },
} as const;

const GUIDE_OVERNIGHT_SUPPLEMENT = 50;
const IMPORTED_SERVICE_SUPPLIER_ID = 'import-itinerary-system';

type ServiceTypeKey = (typeof SERVICE_TYPE_BUTTONS)[number]['key'];
type ExternalPackageSection = 'basics' | 'pricing' | 'hotels' | 'clientText' | 'internalNotes';

const EXTERNAL_PACKAGE_SECTION_TABS: Array<{ id: ExternalPackageSection; label: string }> = [
  { id: 'basics', label: 'Basics' },
  { id: 'pricing', label: 'Pricing Matrix' },
  { id: 'hotels', label: 'Hotels' },
  { id: 'clientText', label: 'Client Text' },
  { id: 'internalNotes', label: 'Internal Notes' },
];

function hasMealSignal(value: string | null | undefined) {
  const normalized = normalizeServiceTaxonomyText(value);

  return (
    normalized.includes('meal') ||
    normalized.includes('dining') ||
    normalized.includes('breakfast') ||
    normalized.includes('lunch') ||
    normalized.includes('dinner') ||
    normalized.includes('restaurant') ||
    normalized.includes('food')
  );
}

function getServiceTypeKey(service: Pick<SupplierService, 'category' | 'serviceType'> & { name?: string | null }): ServiceTypeKey {
  if (service.serviceType) {
    return getPlannerCategoryForService({ serviceType: service.serviceType }) as ServiceTypeKey;
  }

  if (hasMealSignal(service.name) || hasMealSignal(service.category)) {
    return 'meal';
  }

  return getPlannerCategoryForService({ category: service.category }) as ServiceTypeKey;
}

function getServiceTypeKeyFromText(value: string | null | undefined): ServiceTypeKey | null {
  const normalized = normalizeServiceTaxonomyText(value);

  if (!normalized) {
    return null;
  }

  return getPlannerCategoryForService({ category: value }) as ServiceTypeKey;
}

function isImportedPlaceholderService(service: Pick<SupplierService, 'supplierId'>) {
  return service.supplierId === IMPORTED_SERVICE_SUPPLIER_ID;
}

function normalizeActivityMatchText(value: string | null | undefined) {
  return (value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function findPairedActivityService(activity: ActivityCatalogItem, services: SupplierService[]) {
  const activityName = normalizeActivityMatchText(activity.name);
  const activityServices = services.filter((service) => getServiceTypeKey(service) === 'activity');

  return (
    activityServices.find((service) => normalizeActivityMatchText(service.name) === activityName) ||
    activityServices.find((service) => {
      const serviceName = normalizeActivityMatchText(service.name);
      return Boolean(activityName && (serviceName.includes(activityName) || activityName.includes(serviceName)));
    }) ||
    activityServices[0] ||
    null
  );
}

function getActivityMasterOptions(activities: ActivityCatalogItem[]) {
  return activities.filter((activity) => activity.active !== false);
}

function getActivityServiceBridge(activity: ActivityCatalogItem | null, services: SupplierService[]) {
  if (!activity) {
    return services.find((service) => getServiceTypeKey(service) === 'activity') || null;
  }

  return findPairedActivityService(activity, services);
}

function formatDisplayLabel(value: string) {
  return value
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatMarkupPercent(defaultSell: number | null, defaultCost: number | null, fallbackCost: number | null) {
  if (defaultSell === null || defaultSell === undefined) {
    return null;
  }

  const effectiveCost = defaultCost ?? fallbackCost ?? null;

  if (!effectiveCost || effectiveCost <= 0) {
    return '0';
  }

  return String(Math.max(0, Number((((defaultSell - effectiveCost) / effectiveCost) * 100).toFixed(2))));
}

function resolveDerivedServiceDate(travelStartDate: string | null | undefined, itineraryDayNumber: number | null | undefined) {
  if (!travelStartDate || !itineraryDayNumber || itineraryDayNumber < 1) {
    return null;
  }

  const resolvedDate = new Date(travelStartDate);

  if (Number.isNaN(resolvedDate.getTime())) {
    return null;
  }

  resolvedDate.setUTCDate(resolvedDate.getUTCDate() + (itineraryDayNumber - 1));

  return resolvedDate.toISOString().slice(0, 10);
}

function normalizeRouteMatchText(value: string | null | undefined) {
  return ` ${String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()} `;
}

function getPlaceMatchTerms(place: RouteOption['fromPlace']) {
  return [place.name, place.city]
    .map((value) => normalizeRouteMatchText(value).trim())
    .filter((value, index, collection) => Boolean(value) && collection.indexOf(value) === index);
}

function includesRouteTerm(context: string, terms: string[]) {
  return terms.some((term) => context.includes(` ${term} `));
}

function getRouteContextScore(route: RouteOption, context: string) {
  if (!context.trim()) {
    return 0;
  }

  const fromTerms = getPlaceMatchTerms(route.fromPlace);
  const toTerms = getPlaceMatchTerms(route.toPlace);

  if (!includesRouteTerm(context, fromTerms) || !includesRouteTerm(context, toTerms)) {
    return 0;
  }

  const fromIndex = Math.min(...fromTerms.map((term) => context.indexOf(` ${term} `)).filter((index) => index >= 0));
  const toIndex = Math.min(...toTerms.map((term) => context.indexOf(` ${term} `)).filter((index) => index >= 0));

  return fromIndex <= toIndex ? 2 : 1;
}

function findSmartDefaultTransportRoute(routes: RouteOption[], itineraryDayTitle?: string | null, itineraryDayDescription?: string | null) {
  if (routes.length === 1) {
    return routes[0];
  }

  const context = normalizeRouteMatchText([itineraryDayTitle, itineraryDayDescription].filter(Boolean).join(' '));
  const matches = routes
    .map((route) => ({ route, score: getRouteContextScore(route, context) }))
    .filter((match) => match.score > 0)
    .sort((left, right) => right.score - left.score);

  if (matches.length === 0) {
    return null;
  }

  return matches.length === 1 || matches[0].score > matches[1].score ? matches[0].route : null;
}

function addDaysToDateString(value: string, days: number) {
  if (!value) return '';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatRatePolicy(policy: NonNullable<HotelContract['ratePolicies']>[number], fallbackCurrency: string) {
  const type = String(policy.policyType || '').replace(/_/g, ' ').toLowerCase();
  const title = type ? type.charAt(0).toUpperCase() + type.slice(1) : 'Rate policy';
  const ageRange =
    policy.ageFrom !== null && policy.ageFrom !== undefined && policy.ageTo !== null && policy.ageTo !== undefined
      ? `ages ${policy.ageFrom}-${policy.ageTo}`
      : policy.ageFrom !== null && policy.ageFrom !== undefined
        ? `from age ${policy.ageFrom}`
        : policy.ageTo !== null && policy.ageTo !== undefined
          ? `up to age ${policy.ageTo}`
          : '';
  const value =
    policy.percent !== null && policy.percent !== undefined
      ? `${Number(policy.percent).toFixed(0)}%`
      : policy.amount !== null && policy.amount !== undefined
        ? `${Number(policy.amount).toFixed(2)} ${policy.currency || fallbackCurrency}`
        : '';
  return [title, ageRange, value, policy.mealPlan || '', policy.notes || ''].filter(Boolean).join(' | ');
}

function formatHotelRatePricingBasis(value: HotelRate['pricingBasis']) {
  return value === 'PER_PERSON' ? 'per person/night' : 'per room/night';
}

function supplementMealPlan(supplement: NonNullable<HotelContract['supplements']>[number]) {
  const directMealPlan = String(supplement.mealPlan || '').trim().toUpperCase();
  if (directMealPlan) {
    return directMealPlan;
  }

  const match = String(supplement.notes || '').match(/\bMeal(?:\s*Plan)?\s*:\s*(RO|BB|HB|FB|AI)\b/i);
  return match ? match[1].toUpperCase() : null;
}

function normalizeSeasonScope(value: string) {
  return String(value || '')
    .toUpperCase()
    .replace(/\bSEASON\b/g, '')
    .replace(/[^A-Z0-9]/g, '');
}

function supplementAppliesToSeason(supplement: NonNullable<HotelContract['supplements']>[number], seasonName?: string | null) {
  const match = String(supplement.notes || '').match(/\bSeason\s*:\s*([A-Z0-9_\-\s]+?)(?:\s*\||$)/i);
  const seasonScope = String(match?.[1] || '').trim().toUpperCase();
  if (!seasonScope || ['ALL_SEASONS', 'GLOBAL', 'ANY'].includes(seasonScope)) {
    return true;
  }

  const normalizedScope = normalizeSeasonScope(seasonScope);
  const normalizedSeason = normalizeSeasonScope(seasonName || '');
  return Boolean(normalizedSeason && (normalizedSeason === normalizedScope || normalizedSeason.includes(normalizedScope) || normalizedScope.includes(normalizedSeason)));
}

function isHbMealSupplement(
  supplement: NonNullable<HotelContract['supplements']>[number],
  roomCategoryId?: string | null,
  seasonName?: string | null,
) {
  const type = String(supplement.type || '').trim().toUpperCase();
  const appliesToRoom = !supplement.roomCategoryId || !roomCategoryId || supplement.roomCategoryId === roomCategoryId;
  const mealPlan = supplementMealPlan(supplement);
  return supplement.isActive !== false && type === 'EXTRA_DINNER' && appliesToRoom && (!mealPlan || mealPlan === 'HB') && supplementAppliesToSeason(supplement, seasonName);
}

function contractHasHbSupplement(contract: HotelContract | null, roomCategoryId?: string | null, seasonName?: string | null) {
  return Boolean(
    contract?.supplements?.some((supplement) => isHbMealSupplement(supplement, roomCategoryId, seasonName)),
  );
}

function calculateHotelSupplementPreviewTotal(
  contract: HotelContract | null,
  roomCategoryId: string | null | undefined,
  mealPlan: string,
  baseMealPlan: string | null | undefined,
  pax: number,
  rooms: number,
  nights: number,
  seasonName?: string | null,
) {
  return Number(
    (contract?.supplements || [])
      .filter((supplement) => mealPlan === 'HB' && baseMealPlan === 'BB' && isHbMealSupplement(supplement, roomCategoryId, seasonName))
      .reduce((sum, supplement) => {
        const amount = Number(supplement.amount || 0);
        if (!Number.isFinite(amount) || amount <= 0) {
          return sum;
        }

        const basis = String(supplement.chargeBasis || '').trim().toUpperCase();
        const multiplier =
          basis === 'PER_ROOM' || basis === 'PER_ROOM_NIGHT'
            ? rooms * nights
            : basis === 'PER_STAY'
              ? 1
              : basis === 'PER_NIGHT'
                ? nights
                : pax * nights;
        return sum + amount * multiplier;
      }, 0)
      .toFixed(2),
  );
}

function roomCategorySortRank(category: { name: string; code?: string | null }) {
  const value = `${category.code || ''} ${category.name || ''}`.toUpperCase();
  if (/\bSTANDARD\b|\bSTD\b/.test(value)) return 0;
  if (/\bCLASSIC\b|\bCLS\b/.test(value)) return 1;
  if (/\bSUPERIOR\b|\bSUP\b/.test(value)) return 2;
  if (/\bDELUXE\b|\bDLX\b/.test(value)) return 3;
  if (/\bPREMIUM\b|\bPRM\b/.test(value)) return 4;
  if (/\bUPGRADE\b|\bSEA\s*VIEW\b|\bPOOL\s*VIEW\b|\bVIEW\b/.test(value)) return 5;
  if (/\bFAMILY\b|\bFAM\b/.test(value)) return 6;
  if (/\bAPARTMENT\b|\bAPT\b/.test(value)) return 7;
  if (/\bPRESIDENTIAL\b|\bPRES\b/.test(value)) return 9;
  if (/\bSUITE\b|\bSTE\b|\bJUNIOR\b|\bEXECUTIVE\b/.test(value)) return 8;
  return 10;
}

export function QuoteItemsForm({
  apiBaseUrl,
  quoteId,
  itemId,
  optionId,
  blocks = [],
  services,
  activities = [],
  transportServiceTypes,
  routes,
  hotels,
  hotelContracts,
  hotelRates,
  seasons,
  quoteType = 'FIT',
  quoteCurrency = 'USD',
  defaultPaxCount,
  defaultAdultCount,
  defaultChildCount,
  defaultRoomCount,
  defaultNightCount,
  travelStartDate,
  itineraryDayNumber,
  itineraryDayTitle,
  itineraryDayDescription,
  itineraryId,
  initialServiceTypeKey,
  preferredServiceId,
  preferredActivityId,
  preferredHotelId,
  preferredContractId,
  preferredRoomCategoryId,
  preferredMealPlan,
  preferredOccupancyType,
  preferredRateCost,
  preferredRateCurrency,
  preferredRateNote,
  preferredRouteId,
  submitLabel = 'Add item',
  initialValues,
  onSaved,
  onCancel,
}: QuoteItemsFormProps) {
  const router = useRouter();
  const isEditing = Boolean(itemId);
  const requestedInitialServiceId = initialValues?.serviceId || preferredServiceId;
  const requestedInitialService = services.find((service) => service.id === requestedInitialServiceId);
  const initialService =
    requestedInitialService && (isEditing || !initialServiceTypeKey || getServiceTypeKey(requestedInitialService) === initialServiceTypeKey)
      ? requestedInitialService
      : undefined;
  const hasInitialExternalPackage = Boolean(
    initialValues?.externalPackage?.packageName ||
      initialValues?.externalPackage?.country ||
      initialValues?.externalPackage?.netCost ||
      initialValues?.externalPackage?.clientItineraryText,
  );
  const initialItemServiceTypeKey = hasInitialExternalPackage
    ? 'externalPackage'
    : initialValues?.hotelId
      ? 'hotel'
      : null;
  const initialActiveServiceType = initialService
    ? getServiceTypeKey(initialService)
    : initialServiceTypeKey || (isEditing ? initialItemServiceTypeKey : null);
  const initialServiceDate =
    (initialActiveServiceType === 'activity' ||
      initialActiveServiceType === 'ticketing' ||
      initialActiveServiceType === 'hotel' ||
      initialActiveServiceType === 'meal') &&
    !itineraryId &&
    travelStartDate
      ? travelStartDate.slice(0, 10)
      : '';
  const initialRouteId = [initialValues?.routeId, preferredRouteId].find((candidateRouteId) =>
    Boolean(candidateRouteId && routes.some((route) => route.id === candidateRouteId)),
  ) || '';
  const initialRouteName = initialValues?.routeName || '';
  const [activeServiceType, setActiveServiceType] = useState<ServiceTypeKey | null>(
    initialActiveServiceType,
  );
  const [serviceId, setServiceId] = useState(initialValues?.serviceId || initialService?.id || '');
  const [activityId, setActivityId] = useState(initialValues?.activityId || preferredActivityId || '');
  const [activityRateVariantId, setActivityRateVariantId] = useState(initialValues?.activityRateVariantId || '');
  const [ticketRateVariantId, setTicketRateVariantId] = useState(initialValues?.ticketRateVariantId || '');
  const [quantity, setQuantity] = useState(initialValues?.quantity || '1');
  const [markupPercent, setMarkupPercent] = useState(initialValues?.markupPercent || '20');
  const [markupAmount, setMarkupAmount] = useState(initialValues?.markupAmount || '');
  const [sellPrice, setSellPrice] = useState(initialValues?.sellPrice || '');
  const [paxCount, setPaxCount] = useState(initialValues?.paxCount || String(defaultPaxCount || 1));
  const [participantCount, setParticipantCount] = useState(initialValues?.participantCount || String(defaultPaxCount || 1));
  const [adultCount, setAdultCount] = useState(initialValues?.adultCount || String(defaultAdultCount || 0));
  const [childCount, setChildCount] = useState(initialValues?.childCount || String(defaultChildCount || 0));
  const [roomCount, setRoomCount] = useState(initialValues?.roomCount || String(defaultRoomCount || 1));
  const [nightCount, setNightCount] = useState(initialValues?.nightCount || String(defaultNightCount || 1));
  const [dayCount, setDayCount] = useState(initialValues?.dayCount || '1');
  const [serviceDate, setServiceDate] = useState(initialValues?.serviceDate || initialServiceDate);
  const [startTime, setStartTime] = useState(initialValues?.startTime || '');
  const [pickupTime, setPickupTime] = useState(initialValues?.pickupTime || '');
  const [pickupLocation, setPickupLocation] = useState(initialValues?.pickupLocation || '');
  const [meetingPoint, setMeetingPoint] = useState(initialValues?.meetingPoint || '');
  const [reconfirmationRequired, setReconfirmationRequired] = useState(initialValues?.reconfirmationRequired || false);
  const [reconfirmationDueAt, setReconfirmationDueAt] = useState(initialValues?.reconfirmationDueAt || '');
  const [baseCost, setBaseCost] = useState(initialValues?.baseCost || '');
  const [overrideCost, setOverrideCost] = useState(initialValues?.overrideCost || '');
  const [overrideReason, setOverrideReason] = useState(initialValues?.overrideReason || '');
  const [useOverride, setUseOverride] = useState(initialValues?.useOverride || false);
  const [transportServiceTypeId, setTransportServiceTypeId] = useState(
    initialValues?.transportServiceTypeId || (initialActiveServiceType === 'transport' ? transportServiceTypes[0]?.id || '' : ''),
  );
  const [routeId, setRouteId] = useState(
    initialRouteId,
  );
  const [routeName, setRouteName] = useState(initialRouteName);
  const [hotelId, setHotelId] = useState(initialValues?.hotelId || preferredHotelId || '');
  const [contractId, setContractId] = useState(initialValues?.contractId || preferredContractId || '');
  const [seasonId, setSeasonId] = useState(initialValues?.seasonId || '');
  const [seasonName, setSeasonName] = useState(initialValues?.seasonName || '');
  const [roomCategoryId, setRoomCategoryId] = useState(initialValues?.roomCategoryId || preferredRoomCategoryId || '');
  const [occupancyType, setOccupancyType] = useState<'SGL' | 'DBL' | 'TPL'>(initialValues?.occupancyType || preferredOccupancyType || 'DBL');
  const [mealPlan, setMealPlan] = useState<'BB' | 'HB' | 'FB'>(initialValues?.mealPlan || (preferredMealPlan === 'AI' || preferredMealPlan === 'RO' ? 'BB' : preferredMealPlan) || 'BB');
  const [guideType, setGuideType] = useState<'local' | 'escort'>(initialValues?.guideType || 'local');
  const [guideDuration, setGuideDuration] = useState<'half_day' | 'full_day'>(initialValues?.guideDuration || 'full_day');
  const [overnight, setOvernight] = useState<'no' | 'yes'>(initialValues?.overnight || 'no');
  const [externalPackage, setExternalPackage] = useState<ExternalPackageFormState>(
    initialValues?.externalPackage || createEmptyExternalPackageFormState(initialService?.currency || 'USD'),
  );
  const [externalPackageSection, setExternalPackageSection] = useState<ExternalPackageSection>('basics');
  const [mealName, setMealName] = useState('');
  const [mealCost, setMealCost] = useState('');
  const [mealCurrency, setMealCurrency] = useState('USD');
  const [resolvedTransportPricing, setResolvedTransportPricing] = useState<ResolvedTransportPricing | null>(null);
  const [hotelCostCalculation, setHotelCostCalculation] = useState<HotelCostCalculation | null>(null);
  const [selectedBlockId, setSelectedBlockId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingTransportCost, setIsLoadingTransportCost] = useState(false);
  const [isLoadingHotelCost, setIsLoadingHotelCost] = useState(false);
  const [error, setError] = useState('');
  const [hasAttemptedExternalPackageSubmit, setHasAttemptedExternalPackageSubmit] = useState(false);
  const [showHotelRateModal, setShowHotelRateModal] = useState(false);
  const [manualHotelRateDraft, setManualHotelRateDraft] = useState<QuoteHotelRateDraftRow | null>(null);
  const [hotelRateReference, setHotelRateReference] = useState<HotelRateReference | null>(null);
  const [pendingHotelRateSubmit, setPendingHotelRateSubmit] = useState(false);
  const [transportSuggestionOverridden, setTransportSuggestionOverridden] = useState(false);
  const [routeSelectionManuallyChanged, setRouteSelectionManuallyChanged] = useState(Boolean(initialRouteId || initialRouteName));
  const [selectedTransportAddOns, setSelectedTransportAddOns] = useState<Record<string, { selected: boolean; quantity: string }>>({});
  const [transportPricingRules, setTransportPricingRules] = useState<TransportPricingRuleSummary[]>([]);
  const [isLoadingTransportPricingRules, setIsLoadingTransportPricingRules] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const serviceEntryFormId = `quote-item-form-${quoteId}-${optionId || 'base'}-${itemId || 'new'}`;
  const hotelCostDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hotelCostInFlightKeyRef = useRef<string | null>(null);
  const hotelCostLastRequestedKeyRef = useRef<string | null>(null);
  const hotelCostAbortRef = useRef<AbortController | null>(null);
  const externalPackageDefaultsServiceIdRef = useRef<string | null>(isEditing ? initialService?.id || null : null);
  const serviceBlocks = blocks.filter((block) => block.type === 'SERVICE_BLOCK');

  function updateExternalPackageMatrixRow(rowId: string, patch: Partial<ExternalPackagePricingMatrixRow>) {
    setExternalPackage((current) => ({
      ...current,
      pricingMatrixRows: current.pricingMatrixRows.map((row) => (row.id === rowId ? { ...row, ...patch } : row)),
    }));
  }

  function addExternalPackageMatrixRow() {
    setExternalPackage((current) => ({
      ...current,
      pricingMatrixRows: [...current.pricingMatrixRows, createExternalPackagePricingMatrixRow()],
    }));
  }

  function removeExternalPackageMatrixRow(rowId: string) {
    setExternalPackage((current) => ({
      ...current,
      pricingMatrixRows: current.pricingMatrixRows.filter((row) => row.id !== rowId),
    }));
  }

  const transportCandidates = useMemo(() => {
    const candidates = resolvedTransportPricing?.candidates || [];
    const seen = new Set<string>();
    const currentPax = Number(paxCount) || defaultPaxCount || 1;

    const normalizedCandidates = candidates
      .filter((candidate) => {
        const key = `${candidate.vehicle.id}:${candidate.serviceType.id}:${candidate.routeId || candidate.routeName}:${candidate.supplier?.id || ''}`;

        if (seen.has(key)) {
          return false;
        }

        seen.add(key);
        return true;
      })
      .map((candidate) => {
        const category = getVehicleCategory(candidate.vehicle.name, candidate.vehicle.maxPax);

        return {
          ...candidate,
          category,
          isRecommended: isRecommendedVehicleCategory(quoteType, currentPax, category),
        };
      });

    const sortedCandidates = getSmartTransportSuggestions(normalizedCandidates, currentPax, 3);
    const bestValueCandidate = sortedCandidates[0] || null;

    return sortedCandidates
      .map((candidate) => ({
        ...candidate,
        isBestValue:
          Boolean(bestValueCandidate) &&
          candidate.vehicle.id === bestValueCandidate?.vehicle.id &&
          candidate.serviceType.id === bestValueCandidate.serviceType.id &&
          (candidate.routeId || candidate.routeName) === (bestValueCandidate.routeId || bestValueCandidate.routeName),
      }));
  }, [defaultPaxCount, paxCount, quoteType, resolvedTransportPricing?.candidates]);
  const autoTransportCandidate = transportCandidates[0] || null;
  const selectedTransportCandidate = resolvedTransportPricing
    ? transportCandidates.find(
        (candidate) =>
          candidate.vehicle.id === resolvedTransportPricing.vehicle.id &&
          candidate.serviceType.id === resolvedTransportPricing.serviceType.id &&
          (candidate.routeId || candidate.routeName) === (routeId || resolvedTransportPricing.routeName) &&
          (candidate.supplier?.id || '') === (resolvedTransportPricing.supplier?.id || ''),
      ) || null
    : null;
  const resolvedTransportMatchesCurrentSelection = Boolean(
    resolvedTransportPricing &&
      resolvedTransportPricing.serviceType.id === transportServiceTypeId &&
      (routeId
        ? resolvedTransportPricing.routeId === routeId
        : resolvedTransportPricing.routeName === routeName.trim()),
  );
  const selectedTransportVehicleId = resolvedTransportMatchesCurrentSelection
    ? resolvedTransportPricing?.vehicle.id
    : undefined;
  const transportRecommendationReasons = selectedTransportCandidate
    ? [
        selectedTransportCandidate.isRecommended
          ? `Recommended for ${Number(paxCount) || defaultPaxCount || 1} pax (${quoteType})`
          : null,
        selectedTransportCandidate.isBestValue ? 'Best value based on price per pax' : null,
      ].filter((reason): reason is string => Boolean(reason))
    : [];
  const selectedTransportServiceType = transportServiceTypes.find((serviceType) => serviceType.id === transportServiceTypeId) || null;
  const selectedTransportClassification =
    resolvedTransportPricing?.serviceType.classification || selectedTransportServiceType?.classification || 'ROUTE_TRANSFER';

  const transportSelectedDays = Math.max(1, Number(dayCount) || 1);
  const transportBillableDays =
    selectedTransportClassification === 'FULL_DAY' || selectedTransportClassification === 'DAILY_PACKAGE'
      ? Math.max(transportSelectedDays, 3)
      : 1;
  const transportAddOnRows = resolvedTransportPricing?.optionalAddOns || [];
  const selectedTransportAddOnPayload = transportAddOnRows
    .map((addOn) => {
      const state = selectedTransportAddOns[addOn.rateId];
      const selected = state?.selected ?? addOn.defaultQuantity > 0;
      const quantity = Math.max(1, Number(state?.quantity || addOn.defaultQuantity || 1));

      return selected ? { rateId: addOn.rateId, quantity } : null;
    })
    .filter((entry): entry is { rateId: string; quantity: number } => Boolean(entry));
  const selectedTransportAddOnTotal = transportAddOnRows.reduce((total, addOn) => {
    const state = selectedTransportAddOns[addOn.rateId];
    const selected = state?.selected ?? addOn.defaultQuantity > 0;
    const quantity = Math.max(1, Number(state?.quantity || addOn.defaultQuantity || 1));
    const units = resolvedTransportPricing?.unitCount || Math.ceil((Number(paxCount) || defaultPaxCount || 1) / Math.max(1, addOn.unitCapacity));

    return selected ? total + units * addOn.unitCost * quantity : total;
  }, 0);
  const activeTransportRoutes = useMemo(() => routes.filter((route) => route.isActive !== false), [routes]);
  const pricedTransportRouteIds = useMemo(() => {
    if (!transportServiceTypeId) {
      return new Set<string>();
    }

    return new Set(
      transportPricingRules
        .filter((rule) => rule.isActive !== false && rule.transportServiceTypeId === transportServiceTypeId)
        .map((rule) => rule.routeId),
    );
  }, [transportPricingRules, transportServiceTypeId]);
  const validTransportRoutes = useMemo(
    () => activeTransportRoutes.filter((route) => pricedTransportRouteIds.has(route.id)),
    [activeTransportRoutes, pricedTransportRouteIds],
  );
  const hasTransportRoutes = validTransportRoutes.length > 0;
  const smartDefaultTransportRoute = useMemo(
    () => findSmartDefaultTransportRoute(validTransportRoutes, itineraryDayTitle, itineraryDayDescription),
    [itineraryDayDescription, itineraryDayTitle, validTransportRoutes],
  );

  const filteredServices = activeServiceType
    ? services.filter((service) => {
        if (getServiceTypeKey(service) !== activeServiceType) {
          return false;
        }

        if (activeServiceType === 'hotel') {
          return !isImportedPlaceholderService(service);
        }

        return true;
      })
    : [];

  const activeActivities = useMemo(() => getActivityMasterOptions(activities), [activities]);
  const selectedActivity = activeActivities.find((activity) => activity.id === activityId) || null;
  const selectedService =
    services.find((service) => service.id === serviceId) ||
    (activeServiceType === 'activity' ? getActivityServiceBridge(selectedActivity || activeActivities[0] || null, services) || undefined : activeServiceType === 'externalPackage' ? undefined : filteredServices[0]);
  const activeActivityRateVariants = useMemo(
    () => (selectedActivity?.rateVariants || []).filter((variant) => variant.active !== false),
    [selectedActivity],
  );
  const hasActivityRateVariants = activeActivityRateVariants.length > 0;
  const selectedActivityRateVariant =
    activeActivityRateVariants.find((variant) => variant.id === activityRateVariantId) || activeActivityRateVariants[0] || null;
  const isHotelService = selectedService ? getServiceTypeKey(selectedService) === 'hotel' : false;
  const isTransportService = selectedService ? getServiceTypeKey(selectedService) === 'transport' : false;
  const isGuideService = selectedService ? getServiceTypeKey(selectedService) === 'guide' : false;
  const isActivityService = selectedService ? getServiceTypeKey(selectedService) === 'activity' : false;
  const isTicketingService = selectedService ? getServiceTypeKey(selectedService) === 'ticketing' : false;
  const isMealService = selectedService ? getServiceTypeKey(selectedService) === 'meal' : false;
  const isExternalPackageService = activeServiceType === 'externalPackage' || (selectedService ? getServiceTypeKey(selectedService) === 'externalPackage' : false);
  const externalPackageValidationErrors = useMemo(() => validateExternalPackageFormState(externalPackage), [externalPackage]);
  const externalPackageFooterErrors = isExternalPackageService
    ? error
      ? [error]
      : hasAttemptedExternalPackageSubmit
        ? externalPackageValidationErrors
        : []
    : [];
  const hasTransportRouteSelection = Boolean(routeId);
  const activeTicketRateVariants = useMemo(
    () => (selectedService?.ticketRateVariants || []).filter((variant) => variant.active !== false),
    [selectedService],
  );
  const selectedTicketRateVariant =
    activeTicketRateVariants.find((variant) => variant.id === ticketRateVariantId) || activeTicketRateVariants[0] || null;
  const showTransportRouteRequired = isTransportService && Boolean(transportServiceTypeId) && !hasTransportRouteSelection;
  const isTransportVehicleSelected = Boolean(
    isTransportService &&
      selectedTransportVehicleId &&
      resolvedTransportPricing &&
      resolvedTransportMatchesCurrentSelection,
  );

  useEffect(() => {
    if (!isTransportService) {
      return;
    }

    const abortController = new AbortController();
    setIsLoadingTransportPricingRules(true);

    fetch('/api/transport-pricing/rules', {
      cache: 'no-store',
      signal: abortController.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(await getErrorMessage(response, 'Could not load transport priced routes.'));
        }

        return readJsonResponse<TransportPricingRuleSummary[]>(response, 'Could not load transport priced routes.');
      })
      .then((rules) => {
        if (!abortController.signal.aborted) {
          setTransportPricingRules(rules);
        }
      })
      .catch((caughtError) => {
        if (caughtError instanceof Error && caughtError.name === 'AbortError') {
          return;
        }

        if (!abortController.signal.aborted) {
          setError(caughtError instanceof Error ? caughtError.message : 'Could not load transport priced routes.');
          setTransportPricingRules([]);
        }
      })
      .finally(() => {
        if (!abortController.signal.aborted) {
          setIsLoadingTransportPricingRules(false);
        }
      });

    return () => abortController.abort();
  }, [isTransportService]);

  const hasPrimarySelection = isEditing || isExternalPackageService || (isHotelService ? Boolean(hotelId) : Boolean(serviceId));
  const needsServiceSelection = !isEditing && Boolean(activeServiceType) && activeServiceType !== 'hotel' && activeServiceType !== 'externalPackage' && !serviceId;
  const selectionStepTitle =
    activeServiceType === 'transport'
      ? 'Choose transport service'
      : activeServiceType === 'activity'
        ? 'Choose activity'
        : activeServiceType === 'ticketing'
          ? 'Choose ticket / entrance service'
          : activeServiceType === 'meal'
            ? 'Choose meal'
            : activeServiceType === 'guide'
              ? 'Choose guide service'
              : activeServiceType === 'externalPackage'
                ? 'Choose external package'
                : 'Choose service';

  const selectedHotel = hotels.find((hotel) => hotel.id === hotelId) || null;
  const hotelRatePreviewByHotelId = useMemo(() => {
    const contractById = new Map(hotelContracts.map((contract) => [contract.id, contract]));
    const previewByHotel = new Map<string, { cost: number; currency: string }>();

    for (const rate of hotelRates) {
      const hotelContract = contractById.get(rate.contractId);

      if (!hotelContract) {
        continue;
      }

      const current = previewByHotel.get(hotelContract.hotelId);

      if (!current || rate.cost < current.cost) {
        previewByHotel.set(hotelContract.hotelId, { cost: rate.cost, currency: rate.currency });
      }
    }

    return previewByHotel;
  }, [hotelContracts, hotelRates]);
  const filteredHotelContracts = hotelContracts.filter((contract) => contract.hotelId === hotelId);
  const selectedHotelContract = filteredHotelContracts.find((contract) => contract.id === contractId) || null;
  const filteredSeasonRates = hotelRates.filter((rate) => rate.contractId === contractId);
  const seasonOptions = Array.from(new Set(filteredSeasonRates.map((rate) => rate.seasonName))).sort((left, right) =>
    left.localeCompare(right),
  );
  const seasonByName = new Map(seasons.map((season) => [season.name.trim().toLowerCase(), season]));
  const availableSeasons = seasonOptions
    .map((name) => seasonByName.get(name.trim().toLowerCase()) || null)
    .filter((season): season is Season => Boolean(season));
  const selectedSeason =
    seasons.find((season) => season.id === seasonId) ||
    (seasonName ? seasonByName.get(seasonName.trim().toLowerCase()) || null : null);
  const effectiveSeasonName = selectedSeason?.name || seasonName;
  const selectedSeasonValue = selectedSeason ? selectedSeason.id : seasonName ? `legacy:${seasonName}` : '';
  const seasonFilteredRates = filteredSeasonRates.filter((rate) => rate.seasonName === effectiveSeasonName);
  const selectedHotelRoomCategories = hotels.find((hotel) => hotel.id === hotelId)?.roomCategories || [];
  const roomCategoryOptions = Array.from(
    new Map(
      [
        ...seasonFilteredRates.map((rate) => [rate.roomCategoryId, rate.roomCategory] as const),
        ...selectedHotelRoomCategories.map((category) => [
          category.id,
          { id: category.id, name: category.name, code: category.code },
        ] as const),
      ],
    ).values(),
  ).sort((left, right) => roomCategorySortRank(left) - roomCategorySortRank(right) || left.name.localeCompare(right.name));
  const roomCategoryFilteredRates = seasonFilteredRates.filter((rate) => rate.roomCategoryId === roomCategoryId);
  const occupancyOptions = Array.from(new Set(roomCategoryFilteredRates.map((rate) => rate.occupancyType))).sort();
  const occupancyFilteredRates = roomCategoryFilteredRates.filter((rate) => rate.occupancyType === occupancyType);
  const mealPlanOptions = Array.from(
    new Set([
      ...occupancyFilteredRates.map((rate) => rate.mealPlan),
      ...(contractHasHbSupplement(selectedHotelContract, roomCategoryId, effectiveSeasonName) && occupancyFilteredRates.some((rate) => rate.mealPlan === 'BB')
        ? (['HB'] as const)
        : []),
    ]),
  ).sort();
  const selectedHotelRate =
    hotelRates.find(
      (rate) =>
        rate.contractId === contractId &&
        rate.seasonName === effectiveSeasonName &&
        rate.roomCategoryId === roomCategoryId &&
        rate.occupancyType === occupancyType &&
        rate.mealPlan === mealPlan,
    ) || null;
  const selectedHotelBaseRate =
    selectedHotelRate ||
    (mealPlan === 'HB' && contractHasHbSupplement(selectedHotelContract, roomCategoryId, effectiveSeasonName)
      ? hotelRates.find(
          (rate) =>
            rate.contractId === contractId &&
            rate.seasonName === effectiveSeasonName &&
            rate.roomCategoryId === roomCategoryId &&
            rate.occupancyType === occupancyType &&
            rate.mealPlan === 'BB',
        ) || null
      : null);
  const hotelCheckInDate = isHotelService ? serviceDate || travelStartDate?.slice(0, 10) || '' : '';
  const hotelCheckOutDate = hotelCheckInDate ? addDaysToDateString(hotelCheckInDate, Math.max(1, Number(nightCount || 1))) : '';
  const hotelPreviewNights = Math.max(1, Number(nightCount || 1));
  const hotelPreviewRooms = Math.max(1, Number(roomCount || 1));
  const hotelPreviewPax = Math.max(1, Number(paxCount || 1));
  const hotelPreviewPricingBasis = selectedHotelBaseRate?.pricingBasis || 'PER_ROOM';
  const hotelPreviewUnitRate = selectedHotelBaseRate
    ? Number(selectedHotelBaseRate.cost || 0)
    : manualHotelRateDraft
      ? Number(manualHotelRateDraft.cost || 0)
      : 0;
  const hotelPreviewSupplementTotal = calculateHotelSupplementPreviewTotal(
    selectedHotelContract,
    roomCategoryId,
    mealPlan,
    selectedHotelBaseRate?.mealPlan,
    hotelPreviewPax,
    hotelPreviewRooms,
    hotelPreviewNights,
    effectiveSeasonName,
  );
  const hotelPreviewMultiplier =
    hotelPreviewPricingBasis === 'PER_PERSON'
      ? hotelPreviewPax
      : hotelPreviewRooms;
  const hotelPreviewMultiplierLabel =
    hotelPreviewPricingBasis === 'PER_PERSON'
      ? `${hotelPreviewPax} pax`
      : `${hotelPreviewRooms} room${hotelPreviewRooms === 1 ? '' : 's'}`;
  const hotelCalculatedTotalCost = hotelCostCalculation
    ? Number(hotelCostCalculation.totalCost || 0)
    : Number((hotelPreviewUnitRate * hotelPreviewMultiplier * hotelPreviewNights + hotelPreviewSupplementTotal).toFixed(2));
  const hotelPricingBreakdownLines = hotelCostCalculation?.breakdown.flatMap((night) =>
    (night.lines || []).map((line) => ({
      ...line,
      date: night.date,
    })),
  ) || [];
  const hotelPricingWarnings = hotelCostCalculation?.breakdown.flatMap((night) => night.warnings || []) || [];
  const hotelEffectiveTotalCost = useOverride && overrideCost.trim()
    ? Number(overrideCost)
    : hotelCalculatedTotalCost;
  const hotelPreviewSellTotal = sellPrice.trim()
    ? Number(sellPrice)
    : markupAmount.trim()
      ? Number((hotelEffectiveTotalCost + Number(markupAmount)).toFixed(2))
      : Number((hotelEffectiveTotalCost * (1 + Number(markupPercent || '0') / 100)).toFixed(2));
  const hotelPreviewMargin =
    Number.isFinite(hotelEffectiveTotalCost) && Number.isFinite(hotelPreviewSellTotal)
      ? Number((hotelPreviewSellTotal - hotelEffectiveTotalCost).toFixed(2))
      : null;
  const isHotelPricingReady = Boolean(
    isHotelService &&
      hotelId &&
      contractId &&
      effectiveSeasonName &&
      roomCategoryId &&
      occupancyType &&
      mealPlan &&
      hotelCheckInDate &&
      hotelCheckOutDate &&
      (selectedHotelBaseRate || manualHotelRateDraft) &&
      Number.isFinite(hotelPreviewUnitRate) &&
      hotelPreviewUnitRate > 0,
  );
  const displayCurrency = isExternalPackageService
    ? externalPackage.currency
    : isMealService
      ? mealCurrency
      : isTicketingService
        ? normalizeQuoteCurrency(quoteCurrency)
      : selectedActivityRateVariant?.currency ||
        selectedActivity?.currency ||
        preferredRateCurrency ||
        selectedHotelBaseRate?.currency ||
        selectedService?.currency ||
        'USD';
  const ticketNativeCurrency = selectedTicketRateVariant?.currency || selectedService?.currency || 'JOD';
  const activityParticipantTotal = Math.max(
    1,
    Number(participantCount || 0) || Number(adultCount || 0) + Number(childCount || 0) || defaultPaxCount || 1,
  );
  const finalCost = useMemo(() => {
    if (isExternalPackageService) {
      if (useOverride && overrideCost.trim()) {
        return Number(overrideCost);
      }

      return getExternalPackageCalculatedCost(externalPackage, Number(paxCount || defaultPaxCount || 1));
    }

    if (isMealService) {
      const unitCost = Number(mealCost || 0);
      const pax = Math.max(1, Number(paxCount || defaultPaxCount || 1));
      return Number.isFinite(unitCost) ? Number((unitCost * pax).toFixed(2)) : null;
    }

    if (useOverride && overrideCost.trim()) {
      return Number(overrideCost);
    }

    if (isHotelService) {
      return Number.isFinite(hotelEffectiveTotalCost) ? hotelEffectiveTotalCost : null;
    }

    if (isActivityService) {
      const unitCost = Number(selectedActivityRateVariant?.costPrice ?? selectedActivity?.costPrice ?? baseCost ?? 0);
      const participants = Math.max(
        1,
        Number(participantCount || 0) || Number(adultCount || 0) + Number(childCount || 0) || defaultPaxCount || 1,
      );
      const maxPaxPerUnit = Number(selectedActivityRateVariant?.maxPaxPerUnit || 0);
      const units =
        maxPaxPerUnit > 0
          ? Math.ceil(participants / maxPaxPerUnit)
          : (selectedActivityRateVariant?.pricingBasis ?? selectedActivity?.pricingBasis) === 'PER_GROUP'
            ? 1
            : participants;
      return Number.isFinite(unitCost) ? Number((unitCost * units).toFixed(2)) : null;
    }

    if (isTicketingService) {
      const unitCost = Number(selectedTicketRateVariant?.costPrice ?? baseCost ?? selectedService?.baseCost ?? 0);
      const pax = Math.max(1, Number(paxCount || defaultPaxCount || 1));
      const pricingBasis = selectedTicketRateVariant?.pricingBasis || 'PER_PERSON';
      const units = pricingBasis === 'PER_GROUP' ? 1 : pricingBasis === 'PER_DAY' ? Math.max(1, Number(dayCount || 1)) : pax;
      const nativeTotal = Number.isFinite(unitCost) ? Number((unitCost * units).toFixed(2)) : null;
      return nativeTotal === null ? null : convertQuoteMoney(nativeTotal, ticketNativeCurrency, quoteCurrency);
    }

    return baseCost ? Number(baseCost) : null;
  }, [
    adultCount,
    baseCost,
    childCount,
    defaultPaxCount,
    externalPackage,
    isActivityService,
    isExternalPackageService,
    isHotelService,
    isMealService,
    isTicketingService,
    hotelEffectiveTotalCost,
    mealCost,
    overrideCost,
    participantCount,
    paxCount,
    selectedService?.baseCost,
    selectedService?.currency,
    selectedActivity?.costPrice,
    selectedActivity?.pricingBasis,
    selectedActivityRateVariant,
    selectedTicketRateVariant,
    ticketNativeCurrency,
    quoteCurrency,
    useOverride,
  ]);
  const finalSellPrice = useMemo(() => {
    if (sellPrice.trim()) {
      return Number(sellPrice);
    }

    if (markupAmount.trim()) {
      return finalCost === null ? null : Number((finalCost + Number(markupAmount)).toFixed(2));
    }

    if (isActivityService && selectedActivity) {
      const maxPaxPerUnit = Number(selectedActivityRateVariant?.maxPaxPerUnit || 0);
      const units =
        maxPaxPerUnit > 0
          ? Math.ceil(activityParticipantTotal / maxPaxPerUnit)
          : (selectedActivityRateVariant?.pricingBasis ?? selectedActivity.pricingBasis) === 'PER_GROUP'
            ? 1
            : activityParticipantTotal;
      return Number((Number(selectedActivityRateVariant?.sellPrice ?? selectedActivity.sellPrice ?? 0) * units).toFixed(2));
    }

    if (isTicketingService && selectedTicketRateVariant?.sellPrice !== null && selectedTicketRateVariant?.sellPrice !== undefined) {
      const pax = Math.max(1, Number(paxCount || defaultPaxCount || 1));
      const units = selectedTicketRateVariant.pricingBasis === 'PER_GROUP' ? 1 : selectedTicketRateVariant.pricingBasis === 'PER_DAY' ? Math.max(1, Number(dayCount || 1)) : pax;
      const nativeSellTotal = Number((Number(selectedTicketRateVariant.sellPrice || 0) * units).toFixed(2));
      return convertQuoteMoney(nativeSellTotal, ticketNativeCurrency, quoteCurrency);
    }

    return finalCost === null ? null : Number((finalCost * (1 + Number(markupPercent || '0') / 100)).toFixed(2));
  }, [activityParticipantTotal, dayCount, defaultPaxCount, finalCost, isActivityService, isTicketingService, markupAmount, markupPercent, paxCount, quoteCurrency, selectedActivity, selectedActivityRateVariant, selectedTicketRateVariant, sellPrice, ticketNativeCurrency]);
  const finalMargin =
    finalCost !== null && finalSellPrice !== null && Number.isFinite(finalCost) && Number.isFinite(finalSellPrice)
      ? Number((finalSellPrice - finalCost).toFixed(2))
      : null;
  const ticketPricingBasis = selectedTicketRateVariant?.pricingBasis || 'PER_PERSON';
  const ticketUnitCost = Number(selectedTicketRateVariant?.costPrice ?? baseCost ?? selectedService?.baseCost ?? 0);
  const ticketUnitSell = Number(selectedTicketRateVariant?.sellPrice ?? 0);
  const ticketOperationalUnits =
    ticketPricingBasis === 'PER_GROUP'
      ? 1
      : ticketPricingBasis === 'PER_DAY'
        ? Math.max(1, Number(dayCount || 1))
        : Math.max(1, Number(paxCount || defaultPaxCount || 1));
  const activityUnitRate = Number(selectedActivityRateVariant?.costPrice ?? selectedActivity?.costPrice ?? baseCost ?? 0);
  const activityUnitSellRate = Number(selectedActivityRateVariant?.sellPrice ?? selectedActivity?.sellPrice ?? 0);
  const activityPricingBasis = selectedActivityRateVariant?.pricingBasis ?? selectedActivity?.pricingBasis ?? 'PER_PERSON';
  const activityMaxPaxPerUnit = Number(selectedActivityRateVariant?.maxPaxPerUnit || 0);
  const activityCapacityUnits =
    activityMaxPaxPerUnit > 0
      ? Math.ceil(activityParticipantTotal / activityMaxPaxPerUnit)
      : null;
  const isLegacyActivityEdit = Boolean(isEditing && isActivityService && !activityId);
  const isActivitySelected = Boolean(
    isActivityService &&
      serviceId &&
      selectedService &&
      (isLegacyActivityEdit || (activeActivities.length > 0 && activityId && (activeActivityRateVariants.length === 0 || selectedActivityRateVariant))),
  );
  const resolvedActivityServiceDate = isActivityService && !serviceDate ? resolveDerivedServiceDate(travelStartDate, itineraryDayNumber) : null;
  const resolvedMealServiceDate = isMealService && !serviceDate ? resolveDerivedServiceDate(travelStartDate, itineraryDayNumber) : null;
  const activityIssues =
    isActivityService
      ? [
          itineraryId && itineraryDayNumber && !travelStartDate ? 'Itinerary day is selected, but the quote travel start date is missing.' : null,
          !(serviceDate || resolvedActivityServiceDate) ? 'Activity date is missing.' : null,
          !(startTime || pickupTime) ? 'Operational details missing: start time or pickup time.' : null,
          !(pickupLocation.trim() || meetingPoint.trim()) ? 'Operational details missing: pickup location or meeting point.' : null,
          !(Number(participantCount || 0) > 0 || Number(adultCount || 0) + Number(childCount || 0) > 0)
            ? 'Participant counts are required.'
            : null,
          reconfirmationRequired && !reconfirmationDueAt ? 'Reconfirmation is required, but no due date is set.' : null,
        ].filter((issue): issue is string => Boolean(issue))
      : [];
  const roomCategoryDraftOptions = useMemo(
    () =>
      roomCategoryOptions.map((category) => ({
        id: category.id,
        name: category.name,
        code: category.code,
      })),
    [roomCategoryOptions],
  );
  const hotelRateDraftRows = useMemo(() => {
    const matchingDraftRates = roomCategoryFilteredRates.map((rate) => ({
      id: rate.id,
      roomCategoryId: rate.roomCategoryId,
      mealPlan: rate.mealPlan,
      occupancyType: rate.occupancyType,
      cost: String(rate.cost),
      sell:
        baseCost && markupPercent
          ? String(Number((Number(rate.cost) * (1 + Number(markupPercent || '0') / 100)).toFixed(2)))
          : '',
      notes: '',
    }));

    if (matchingDraftRates.length > 0) {
      return matchingDraftRates;
    }

    return [
      {
        id: `current-${hotelId || 'hotel'}-${contractId || 'contract'}`,
        roomCategoryId,
        mealPlan,
        occupancyType,
        cost: overrideCost.trim() || baseCost || '',
        sell:
          overrideCost.trim() && markupPercent
            ? String(Number((Number(overrideCost) * (1 + Number(markupPercent || '0') / 100)).toFixed(2)))
            : '',
        notes: manualHotelRateDraft?.notes || '',
      },
    ];
  }, [
    baseCost,
    contractId,
    hotelId,
    manualHotelRateDraft?.notes,
    markupPercent,
    mealPlan,
    occupancyType,
    overrideCost,
    roomCategoryFilteredRates,
    roomCategoryId,
  ]);

  useEffect(() => {
    if (!activeServiceType) {
      setServiceId('');
      return;
    }

    if (isEditing && activeServiceType === 'hotel') {
      return;
    }

    if (activeServiceType === 'externalPackage') {
      return;
    }

    if (activeServiceType === 'activity') {
      const pairedService = getActivityServiceBridge(selectedActivity || activeActivities[0] || null, services);
      const nextServiceId = pairedService?.id || '';
      if (serviceId !== nextServiceId) {
        setServiceId(nextServiceId);
      }
      return;
    }

    if (!filteredServices.some((service) => service.id === serviceId)) {
      // Preserve API order so the first real hotel template remains the default when multiple templates exist.
      setServiceId(filteredServices[0]?.id || '');
    }
  }, [activeActivities, activeServiceType, filteredServices, isEditing, selectedActivity, serviceId, services]);

  useEffect(() => {
    if (isEditing || activeServiceType !== 'activity' || !selectedActivity) {
      return;
    }

    const pairedService = getActivityServiceBridge(selectedActivity, services);

    if (pairedService && !serviceId) {
      setServiceId(pairedService.id);
    }
  }, [activeServiceType, isEditing, selectedActivity, serviceId, services]);

  useEffect(() => {
    if (!selectedActivity || activeActivityRateVariants.length === 0) {
      setActivityRateVariantId('');
      return;
    }

    if (!activeActivityRateVariants.some((variant) => variant.id === activityRateVariantId)) {
      setActivityRateVariantId(activeActivityRateVariants[0].id);
    }
  }, [activeActivityRateVariants, activityRateVariantId, selectedActivity]);

  useEffect(() => {
    if (!selectedService || activeTicketRateVariants.length === 0) {
      setTicketRateVariantId('');
      return;
    }

    if (!activeTicketRateVariants.some((variant) => variant.id === ticketRateVariantId)) {
      setTicketRateVariantId(activeTicketRateVariants[0].id);
    }
  }, [activeTicketRateVariants, selectedService, ticketRateVariantId]);

  useEffect(() => {
    if (!selectedService) {
      setBaseCost('');
      return;
    }

    if (isHotelService) {
      setBaseCost(selectedHotelBaseRate ? String(selectedHotelBaseRate.cost) : '');
      return;
    }

    if (isGuideService) {
      setBaseCost(String(GUIDE_RATES[guideType][guideDuration] + (overnight === 'yes' ? GUIDE_OVERNIGHT_SUPPLEMENT : 0)));
      return;
    }

    if (isTransportService) {
      return;
    }

    if (isActivityService && selectedActivity) {
      setBaseCost(String(selectedActivityRateVariant?.costPrice ?? selectedActivity.costPrice));
      return;
    }

    if (isExternalPackageService) {
      const isNewExternalPackageService = externalPackageDefaultsServiceIdRef.current !== selectedService.id;
      const inferredPricingBasis = getExternalPackagePricingBasisForService(selectedService);
      setExternalPackage((current) => ({
        ...current,
        currency: current.currency || selectedService.currency || 'USD',
        pricingBasis: isNewExternalPackageService && !isEditing ? inferredPricingBasis : current.pricingBasis,
        netCost: current.netCost.trim() ? current.netCost : String(selectedService.baseCost || 0),
        supplierName: current.supplierName.trim() ? current.supplierName : selectedService.supplierId || '',
        packageName: current.packageName.trim() ? current.packageName : selectedService.name,
        clientItineraryText: current.clientItineraryText.trim() ? current.clientItineraryText : selectedService.name,
      }));
      externalPackageDefaultsServiceIdRef.current = selectedService.id;
      const resolvedNetCost = externalPackage.netCost.trim() || String(selectedService.baseCost || 0);
      setBaseCost(
        String(
          getExternalPackageCalculatedCost(
            {
              pricingBasis: isNewExternalPackageService && !isEditing ? inferredPricingBasis : externalPackage.pricingBasis,
              netCost: resolvedNetCost,
            },
            Number(paxCount || defaultPaxCount || 1),
          ) ?? '',
        ),
      );
      return;
    }

    if (isMealService) {
      if (!mealName.trim()) {
        setMealName(selectedService.name);
      }
      if (!mealCost.trim()) {
        setMealCost(String(selectedService.baseCost));
      }
      if (!mealCurrency.trim() || mealCurrency === 'USD') {
        setMealCurrency(selectedService.currency || 'USD');
      }
      setBaseCost(mealCost.trim() || String(selectedService.baseCost));
      return;
    }

    setBaseCost(String(selectedService.baseCost));
  }, [
    guideDuration,
    guideType,
    isGuideService,
    isHotelService,
    isExternalPackageService,
    isMealService,
    isTransportService,
    isActivityService,
    externalPackage.netCost,
    externalPackage.pricingBasis,
    paxCount,
    mealCost,
    mealCurrency,
    mealName,
    overnight,
    selectedHotelBaseRate,
    selectedActivity,
    selectedActivityRateVariant,
    selectedService,
  ]);

  useEffect(() => {
    if (!isHotelService) {
      setHotelCostCalculation(null);
      setIsLoadingHotelCost(false);
      hotelCostInFlightKeyRef.current = null;
      hotelCostLastRequestedKeyRef.current = null;
      hotelCostAbortRef.current?.abort();
      hotelCostAbortRef.current = null;
      if (hotelCostDebounceRef.current) {
        clearTimeout(hotelCostDebounceRef.current);
        hotelCostDebounceRef.current = null;
      }
      return;
    }

    if (
      !hotelId ||
      !contractId ||
      !roomCategoryId ||
      !hotelCheckInDate ||
      !hotelCheckOutDate ||
      !occupancyType ||
      !mealPlan ||
      !(Number(paxCount) > 0)
    ) {
      setHotelCostCalculation(null);
      setIsLoadingHotelCost(false);
      hotelCostAbortRef.current?.abort();
      hotelCostAbortRef.current = null;
      hotelCostInFlightKeyRef.current = null;
      if (hotelCostDebounceRef.current) {
        clearTimeout(hotelCostDebounceRef.current);
        hotelCostDebounceRef.current = null;
      }
      return;
    }

    const params = new URLSearchParams({
      hotelId,
      contractId,
      roomCategoryId,
      checkInDate: hotelCheckInDate,
      checkOutDate: hotelCheckOutDate,
      nightCount: String(Number(nightCount) || 1),
      occupancy: occupancyType,
      mealPlan,
      pax: String(Number(paxCount) || 1),
      roomCount: String(Number(roomCount) || 1),
    });
    const requestKey = params.toString();

    if (hotelCostInFlightKeyRef.current === requestKey) {
      return;
    }

    setHotelCostCalculation(null);
    setError('');
    hotelCostAbortRef.current?.abort();
    hotelCostAbortRef.current = null;
    if (hotelCostDebounceRef.current) {
      clearTimeout(hotelCostDebounceRef.current);
    }

    hotelCostDebounceRef.current = setTimeout(() => {
      const abortController = new AbortController();
      hotelCostDebounceRef.current = null;
      hotelCostInFlightKeyRef.current = requestKey;
      hotelCostLastRequestedKeyRef.current = requestKey;
      hotelCostAbortRef.current = abortController;
      setIsLoadingHotelCost(true);

      fetch(`/api/hotel-rates/calculate-hotel-cost?${requestKey}`, { signal: abortController.signal })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error(await getErrorMessage(response, 'Could not calculate hotel contract pricing.'));
          }

          return readJsonResponse<HotelCostCalculation>(response, 'Hotel contract pricing');
        })
        .then((result) => {
          if (hotelCostLastRequestedKeyRef.current !== requestKey) {
            return;
          }

          setHotelCostCalculation(result);
        })
        .catch((caughtError) => {
          if (caughtError instanceof Error && caughtError.name === 'AbortError') {
            return;
          }

          if (hotelCostLastRequestedKeyRef.current !== requestKey) {
            return;
          }

          setHotelCostCalculation(null);
          setError(caughtError instanceof Error ? caughtError.message : 'Could not calculate hotel contract pricing.');
        })
        .finally(() => {
          if (hotelCostInFlightKeyRef.current === requestKey) {
            hotelCostInFlightKeyRef.current = null;
          }
          if (hotelCostAbortRef.current === abortController) {
            hotelCostAbortRef.current = null;
            setIsLoadingHotelCost(false);
          }
        });
    }, 400);

    return () => {
      if (hotelCostDebounceRef.current) {
        clearTimeout(hotelCostDebounceRef.current);
        hotelCostDebounceRef.current = null;
      }
      if (hotelCostInFlightKeyRef.current === requestKey) {
        hotelCostAbortRef.current?.abort();
        hotelCostAbortRef.current = null;
        hotelCostInFlightKeyRef.current = null;
        setIsLoadingHotelCost(false);
      }
    };
  }, [contractId, hotelCheckInDate, hotelCheckOutDate, hotelId, isHotelService, mealPlan, nightCount, occupancyType, paxCount, roomCategoryId, roomCount]);

  useEffect(() => {
    if (!isHotelService) {
      setHotelId('');
      setContractId('');
      setSeasonId('');
      setSeasonName('');
      setRoomCategoryId('');
      setOccupancyType('DBL');
      setMealPlan('BB');
      setManualHotelRateDraft(null);
      setHotelRateReference(null);
      setPendingHotelRateSubmit(false);
      return;
    }
  }, [isHotelService]);

  useEffect(() => {
    if (!manualHotelRateDraft) {
      return;
    }

    const draftStillMatches =
      manualHotelRateDraft.roomCategoryId === roomCategoryId &&
      manualHotelRateDraft.mealPlan === mealPlan &&
      manualHotelRateDraft.occupancyType === occupancyType;

    if (!draftStillMatches) {
      setManualHotelRateDraft(null);
    }
  }, [manualHotelRateDraft, mealPlan, occupancyType, roomCategoryId]);

  useEffect(() => {
    if (isHotelService && !useOverride && manualHotelRateDraft) {
      setManualHotelRateDraft(null);
      setOverrideCost('');
      setOverrideReason('');
    }
  }, [isHotelService, manualHotelRateDraft, useOverride]);

  useEffect(() => {
    if (!hotelRateReference) {
      return;
    }

    const referenceStillMatches =
      hotelRateReference.contractId === contractId &&
      hotelRateReference.roomCategoryId === roomCategoryId &&
      hotelRateReference.mealPlan === mealPlan &&
      hotelRateReference.occupancyType === occupancyType;

    if (!referenceStillMatches) {
      setHotelRateReference(null);
    }
  }, [contractId, hotelRateReference, mealPlan, occupancyType, roomCategoryId]);

  useEffect(() => {
    if (!isHotelService || !preferredRateCost || manualHotelRateDraft || isEditing) {
      return;
    }
    const roomCategoryLabel =
      roomCategoryOptions.find((category) => category.id === preferredRoomCategoryId)?.name || 'Selected room';

    setHotelRateReference({
      contractId: preferredContractId || '',
      roomCategoryId: preferredRoomCategoryId || '',
      roomCategoryLabel,
      mealPlan: preferredMealPlan || 'BB',
      occupancyType: preferredOccupancyType || 'DBL',
      cost: preferredRateCost,
      currency: preferredRateCurrency || displayCurrency,
      note: preferredRateNote || '',
    });
    if (preferredRateNote) {
      setSeasonName(preferredRateNote);
    }
  }, [
    displayCurrency,
    isEditing,
    isHotelService,
    manualHotelRateDraft,
    preferredContractId,
    preferredMealPlan,
    preferredOccupancyType,
    preferredRateCost,
    preferredRateCurrency,
    preferredRateNote,
    preferredRoomCategoryId,
    roomCategoryOptions,
  ]);

  useEffect(() => {
    if (!isHotelService) {
      return;
    }

    const nextContractId = filteredHotelContracts.some((contract) => contract.id === contractId)
      ? contractId
      : filteredHotelContracts[0]?.id || '';

    if (nextContractId !== contractId) {
      setContractId(nextContractId);
    }
  }, [contractId, filteredHotelContracts, isHotelService]);

  useEffect(() => {
    if (!isHotelService) {
      return;
    }

    const nextSeason =
      availableSeasons.find((season) => season.id === seasonId) ||
      (seasonName ? seasonByName.get(seasonName.trim().toLowerCase()) || null : null) ||
      availableSeasons[0] ||
      null;
    const nextSeasonName = nextSeason?.name || (seasonOptions.includes(seasonName) ? seasonName : seasonOptions[0] || '');

    if ((nextSeason?.id || '') !== seasonId) {
      setSeasonId(nextSeason?.id || '');
    }

    if (nextSeasonName !== seasonName) {
      setSeasonName(nextSeasonName);
    }
  }, [availableSeasons, isHotelService, seasonByName, seasonId, seasonName, seasonOptions]);

  useEffect(() => {
    if (!isHotelService) {
      return;
    }

    const nextRoomCategoryId = roomCategoryOptions.some((category) => category.id === roomCategoryId)
      ? roomCategoryId
      : roomCategoryOptions[0]?.id || '';

    if (nextRoomCategoryId !== roomCategoryId) {
      setRoomCategoryId(nextRoomCategoryId);
    }
  }, [isHotelService, roomCategoryId, roomCategoryOptions]);

  useEffect(() => {
    if (!isHotelService) {
      return;
    }

    const nextOccupancyType = occupancyOptions.includes(occupancyType) ? occupancyType : occupancyOptions[0] || 'DBL';

    if (nextOccupancyType !== occupancyType) {
      setOccupancyType(nextOccupancyType);
    }
  }, [isHotelService, occupancyOptions, occupancyType]);

  useEffect(() => {
    if (!isHotelService) {
      return;
    }

    const nextMealPlan = mealPlanOptions.includes(mealPlan) ? mealPlan : mealPlanOptions[0] || 'BB';

    if (nextMealPlan !== mealPlan) {
      setMealPlan(nextMealPlan);
    }
  }, [isHotelService, mealPlan, mealPlanOptions]);

  useEffect(() => {
    if (!isTransportService) {
      setTransportServiceTypeId('');
      setRouteId('');
      setRouteName('');
      setResolvedTransportPricing(null);
      setIsLoadingTransportCost(false);
      setSelectedTransportAddOns({});
    }
  }, [isTransportService]);

  useEffect(() => {
    if (!isTransportService || !resolvedTransportPricing?.optionalAddOns) {
      return;
    }

    setSelectedTransportAddOns((current) => {
      const next = { ...current };

      for (const addOn of resolvedTransportPricing.optionalAddOns || []) {
        if (!next[addOn.rateId]) {
          next[addOn.rateId] = {
            selected: addOn.defaultQuantity > 0,
            quantity: String(Math.max(1, addOn.defaultQuantity || 1)),
          };
        }
      }

      return next;
    });
  }, [isTransportService, resolvedTransportPricing?.optionalAddOns]);

  useEffect(() => {
    if (!isTransportService || routeSelectionManuallyChanged || routeId || routeName.trim() || !smartDefaultTransportRoute) {
      return;
    }

    setRouteId(smartDefaultTransportRoute.id);
    setRouteName('');
    setBaseCost('');
    setResolvedTransportPricing(null);
  }, [isTransportService, routeId, routeName, routeSelectionManuallyChanged, smartDefaultTransportRoute]);

  function applyTransportCandidate(candidate: (typeof transportCandidates)[number], options?: { userInitiated?: boolean }) {
    const matchingService = findSupplierServiceForTransportSelection(filteredServices, candidate);

    if (matchingService) {
      setServiceId(matchingService.id);
    } else {
      setServiceId('');
      setError('Transport rate found, but no matching transport catalog service exists for this supplier/pricing mode. Add the service mapping before saving.');
    }

    setTransportServiceTypeId(candidate.serviceType.id);
    setRouteId(candidate.routeId || '');
    setRouteName(candidate.routeId ? '' : candidate.routeName);
    setBaseCost(String(candidate.price));
    setResolvedTransportPricing({
      vehicleRateId: candidate.vehicleRateId,
      routeId: candidate.routeId,
      routeName: candidate.routeName,
      currency: candidate.currency,
      price: candidate.price,
      unitCount: candidate.unitCount,
      pricingMode: candidate.pricingMode,
      unitCapacity: candidate.unitCapacity,
      vehicle: candidate.vehicle,
      serviceType: candidate.serviceType,
      supplier: candidate.supplier,
      optionalAddOns: resolvedTransportPricing?.optionalAddOns || [],
      candidates: resolvedTransportPricing?.candidates,
    });

    if (options?.userInitiated) {
      setTransportSuggestionOverridden(true);
    }
  }

  useEffect(() => {
    if (!isTransportService || isEditing || transportSuggestionOverridden || !routeId || !autoTransportCandidate) {
      return;
    }

    applyTransportCandidate(autoTransportCandidate);
  }, [autoTransportCandidate, isEditing, isTransportService, routeId, transportSuggestionOverridden]);

  useEffect(() => {
    if (!isTransportService || !routeId) {
      return;
    }

    if (!validTransportRoutes.some((route) => route.id === routeId)) {
      setRouteId('');
      setRouteName('');
      setBaseCost('');
      setResolvedTransportPricing(null);
    }
  }, [isTransportService, routeId, validTransportRoutes]);

  useEffect(() => {
    if (!isTransportService) {
      return;
    }

    if (
      transportSuggestionOverridden &&
      resolvedTransportMatchesCurrentSelection &&
      resolvedTransportPricing?.candidates?.length &&
      selectedTransportVehicleId
    ) {
      setIsLoadingTransportCost(false);
      return;
    }

    if (!transportServiceTypeId && transportServiceTypes[0]?.id) {
      setTransportServiceTypeId(transportServiceTypes[0].id);
    }

    if (!transportServiceTypeId || !routeId) {
      setIsLoadingTransportCost(false);
      setBaseCost('');
      setResolvedTransportPricing(null);
      return;
    }

    const abortController = new AbortController();

    async function loadTransportCost() {
      setIsLoadingTransportCost(true);

      try {
        const response = await fetch(`${apiBaseUrl}/transport-pricing/calculate`, {
          method: 'POST',
          headers: buildAuthHeaders({
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({
            serviceTypeId: transportServiceTypeId,
            vehicleId: selectedTransportVehicleId || null,
            routeId: routeId || null,
            routeName: routeName.trim(),
            paxCount: Number(paxCount),
          }),
          signal: abortController.signal,
        });

        if (!response.ok) {
          const message = await getErrorMessage(response, 'Could not resolve transport pricing.');
          if (!abortController.signal.aborted) {
            setError(message);
          }
          return;
        }

        const result = await readJsonResponse<ResolvedTransportPricing>(response, 'Could not resolve transport pricing.');
        setBaseCost(String(result.price));
        setResolvedTransportPricing(result);
      } catch (caughtError) {
        if (caughtError instanceof Error && caughtError.name === 'AbortError') {
          return;
        }

        if (!abortController.signal.aborted) {
          setError(caughtError instanceof Error ? caughtError.message : 'Could not resolve transport pricing.');
        }
      } finally {
        if (!abortController.signal.aborted) {
          setIsLoadingTransportCost(false);
        }
      }
    }

    void loadTransportCost();

    return () => abortController.abort();
  }, [
    apiBaseUrl,
    isTransportService,
    paxCount,
    resolvedTransportMatchesCurrentSelection,
    hasTransportRouteSelection,
    routeId,
    routeName,
    selectedTransportVehicleId,
    transportServiceTypeId,
    transportServiceTypes,
    transportSuggestionOverridden,
  ]);

  useEffect(() => {
    if (!isActivityService) {
      return;
    }

    if (!serviceDate && !itineraryId && travelStartDate) {
      setServiceDate(travelStartDate.slice(0, 10));
    }
  }, [isActivityService, itineraryId, serviceDate, travelStartDate]);

  useEffect(() => {
    if (!isGuideService) {
      setGuideType('local');
      setGuideDuration('full_day');
      setOvernight('no');
    }
  }, [isGuideService]);

  useEffect(() => {
    if (!isActivityService) {
      setServiceDate('');
      setStartTime('');
      setPickupTime('');
      setPickupLocation('');
      setMeetingPoint('');
      setParticipantCount(String(defaultPaxCount || 1));
      setAdultCount(String(defaultAdultCount || 0));
      setChildCount(String(defaultChildCount || 0));
      setReconfirmationRequired(false);
      setReconfirmationDueAt('');
    }
  }, [defaultAdultCount, defaultChildCount, defaultPaxCount, isActivityService]);

  useEffect(() => {
    if (!pendingHotelRateSubmit || !formRef.current) {
      return;
    }

    if (!isHotelService || !manualHotelRateDraft) {
      return;
    }

    setPendingHotelRateSubmit(false);
    formRef.current.requestSubmit();
  }, [isHotelService, manualHotelRateDraft, pendingHotelRateSubmit]);

  function applyHotelRateDraft(row: QuoteHotelRateDraftRow, intent: 'save' | 'save-and-add') {
    const parsedCost = Number(row.cost);
    const parsedSell = Number(row.sell);
    const nextMarkupPercent =
      Number.isFinite(parsedCost) && parsedCost > 0 && Number.isFinite(parsedSell) && parsedSell > 0
        ? String(Math.max(0, Number((((parsedSell - parsedCost) / parsedCost) * 100).toFixed(2))))
        : markupPercent;

    setRoomCategoryId(row.roomCategoryId);
    setMealPlan(row.mealPlan);
    setOccupancyType(row.occupancyType);
    setOverrideCost(row.cost);
    setOverrideReason(row.notes || '');
    setUseOverride(true);
    setMarkupPercent(nextMarkupPercent);
    setManualHotelRateDraft(row);
    setShowHotelRateModal(false);

    if (intent === 'save-and-add') {
      setPendingHotelRateSubmit(true);
    }
  }

  const activeHotelSourceRate = selectedHotelBaseRate
    ? {
        roomCategoryLabel: selectedHotelBaseRate.roomCategory.name,
        mealPlan,
        occupancyType,
        cost: String(selectedHotelBaseRate.cost),
        currency: selectedHotelBaseRate.currency,
        note: `${effectiveSeasonName || 'Contract rate'} | ${formatHotelRatePricingBasis(selectedHotelBaseRate.pricingBasis)}`,
      }
    : hotelRateReference
      ? {
          roomCategoryLabel: hotelRateReference.roomCategoryLabel,
          mealPlan: hotelRateReference.mealPlan,
          occupancyType: hotelRateReference.occupancyType,
          cost: hotelRateReference.cost,
          currency: hotelRateReference.currency,
          note: hotelRateReference.note,
        }
      : null;

  function applyBlock(blockId: string) {
    const block = serviceBlocks.find((entry) => entry.id === blockId);

    if (!block) {
      return;
    }

    const targetService =
      services.find((service) => service.id === (block.defaultServiceId || block.defaultService?.id || '')) || null;
    const nextServiceType =
      targetService
        ? getServiceTypeKey(targetService)
        : getServiceTypeKeyFromText(block.defaultServiceType?.code || block.defaultServiceType?.name || block.defaultCategory);

    if (nextServiceType) {
      setActiveServiceType(nextServiceType);
    }

    if (targetService) {
      setServiceId(targetService.id);
    }

    if (block.defaultCost !== null && block.defaultCost !== undefined) {
      setOverrideCost(String(block.defaultCost));
      setUseOverride(true);
    }

    const nextMarkupPercent = formatMarkupPercent(block.defaultSell, block.defaultCost, targetService?.baseCost ?? null);
    if (nextMarkupPercent !== null) {
      setMarkupPercent(nextMarkupPercent);
    }
  }

  function logExternalPackageSubmit(message: string, details?: unknown) {
    if (!isExternalPackageService) {
      return;
    }

    console.log(`[External Country Package] ${message}`, details);
  }

  function logExternalPackageError(message: string, details?: unknown) {
    if (!isExternalPackageService) {
      return;
    }

    console.error(`[External Country Package] ${message}`, details);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    if (isExternalPackageService) {
      console.log('[External Country Package] submit handler fired before loading starts', {
        quoteId,
        itemId: itemId || null,
        optionId: optionId || null,
        serviceId,
      });
      setHasAttemptedExternalPackageSubmit(true);
      if (externalPackageValidationErrors.length > 0) {
        setError(externalPackageValidationErrors[0]);
        logExternalPackageSubmit('validation blocked submit', { errors: externalPackageValidationErrors });
        setIsSubmitting(false);
        return;
      }
    }

    setIsSubmitting(true);

    try {
      const endpoint = optionId
        ? `${apiBaseUrl}/quotes/${quoteId}/options/${optionId}/items${itemId ? `/${itemId}` : ''}`
        : `${apiBaseUrl}/quotes/${quoteId}/items${itemId ? `/${itemId}` : ''}`;

      if (!hasPrimarySelection) {
        throw new Error(isHotelService ? 'Choose a hotel before configuring this item.' : 'Choose a service before configuring this item.');
      }

      if (isHotelService) {
        if (!hotelId || !contractId || !seasonName || !roomCategoryId || !occupancyType || !mealPlan || !hotelCheckInDate || !hotelCheckOutDate) {
          throw new Error('Complete the hotel pricing selection.');
        }

        if (!hotelCostCalculation && !selectedHotelBaseRate && !manualHotelRateDraft) {
          throw new Error('Matching hotel rate not found for the selected combination.');
        }
      }

      if (isTransportService) {
        if (!transportServiceTypeId) {
          throw new Error('Transport service type is required');
        }

        if (!routeId) {
          throw new Error('Transport route is required');
        }

        if (!selectedTransportVehicleId) {
          throw new Error('Choose a priced transport vehicle before saving.');
        }

        if (!Number.isFinite(Number(baseCost)) || Number(baseCost) <= 0) {
          throw new Error('Transport cost must be resolved before saving.');
        }

        if (!resolvedTransportPricing || !resolvedTransportMatchesCurrentSelection) {
          throw new Error('Transport pricing no longer matches the selected route or service type.');
        }
      }

      if (isMealService) {
        if (!mealName.trim()) {
          throw new Error('Meal name is required.');
        }

        if (!serviceDate && !resolvedMealServiceDate) {
          throw new Error('Meal date is required.');
        }

        if (!mealCost.trim() || Number(mealCost) < 0) {
          throw new Error('Meal cost must be zero or greater.');
        }

        if (!mealCurrency.trim()) {
          throw new Error('Meal currency is required.');
        }
      }

      if (useOverride && !overrideCost.trim()) {
        throw new Error('Override cost is required when override is enabled.');
      }

      if (isTicketingService && activeTicketRateVariants.length > 0 && !ticketRateVariantId) {
        throw new Error('Ticket items require a rate variant.');
      }

      if (markupAmount.trim() && Number(markupAmount) < 0) {
        throw new Error('Markup amount must be zero or greater.');
      }

      if (sellPrice.trim() && Number(sellPrice) < 0) {
        throw new Error('Sell price must be zero or greater.');
      }

      if (isActivityService) {
        const hasDateOrItinerary = Boolean(serviceDate || resolvedActivityServiceDate);
        const numericParticipantCount = Number(participantCount || 0);
        const numericAdultCount = Number(adultCount || 0);
        const numericChildCount = Number(childCount || 0);
        const hasCounts = numericParticipantCount > 0 || numericAdultCount + numericChildCount > 0;

        if (!hasDateOrItinerary) {
          throw new Error('Activity items require a service date or itinerary day.');
        }

        if (!hasCounts) {
          throw new Error('Activity items require participant counts.');
        }

        if (activeActivityRateVariants.length > 0 && !activityRateVariantId) {
          throw new Error('Activity items require a rate variant.');
        }

        if (reconfirmationRequired && !reconfirmationDueAt) {
          throw new Error('Set a reconfirmation due date when reconfirmation is required.');
        }
      }

      const resolvedTransportServiceId =
        isTransportService
          ? findSupplierServiceForTransportSelection(filteredServices, selectedTransportCandidate || resolvedTransportPricing)?.id || ''
          : serviceId;
      const resolvedHotelServiceId =
        isHotelService
          ? selectedService?.id || filteredServices[0]?.id || serviceId
          : serviceId;

      if (isHotelService && !resolvedHotelServiceId) {
        throw new Error('Hotel catalog service not found for this stay.');
      }

      if (isTransportService && !resolvedTransportServiceId) {
        throw new Error('Transport rate found, but no matching transport catalog service exists for this supplier/pricing mode. No generic fallback transport item was saved.');
      }

      const hasManualSellOverride = sellPrice.trim().length > 0;
      const quoteItemPayload = {
        serviceId: isTransportService ? resolvedTransportServiceId : resolvedHotelServiceId,
        activityId: isActivityService && activityId ? activityId : undefined,
        activityRateVariantId: isActivityService && activityRateVariantId ? activityRateVariantId : undefined,
        ticketRateVariantId: isTicketingService && ticketRateVariantId ? ticketRateVariantId : undefined,
        itineraryId,
        serviceDate:
          (isActivityService || isHotelService || isMealService) && (serviceDate || resolvedActivityServiceDate || resolvedMealServiceDate)
            ? new Date(`${serviceDate || resolvedActivityServiceDate || resolvedMealServiceDate}T09:00:00`).toISOString()
            : undefined,
        startTime: isActivityService ? startTime || null : undefined,
        pickupTime: isActivityService ? pickupTime || null : undefined,
        pickupLocation: isActivityService ? pickupLocation.trim() || null : undefined,
        meetingPoint: isActivityService ? meetingPoint.trim() || null : undefined,
        participantCount: isActivityService ? activityParticipantTotal : undefined,
        adultCount: isActivityService ? Number(adultCount || 0) : undefined,
        childCount: isActivityService ? Number(childCount || 0) : undefined,
        reconfirmationRequired: isActivityService ? reconfirmationRequired : undefined,
        reconfirmationDueAt:
          isActivityService && reconfirmationRequired && reconfirmationDueAt
            ? new Date(reconfirmationDueAt).toISOString()
            : isActivityService
              ? null
              : undefined,
        hotelId: isHotelService ? hotelId : undefined,
        contractId: isHotelService ? contractId : undefined,
        seasonId: isHotelService ? seasonId || undefined : undefined,
        seasonName: isHotelService ? effectiveSeasonName : undefined,
        roomCategoryId: isHotelService ? roomCategoryId : undefined,
        occupancyType: isHotelService ? occupancyType : undefined,
        mealPlan: isHotelService ? mealPlan : undefined,
        customServiceName: isMealService ? mealName.trim() : undefined,
        unitCost: isMealService ? Number(mealCost) : undefined,
        pricingBasis: isMealService ? 'PER_PERSON' : isExternalPackageService ? externalPackage.pricingBasis : undefined,
        ...(isExternalPackageService ? buildExternalPackagePayload(externalPackage) : {}),
        quantity: Number(quantity),
        paxCount: isActivityService ? activityParticipantTotal : Number(paxCount),
        roomCount: isTransportService || isGuideService || isMealService || isTicketingService || isExternalPackageService ? undefined : Number(roomCount),
        nightCount: isTransportService || isGuideService || isMealService || isTicketingService || isExternalPackageService ? undefined : Number(nightCount),
        dayCount: isGuideService || isMealService || isExternalPackageService ? undefined : Number(dayCount),
        overrideCost: overrideCost.trim() ? Number(overrideCost) : null,
        overrideReason: useOverride ? overrideReason.trim() || null : null,
        useOverride,
        markupAmount: markupAmount.trim() ? Number(markupAmount) : null,
        sellPrice: isActivityService && activityRateVariantId && !hasManualSellOverride ? null : hasManualSellOverride ? Number(sellPrice) : null,
        sellPriceOverrideExplicit: hasManualSellOverride,
        markupPercent: Number(markupPercent),
        transportServiceTypeId: isTransportService ? transportServiceTypeId : undefined,
        vehicleRateId: isTransportService ? resolvedTransportPricing?.vehicleRateId || undefined : undefined,
        transportVehicleId: isTransportService ? selectedTransportVehicleId : undefined,
        routeId: isTransportService ? routeId || undefined : undefined,
        routeName: isTransportService ? routeName.trim() : undefined,
        transportAddOns: isTransportService ? selectedTransportAddOnPayload : undefined,
        guideType: isGuideService ? guideType : undefined,
        guideDuration: isGuideService ? guideDuration : undefined,
        overnight: isGuideService ? overnight === 'yes' : undefined,
        currency: isMealService ? mealCurrency.trim().toUpperCase() : isExternalPackageService ? externalPackage.currency.trim().toUpperCase() : undefined,
      };
      const requestUrl = logFetchUrl(endpoint);
      const submitController = isExternalPackageService ? new AbortController() : null;
      const submitTimeoutId = submitController ? window.setTimeout(() => submitController.abort(), 30000) : null;

      logExternalPackageSubmit('calling API endpoint', {
        method: isEditing ? 'PATCH' : 'POST',
        endpoint,
        payload: quoteItemPayload,
      });

      let response: Response;
      try {
        response = await fetch(requestUrl, {
          method: isEditing ? 'PATCH' : 'POST',
          headers: buildAuthHeaders({
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify(quoteItemPayload),
          signal: submitController?.signal,
        });
      } finally {
        if (submitTimeoutId) {
          window.clearTimeout(submitTimeoutId);
        }
      }

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, `Could not ${isEditing ? 'update' : 'add'} quote item.`));
      }

      const savedItem = await readJsonResponse<any>(response, `Could not read ${isEditing ? 'updated' : 'created'} quote item.`);
      notifyQuotePricingChanged(quoteId);
      onSaved?.(savedItem);

      if (!isEditing) {
        setQuantity('1');
        setMarkupPercent('20');
        setMarkupAmount('');
        setSellPrice('');
        setPaxCount(String(defaultPaxCount || 1));
        setParticipantCount(String(defaultPaxCount || 1));
        setAdultCount(String(defaultAdultCount || 0));
        setChildCount(String(defaultChildCount || 0));
        setRoomCount(String(defaultRoomCount || 1));
        setNightCount(String(defaultNightCount || 1));
        setDayCount('1');
        setServiceDate('');
        setStartTime('');
        setPickupTime('');
        setPickupLocation('');
        setMeetingPoint('');
        setReconfirmationRequired(false);
        setReconfirmationDueAt('');
        setBaseCost('');
        setOverrideCost('');
        setOverrideReason('');
        setUseOverride(false);
        setTransportServiceTypeId('');
        setRouteId('');
        setRouteName('');
        setResolvedTransportPricing(null);
        setSelectedTransportAddOns({});
        setContractId('');
        setSeasonId('');
        setSeasonName('');
        setRoomCategoryId('');
        setOccupancyType('DBL');
        setGuideType('local');
        setGuideDuration('full_day');
        setOvernight('no');
        setMealName('');
        setMealCost('');
        setMealCurrency('USD');
        setExternalPackage(createEmptyExternalPackageFormState(selectedService?.currency || 'USD'));
        setHasAttemptedExternalPackageSubmit(false);
        setActiveServiceType(null);
      }
      router.refresh();
    } catch (caughtError) {
      const fallbackMessage = `Could not ${isEditing ? 'update' : 'add'} quote item.`;
      const isAbortError = caughtError instanceof DOMException && caughtError.name === 'AbortError';
      const message = isAbortError
        ? 'External package save timed out before the server responded. Please try again.'
        : caughtError instanceof Error
          ? caughtError.message
          : fallbackMessage;
      logExternalPackageError('save failed', caughtError);
      setError(isTransportService && !message.toLowerCase().includes('transport') ? `Could not add transport item: ${message}` : message);
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleExternalPackageCancel() {
    setError('');
    setHasAttemptedExternalPackageSubmit(false);
    if (onCancel) {
      onCancel();
      return;
    }
    if (!isEditing) {
      setActiveServiceType(null);
    }
  }

  return (
    <div className="service-entry">
      {serviceBlocks.length > 0 ? (
        <div className="form-row form-row-3">
          <label>
            Reusable block
            <select value={selectedBlockId} onChange={(event) => setSelectedBlockId(event.target.value)}>
              <option value="">Select service block</option>
              {serviceBlocks.map((block) => (
                <option key={block.id} value={block.id}>
                  {block.name}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="secondary-button" onClick={() => applyBlock(selectedBlockId)} disabled={!selectedBlockId}>
            Apply block
          </button>
          <Link href="/quote-blocks" className="secondary-button">
            Manage blocks
          </Link>
        </div>
      ) : null}

      {!isEditing ? (
        <div className="service-type-buttons">
          {SERVICE_TYPE_BUTTONS.map((button) => {
            const count =
              button.key === 'activity'
                ? activeActivities.length
                : services.filter((service) => {
                    if (getServiceTypeKey(service) !== button.key) {
                      return false;
                    }

                    if (button.key === 'hotel') {
                      return !isImportedPlaceholderService(service);
                    }

                    return true;
                  }).length;
            const isActive = activeServiceType === button.key;

            return (
              <button
                key={button.key}
                type="button"
                className={isActive ? 'service-type-button service-type-button-active' : 'service-type-button'}
                onClick={() => {
                  setActiveServiceType(button.key);
                  if (button.key === 'externalPackage') {
                    setServiceId('');
                  }
                }}
                disabled={button.key !== 'externalPackage' && count === 0}
              >
                {button.label}
              </button>
            );
          })}
        </div>
      ) : null}

      {!activeServiceType ? (
        <div className="quote-service-empty-state">
          <strong>Select a service type to begin</strong>
          <p>Choose Hotel, Transport, Activity, or Meal to open the matching service form.</p>
        </div>
      ) : null}

      {activeServiceType ? (
        <form id={serviceEntryFormId} ref={formRef} className="entity-form compact-form service-entry-form" onSubmit={handleSubmit} noValidate={isExternalPackageService}>
          <div className="service-entry-form-head">
            <div>
              <strong>{SERVICE_TYPE_BUTTONS.find((button) => button.key === activeServiceType)?.label}</strong>
              <p>{submitLabel}</p>
            </div>
            {!isEditing && !isExternalPackageService ? (
              <button type="button" className="secondary-button" onClick={() => setActiveServiceType(null)}>
                Cancel
              </button>
            ) : null}
          </div>

          {isEditing && !isExternalPackageService && !(activeServiceType === 'activity' && hasActivityRateVariants) ? (
            <label>
              {activeServiceType === 'transport'
                ? 'Transport selector'
                : activeServiceType === 'activity'
                  ? 'Activity selector'
                  : activeServiceType === 'ticketing'
                    ? 'Ticketing service'
                    : activeServiceType === 'meal'
                      ? 'Meal service'
                      : 'Service'}
              <select
                value={serviceId}
                onChange={(event) => {
                  setServiceId(event.target.value);
                  if (isTransportService) {
                    setTransportSuggestionOverridden(true);
                  }
                }}
                required
                disabled={filteredServices.length === 0}
              >
                {filteredServices.length === 0 ? (
                  <option value="">No services available for this type</option>
                ) : (
                  filteredServices.map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.name} ({service.unitType})
                    </option>
                  ))
                )}
              </select>
            </label>
          ) : null}

          {!isEditing && activeServiceType && activeServiceType !== 'hotel' && activeServiceType !== 'activity' ? (
            <section className="quote-hotel-step-panel quote-hotel-step-panel-primary">
              <div className="quote-hotel-step-head">
                <div>
                  <p className="eyebrow">Step 1</p>
                  <h3>{selectionStepTitle}</h3>
                  <p className="detail-copy">
                    {activeServiceType === 'externalPackage'
                      ? 'Create a quote-only package or choose a saved package template.'
                      : 'Select the service first. Route, date, pax, pricing, and markup fields appear next.'}
                  </p>
                </div>
                {activeServiceType === 'externalPackage' || serviceId ? <span className="page-tab-badge">Selected</span> : null}
              </div>

              {activeServiceType === 'externalPackage' ? (
                <div className="quote-service-selection-stack">
                  <div className="quote-service-picker-grid" role="listbox" aria-label="External package source">
                    <button
                      type="button"
                      className={!serviceId ? 'quote-hotel-choice-card quote-hotel-choice-card-active' : 'quote-hotel-choice-card'}
                      onClick={() => {
                        setServiceId('');
                        setExternalPackage(createEmptyExternalPackageFormState(externalPackage.currency || 'USD'));
                      }}
                      role="option"
                      aria-selected={!serviceId}
                    >
                      <strong>Create one-off package</strong>
                      <span>Quote-only partner package</span>
                      <em>No catalog service required</em>
                    </button>
                    {filteredServices.slice(0, 3).map((service) => {
                      const isSelected = service.id === serviceId;

                      return (
                        <button
                          key={service.id}
                          type="button"
                          className={isSelected ? 'quote-hotel-choice-card quote-hotel-choice-card-active' : 'quote-hotel-choice-card'}
                          onClick={() => setServiceId(service.id)}
                          role="option"
                          aria-selected={isSelected}
                        >
                          <strong>{service.name}</strong>
                          <span>{service.serviceType?.name || service.category || service.unitType}</span>
                          <em>{service.currency} {Number(service.baseCost || 0).toFixed(2)}</em>
                        </button>
                      );
                    })}
                  </div>

                  <label>
                    Saved package template
                    <select value={serviceId} onChange={(event) => setServiceId(event.target.value)}>
                      <option value="">Create one-off package</option>
                      {filteredServices.map((service) => (
                        <option key={service.id} value={service.id}>
                          {service.name} ({service.unitType})
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ) : filteredServices.length === 0 ? (
                <div className="quote-service-empty-state">
                  <strong>No services available</strong>
                  <p>Create a catalog service for this type before adding it to the quote.</p>
                </div>
              ) : (
                <div className="quote-service-selection-stack">
                  <div className="quote-smart-suggestion-section">
                    <div className="quote-smart-suggestion-section-head">
                      <h5>Suggested for this day</h5>
                      <span>{Math.min(3, filteredServices.length)}</span>
                    </div>
                    <div className="quote-service-picker-grid" role="listbox" aria-label={selectionStepTitle}>
                      {filteredServices.slice(0, 3).map((service) => {
                        const isSelected = service.id === serviceId;

                        return (
                          <button
                            key={service.id}
                            type="button"
                            className={isSelected ? 'quote-hotel-choice-card quote-hotel-choice-card-active' : 'quote-hotel-choice-card'}
                            onClick={() => {
                              setServiceId(service.id);
                              if (getServiceTypeKey(service) === 'transport') {
                                setTransportSuggestionOverridden(true);
                              }
                            }}
                            role="option"
                            aria-selected={isSelected}
                          >
                            <strong>{service.name}</strong>
                            <span>{service.serviceType?.name || service.category || service.unitType}</span>
                            <em>{service.currency} {Number(service.baseCost || 0).toFixed(2)}</em>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="quote-smart-suggestion-section">
                    <div className="quote-smart-suggestion-section-head">
                      <h5>Recent services</h5>
                      <span>0</span>
                    </div>
                    <p className="detail-copy">Recent selections from the suggestion drawer appear before this form.</p>
                  </div>

                  <label>
                    All services
                    <select
                      value={serviceId}
                      onChange={(event) => {
                        setServiceId(event.target.value);
                        if (activeServiceType === 'transport') {
                          setTransportSuggestionOverridden(true);
                        }
                      }}
                      required
                    >
                      <option value="">Select {SERVICE_TYPE_BUTTONS.find((button) => button.key === activeServiceType)?.label || 'service'}</option>
                      {filteredServices.map((service) => (
                        <option key={service.id} value={service.id}>
                          {service.name} ({service.unitType})
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
            </section>
          ) : null}

          {hasPrimarySelection && isTicketingService && activeTicketRateVariants.length > 0 ? (
            <section className="quote-hotel-step-panel quote-transport-step-panel">
              <div className="quote-hotel-step-head">
                <div>
                  <p className="eyebrow">Ticket variant</p>
                  <h3>Select ticket option</h3>
                  <p className="detail-copy">Choose the operational ticket variant before confirming pricing.</p>
                </div>
                {selectedTicketRateVariant ? <span className="page-tab-badge">Variant selected</span> : null}
              </div>

              <div className="quote-transport-step-fields">
                <label>
                  Variant
                  <select value={ticketRateVariantId} onChange={(event) => setTicketRateVariantId(event.target.value)} required>
                    {activeTicketRateVariants.map((variant) => (
                      <option key={variant.id} value={variant.id}>
                        {variant.label} - {variant.currency} {Number(variant.costPrice || 0).toFixed(2)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </section>
          ) : null}

          {hasPrimarySelection && isTicketingService ? (
            <section className="quote-hotel-step-panel quote-transport-step-panel">
              <div className="quote-hotel-step-head">
                <div>
                  <p className="eyebrow">Ticket pricing</p>
                  <h3>Pax, unit, and markup</h3>
                  <p className="detail-copy">Ticket items use ticket basis and pax. Room and night fields are not used.</p>
                </div>
              </div>

              <div className="quote-transport-step-fields">
                <label>
                  Pax
                  <input value={paxCount} onChange={(event) => setPaxCount(event.target.value)} type="number" min="1" required />
                </label>

                <label>
                  Service units
                  <input value={quantity} onChange={(event) => setQuantity(event.target.value)} type="number" min="1" required />
                </label>

                <label>
                  Pricing basis
                  <input value={ticketPricingBasis.replace(/_/g, ' ')} readOnly />
                </label>

                <label>
                  Unit price
                  <input
                    value={Number.isFinite(ticketUnitCost) ? `${ticketNativeCurrency} ${ticketUnitCost.toFixed(2)}` : ''}
                    readOnly
                    placeholder="Select ticket rate"
                  />
                </label>

                <label>
                  Markup %
                  <input
                    value={markupPercent}
                    onChange={(event) => setMarkupPercent(event.target.value)}
                    type="number"
                    min="0"
                    step="0.01"
                    required
                  />
                </label>
              </div>

              <div className="quote-selected-transport-card quote-selected-transport-card-active">
                <div className="quote-selected-transport-summary">
                  <div>
                    <span>Operational units</span>
                    <strong>{ticketOperationalUnits}</strong>
                  </div>
                  <div>
                    <span>Unit sell</span>
                    <strong>{ticketUnitSell > 0 ? `${ticketNativeCurrency} ${ticketUnitSell.toFixed(2)}` : 'Markup based'}</strong>
                  </div>
                  <div>
                    <span>Total cost</span>
                    <strong>{displayCurrency} {finalCost !== null && Number.isFinite(finalCost) ? finalCost.toFixed(2) : '0.00'}</strong>
                  </div>
                  <div>
                    <span>Total sell</span>
                    <strong>{displayCurrency} {finalSellPrice !== null && Number.isFinite(finalSellPrice) ? finalSellPrice.toFixed(2) : '0.00'}</strong>
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          {!isEditing && preferredServiceId && activeServiceType !== 'hotel' ? (
            <p className="form-helper">Catalog selection applied. You can keep this service or switch to another option before saving.</p>
          ) : null}
          {!isEditing && preferredHotelId && isHotelService ? (
            <p className="form-helper">Catalog hotel selection applied. Complete the contract and rate fields below to finish the stay setup.</p>
          ) : null}
          {!isEditing && preferredRouteId && isTransportService ? (
            <p className="form-helper">Catalog route selection applied. Choose the transport service type to complete transfer pricing.</p>
          ) : null}

          {isHotelService ? (
            <section className="quote-hotel-step-panel quote-hotel-step-panel-primary quote-transport-step-panel">
              <div className="quote-hotel-step-head">
                <div>
                  <p className="eyebrow">Step 1</p>
                  <h3>Stay details</h3>
                  <p className="detail-copy">Set the property, dates, rooms, and pax before choosing the contract rate.</p>
                </div>
                {selectedHotel ? <span className="page-tab-badge">Stay started</span> : null}
              </div>

              {hotels.length === 0 ? (
                <div className="quote-service-empty-state">
                  <strong>Create a hotel first</strong>
                  <p>Hotel services need a property before contract rates can be selected.</p>
                </div>
              ) : (
                <div className="quote-transport-step-fields">
                  <label>
                    Hotel
                    <select
                      value={hotelId}
                      onChange={(event) => {
                        setHotelId(event.target.value);
                        setContractId('');
                        setSeasonId('');
                        setSeasonName('');
                        setRoomCategoryId('');
                        setOccupancyType('DBL');
                        setMealPlan('BB');
                        setManualHotelRateDraft(null);
                        setHotelRateReference(null);
                      }}
                      required
                    >
                      <option value="">Select hotel</option>
                      {hotels.map((hotel) => {
                        const preview = hotelRatePreviewByHotelId.get(hotel.id);

                        return (
                          <option key={hotel.id} value={hotel.id}>
                            {hotel.name}
                            {preview ? ` - from ${preview.currency} ${Number(preview.cost || 0).toFixed(2)}` : ''}
                          </option>
                        );
                      })}
                    </select>
                  </label>

                  <label>
                    Check-in date
                    <input value={hotelCheckInDate} onChange={(event) => setServiceDate(event.target.value)} type="date" required />
                  </label>

                  <label>
                    Nights
                    <input value={nightCount} onChange={(event) => setNightCount(event.target.value)} type="number" min="1" required />
                  </label>

                  <label>
                    Rooms
                    <input value={roomCount} onChange={(event) => setRoomCount(event.target.value)} type="number" min="1" required />
                  </label>

                  <label>
                    Pax
                    <input value={paxCount} onChange={(event) => setPaxCount(event.target.value)} type="number" min="1" required />
                  </label>

                </div>
              )}
            </section>
          ) : null}

          {isHotelService && !hotelId ? (
            <div className="quote-service-empty-state">
              <strong>Select a hotel to continue</strong>
              <p>Contract, room, season, and pricing controls will appear after this step.</p>
            </div>
          ) : null}
          {hasPrimarySelection && !isTransportService && !isHotelService && !isActivityService && !isTicketingService ? (
          <div className="form-row form-row-4">
            {!isTransportService ? (
              <label>
                Quantity
                <input value={quantity} onChange={(event) => setQuantity(event.target.value)} type="number" min="1" required disabled={isMealService} />
              </label>
            ) : null}

            <label>
              Markup %
              <input
                value={markupPercent}
                onChange={(event) => setMarkupPercent(event.target.value)}
                type="number"
                min="0"
                step="0.01"
                required
              />
            </label>

            {!isTransportService && !isMealService && !isExternalPackageService ? (
              <label>
                Contract price / base cost
                <input
                  value={baseCost}
                  type="number"
                  min="0"
                  step="0.01"
                  readOnly
                  placeholder={
                    isHotelService
                      ? 'Auto from hotel rates'
                      : isGuideService
                        ? 'Auto from guide setup'
                        : 'Auto from service'
                  }
                />
              </label>
            ) : null}

            {!isTransportService && !isGuideService && !isMealService && !isExternalPackageService ? (
              <label>
                Day count
                <input value={dayCount} onChange={(event) => setDayCount(event.target.value)} type="number" min="1" required />
              </label>
            ) : null}
          </div>
          ) : null}

          {hasPrimarySelection && !isTransportService && !isHotelService && !isActivityService && !isTicketingService ? (
          <div className="form-row form-row-4">
            <label>
              Cost
              <input value={finalCost !== null && Number.isFinite(finalCost) ? finalCost.toFixed(2) : ''} readOnly placeholder="Select cost inputs" />
            </label>

            <label>
              Markup amount
              <input
                value={markupAmount}
                onChange={(event) => setMarkupAmount(event.target.value)}
                type="number"
                min="0"
                step="0.01"
                placeholder="Overrides percent"
              />
            </label>

            <label>
              Sell price override
              <input
                value={sellPrice}
                onChange={(event) => setSellPrice(event.target.value)}
                type="number"
                min="0"
                step="0.01"
                placeholder="Optional"
              />
            </label>

            <div className={sellPrice.trim() ? 'quote-item-override-status quote-item-override-status-active' : 'quote-item-override-status'}>
              <strong>Final sell price</strong>
              <span>
                {finalSellPrice !== null && Number.isFinite(finalSellPrice)
                  ? `${displayCurrency} ${finalSellPrice.toFixed(2)}`
                  : 'Waiting for cost'}
              </span>
            </div>
          </div>
          ) : null}

          {hasPrimarySelection && !isHotelService && !isMealService && !isTransportService && !isActivityService && !isTicketingService ? (
            <details className="quote-advanced-settings" open={useOverride}>
              <summary>Advanced cost settings</summary>

              <div className="form-row form-row-3">
                <label className={useOverride ? 'quote-item-override quote-item-override-active' : 'quote-item-override'}>
                  <span>Override cost</span>
                  <input
                    value={overrideCost}
                    onChange={(event) => setOverrideCost(event.target.value)}
                    type="number"
                    min="0"
                    step="0.01"
                    disabled={!useOverride}
                    placeholder="Leave blank to use base cost"
                  />
                </label>

                <label className="quote-item-override-toggle">
                  <span>Use override</span>
                  <input checked={useOverride} onChange={(event) => setUseOverride(event.target.checked)} type="checkbox" />
                </label>

                <div
                  className={useOverride ? 'quote-item-override-status quote-item-override-status-active' : 'quote-item-override-status'}
                >
                  <strong>{useOverride ? 'Manual override applied' : 'Using contract/base cost'}</strong>
                  <span>
                    {finalCost !== null && Number.isFinite(finalCost)
                      ? `Final cost ${displayCurrency} ${finalCost.toFixed(2)}`
                      : isLoadingTransportCost
                        ? 'Loading transport rate...'
                        : 'Select pricing inputs'}
                  </span>
                </div>
              </div>

              {useOverride ? (
                <div className="form-row">
                  <label>
                    Override reason
                    <input
                      value={overrideReason}
                      onChange={(event) => setOverrideReason(event.target.value)}
                      placeholder="Reason for this quote-only rate"
                    />
                  </label>
                </div>
              ) : null}
            </details>
          ) : null}

          {hasPrimarySelection && !isTransportService && !isHotelService && !isActivityService && !isTicketingService ? (
          <div className="form-row form-row-3">
            <label>
              Pax count
              <input value={paxCount} onChange={(event) => setPaxCount(event.target.value)} type="number" min="1" required />
            </label>

            {!isHotelService && !isTransportService && !isGuideService && !isMealService && !isExternalPackageService ? (
              <label>
                Room count
                <input value={roomCount} onChange={(event) => setRoomCount(event.target.value)} type="number" min="1" required />
              </label>
            ) : null}

            {!isTransportService && !isGuideService && !isMealService && !isExternalPackageService ? (
              <label>
                Night count
                <input value={nightCount} onChange={(event) => setNightCount(event.target.value)} type="number" min="1" required />
              </label>
            ) : null}
          </div>
          ) : null}

          {hasPrimarySelection && isGuideService ? (
            <div className="form-row form-row-3">
              <label>
                Guide type
                <select value={guideType} onChange={(event) => setGuideType(event.target.value as 'local' | 'escort')} required>
                  <option value="local">Local</option>
                  <option value="escort">Escort</option>
                </select>
              </label>

              <label>
                Duration
                <select
                  value={guideDuration}
                  onChange={(event) => setGuideDuration(event.target.value as 'half_day' | 'full_day')}
                  required
                >
                  <option value="half_day">Half day</option>
                  <option value="full_day">Full day</option>
                </select>
              </label>

              <label>
                Overnight
                <select value={overnight} onChange={(event) => setOvernight(event.target.value as 'no' | 'yes')} required>
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                </select>
              </label>
            </div>
          ) : null}

          {hasPrimarySelection && isMealService ? (
            <>
              <div className="form-row form-row-4">
                <label>
                  Meal name
                  <input value={mealName} onChange={(event) => setMealName(event.target.value)} placeholder="Lunch in Petra" required />
                </label>

                <label>
                  Meal date
                  <input value={serviceDate} onChange={(event) => setServiceDate(event.target.value)} type="date" required={!resolvedMealServiceDate} />
                </label>

                <label>
                  Cost per person
                  <input value={mealCost} onChange={(event) => setMealCost(event.target.value)} type="number" min="0" step="0.01" required />
                </label>

                <label>
                  Currency
                  <input value={mealCurrency} onChange={(event) => setMealCurrency(event.target.value.toUpperCase())} maxLength={3} required />
                </label>
              </div>

              <div className="quote-item-override-status quote-item-override-status-active">
                <strong>Pricing basis: PER_PERSON</strong>
                <span>
                  {Number.isFinite(finalCost ?? Number.NaN)
                    ? `Meal total ${displayCurrency} ${(finalCost ?? 0).toFixed(2)} for ${Math.max(1, Number(paxCount || defaultPaxCount || 1))} pax`
                    : 'Enter cost and pax to price this meal'}
                </span>
              </div>
              {resolvedMealServiceDate && !serviceDate ? (
                <p className="form-helper">Resolved from travel start date and itinerary day: {resolvedMealServiceDate}</p>
              ) : null}
            </>
          ) : null}

          {hasPrimarySelection && isExternalPackageService ? (
            <section className="quote-external-package-editor">
              <div className="quote-external-package-tabs" role="tablist" aria-label="External country package sections">
                {EXTERNAL_PACKAGE_SECTION_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={externalPackageSection === tab.id}
                    className={externalPackageSection === tab.id ? 'quote-external-package-tab quote-external-package-tab-active' : 'quote-external-package-tab'}
                    onClick={() => setExternalPackageSection(tab.id)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {externalPackageSection === 'basics' ? (
                <div className="quote-external-package-section">
                  <div className="form-row form-row-2">
                    <label>
                      Country
                      <input value={externalPackage.country} onChange={(event) => setExternalPackage((current) => ({ ...current, country: event.target.value }))} placeholder="Egypt" required />
                    </label>
                    <label>
                      Supplier name
                      <input value={externalPackage.supplierName} onChange={(event) => setExternalPackage((current) => ({ ...current, supplierName: event.target.value }))} placeholder="Internal supplier" />
                    </label>
                  </div>
                  <div className="form-row form-row-2">
                    <label>
                      Package name
                      <input value={externalPackage.packageName} onChange={(event) => setExternalPackage((current) => ({ ...current, packageName: event.target.value }))} placeholder="Cairo extension" required />
                    </label>
                    <label>
                      Currency
                      <input value={externalPackage.currency} onChange={(event) => setExternalPackage((current) => ({ ...current, currency: event.target.value.toUpperCase() }))} maxLength={3} required />
                    </label>
                  </div>
                  <div className="form-row form-row-4">
                    <label>
                      Start day
                      <input value={externalPackage.startDay} onChange={(event) => setExternalPackage((current) => ({ ...current, startDay: event.target.value }))} type="number" min="1" />
                    </label>
                    <label>
                      End day
                      <input value={externalPackage.endDay} onChange={(event) => setExternalPackage((current) => ({ ...current, endDay: event.target.value }))} type="number" min="1" />
                    </label>
                    <label>
                      Start date
                      <input value={externalPackage.startDate} onChange={(event) => setExternalPackage((current) => ({ ...current, startDate: event.target.value }))} type="date" />
                    </label>
                    <label>
                      End date
                      <input value={externalPackage.endDate} onChange={(event) => setExternalPackage((current) => ({ ...current, endDate: event.target.value }))} type="date" />
                    </label>
                  </div>
                </div>
              ) : null}

              {externalPackageSection === 'pricing' ? (
                <div className="quote-external-package-section">
                  <div className="form-row form-row-4">
                    <label>
                      Pricing basis
                      <select value={externalPackage.pricingBasis} onChange={(event) => setExternalPackage((current) => ({ ...current, pricingBasis: event.target.value as ExternalPackagePricingBasis }))} required>
                        {EXTERNAL_PACKAGE_PRICING_BASIS_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Fallback net cost
                      <input value={externalPackage.netCost} onChange={(event) => setExternalPackage((current) => ({ ...current, netCost: event.target.value }))} type="number" min="0" step="0.01" placeholder="Optional with matrix" />
                    </label>
                    <label>
                      Single supplement
                      <input value={externalPackage.singleSupplement} onChange={(event) => setExternalPackage((current) => ({ ...current, singleSupplement: event.target.value }))} type="number" min="0" step="0.01" placeholder="500" />
                    </label>
                    <div className="quote-item-override-status quote-item-override-status-active">
                      <strong>Current total uses fallback cost</strong>
                      <span>{finalCost !== null && Number.isFinite(finalCost) ? `${displayCurrency} ${finalCost.toFixed(2)}` : 'Enter net cost'}</span>
                    </div>
                  </div>

                  <div className="quote-external-matrix-table">
                    <div className="quote-external-matrix-head">
                      <strong>Pax slab</strong>
                      <strong>From</strong>
                      <strong>To</strong>
                      <strong>FOC</strong>
                      <strong>Cost pp</strong>
                      <strong>Sell pp</strong>
                      <strong>Notes</strong>
                      <span />
                    </div>
                    {externalPackage.pricingMatrixRows.map((row) => (
                      <div key={row.id} className="quote-external-matrix-row">
                        <input value={row.label} onChange={(event) => updateExternalPackageMatrixRow(row.id, { label: event.target.value })} placeholder="20+1" />
                        <input value={row.paxFrom} onChange={(event) => updateExternalPackageMatrixRow(row.id, { paxFrom: event.target.value })} type="number" min="0" placeholder="20" />
                        <input value={row.paxTo} onChange={(event) => updateExternalPackageMatrixRow(row.id, { paxTo: event.target.value })} type="number" min="0" />
                        <input value={row.freePax} onChange={(event) => updateExternalPackageMatrixRow(row.id, { freePax: event.target.value })} type="number" min="0" placeholder="1" />
                        <input value={row.costPerPerson} onChange={(event) => updateExternalPackageMatrixRow(row.id, { costPerPerson: event.target.value })} type="number" min="0" step="0.01" placeholder="893" />
                        <input value={row.sellPerPerson} onChange={(event) => updateExternalPackageMatrixRow(row.id, { sellPerPerson: event.target.value })} type="number" min="0" step="0.01" />
                        <input value={row.notes} onChange={(event) => updateExternalPackageMatrixRow(row.id, { notes: event.target.value })} placeholder="Supplier notes" />
                        <button type="button" className="compact-button" onClick={() => removeExternalPackageMatrixRow(row.id)}>Remove</button>
                      </div>
                    ))}
                    <button type="button" className="secondary-button" onClick={addExternalPackageMatrixRow}>+ Add matrix row</button>
                  </div>
                </div>
              ) : null}

              {externalPackageSection === 'hotels' ? (
                <div className="quote-external-package-section">
                  <label>
                    Hotels or Similar
                    <textarea className="quote-external-large-textarea" value={externalPackage.hotelsOrSimilar} onChange={(event) => setExternalPackage((current) => ({ ...current, hotelsOrSimilar: event.target.value }))} placeholder={`Cairo: Steigenberger / Concorde\nLuxor: Sonesta / Jolie Ville`} />
                  </label>
                </div>
              ) : null}

              {externalPackageSection === 'clientText' ? (
                <div className="quote-external-package-section quote-external-package-text-grid">
                  <label>
                    Client itinerary text
                    <textarea className="quote-external-large-textarea" value={externalPackage.clientItineraryText} onChange={(event) => setExternalPackage((current) => ({ ...current, clientItineraryText: event.target.value }))} placeholder="Client-facing program description" required />
                  </label>
                  <label>
                    Includes
                    <textarea className="quote-external-large-textarea" value={externalPackage.includes} onChange={(event) => setExternalPackage((current) => ({ ...current, includes: event.target.value }))} placeholder="Client-facing inclusions" />
                  </label>
                  <label>
                    Excludes
                    <textarea className="quote-external-large-textarea" value={externalPackage.excludes} onChange={(event) => setExternalPackage((current) => ({ ...current, excludes: event.target.value }))} placeholder="Client-facing exclusions" />
                  </label>
                </div>
              ) : null}

              {externalPackageSection === 'internalNotes' ? (
                <div className="quote-external-package-section">
                  <label>
                    Internal notes
                    <textarea className="quote-external-large-textarea" value={externalPackage.internalNotes} onChange={(event) => setExternalPackage((current) => ({ ...current, internalNotes: event.target.value }))} placeholder="Internal only" />
                  </label>
                </div>
              ) : null}
            </section>
          ) : null}

          {activeServiceType === 'activity' ? (
            <>
              <section className="quote-hotel-step-panel quote-hotel-step-panel-primary quote-transport-step-panel">
                <div className="quote-hotel-step-head">
                  <div>
                    <p className="eyebrow">Step 1</p>
                    <h3>Select activity</h3>
                    <p className="detail-copy">Choose the activity, date, and participant count before confirming the quote item.</p>
                  </div>
                  {selectedService ? <span className="page-tab-badge">Activity selected</span> : null}
                </div>

                {activeActivities.length === 0 ? (
                  <div className="quote-service-empty-state">
                    <strong>No activities available</strong>
                    <p>Create an Activity Master record before adding it to the quote.</p>
                  </div>
                ) : (
                  <div className="quote-transport-step-fields">
                    <label>
                      Activity
                      <select
                        value={activityId}
                        onChange={(event) => {
                          const nextActivityId = event.target.value;
                          const nextActivity = activeActivities.find((activity) => activity.id === nextActivityId) || null;
                          setActivityId(nextActivityId);
                          setActivityRateVariantId(nextActivity?.rateVariants?.find((variant) => variant.active !== false)?.id || '');
                          setServiceId(getActivityServiceBridge(nextActivity, services)?.id || '');
                        }}
                        required
                      >
                        <option value="">Select activity</option>
                        {activeActivities.map((activity) => (
                          <option key={activity.id} value={activity.id}>
                            {activity.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    {hasActivityRateVariants ? (
                      <label>
                        Rate variant
                        <select value={activityRateVariantId} onChange={(event) => setActivityRateVariantId(event.target.value)} required>
                          {activeActivityRateVariants.map((variant) => (
                            <option key={variant.id} value={variant.id}>
                              {variant.name}
                              {variant.currency ? ` - ${variant.currency}` : ''}
                              {variant.durationMinutes ? ` - ${variant.durationMinutes} min` : ''}
                              {variant.minPax || variant.maxPax ? ` - pax ${variant.minPax || 1}-${variant.maxPax || 'open'}` : ''}
                              {variant.maxPaxPerUnit ? ` - max ${variant.maxPaxPerUnit} pax/unit` : ''}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}

                    <label>
                      Date
                      <input value={serviceDate} onChange={(event) => setServiceDate(event.target.value)} type="date" />
                    </label>

                    <label>
                      Participant count
                      <input value={participantCount} onChange={(event) => setParticipantCount(event.target.value)} type="number" min="1" required />
                    </label>

                    <label>
                      Pricing basis
                      <input value={activityPricingBasis.replace(/_/g, ' ')} readOnly />
                    </label>
                  </div>
                )}
              </section>

              <section className="quote-hotel-step-panel quote-transport-step-panel">
                <div className="quote-hotel-step-head">
                  <div>
                    <p className="eyebrow">Step 2</p>
                    <h3>Review & confirm</h3>
                    <p className="detail-copy">Review participant pricing before adding this activity to the quote.</p>
                  </div>
                </div>

                {isActivitySelected ? (
                  <div className="quote-selected-transport-card quote-selected-transport-card-active">
                    <div className="quote-selected-transport-summary">
                      <span>
                        Activity
                        <strong>{selectedActivity?.name || selectedService?.name || 'Selected activity'}</strong>
                      </span>
                      {selectedActivityRateVariant ? (
                        <span>
                          Variant
                          <strong>{selectedActivityRateVariant.name}</strong>
                        </span>
                      ) : null}
                      <span>
                        Pricing basis
                        <strong>{activityPricingBasis.replace(/_/g, ' ')}</strong>
                      </span>
                      <span>
                        Participants
                        <strong>{activityParticipantTotal}</strong>
                      </span>
                      {activityPricingBasis === 'PER_GROUP' && !activityCapacityUnits ? (
                        <span>
                          Charged units
                          <strong>1 group</strong>
                        </span>
                      ) : null}
                      {activityCapacityUnits ? (
                        <span>
                          Required units
                          <strong>{activityCapacityUnits}</strong>
                        </span>
                      ) : null}
                      {activityCapacityUnits && activityMaxPaxPerUnit ? (
                        <span>
                          Capacity logic
                          <strong>
                            ceil({activityParticipantTotal} / {activityMaxPaxPerUnit}) = {activityCapacityUnits}
                          </strong>
                        </span>
                      ) : null}
                      <span>
                        Unit cost
                        <strong>
                          {displayCurrency} {Number.isFinite(activityUnitRate) ? activityUnitRate.toFixed(2) : '0.00'}
                          {activityCapacityUnits ? ` x ${activityCapacityUnits}` : (selectedActivityRateVariant?.pricingBasis ?? selectedActivity?.pricingBasis) === 'PER_GROUP' ? ' group' : ''}
                        </strong>
                      </span>
                      <span>
                        Unit sell
                        <strong>
                          {displayCurrency} {Number.isFinite(activityUnitSellRate) ? activityUnitSellRate.toFixed(2) : '0.00'}
                          {activityCapacityUnits ? ` x ${activityCapacityUnits}` : (selectedActivityRateVariant?.pricingBasis ?? selectedActivity?.pricingBasis) === 'PER_GROUP' ? ' group' : ''}
                        </strong>
                      </span>
                      <span>
                        Total cost
                        <strong>{displayCurrency} {finalCost !== null && Number.isFinite(finalCost) ? finalCost.toFixed(2) : '0.00'}</strong>
                      </span>
                      <span>
                        Total sell
                        <strong>{displayCurrency} {finalSellPrice !== null && Number.isFinite(finalSellPrice) ? finalSellPrice.toFixed(2) : '0.00'}</strong>
                      </span>
                      <span>
                        Margin
                        <strong>{displayCurrency} {finalMargin !== null && Number.isFinite(finalMargin) ? finalMargin.toFixed(2) : '0.00'}</strong>
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="quote-service-empty-state">
                    <strong>Choose an activity</strong>
                    <p>The Add Activity button is enabled after an activity is selected.</p>
                  </div>
                )}

                <button
                  type="submit"
                  className="quote-transport-add-button"
                  disabled={isSubmitting || !isActivitySelected}
                >
                  {isSubmitting ? 'Saving...' : 'Add Activity'}
                </button>
              </section>

              <details className="quote-advanced-settings" open={useOverride}>
                <summary>More options</summary>

                <div className="form-row form-row-3">
                  <label>
                    Markup %
                    <input
                      value={markupPercent}
                      onChange={(event) => setMarkupPercent(event.target.value)}
                      type="number"
                      min="0"
                      step="0.01"
                      required
                    />
                  </label>

                  <label>
                    Markup amount
                    <input
                      value={markupAmount}
                      onChange={(event) => setMarkupAmount(event.target.value)}
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Overrides percent"
                    />
                  </label>

                  <label>
                    Sell price override
                    <input
                      value={sellPrice}
                      onChange={(event) => setSellPrice(event.target.value)}
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Optional"
                    />
                  </label>
                </div>

                <div className="form-row form-row-2">
                  <label className={useOverride ? 'quote-item-override quote-item-override-active' : 'quote-item-override'}>
                    <span>Override cost</span>
                    <input
                      value={overrideCost}
                      onChange={(event) => setOverrideCost(event.target.value)}
                      type="number"
                      min="0"
                      step="0.01"
                      disabled={!useOverride}
                      placeholder="Leave blank to use rate x participants"
                    />
                  </label>

                  <label className="quote-item-override-toggle">
                    <span>Use override</span>
                    <input checked={useOverride} onChange={(event) => setUseOverride(event.target.checked)} type="checkbox" />
                  </label>
                </div>

                {useOverride ? (
                  <div className="form-row">
                    <label>
                      Override reason
                      <input
                        value={overrideReason}
                        onChange={(event) => setOverrideReason(event.target.value)}
                        placeholder="Reason for this quote-only rate"
                      />
                    </label>
                  </div>
                ) : null}

                <div className="form-row form-row-3">
                  <label>
                    Resolved service date
                    <input value={serviceDate || resolvedActivityServiceDate || ''} readOnly placeholder="Needs service date or travel start date + itinerary day" />
                  </label>

                  <label>
                    Start time
                    <input value={startTime} onChange={(event) => setStartTime(event.target.value)} type="time" />
                  </label>

                  <label>
                    Pickup time
                    <input value={pickupTime} onChange={(event) => setPickupTime(event.target.value)} type="time" />
                  </label>
                </div>

                <div className="form-row form-row-3">
                  <label>
                    Pickup location
                    <input value={pickupLocation} onChange={(event) => setPickupLocation(event.target.value)} placeholder="Hotel lobby" />
                  </label>

                  <label>
                    Meeting point
                    <input value={meetingPoint} onChange={(event) => setMeetingPoint(event.target.value)} placeholder="Visitor center" />
                  </label>

                  <label>
                    Adult count
                    <input value={adultCount} onChange={(event) => setAdultCount(event.target.value)} type="number" min="0" />
                  </label>
                </div>

                <div className="form-row form-row-3">
                  <label>
                    Child count
                    <input value={childCount} onChange={(event) => setChildCount(event.target.value)} type="number" min="0" />
                  </label>

                  <label className="quote-item-override-toggle">
                    <span>Reconfirmation required</span>
                    <input
                      checked={reconfirmationRequired}
                      onChange={(event) => setReconfirmationRequired(event.target.checked)}
                      type="checkbox"
                    />
                  </label>

                  <label>
                    Reconfirmation due
                    <input
                      value={reconfirmationDueAt}
                      onChange={(event) => setReconfirmationDueAt(event.target.value)}
                      type="datetime-local"
                      disabled={!reconfirmationRequired}
                    />
                  </label>
                </div>
              </details>

              {itineraryId ? <p className="form-helper">Leave service date blank to use the assigned itinerary day.</p> : null}
              {resolvedActivityServiceDate && !serviceDate ? (
                <p className="form-helper">Resolved from travel start date and itinerary day: {resolvedActivityServiceDate}</p>
              ) : null}
              {activityIssues.map((issue) => (
                <p key={issue} className="form-error">
                  {issue}
                </p>
              ))}

            </>
          ) : null}

          {isHotelService && hotelId ? (
            <section className="quote-hotel-step-panel quote-transport-step-panel">
              <div className="quote-hotel-step-head">
                <div>
                  <p className="eyebrow">Step 2</p>
                  <h3>Choose contract/rate</h3>
                  <p className="detail-copy">Select the contracted room rate. Preview totals use the selected rate as a unit rate.</p>
                </div>
                {selectedHotelBaseRate ? <span className="page-tab-badge">Rate selected</span> : null}
              </div>

              <div className="quote-transport-step-fields">
                <label>
                  Contract
                  <select value={contractId} onChange={(event) => setContractId(event.target.value)} required disabled={filteredHotelContracts.length === 0}>
                    {filteredHotelContracts.length === 0 ? <option value="">No contracts for this hotel</option> : null}
                    {filteredHotelContracts.map((contract) => (
                      <option key={contract.id} value={contract.id}>
                        {contract.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Season
                  <select
                    value={selectedSeasonValue}
                    onChange={(event) => {
                      if (event.target.value.startsWith('legacy:')) {
                        setSeasonId('');
                        setSeasonName(event.target.value.slice('legacy:'.length));
                        return;
                      }

                      const nextSeason = seasons.find((season) => season.id === event.target.value) || null;
                      setSeasonId(nextSeason?.id || '');
                      setSeasonName(nextSeason?.name || '');
                    }}
                    required
                    disabled={availableSeasons.length === 0}
                  >
                    {availableSeasons.length === 0 ? <option value="">No seasons in hotel rates</option> : null}
                    {availableSeasons.map((season) => (
                      <option key={season.id} value={season.id}>
                        {formatDisplayLabel(season.name)}
                      </option>
                    ))}
                    {!selectedSeason && seasonName ? (
                      <option value={`legacy:${seasonName}`} hidden>
                        {formatDisplayLabel(seasonName)}
                      </option>
                    ) : null}
                  </select>
                </label>

                <label>
                  Room category
                  <select
                    value={roomCategoryId}
                    onChange={(event) => setRoomCategoryId(event.target.value)}
                    required
                    disabled={roomCategoryOptions.length === 0}
                  >
                    {roomCategoryOptions.length === 0 ? <option value="">No room categories in hotel rates</option> : null}
                    {roomCategoryOptions.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                        {category.code ? ` (${category.code})` : ''}
                      </option>
                    ))}
                  </select>
                </label>

                  <label>
                    Occupancy
                    <select
                      value={occupancyType}
                      onChange={(event) => setOccupancyType(event.target.value as 'SGL' | 'DBL' | 'TPL')}
                      required
                      disabled={occupancyOptions.length === 0}
                    >
                      {occupancyOptions.length === 0 ? <option value="">No occupancies in hotel rates</option> : null}
                      {occupancyOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Meal plan
                    <select
                      value={mealPlan}
                      onChange={(event) => setMealPlan(event.target.value as 'BB' | 'HB' | 'FB')}
                      required
                      disabled={mealPlanOptions.length === 0}
                    >
                      {mealPlanOptions.length === 0 ? <option value="">No meal plans in hotel rates</option> : null}
                      {mealPlanOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Selected unit rate
                    <input
                      value={
                        activeHotelSourceRate
                          ? `${activeHotelSourceRate.currency} ${Number(activeHotelSourceRate.cost || 0).toFixed(2)}`
                          : isLoadingHotelCost
                            ? 'Loading rate...'
                            : ''
                      }
                      readOnly
                      placeholder="Select rate inputs"
                    />
                  </label>

                  <label>
                    Pricing basis
                    <input value={hotelPreviewPricingBasis} readOnly />
                  </label>
                </div>

              <div className="quote-preview-total-list quote-hotel-source-summary">
                <div>
                  <span>Unit rate</span>
                  <strong>{displayCurrency} {hotelPreviewUnitRate.toFixed(2)}</strong>
                </div>
                <div>
                  <span>Nights</span>
                  <strong>{hotelPreviewNights}</strong>
                </div>
                <div>
                  <span>Multiplier</span>
                  <strong>{hotelPreviewMultiplierLabel}</strong>
                </div>
                {hotelPreviewSupplementTotal > 0 ? (
                  <div>
                    <span>Meal supplements</span>
                    <strong>{displayCurrency} {hotelPreviewSupplementTotal.toFixed(2)}</strong>
                  </div>
                ) : null}
                <div>
                  <span>Total cost</span>
                  <strong>{displayCurrency} {hotelCalculatedTotalCost.toFixed(2)}</strong>
                </div>
                <div>
                  <span>Sell total</span>
                  <strong>{displayCurrency} {hotelPreviewSellTotal.toFixed(2)}</strong>
                </div>
              </div>
            </section>
          ) : null}

          {isHotelService && hotelId ? (
            <section className="quote-hotel-step-panel quote-transport-step-panel">
              <div className="quote-hotel-step-head">
                <div>
                  <p className="eyebrow">Step 3</p>
                  <h3>Confirm hotel</h3>
                  <p className="detail-copy">Review the stay totals before adding this hotel to the quote.</p>
                </div>
              </div>

              <div className="quote-selected-transport-card quote-selected-transport-card-active">
                <div className="quote-selected-transport-summary">
                  <div>
                    <span>Hotel</span>
                    <strong>{selectedHotel?.name || 'Select hotel'}</strong>
                  </div>
                  <div>
                    <span>Dates</span>
                    <strong>{hotelCheckInDate && hotelCheckOutDate ? `${hotelCheckInDate} to ${hotelCheckOutDate}` : 'Select dates'}</strong>
                  </div>
                  <div>
                    <span>Rooms / pax</span>
                    <strong>{hotelPreviewRooms} room{hotelPreviewRooms === 1 ? '' : 's'} / {hotelPreviewPax} pax</strong>
                  </div>
                  <div>
                    <span>Unit rate</span>
                    <strong>{displayCurrency} {hotelPreviewUnitRate.toFixed(2)}</strong>
                  </div>
                  <div>
                  <span>Multiplier</span>
                  <strong>{hotelPreviewMultiplierLabel}</strong>
                  </div>
                  {hotelPreviewSupplementTotal > 0 ? (
                    <div>
                      <span>Meal supplements</span>
                      <strong>{displayCurrency} {hotelPreviewSupplementTotal.toFixed(2)}</strong>
                    </div>
                  ) : null}
                  <div>
                    <span>Total cost</span>
                    <strong>{displayCurrency} {hotelEffectiveTotalCost.toFixed(2)}</strong>
                  </div>
                  <div>
                    <span>Sell</span>
                    <strong>{displayCurrency} {hotelPreviewSellTotal.toFixed(2)}</strong>
                  </div>
                  <div>
                    <span>Margin</span>
                    <strong>{displayCurrency} {hotelPreviewMargin !== null ? hotelPreviewMargin.toFixed(2) : '0.00'}</strong>
                  </div>
                </div>
              </div>

              {hotelPricingBreakdownLines.length > 0 ? (
                <div className="quote-selected-transport-card">
                  <div className="quote-selected-transport-summary">
                    {hotelPricingBreakdownLines.map((line, index) => (
                      <div key={`${line.date}-${line.label}-${index}`}>
                        <span>{line.label}</span>
                        <strong>
                          {displayCurrency} {Number(line.unitAmount || 0).toFixed(2)} x {Number(line.quantity || 0).toFixed(2)} = {displayCurrency}{' '}
                          {Number(line.total || 0).toFixed(2)}
                        </strong>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {hotelPricingWarnings.length > 0 ? (
                <div className="quote-selected-transport-card">
                  <div className="quote-selected-transport-summary">
                    {hotelPricingWarnings.map((warning, index) => (
                      <div key={`${warning}-${index}`}>
                        <span>Pricing review</span>
                        <strong>{warning}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <details className="quote-advanced-settings" open={useOverride || Boolean(manualHotelRateDraft)}>
                <summary>More options</summary>

                <div className="quote-transport-step-fields">
                  <label>
                    Markup %
                    <input
                      value={markupPercent}
                      onChange={(event) => setMarkupPercent(event.target.value)}
                      type="number"
                      min="0"
                      step="0.01"
                      required
                    />
                  </label>

                  <label>
                    Markup amount
                    <input
                      value={markupAmount}
                      onChange={(event) => setMarkupAmount(event.target.value)}
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Overrides percent"
                    />
                  </label>

                  <label>
                    Sell total override
                    <input
                      value={sellPrice}
                      onChange={(event) => setSellPrice(event.target.value)}
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Optional"
                    />
                  </label>

                  <label className="quote-item-override-toggle">
                    <span>Use cost override</span>
                    <input checked={useOverride} onChange={(event) => setUseOverride(event.target.checked)} type="checkbox" />
                  </label>

                  <label className={useOverride ? 'quote-item-override quote-item-override-active' : 'quote-item-override'}>
                    <span>Override total cost</span>
                    <input
                      value={overrideCost}
                      onChange={(event) => setOverrideCost(event.target.value)}
                      type="number"
                      min="0"
                      step="0.01"
                      disabled={!useOverride}
                      placeholder="Quote-only total"
                    />
                  </label>

                  <label>
                    Override reason
                    <input
                      value={overrideReason}
                      onChange={(event) => setOverrideReason(event.target.value)}
                      disabled={!useOverride}
                      placeholder="Reason for this quote-only total"
                    />
                  </label>
                </div>

                <div className="quote-hotel-rate-helper">
                  <div>
                    <strong>Quote-only hotel rate</strong>
                    <p>Use the popup only when this quote needs a manual hotel override.</p>
                  </div>
                  <button type="button" className="secondary-button" onClick={() => setShowHotelRateModal(true)}>
                    Open Override Popup
                  </button>
                </div>

                {manualHotelRateDraft ? (
                  <div className="quote-preview-total-list quote-hotel-rate-inline-summary">
                    <div>
                      <span>Override room type</span>
                      <strong>
                        {roomCategoryOptions.find((category) => category.id === manualHotelRateDraft.roomCategoryId)?.name || 'Selected room'}
                      </strong>
                    </div>
                    <div>
                      <span>Override basis</span>
                      <strong>{manualHotelRateDraft.mealPlan} / {manualHotelRateDraft.occupancyType}</strong>
                    </div>
                    <div>
                      <span>Override cost / sell</span>
                      <strong>
                        {displayCurrency} {Number(manualHotelRateDraft.cost || 0).toFixed(2)} / {displayCurrency}{' '}
                        {Number(manualHotelRateDraft.sell || 0).toFixed(2)}
                      </strong>
                    </div>
                    <div>
                      <span>Override note</span>
                      <strong>{manualHotelRateDraft.notes || 'No notes'}</strong>
                    </div>
                  </div>
                ) : null}
              </details>

              <button className="quote-transport-add-button" type="submit" disabled={isSubmitting || isLoadingHotelCost || !isHotelPricingReady}>
                {isSubmitting ? 'Saving...' : 'Add Confirmed Hotel Stay'}
              </button>
            </section>
          ) : null}

          {isTransportService ? (
            <section className="quote-hotel-step-panel quote-transport-step-panel">
              <div className="quote-hotel-step-head">
                <div>
                  <p className="eyebrow">Step 1</p>
                  <h3>Pricing Mode, route, and pax</h3>
                  <p className="detail-copy">Choose a priced route first. Vehicle and supplier options appear immediately after pricing resolves.</p>
                </div>
                {routeId ? <span className="page-tab-badge">Route selected</span> : null}
              </div>

              <div className="quote-transport-step-fields">
                <label>
                  Pricing Mode
                  <select
                    value={transportServiceTypeId}
                    onChange={(event) => {
                      setTransportServiceTypeId(event.target.value);
                      setRouteSelectionManuallyChanged(false);
                      setTransportSuggestionOverridden(true);
                    }}
                    required
                  >
                    <option value="">Select pricing mode</option>
                    {transportServiceTypes.map((serviceType) => (
                      <option key={serviceType.id} value={serviceType.id}>
                        {formatServiceTypeLabel(serviceType.name)}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Pax
                  <input value={paxCount} onChange={(event) => setPaxCount(event.target.value)} type="number" min="1" required />
                </label>

                {isLoadingTransportPricingRules ? (
                  <div className="quote-transport-route-empty">
                    <span>Route</span>
                    <strong>Loading priced routes</strong>
                    <p>Routes will appear after active pricing rules are loaded.</p>
                  </div>
                ) : hasTransportRoutes ? (
                  <div
                    className={
                      showTransportRouteRequired
                        ? 'quote-transport-route-field quote-transport-route-required'
                        : 'quote-transport-route-field'
                    }
                  >
                    <RouteCombobox
                      label="Route *"
                      routes={validTransportRoutes}
                      value={routeId}
                      onChange={(value) => {
                        const nextRouteId = validTransportRoutes.some((route) => route.id === value) ? value : '';
                        setRouteSelectionManuallyChanged(true);
                        setRouteId(nextRouteId);
                        setRouteName('');
                        setBaseCost('');
                        setResolvedTransportPricing(null);
                        setTransportSuggestionOverridden(false);
                      }}
                      placeholder="Select priced route"
                      emptyText="No priced routes available for this service"
                    />
                    {showTransportRouteRequired ? (
                      <p className="form-error">Choose a route before transport pricing can be calculated.</p>
                    ) : null}
                    <p className="form-helper">Only routes with active pricing are shown.</p>
                  </div>
                ) : (
                  <div className="quote-transport-route-empty">
                    <span>Route</span>
                    <strong>Select a route to continue</strong>
                    <p>Use the route-first Add Transport picker for new transport lines.</p>
                  </div>
                )}
              </div>
            </section>
          ) : null}

          {isTransportService ? (
            <section className="quote-hotel-step-panel quote-transport-step-panel">
              <div className="quote-hotel-step-head">
                <div>
                  <p className="eyebrow">Step 2</p>
                  <h3>Vehicle and supplier options</h3>
                  <p className="detail-copy">Pick the supplier and vehicle that should be saved on this quote item.</p>
                </div>
                {transportCandidates.length > 0 ? <span className="page-tab-badge">{transportCandidates.length} option{transportCandidates.length === 1 ? '' : 's'}</span> : null}
              </div>

              {!routeId ? (
                <div className="quote-service-empty-state">
                  <strong>Select a route first</strong>
                  <p>Vehicle and supplier options appear after a priced route is selected.</p>
                </div>
              ) : isLoadingTransportCost ? (
                <div className="quote-service-empty-state">
                  <strong>Loading vehicle options</strong>
                  <p>Checking active rates for {Number(paxCount) || defaultPaxCount || 1} pax.</p>
                </div>
              ) : transportCandidates.length > 0 ? (
                <div className="quote-transport-candidate-list">
                  {transportCandidates.map((candidate) => {
                    const candidateKey = `${candidate.vehicle.id}:${candidate.serviceType.id}:${candidate.routeId || candidate.routeName}:${candidate.supplier?.id || ''}`;
                    const selectedCandidateKey = selectedTransportCandidate
                      ? `${selectedTransportCandidate.vehicle.id}:${selectedTransportCandidate.serviceType.id}:${selectedTransportCandidate.routeId || selectedTransportCandidate.routeName}:${selectedTransportCandidate.supplier?.id || ''}`
                      : null;
                    const isCurrentCandidate = candidateKey === selectedCandidateKey;

                    return (
                      <button
                        key={candidateKey}
                        type="button"
                        className={
                          isCurrentCandidate
                            ? 'quote-transport-suggestion-option quote-transport-suggestion-option-selected'
                            : 'quote-transport-suggestion-option'
                        }
                        onClick={() => applyTransportCandidate(candidate, { userInitiated: true })}
                      >
                        <span className="quote-transport-suggestion-main">
                          <span className="quote-transport-candidate-copy">
                            <strong>{formatTransportVehicleDisplay(candidate.vehicle)}</strong>
                            <span>{formatSupplierName(candidate.supplier?.name, candidate.supplier?.id)}</span>
                            <em>{candidate.vehicle.maxPax} pax capacity</em>
                          </span>
                          <span className="quote-transport-price-stack">
                            <strong className="quote-transport-suggestion-price">
                              {candidate.currency} {candidate.price.toFixed(2)}
                            </strong>
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="quote-service-empty-state">
                  <strong>No vehicle options found</strong>
                  <p>No active vehicle rate matches this route, service type, and pax count.</p>
                </div>
              )}
            </section>
          ) : null}

          {isTransportService ? (
            <section className="quote-hotel-step-panel quote-transport-step-panel">
              <div className="quote-hotel-step-head">
                <div>
                  <p className="eyebrow">Step 3</p>
                  <h3>Confirm transport</h3>
                  <p className="detail-copy">Review the selected supplier, vehicle, and calculated price before adding it to the quote.</p>
                </div>
                {isTransportVehicleSelected ? <span className="page-tab-badge">Ready</span> : null}
              </div>

              {resolvedTransportPricing ? (
                <div className="quote-selected-transport-card quote-selected-transport-card-active">
                  <div className="quote-selected-transport-summary">
                    <div>
                      <span>Vehicle</span>
                      <strong>{formatTransportVehicleDisplay(resolvedTransportPricing.vehicle)}</strong>
                    </div>
                    <div>
                      <span>Supplier</span>
                      <strong>{formatSupplierName(resolvedTransportPricing.supplier?.name, resolvedTransportPricing.supplier?.id)}</strong>
                    </div>
                    <div>
                      <span>Route</span>
                      <strong>{formatRouteLabel(resolvedTransportPricing.routeName)}</strong>
                    </div>
                    <div>
                      <span>Units</span>
                      <strong>
                        {resolvedTransportPricing.pricingMode === 'capacity_unit'
                          ? `${resolvedTransportPricing.unitCount || 1} vehicle${(resolvedTransportPricing.unitCount || 1) === 1 ? '' : 's'}`
                          : '1 group'}
                      </strong>
                    </div>
                    <div>
                      <span>Pax</span>
                      <strong>{Math.max(1, Number(paxCount || defaultPaxCount || 1))}</strong>
                    </div>
                    <div>
                      <span>Cost</span>
                      <strong>
                        {resolvedTransportPricing.currency} {finalCost !== null ? finalCost.toFixed(2) : resolvedTransportPricing.price.toFixed(2)}
                      </strong>
                    </div>
                    <div>
                      <span>Sell</span>
                      <strong>
                        {displayCurrency} {finalSellPrice !== null && Number.isFinite(finalSellPrice) ? finalSellPrice.toFixed(2) : '0.00'}
                      </strong>
                    </div>
                    <div>
                      <span>Margin</span>
                      <strong>
                        {displayCurrency} {finalMargin !== null ? finalMargin.toFixed(2) : '0.00'}
                      </strong>
                    </div>
                  </div>
                  {transportRecommendationReasons.length > 0 ? (
                    <div className="quote-selected-transport-explanation">
                      <ul>
                        {transportRecommendationReasons.map((reason) => (
                          <li key={reason}>{reason}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="quote-service-empty-state">
                  <strong>Select a vehicle option</strong>
                  <p>The Add Transport button is enabled after a priced vehicle and supplier option is selected.</p>
                </div>
              )}

              <button
                type="submit"
                className="quote-transport-add-button"
                disabled={
                  isSubmitting ||
                  isLoadingTransportCost ||
                  filteredServices.length === 0 ||
                  !selectedService ||
                  showTransportRouteRequired ||
                  !isTransportVehicleSelected
                }
              >
                {isSubmitting ? 'Saving...' : 'Add Transport'}
              </button>
            </section>
          ) : null}

          {isTransportService ? (
            <details className="quote-advanced-settings">
              <summary>More options</summary>

              <div className="form-row form-row-4">
                <label>
                  Markup %
                  <input
                    value={markupPercent}
                    onChange={(event) => setMarkupPercent(event.target.value)}
                    type="number"
                    min="0"
                    step="0.01"
                    required
                  />
                </label>

                <label>
                  Markup amount
                  <input
                    value={markupAmount}
                    onChange={(event) => setMarkupAmount(event.target.value)}
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Overrides percent"
                  />
                </label>

                <label>
                  Sell price override
                  <input
                    value={sellPrice}
                    onChange={(event) => setSellPrice(event.target.value)}
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Optional"
                  />
                </label>

                <div className={sellPrice.trim() ? 'quote-item-override-status quote-item-override-status-active' : 'quote-item-override-status'}>
                  <strong>Final sell price</strong>
                  <span>
                    {finalSellPrice !== null && Number.isFinite(finalSellPrice)
                      ? `${displayCurrency} ${finalSellPrice.toFixed(2)}`
                      : 'Waiting for cost'}
                  </span>
                </div>
              </div>

              <div className="form-row">
                <label>
                  Legacy route text
                  <input
                    value={routeName}
                    onChange={(event) => {
                      setRouteSelectionManuallyChanged(true);
                      setRouteName(event.target.value);
                      setTransportSuggestionOverridden(true);
                    }}
                    placeholder="Airport - Hotel"
                    disabled={Boolean(routeId)}
                  />
                </label>
              </div>

              {transportAddOnRows.length > 0 ? (
                <div className="quote-selected-transport-card">
                  <div className="panel-header" style={{ marginBottom: 12 }}>
                    <div>
                      <p className="eyebrow">Transport add-ons</p>
                      <h3 className="section-title" style={{ fontSize: '1rem' }}>Optional package rules</h3>
                    </div>
                    <strong>
                      {transportAddOnRows[0]?.currency || resolvedTransportPricing?.currency || 'JOD'} {selectedTransportAddOnTotal.toFixed(2)}
                    </strong>
                  </div>

                  <div className="quote-preview-total-list">
                    {transportAddOnRows.map((addOn) => {
                      const state = selectedTransportAddOns[addOn.rateId];
                      const selected = state?.selected ?? addOn.defaultQuantity > 0;
                      const quantity = Math.max(1, Number(state?.quantity || addOn.defaultQuantity || 1));
                      const units = resolvedTransportPricing?.unitCount || Math.ceil((Number(paxCount) || defaultPaxCount || 1) / Math.max(1, addOn.unitCapacity));
                      const addOnTotal = units * addOn.unitCost * quantity;

                      return (
                        <label key={addOn.rateId} className="quote-transport-addon-option">
                          <span>
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={(event) =>
                                setSelectedTransportAddOns((current) => ({
                                  ...current,
                                  [addOn.rateId]: {
                                    selected: event.target.checked,
                                    quantity: current[addOn.rateId]?.quantity || String(quantity),
                                  },
                                }))
                              }
                            />
                            <strong>{formatServiceTypeLabel(addOn.name)}</strong>
                            <em>{formatServiceTypeLabel(addOn.addOnType)}</em>
                          </span>
                          <span>
                            <input
                              type="number"
                              min="1"
                              value={state?.quantity || String(quantity)}
                              onChange={(event) =>
                                setSelectedTransportAddOns((current) => ({
                                  ...current,
                                  [addOn.rateId]: {
                                    selected,
                                    quantity: event.target.value,
                                  },
                                }))
                              }
                              disabled={!selected}
                            />
                            {addOn.currency} {addOn.unitCost.toFixed(2)} x {units} x {quantity} = {addOn.currency} {addOnTotal.toFixed(2)}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              
            </details>
          ) : null}

          {hasPrimarySelection && !isTransportService && !isHotelService && !isActivityService && !isExternalPackageService ? (
            <button
              type="submit"
              disabled={
                isSubmitting ||
                isLoadingTransportCost ||
                filteredServices.length === 0 ||
                !selectedService ||
                showTransportRouteRequired ||
                (isTransportService && !isTransportVehicleSelected) ||
                (isHotelService && !selectedHotelBaseRate && !manualHotelRateDraft)
              }
            >
              {isSubmitting ? 'Saving...' : isTransportService ? 'Add Transport' : submitLabel}
            </button>
          ) : needsServiceSelection ? (
            <div className="quote-service-empty-state">
              <strong>Select a service to continue</strong>
              <p>Configuration and pricing controls will appear after this step.</p>
            </div>
          ) : null}

          {hasPrimarySelection && isHotelService && !selectedHotelBaseRate && !manualHotelRateDraft ? (
            <p className="form-error">No hotel rate matches the selected contract, season, room category, occupancy, and meal plan.</p>
          ) : null}
          {hasPrimarySelection && isTransportService && !baseCost && !isLoadingTransportCost && transportServiceTypeId && (routeId || routeName.trim()) ? (
            <p className="form-error">No transport pricing rule matches the selected route, service type, and pax count.</p>
          ) : null}
          {hasPrimarySelection && isExternalPackageService ? (
            <div className="quote-external-package-sticky-footer">
              {externalPackageFooterErrors.length > 0 ? (
                <div className="quote-external-package-errors" role="alert">
                  <strong>Check these fields before saving:</strong>
                  {externalPackageFooterErrors.map((message) => (
                    <p key={message} className="form-error">{message}</p>
                  ))}
                </div>
              ) : null}
              <div className="quote-external-package-footer-actions">
                <button type="button" className="secondary-button" onClick={handleExternalPackageCancel}>
                  Cancel
                </button>
                <button
                  type="button"
                  form={serviceEntryFormId}
                  disabled={isSubmitting}
                  onClick={() => {
                    console.log('[External Country Package] save button clicked', {
                      quoteId,
                      itemId: itemId || null,
                      optionId: optionId || null,
                      serviceId,
                    });
                    formRef.current?.requestSubmit();
                  }}
                >
                  {isSubmitting ? 'Saving...' : 'Save External Package'}
                </button>
              </div>
            </div>
          ) : null}
          {error && !isExternalPackageService ? <p className="form-error">{error}</p> : null}
        </form>
      ) : null}

      {showHotelRateModal && isHotelService ? (
        <QuoteHotelRateModal
          hotelName={hotels.find((hotel) => hotel.id === hotelId)?.name || selectedService?.name || 'Selected hotel'}
          dayContextLabel={itineraryDayNumber ? `Quote day ${itineraryDayNumber}` : 'Current quote context'}
          roomCategoryOptions={roomCategoryDraftOptions}
          initialRows={hotelRateDraftRows}
          initialSelectedRowId={manualHotelRateDraft?.id || hotelRateDraftRows[0]?.id || null}
          onClose={() => setShowHotelRateModal(false)}
          onSave={applyHotelRateDraft}
        />
      ) : null}
    </div>
  );
}
