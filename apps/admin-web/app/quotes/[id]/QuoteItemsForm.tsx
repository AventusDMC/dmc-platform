'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RouteCombobox } from '../../components/RouteCombobox';
import { getErrorMessage, logFetchUrl, readJsonResponse } from '../../lib/api';
import { buildAuthHeaders } from '../../lib/auth-client';
import { RouteOption } from '../../lib/routes';
import { QuoteHotelRateDraftRow, QuoteHotelRateModal } from './QuoteHotelRateModal';
import {
  buildExternalPackagePayload,
  createEmptyExternalPackageFormState,
  EXTERNAL_PACKAGE_PRICING_BASIS_OPTIONS,
  ExternalPackageFormState,
  ExternalPackagePricingBasis,
  getExternalPackageCalculatedCost,
  isExternalPackageCategory,
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
};

type Hotel = {
  id: string;
  name: string;
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
};

type QuoteType = 'FIT' | 'GROUP';
type VehicleCategory = 'CAR' | 'VAN' | 'MINIBUS' | 'BUS' | 'COACH' | 'LIMO';

type TransportPricingCandidate = {
  routeId: string | null;
  routeName: string;
  currency: string;
  price: number;
  unitCount: number | null;
  pricingMode: 'per_vehicle' | 'capacity_unit';
  unitCapacity: number | null;
  vehicle: {
    id: string;
    name: string;
    maxPax: number;
  };
  serviceType: {
    id: string;
    name: string;
    code: string;
  };
};

type ResolvedTransportPricing = {
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
    maxPax: number;
  };
  serviceType: {
    id: string;
    name: string;
    code: string;
  };
  candidates?: TransportPricingCandidate[];
};

type HotelCostCalculation = {
  totalCost: number;
  nights: number;
  breakdown: Array<{
    date: string;
    cost: number;
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
  transportServiceTypes: TransportServiceType[];
  routes: RouteOption[];
  hotels: Hotel[];
  hotelContracts: HotelContract[];
  hotelRates: HotelRate[];
  seasons: Season[];
  quoteType?: QuoteType;
  defaultPaxCount: number;
  defaultAdultCount: number;
  defaultChildCount: number;
  defaultRoomCount: number;
  defaultNightCount: number;
  travelStartDate?: string | null;
  itineraryDayNumber?: number | null;
  itineraryId?: string;
  initialServiceTypeKey?: ServiceTypeKey | null;
  preferredServiceId?: string;
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
};

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

const SERVICE_TYPE_BUTTONS = [
  { key: 'hotel', label: 'Add Hotel' },
  { key: 'transport', label: 'Add Transport' },
  { key: 'guide', label: 'Add Guide' },
  { key: 'activity', label: 'Add Activity' },
  { key: 'meal', label: 'Add Meal' },
  { key: 'externalPackage', label: 'Add External Package' },
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

function normalizeCategory(value: string) {
  return value.trim().toLowerCase();
}

function getServiceCategorySource(service: Pick<SupplierService, 'category' | 'serviceType'>) {
  return service.serviceType?.code || service.serviceType?.name || service.category;
}

function getServiceTypeKey(service: Pick<SupplierService, 'category' | 'serviceType'>): ServiceTypeKey {
  const normalized = normalizeCategory(getServiceCategorySource(service));

  if (isExternalPackageCategory(getServiceCategorySource(service))) {
    return 'externalPackage';
  }

  if (normalized.includes('hotel') || normalized.includes('accommodation')) {
    return 'hotel';
  }

  if (normalized.includes('transport') || normalized.includes('transfer') || normalized.includes('vehicle')) {
    return 'transport';
  }

  if (normalized.includes('guide')) {
    return 'guide';
  }

  if (
    normalized.includes('activity') ||
    normalized.includes('tour') ||
    normalized.includes('excursion') ||
    normalized.includes('sightseeing') ||
    normalized.includes('entrance') ||
    normalized.includes('ticket')
  ) {
    return 'activity';
  }

  if (
    normalized.includes('meal') ||
    normalized.includes('dinner') ||
    normalized.includes('lunch') ||
    normalized.includes('breakfast') ||
    normalized.includes('food')
  ) {
    return 'meal';
  }

  return 'other';
}

function getServiceTypeKeyFromText(value: string | null | undefined): ServiceTypeKey | null {
  const normalized = normalizeCategory(value || '');

  if (!normalized) {
    return null;
  }

  if (isExternalPackageCategory(value)) {
    return 'externalPackage';
  }

  if (normalized.includes('hotel') || normalized.includes('accommodation')) {
    return 'hotel';
  }

  if (normalized.includes('transport') || normalized.includes('transfer') || normalized.includes('vehicle')) {
    return 'transport';
  }

  if (normalized.includes('guide')) {
    return 'guide';
  }

  if (
    normalized.includes('activity') ||
    normalized.includes('tour') ||
    normalized.includes('excursion') ||
    normalized.includes('sightseeing') ||
    normalized.includes('entrance') ||
    normalized.includes('ticket')
  ) {
    return 'activity';
  }

  if (
    normalized.includes('meal') ||
    normalized.includes('dinner') ||
    normalized.includes('lunch') ||
    normalized.includes('breakfast') ||
    normalized.includes('food')
  ) {
    return 'meal';
  }

  return 'other';
}

function isImportedPlaceholderService(service: Pick<SupplierService, 'supplierId'>) {
  return service.supplierId === IMPORTED_SERVICE_SUPPLIER_ID;
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

export function QuoteItemsForm({
  apiBaseUrl,
  quoteId,
  itemId,
  optionId,
  blocks = [],
  services,
  transportServiceTypes,
  routes,
  hotels,
  hotelContracts,
  hotelRates,
  seasons,
  quoteType = 'FIT',
  defaultPaxCount,
  defaultAdultCount,
  defaultChildCount,
  defaultRoomCount,
  defaultNightCount,
  travelStartDate,
  itineraryDayNumber,
  itineraryId,
  initialServiceTypeKey,
  preferredServiceId,
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
}: QuoteItemsFormProps) {
  const router = useRouter();
  const isEditing = Boolean(itemId);
  const initialService = services.find((service) => service.id === (initialValues?.serviceId || preferredServiceId));
  const initialActiveServiceType = initialService ? getServiceTypeKey(initialService) : initialServiceTypeKey || null;
  const initialServiceDate =
    (initialActiveServiceType === 'activity' || initialActiveServiceType === 'hotel' || initialActiveServiceType === 'meal') && !itineraryId && travelStartDate
      ? travelStartDate.slice(0, 10)
      : '';
  const validTransportRoutes = routes;
  const initialRouteId = [initialValues?.routeId, preferredRouteId].find((candidateRouteId) =>
    Boolean(candidateRouteId && validTransportRoutes.some((route) => route.id === candidateRouteId)),
  ) || '';
  const initialRouteName = initialValues?.routeName || '';
  const [activeServiceType, setActiveServiceType] = useState<ServiceTypeKey | null>(
    initialActiveServiceType,
  );
  const [serviceId, setServiceId] = useState(initialValues?.serviceId || preferredServiceId || '');
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
  const [showHotelRateModal, setShowHotelRateModal] = useState(false);
  const [manualHotelRateDraft, setManualHotelRateDraft] = useState<QuoteHotelRateDraftRow | null>(null);
  const [hotelRateReference, setHotelRateReference] = useState<HotelRateReference | null>(null);
  const [pendingHotelRateSubmit, setPendingHotelRateSubmit] = useState(false);
  const [transportSuggestionOverridden, setTransportSuggestionOverridden] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const serviceBlocks = blocks.filter((block) => block.type === 'SERVICE_BLOCK');

  const transportCandidates = useMemo(() => {
    const candidates = resolvedTransportPricing?.candidates || [];
    const seen = new Set<string>();
    const currentPax = Number(paxCount) || defaultPaxCount || 1;

    const normalizedCandidates = candidates
      .filter((candidate) => {
        const key = `${candidate.vehicle.id}:${candidate.serviceType.id}:${candidate.routeId || candidate.routeName}`;

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

    const bestValueCandidate = normalizedCandidates.reduce<(typeof normalizedCandidates)[number] | null>((bestCandidate, candidate) => {
      if (!bestCandidate) {
        return candidate;
      }

      const candidatePricePerPax = candidate.price / Math.max(currentPax, 1);
      const bestPricePerPax = bestCandidate.price / Math.max(currentPax, 1);
      const candidateCapacityGap =
        candidate.vehicle.maxPax >= currentPax ? candidate.vehicle.maxPax - currentPax : Number.MAX_SAFE_INTEGER;
      const bestCapacityGap =
        bestCandidate.vehicle.maxPax >= currentPax ? bestCandidate.vehicle.maxPax - currentPax : Number.MAX_SAFE_INTEGER;

      if (candidatePricePerPax < bestPricePerPax) {
        return candidate;
      }

      if (candidatePricePerPax === bestPricePerPax && candidateCapacityGap < bestCapacityGap) {
        return candidate;
      }

      return bestCandidate;
    }, null);

    return normalizedCandidates.map((candidate) => ({
      ...candidate,
      isBestValue:
        Boolean(bestValueCandidate) &&
        candidate.vehicle.id === bestValueCandidate?.vehicle.id &&
        candidate.serviceType.id === bestValueCandidate.serviceType.id &&
        (candidate.routeId || candidate.routeName) === (bestValueCandidate.routeId || bestValueCandidate.routeName),
    }));
  }, [defaultPaxCount, paxCount, quoteType, resolvedTransportPricing?.candidates]);
  const hasRecommendedTransportCandidate = transportCandidates.some((candidate) => candidate.isRecommended);
  const autoTransportCandidate =
    transportCandidates.find((candidate) => candidate.isRecommended && candidate.isBestValue) ||
    transportCandidates.find((candidate) => candidate.isRecommended) ||
    transportCandidates.find((candidate) => candidate.isBestValue) ||
    transportCandidates[0] ||
    null;
  const selectedTransportCandidate = resolvedTransportPricing
    ? transportCandidates.find(
        (candidate) =>
          candidate.vehicle.id === resolvedTransportPricing.vehicle.id &&
          candidate.serviceType.id === resolvedTransportPricing.serviceType.id &&
          (candidate.routeId || candidate.routeName) === (routeId || resolvedTransportPricing.routeName),
      ) || null
    : null;
  const transportRecommendationReasons = selectedTransportCandidate
    ? [
        selectedTransportCandidate.isRecommended
          ? `Recommended for ${Number(paxCount) || defaultPaxCount || 1} pax (${quoteType})`
          : null,
        selectedTransportCandidate.isBestValue ? 'Best value based on price per pax' : null,
      ].filter((reason): reason is string => Boolean(reason))
    : [];

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

  const selectedService = services.find((service) => service.id === serviceId) || filteredServices[0];
  const isHotelService = selectedService ? getServiceTypeKey(selectedService) === 'hotel' : false;
  const isTransportService = selectedService ? getServiceTypeKey(selectedService) === 'transport' : false;
  const isGuideService = selectedService ? getServiceTypeKey(selectedService) === 'guide' : false;
  const isActivityService = selectedService ? getServiceTypeKey(selectedService) === 'activity' : false;
  const isMealService = selectedService ? getServiceTypeKey(selectedService) === 'meal' : false;
  const isExternalPackageService = selectedService ? getServiceTypeKey(selectedService) === 'externalPackage' : false;

  useEffect(() => {
    if (!isTransportService || process.env.NODE_ENV === 'production') {
      return;
    }

    console.debug('[QuoteItemsForm] transport routes returned', {
      count: routes.length,
      routes: routes.map((route) => ({
        id: route.id,
        name: route.name,
        routeType: route.routeType,
        from: route.fromPlace?.name,
        to: route.toPlace?.name,
        isActive: route.isActive,
      })),
    });
    console.debug('[QuoteItemsForm] valid transport routes', {
      count: validTransportRoutes.length,
      routes: validTransportRoutes.map((route) => ({
        id: route.id,
        name: route.name,
        routeType: route.routeType,
        from: route.fromPlace?.name,
        to: route.toPlace?.name,
      })),
    });
  }, [isTransportService, routes, validTransportRoutes]);

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
  ).sort((left, right) => left.name.localeCompare(right.name));
  const roomCategoryFilteredRates = seasonFilteredRates.filter((rate) => rate.roomCategoryId === roomCategoryId);
  const occupancyOptions = Array.from(new Set(roomCategoryFilteredRates.map((rate) => rate.occupancyType))).sort();
  const occupancyFilteredRates = roomCategoryFilteredRates.filter((rate) => rate.occupancyType === occupancyType);
  const mealPlanOptions = Array.from(new Set(occupancyFilteredRates.map((rate) => rate.mealPlan))).sort();
  const selectedHotelRate =
    hotelRates.find(
      (rate) =>
        rate.contractId === contractId &&
        rate.seasonName === effectiveSeasonName &&
        rate.roomCategoryId === roomCategoryId &&
        rate.occupancyType === occupancyType &&
        rate.mealPlan === mealPlan,
    ) || null;
  const hotelCheckInDate = isHotelService ? serviceDate || travelStartDate?.slice(0, 10) || '' : '';
  const hotelCheckOutDate = hotelCheckInDate ? addDaysToDateString(hotelCheckInDate, Math.max(1, Number(nightCount || 1))) : '';
  const displayCurrency = isExternalPackageService
    ? externalPackage.currency
    : isMealService
      ? mealCurrency
      : preferredRateCurrency || selectedHotelRate?.currency || selectedService?.currency || 'USD';
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

    return baseCost ? Number(baseCost) : null;
  }, [baseCost, defaultPaxCount, externalPackage, isExternalPackageService, isMealService, mealCost, overrideCost, paxCount, useOverride]);
  const finalSellPrice = useMemo(() => {
    if (sellPrice.trim()) {
      return Number(sellPrice);
    }

    if (markupAmount.trim()) {
      return finalCost === null ? null : Number((finalCost + Number(markupAmount)).toFixed(2));
    }

    return finalCost === null ? null : Number((finalCost * (1 + Number(markupPercent || '0') / 100)).toFixed(2));
  }, [finalCost, markupAmount, markupPercent, sellPrice]);
  const resolvedActivityServiceDate = isActivityService && !serviceDate ? resolveDerivedServiceDate(travelStartDate, itineraryDayNumber) : null;
  const resolvedMealServiceDate = isMealService && !serviceDate ? resolveDerivedServiceDate(travelStartDate, itineraryDayNumber) : null;
  const activityIssues =
    isActivityService
      ? [
          itineraryId && itineraryDayNumber && !travelStartDate ? 'Itinerary day is selected, but the quote travel start date is missing.' : null,
          !(serviceDate || resolvedActivityServiceDate) ? 'Activity date is missing.' : null,
          !(startTime || pickupTime) ? 'Start time or pickup time is required.' : null,
          !(pickupLocation.trim() || meetingPoint.trim()) ? 'Pickup location or meeting point is required.' : null,
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

    if (!filteredServices.some((service) => service.id === serviceId)) {
      // Preserve API order so the first real hotel template remains the default when multiple templates exist.
      setServiceId(filteredServices[0]?.id || '');
    }
  }, [activeServiceType, filteredServices, isEditing, serviceId]);

  useEffect(() => {
    if (!selectedService) {
      setBaseCost('');
      return;
    }

    if (isHotelService) {
      setBaseCost(hotelCostCalculation ? String(hotelCostCalculation.totalCost) : selectedHotelRate ? String(selectedHotelRate.cost) : '');
      return;
    }

    if (isGuideService) {
      setBaseCost(String(GUIDE_RATES[guideType][guideDuration] + (overnight === 'yes' ? GUIDE_OVERNIGHT_SUPPLEMENT : 0)));
      return;
    }

    if (isTransportService) {
      return;
    }

    if (isExternalPackageService) {
      setExternalPackage((current) => ({
        ...current,
        currency: current.currency || selectedService.currency || 'USD',
      }));
      setBaseCost(externalPackage.netCost.trim() || String(selectedService.baseCost || ''));
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
    externalPackage.netCost,
    hotelCostCalculation,
    mealCost,
    mealCurrency,
    mealName,
    overnight,
    selectedHotelRate,
    selectedService,
  ]);

  useEffect(() => {
    if (!isHotelService) {
      setHotelCostCalculation(null);
      setIsLoadingHotelCost(false);
      return;
    }

    if (!hotelId || !hotelCheckInDate || !hotelCheckOutDate || !occupancyType || !mealPlan || !(Number(paxCount) > 0)) {
      setHotelCostCalculation(null);
      return;
    }

    const controller = new AbortController();
    const params = new URLSearchParams({
      hotelId,
      checkInDate: hotelCheckInDate,
      checkOutDate: hotelCheckOutDate,
      occupancy: occupancyType,
      mealPlan,
      pax: String(Number(paxCount) || 1),
    });

    setIsLoadingHotelCost(true);
    fetch(`/api/hotel-rates/calculate-hotel-cost?${params.toString()}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(await getErrorMessage(response, 'Could not calculate hotel contract pricing.'));
        }

        return readJsonResponse<HotelCostCalculation>(response, 'Hotel contract pricing');
      })
      .then((result) => {
        setHotelCostCalculation(result);
        setBaseCost(String(result.totalCost));
      })
      .catch((caughtError) => {
        if (caughtError instanceof DOMException && caughtError.name === 'AbortError') return;
        setHotelCostCalculation(null);
        setError(caughtError instanceof Error ? caughtError.message : 'Could not calculate hotel contract pricing.');
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoadingHotelCost(false);
        }
      });

    return () => controller.abort();
  }, [hotelCheckInDate, hotelCheckOutDate, hotelId, isHotelService, mealPlan, occupancyType, paxCount]);

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

    const nextHotelId = hotelId || hotels[0]?.id || '';
    if (nextHotelId !== hotelId) {
      setHotelId(nextHotelId);
    }
  }, [hotelId, hotels, isHotelService]);

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
    }
  }, [isTransportService]);

  function applyTransportCandidate(candidate: (typeof transportCandidates)[number], options?: { userInitiated?: boolean }) {
    const matchingService =
      filteredServices.find((service) => service.serviceTypeId === candidate.serviceType.id) ||
      filteredServices.find((service) => getServiceTypeKey(service) === 'transport') ||
      null;

    if (matchingService) {
      setServiceId(matchingService.id);
    }

    setTransportServiceTypeId(candidate.serviceType.id);
    setRouteId(candidate.routeId || '');
    setRouteName(candidate.routeId ? '' : candidate.routeName);
    setBaseCost(String(candidate.price));
    setResolvedTransportPricing({
      routeName: candidate.routeName,
      currency: candidate.currency,
      price: candidate.price,
      unitCount: candidate.unitCount,
      pricingMode: candidate.pricingMode,
      unitCapacity: candidate.unitCapacity,
      vehicle: candidate.vehicle,
      serviceType: candidate.serviceType,
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

    if (!transportServiceTypeId && transportServiceTypes[0]?.id) {
      setTransportServiceTypeId(transportServiceTypes[0].id);
    }

    if (!transportServiceTypeId || (!routeId && !routeName.trim())) {
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
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            serviceTypeId: transportServiceTypeId,
            routeId: routeId || null,
            routeName: routeName.trim(),
            paxCount: Number(paxCount),
          }),
          signal: abortController.signal,
        });

        if (!response.ok) {
          setBaseCost('');
          setResolvedTransportPricing(null);
          return;
        }

        const result = await readJsonResponse<ResolvedTransportPricing>(response, 'Could not resolve transport pricing.');
        setBaseCost(String(result.price));
        setResolvedTransportPricing(result);
      } catch (caughtError) {
        if (!(caughtError instanceof Error) || caughtError.name !== 'AbortError') {
          setBaseCost('');
          setResolvedTransportPricing(null);
        }
      } finally {
        if (!abortController.signal.aborted) {
          setIsLoadingTransportCost(false);
        }
      }
    }

    void loadTransportCost();

    return () => abortController.abort();
  }, [apiBaseUrl, isTransportService, paxCount, routeId, routeName, transportServiceTypeId, transportServiceTypes]);

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

  const activeHotelSourceRate = selectedHotelRate
    ? {
        roomCategoryLabel: selectedHotelRate.roomCategory.name,
        mealPlan,
        occupancyType,
        cost: String(selectedHotelRate.cost),
        currency: selectedHotelRate.currency,
        note: `${effectiveSeasonName || 'Contract rate'} | ${formatHotelRatePricingBasis(selectedHotelRate.pricingBasis)}`,
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      const endpoint = optionId
        ? `${apiBaseUrl}/quotes/${quoteId}/options/${optionId}/items${itemId ? `/${itemId}` : ''}`
        : `${apiBaseUrl}/quotes/${quoteId}/items${itemId ? `/${itemId}` : ''}`;

      if (isHotelService) {
        if (!hotelId || !contractId || !seasonName || !roomCategoryId || !occupancyType || !mealPlan || !hotelCheckInDate || !hotelCheckOutDate) {
          throw new Error('Complete the hotel pricing selection.');
        }

        if (!hotelCostCalculation && !selectedHotelRate && !manualHotelRateDraft) {
          throw new Error('Matching hotel rate not found for the selected combination.');
        }
      }

      if (isTransportService) {
        if (!transportServiceTypeId) {
          throw new Error('Transport service type is required');
        }

        if (!routeId && !routeName.trim()) {
          throw new Error('Transport route is required');
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

      if (isExternalPackageService) {
        const validationErrors = validateExternalPackageFormState(externalPackage);
        if (validationErrors.length > 0) {
          throw new Error(validationErrors[0]);
        }
      }

      if (useOverride && !overrideCost.trim()) {
        throw new Error('Override cost is required when override is enabled.');
      }

      if (markupAmount.trim() && Number(markupAmount) < 0) {
        throw new Error('Markup amount must be zero or greater.');
      }

      if (sellPrice.trim() && Number(sellPrice) < 0) {
        throw new Error('Sell price must be zero or greater.');
      }

      if (isActivityService) {
        const hasDateOrItinerary = Boolean(serviceDate || resolvedActivityServiceDate);
        const hasTime = Boolean(startTime || pickupTime);
        const hasLocation = Boolean(pickupLocation.trim() || meetingPoint.trim());
        const numericParticipantCount = Number(participantCount || 0);
        const numericAdultCount = Number(adultCount || 0);
        const numericChildCount = Number(childCount || 0);
        const hasCounts = numericParticipantCount > 0 || numericAdultCount + numericChildCount > 0;

        if (!hasDateOrItinerary) {
          throw new Error('Activity items require a service date or itinerary day.');
        }

        if (!hasTime) {
          throw new Error('Activity items require a start time or pickup time.');
        }

        if (!hasLocation) {
          throw new Error('Activity items require a pickup location or meeting point.');
        }

        if (!hasCounts) {
          throw new Error('Activity items require participant counts.');
        }

        if (reconfirmationRequired && !reconfirmationDueAt) {
          throw new Error('Set a reconfirmation due date when reconfirmation is required.');
        }
      }

      const response = await fetch(logFetchUrl(endpoint), {
        method: isEditing ? 'PATCH' : 'POST',
        headers: buildAuthHeaders({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          serviceId,
          itineraryId,
          serviceDate:
            (isActivityService || isHotelService || isMealService) && (serviceDate || resolvedActivityServiceDate || resolvedMealServiceDate)
              ? new Date(`${serviceDate || resolvedActivityServiceDate || resolvedMealServiceDate}T09:00:00`).toISOString()
              : undefined,
          startTime: isActivityService ? startTime || null : undefined,
          pickupTime: isActivityService ? pickupTime || null : undefined,
          pickupLocation: isActivityService ? pickupLocation.trim() || null : undefined,
          meetingPoint: isActivityService ? meetingPoint.trim() || null : undefined,
          participantCount: isActivityService ? Number(participantCount || 0) : undefined,
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
          paxCount: Number(paxCount),
          roomCount: isTransportService || isGuideService || isMealService || isExternalPackageService ? undefined : Number(roomCount),
          nightCount: isTransportService || isGuideService || isMealService || isExternalPackageService ? undefined : Number(nightCount),
          dayCount: isTransportService || isGuideService || isMealService || isExternalPackageService ? undefined : Number(dayCount),
          overrideCost: overrideCost.trim() ? Number(overrideCost) : null,
          overrideReason: useOverride ? overrideReason.trim() || null : null,
          useOverride,
          markupAmount: markupAmount.trim() ? Number(markupAmount) : null,
          sellPrice: sellPrice.trim() ? Number(sellPrice) : null,
          markupPercent: Number(markupPercent),
          transportServiceTypeId: isTransportService ? transportServiceTypeId : undefined,
          routeId: isTransportService ? routeId || undefined : undefined,
          routeName: isTransportService ? routeName.trim() : undefined,
          guideType: isGuideService ? guideType : undefined,
          guideDuration: isGuideService ? guideDuration : undefined,
          overnight: isGuideService ? overnight === 'yes' : undefined,
          currency: isMealService ? mealCurrency.trim().toUpperCase() : isExternalPackageService ? externalPackage.currency.trim().toUpperCase() : undefined,
        }),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, `Could not ${isEditing ? 'update' : 'add'} quote item.`));
      }

      notifyQuotePricingChanged(quoteId);

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
        setActiveServiceType(null);
      }
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : `Could not ${isEditing ? 'update' : 'add'} quote item.`);
    } finally {
      setIsSubmitting(false);
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
            const count = services.filter((service) => {
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
                onClick={() => setActiveServiceType(button.key)}
                disabled={count === 0}
              >
                {button.label}
              </button>
            );
          })}
        </div>
      ) : null}

      {activeServiceType ? (
        <form ref={formRef} className="entity-form compact-form service-entry-form" onSubmit={handleSubmit}>
          <div className="service-entry-form-head">
            <div>
              <strong>{SERVICE_TYPE_BUTTONS.find((button) => button.key === activeServiceType)?.label}</strong>
              <p>{submitLabel}</p>
            </div>
            {!isEditing ? (
              <button type="button" className="secondary-button" onClick={() => setActiveServiceType(null)}>
                Cancel
              </button>
            ) : null}
          </div>

          {!(activeServiceType === 'hotel' && !isEditing) ? (
            <label>
              {activeServiceType === 'transport'
                ? 'Transport selector'
                : activeServiceType === 'activity'
                  ? 'Activity selector'
                  : activeServiceType === 'meal'
                    ? 'Meal service'
                    : activeServiceType === 'externalPackage'
                      ? 'External package service'
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

          {!isEditing && preferredServiceId && activeServiceType !== 'hotel' ? (
            <p className="form-helper">Catalog selection applied. You can keep this service or switch to another option before saving.</p>
          ) : null}
          {!isEditing && preferredHotelId && isHotelService ? (
            <p className="form-helper">Catalog hotel selection applied. Complete the contract and rate fields below to finish the stay setup.</p>
          ) : null}
          {!isEditing && preferredRouteId && isTransportService ? (
            <p className="form-helper">Catalog route selection applied. Choose the transport service type to complete transfer pricing.</p>
          ) : null}

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

          {!isHotelService && !isMealService ? (
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

              <div className={useOverride ? 'quote-item-override-status quote-item-override-status-active' : 'quote-item-override-status'}>
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
          ) : null}

          {!isHotelService && !isMealService && useOverride ? (
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

          {isGuideService ? (
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

          {isMealService ? (
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

          {isExternalPackageService ? (
            <>
              <div className="form-row form-row-4">
                <label>
                  Country
                  <input
                    value={externalPackage.country}
                    onChange={(event) => setExternalPackage((current) => ({ ...current, country: event.target.value }))}
                    placeholder="Egypt"
                    required
                  />
                </label>

                <label>
                  Supplier name
                  <input
                    value={externalPackage.supplierName}
                    onChange={(event) => setExternalPackage((current) => ({ ...current, supplierName: event.target.value }))}
                    placeholder="Internal supplier"
                  />
                </label>

                <label>
                  Start day
                  <input
                    value={externalPackage.startDay}
                    onChange={(event) => setExternalPackage((current) => ({ ...current, startDay: event.target.value }))}
                    type="number"
                    min="1"
                  />
                </label>

                <label>
                  End day
                  <input
                    value={externalPackage.endDay}
                    onChange={(event) => setExternalPackage((current) => ({ ...current, endDay: event.target.value }))}
                    type="number"
                    min="1"
                  />
                </label>
              </div>

              <div className="form-row form-row-4">
                <label>
                  Start date
                  <input
                    value={externalPackage.startDate}
                    onChange={(event) => setExternalPackage((current) => ({ ...current, startDate: event.target.value }))}
                    type="date"
                  />
                </label>

                <label>
                  End date
                  <input
                    value={externalPackage.endDate}
                    onChange={(event) => setExternalPackage((current) => ({ ...current, endDate: event.target.value }))}
                    type="date"
                  />
                </label>

                <label>
                  Pricing basis
                  <select
                    value={externalPackage.pricingBasis}
                    onChange={(event) =>
                      setExternalPackage((current) => ({
                        ...current,
                        pricingBasis: event.target.value as ExternalPackagePricingBasis,
                      }))
                    }
                    required
                  >
                    {EXTERNAL_PACKAGE_PRICING_BASIS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Currency
                  <input
                    value={externalPackage.currency}
                    onChange={(event) => setExternalPackage((current) => ({ ...current, currency: event.target.value.toUpperCase() }))}
                    maxLength={3}
                    required
                  />
                </label>
              </div>

              <div className="form-row form-row-3">
                <label>
                  Net cost
                  <input
                    value={externalPackage.netCost}
                    onChange={(event) => setExternalPackage((current) => ({ ...current, netCost: event.target.value }))}
                    type="number"
                    min="0"
                    step="0.01"
                    required
                  />
                </label>

                <div className="quote-item-override-status quote-item-override-status-active">
                  <strong>External package cost</strong>
                  <span>
                    {finalCost !== null && Number.isFinite(finalCost)
                      ? `${displayCurrency} ${finalCost.toFixed(2)} ${externalPackage.pricingBasis === 'PER_PERSON' ? `for ${Math.max(1, Number(paxCount || defaultPaxCount || 1))} pax` : 'per group'}`
                      : 'Enter net cost'}
                  </span>
                </div>
              </div>

              <div className="form-row form-row-3">
                <label>
                  Client description
                  <textarea
                    value={externalPackage.clientDescription}
                    onChange={(event) => setExternalPackage((current) => ({ ...current, clientDescription: event.target.value }))}
                    placeholder="Client-facing program description"
                    required
                  />
                </label>

                <label>
                  Includes
                  <textarea
                    value={externalPackage.includes}
                    onChange={(event) => setExternalPackage((current) => ({ ...current, includes: event.target.value }))}
                    placeholder="Client-facing inclusions"
                  />
                </label>

                <label>
                  Excludes
                  <textarea
                    value={externalPackage.excludes}
                    onChange={(event) => setExternalPackage((current) => ({ ...current, excludes: event.target.value }))}
                    placeholder="Client-facing exclusions"
                  />
                </label>
              </div>

              <div className="form-row">
                <label>
                  Internal notes
                  <textarea
                    value={externalPackage.internalNotes}
                    onChange={(event) => setExternalPackage((current) => ({ ...current, internalNotes: event.target.value }))}
                    placeholder="Internal only"
                  />
                </label>
              </div>
            </>
          ) : null}

          {isActivityService ? (
            <>
              <div className="form-row form-row-3">
                <label>
                  Service date
                  <input value={serviceDate} onChange={(event) => setServiceDate(event.target.value)} type="date" />
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
                  Resolved service date
                  <input value={serviceDate || resolvedActivityServiceDate || ''} readOnly placeholder="Needs service date or travel start date + itinerary day" />
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

                <label className="quote-item-override-toggle">
                  <span>Reconfirmation required</span>
                  <input
                    checked={reconfirmationRequired}
                    onChange={(event) => setReconfirmationRequired(event.target.checked)}
                    type="checkbox"
                  />
                </label>
              </div>

              <div className="form-row form-row-4">
                <label>
                  Participant count
                  <input
                    value={participantCount}
                    onChange={(event) => setParticipantCount(event.target.value)}
                    type="number"
                    min="0"
                  />
                </label>

                <label>
                  Adult count
                  <input value={adultCount} onChange={(event) => setAdultCount(event.target.value)} type="number" min="0" />
                </label>

                <label>
                  Child count
                  <input value={childCount} onChange={(event) => setChildCount(event.target.value)} type="number" min="0" />
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

          {isHotelService ? (
            <div className="form-row form-row-4">
              <label>
                Hotel selector
                <select value={hotelId} onChange={(event) => setHotelId(event.target.value)} required>
                  {hotels.length === 0 ? <option value="">Create a hotel first</option> : null}
                  {hotels.map((hotel) => (
                    <option key={hotel.id} value={hotel.id}>
                      {hotel.name}
                    </option>
                  ))}
                </select>
              </label>

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
            </div>
          ) : null}

          {isHotelService ? (
            <div className="form-row form-row-4">
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
                Check-in date
                <input value={hotelCheckInDate} onChange={(event) => setServiceDate(event.target.value)} type="date" required />
              </label>

              <label>
                Check-out date
                <input value={hotelCheckOutDate} readOnly />
              </label>

              <label>
                Room count
                <input value={roomCount} onChange={(event) => setRoomCount(event.target.value)} type="number" min="1" required />
              </label>

              <label>
                Contract pricing
                <input
                  value={
                    hotelCostCalculation
                      ? `${displayCurrency} ${Number(hotelCostCalculation.totalCost || 0).toFixed(2)}`
                      : isLoadingHotelCost
                        ? 'Loading contract pricing...'
                        : activeHotelSourceRate
                          ? `${activeHotelSourceRate.currency} ${Number(activeHotelSourceRate.cost || 0).toFixed(2)}`
                        : ''
                  }
                  readOnly
                  placeholder="Select hotel dates and rate inputs"
                />
              </label>
            </div>
          ) : null}

          {isHotelService ? (
            <div className="quote-hotel-source-panel">
              <div>
                <p className="eyebrow">Source Contract Rate</p>
                <h4>{activeHotelSourceRate ? activeHotelSourceRate.roomCategoryLabel : 'No source rate selected yet'}</h4>
                <p className="detail-copy">
                  {activeHotelSourceRate
                    ? `${activeHotelSourceRate.mealPlan} board · ${activeHotelSourceRate.occupancyType} occupancy`
                    : 'Use the hotel workflow modal to inspect contract rates and choose one as the source reference.'}
                </p>
              </div>
              <div className="quote-preview-total-list quote-hotel-source-summary">
                <div>
                  <span>Source cost</span>
                  <strong>
                    {activeHotelSourceRate
                      ? `${activeHotelSourceRate.currency} ${Number(activeHotelSourceRate.cost || 0).toFixed(2)}`
                      : 'Pricing to be confirmed'}
                  </strong>
                </div>
                <div>
                  <span>Context</span>
                  <strong>{activeHotelSourceRate?.note || 'Select a contract rate'}</strong>
                </div>
              </div>
              {hotelCostCalculation ? (
                <div className="quote-preview-total-list quote-hotel-nightly-breakdown">
                  <div>
                    <span>Total contract cost</span>
                    <strong>
                      {displayCurrency} {Number(hotelCostCalculation.totalCost || 0).toFixed(2)}
                    </strong>
                  </div>
                  {hotelCostCalculation.breakdown.map((night) => (
                    <div key={night.date}>
                      <span>{night.date}</span>
                      <strong>
                        {displayCurrency} {Number(night.cost || 0).toFixed(2)}
                      </strong>
                    </div>
                  ))}
                </div>
              ) : null}
              {selectedHotelContract?.ratePolicies?.length ? (
                <div className="quote-preview-total-list">
                  {selectedHotelContract.ratePolicies.map((policy, index) => (
                    <div key={`${policy.policyType}-${index}`}>
                      <span>{policy.policyType.replace(/_/g, ' ')}</span>
                      <strong>{formatRatePolicy(policy, selectedHotelContract.currency || displayCurrency)}</strong>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {isHotelService ? (
            <div className="quote-hotel-override-panel">
              <div className="quote-hotel-override-panel-head">
                <div>
                  <p className="eyebrow">Quote-only Override</p>
                  <h4>Override contract rate for this quote</h4>
                  <p className="detail-copy">This affects this quote only.</p>
                </div>
                <label className="quote-item-override-toggle">
                  <span>Override contract rate for this quote</span>
                  <input checked={useOverride} onChange={(event) => setUseOverride(event.target.checked)} type="checkbox" />
                </label>
              </div>

              {useOverride ? (
                <div className="quote-hotel-override-grid">
                  <label className="quote-item-override quote-item-override-active">
                    <span>Quote-only override cost</span>
                    <input
                      value={overrideCost}
                      onChange={(event) => setOverrideCost(event.target.value)}
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Enter quote-only hotel cost"
                    />
                  </label>

                  <label>
                    Override reason
                    <input
                      value={overrideReason}
                      onChange={(event) => setOverrideReason(event.target.value)}
                      placeholder="Reason for this quote-only rate"
                    />
                  </label>

                  <div className="quote-item-override-status quote-item-override-status-active">
                    <strong>Manual override applied</strong>
                    <span>
                      {finalCost !== null && Number.isFinite(finalCost)
                        ? `Final cost ${displayCurrency} ${finalCost.toFixed(2)}`
                        : 'Enter a quote-only override or use the popup below.'}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="quote-item-override-status">
                  <strong>Using source contract rate</strong>
                  <span>
                    {baseCost
                      ? `Final cost ${displayCurrency} ${Number(baseCost).toFixed(2)}`
                      : activeHotelSourceRate
                        ? `${activeHotelSourceRate.currency} ${Number(activeHotelSourceRate.cost || 0).toFixed(2)} from the selected contract reference`
                        : 'Choose a source rate first, or enable quote-only override.'}
                  </span>
                </div>
              )}
            </div>
          ) : null}

          {isHotelService ? (
            <div className="quote-hotel-rate-helper">
              <div>
                <strong>Need a quote-only hotel price input?</strong>
                <p>
                  Open the hotel rate popup to enter or copy quote-only override rows without changing hotel master data.
                </p>
              </div>
              <button type="button" className="secondary-button" onClick={() => setShowHotelRateModal(true)}>
                Open Quote Override Popup
              </button>
            </div>
          ) : null}

          {isHotelService && manualHotelRateDraft ? (
            <div className="quote-preview-total-list quote-hotel-rate-inline-summary">
              <div>
                <span>Override room type</span>
                <strong>
                  {roomCategoryOptions.find((category) => category.id === manualHotelRateDraft.roomCategoryId)?.name || 'Selected room'}
                </strong>
              </div>
              <div>
                <span>Override basis</span>
                <strong>
                  {manualHotelRateDraft.mealPlan} / {manualHotelRateDraft.occupancyType}
                </strong>
              </div>
              <div>
                <span>Quote-only cost / sell</span>
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

          {isTransportService ? (
            <div className="form-row">
              <label>
                Transport selector
                <select
                  value={transportServiceTypeId}
                  onChange={(event) => {
                    setTransportServiceTypeId(event.target.value);
                    setTransportSuggestionOverridden(true);
                  }}
                  required
                >
                  <option value="">Select service type</option>
                  {transportServiceTypes.map((serviceType) => (
                    <option key={serviceType.id} value={serviceType.id}>
                      {serviceType.name} ({serviceType.code})
                    </option>
                  ))}
                </select>
              </label>

              <RouteCombobox
                label="Route"
                routes={validTransportRoutes}
                value={routeId}
                onChange={(value) => {
                  setRouteId(value);
                  setRouteName('');
                  setBaseCost('');
                  setResolvedTransportPricing(null);
                  setTransportSuggestionOverridden(false);
                }}
                placeholder="Select origin -> destination route"
              />
            </div>
          ) : null}

          {isTransportService ? (
            <div className="form-row">
              <label>
                Legacy route text
                <input
                  value={routeName}
                  onChange={(event) => {
                    setRouteName(event.target.value);
                    setTransportSuggestionOverridden(true);
                  }}
                  placeholder="Airport - Hotel"
                  disabled={Boolean(routeId)}
                />
              </label>
            </div>
          ) : null}

          {isTransportService ? (
            <div className="quote-selected-transport-card">
              <div className="form-row form-row-3">
                <label>
                  Resolved vehicle
                  <input
                    value={resolvedTransportPricing?.vehicle.name || ''}
                    readOnly
                    placeholder={isLoadingTransportCost ? 'Resolving vehicle...' : 'Auto from pricing rule'}
                  />
                </label>

                <label>
                  Resolved pricing
                  <input
                    value={
                      resolvedTransportPricing
                        ? `${resolvedTransportPricing.currency} ${resolvedTransportPricing.price.toFixed(2)}`
                        : ''
                    }
                    readOnly
                    placeholder={isLoadingTransportCost ? 'Resolving cost...' : 'Auto from pricing rule'}
                  />
                </label>

                <label>
                  Pricing rule
                  <input
                    value={
                      resolvedTransportPricing
                        ? `${resolvedTransportPricing.serviceType.name} | ${resolvedTransportPricing.routeName}`
                        : ''
                    }
                    readOnly
                    placeholder={isLoadingTransportCost ? 'Resolving rule...' : 'Auto from route, service type, and pax'}
                  />
                </label>

                {resolvedTransportPricing?.unitCount ? (
                  <label>
                    Unit count
                    <input
                      value={
                        resolvedTransportPricing.unitCapacity
                          ? `${resolvedTransportPricing.unitCount} units required (${resolvedTransportPricing.unitCapacity} pax each)`
                          : `${resolvedTransportPricing.unitCount} units required`
                      }
                      readOnly
                    />
                  </label>
                ) : null}
              </div>

              {resolvedTransportPricing ? (
                <div className="quote-selected-transport-explanation">
                  <strong>{transportSuggestionOverridden ? 'Selected transport option' : 'Auto-selected for you. You can change this.'}</strong>
                  {transportRecommendationReasons.length > 0 ? (
                    <ul>
                      {transportRecommendationReasons.map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>
                      {transportSuggestionOverridden
                        ? 'You changed the transport selection. Pricing is based on the selected route, service type, and pax.'
                        : 'Selected from the best available pricing for this route and pax.'}
                    </p>
                  )}
                </div>
              ) : null}
            </div>
          ) : null}

          {isTransportService &&
          resolvedTransportPricing?.pricingMode === 'capacity_unit' &&
          resolvedTransportPricing.unitCount &&
          resolvedTransportPricing.discountedBaseCost !== undefined ? (
            <p className="form-helper">
              {`${resolvedTransportPricing.currency} ${resolvedTransportPricing.discountedBaseCost.toFixed(2)} per unit -> ${resolvedTransportPricing.unitCount} units -> ${resolvedTransportPricing.currency} ${resolvedTransportPricing.price.toFixed(2)} total`}
            </p>
          ) : null}

          {isTransportService && transportCandidates.length > 0 ? (
            <div className="stacked-card">
              <div className="panel-header" style={{ marginBottom: 12 }}>
                <div>
                  <p className="eyebrow">Smart Transport Suggestions</p>
                  <h3 className="section-title" style={{ fontSize: '1rem' }}>
                    {quoteType} / {Number(paxCount) || defaultPaxCount || 1} pax
                  </h3>
                </div>
              </div>

              <div className="quote-preview-total-list">
                {transportCandidates.map((candidate) => (
                  <button
                    key={`${candidate.vehicle.id}:${candidate.routeId || candidate.routeName}`}
                    type="button"
                    className="quote-transport-suggestion-option"
                    onClick={() => applyTransportCandidate(candidate, { userInitiated: true })}
                    style={
                      candidate.isRecommended || candidate.isBestValue
                        ? { borderColor: 'var(--color-accent)', background: 'var(--color-surface-muted)' }
                        : undefined
                    }
                  >
                    <span>
                      {candidate.vehicle.name}
                      {candidate.isRecommended ? <span className="status-badge" style={{ marginLeft: 8 }}>Recommended</span> : null}
                      {candidate.isBestValue ? <span className="status-badge" style={{ marginLeft: 8 }}>Best Value</span> : null}
                    </span>
                    <strong>
                      {candidate.currency} {candidate.price.toFixed(2)}
                    </strong>
                    <span>
                      {candidate.category} / {candidate.vehicle.maxPax} pax capacity
                      {candidate.unitCount ? ` / ${candidate.unitCount} unit${candidate.unitCount === 1 ? '' : 's'}` : ''}
                    </span>
                  </button>
                ))}
              </div>

              {!hasRecommendedTransportCandidate ? (
                <p className="form-helper">
                  Recommended vehicle not available for this route. Showing best available options.
                </p>
              ) : null}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={
              isSubmitting ||
              isLoadingTransportCost ||
              filteredServices.length === 0 ||
              !selectedService ||
              (isHotelService && !selectedHotelRate && !manualHotelRateDraft)
            }
          >
            {isSubmitting ? 'Saving...' : submitLabel}
          </button>

          {isHotelService && !selectedHotelRate && !manualHotelRateDraft ? (
            <p className="form-error">No hotel rate matches the selected contract, season, room category, occupancy, and meal plan.</p>
          ) : null}
          {isTransportService && !baseCost && !isLoadingTransportCost && transportServiceTypeId && (routeId || routeName.trim()) ? (
            <p className="form-error">No transport pricing rule matches the selected route, service type, and pax count.</p>
          ) : null}
          {error ? <p className="form-error">{error}</p> : null}
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
