'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RouteCombobox } from '../../components/RouteCombobox';
import { getErrorMessage, readJsonResponse } from '../../lib/api';
import { buildAuthHeaders } from '../../lib/auth-client';
import { RouteOption } from '../../lib/routes';
import { QuoteHotelRateDraftRow, QuoteHotelRateModal } from './QuoteHotelRateModal';

type SupplierService = {
  id: string;
  supplierId: string;
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

type Season = {
  id: string;
  name: string;
};

type TransportServiceType = {
  id: string;
  name: string;
  code: string;
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

const SERVICE_TYPE_BUTTONS = [
  { key: 'hotel', label: 'Add Hotel' },
  { key: 'transport', label: 'Add Transport' },
  { key: 'guide', label: 'Add Guide' },
  { key: 'activity', label: 'Add Activity' },
  { key: 'meal', label: 'Add Meal' },
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
  const [activeServiceType, setActiveServiceType] = useState<ServiceTypeKey | null>(
    initialService ? getServiceTypeKey(initialService) : initialServiceTypeKey || null,
  );
  const [serviceId, setServiceId] = useState(initialValues?.serviceId || preferredServiceId || '');
  const [quantity, setQuantity] = useState(initialValues?.quantity || '1');
  const [markupPercent, setMarkupPercent] = useState(initialValues?.markupPercent || '20');
  const [paxCount, setPaxCount] = useState(initialValues?.paxCount || String(defaultPaxCount || 1));
  const [participantCount, setParticipantCount] = useState(initialValues?.participantCount || String(defaultPaxCount || 1));
  const [adultCount, setAdultCount] = useState(initialValues?.adultCount || String(defaultAdultCount || 0));
  const [childCount, setChildCount] = useState(initialValues?.childCount || String(defaultChildCount || 0));
  const [roomCount, setRoomCount] = useState(initialValues?.roomCount || String(defaultRoomCount || 1));
  const [nightCount, setNightCount] = useState(initialValues?.nightCount || String(defaultNightCount || 1));
  const [dayCount, setDayCount] = useState(initialValues?.dayCount || '1');
  const [serviceDate, setServiceDate] = useState(initialValues?.serviceDate || '');
  const [startTime, setStartTime] = useState(initialValues?.startTime || '');
  const [pickupTime, setPickupTime] = useState(initialValues?.pickupTime || '');
  const [pickupLocation, setPickupLocation] = useState(initialValues?.pickupLocation || '');
  const [meetingPoint, setMeetingPoint] = useState(initialValues?.meetingPoint || '');
  const [reconfirmationRequired, setReconfirmationRequired] = useState(initialValues?.reconfirmationRequired || false);
  const [reconfirmationDueAt, setReconfirmationDueAt] = useState(initialValues?.reconfirmationDueAt || '');
  const [baseCost, setBaseCost] = useState(initialValues?.baseCost || '');
  const [overrideCost, setOverrideCost] = useState(initialValues?.overrideCost || '');
  const [useOverride, setUseOverride] = useState(initialValues?.useOverride || false);
  const [transportServiceTypeId, setTransportServiceTypeId] = useState(initialValues?.transportServiceTypeId || '');
  const [routeId, setRouteId] = useState(initialValues?.routeId || preferredRouteId || '');
  const [routeName, setRouteName] = useState(initialValues?.routeName || '');
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
  const [resolvedTransportPricing, setResolvedTransportPricing] = useState<ResolvedTransportPricing | null>(null);
  const [selectedBlockId, setSelectedBlockId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingTransportCost, setIsLoadingTransportCost] = useState(false);
  const [error, setError] = useState('');
  const [showHotelRateModal, setShowHotelRateModal] = useState(false);
  const [manualHotelRateDraft, setManualHotelRateDraft] = useState<QuoteHotelRateDraftRow | null>(null);
  const [hotelRateReference, setHotelRateReference] = useState<HotelRateReference | null>(null);
  const [pendingHotelRateSubmit, setPendingHotelRateSubmit] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const serviceBlocks = blocks.filter((block) => block.type === 'SERVICE_BLOCK');

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
  const filteredHotelContracts = hotelContracts.filter((contract) => contract.hotelId === hotelId);
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
  const displayCurrency = preferredRateCurrency || selectedHotelRate?.currency || selectedService?.currency || 'USD';
  const resolvedActivityServiceDate = isActivityService && !serviceDate ? resolveDerivedServiceDate(travelStartDate, itineraryDayNumber) : null;
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
      setBaseCost(selectedHotelRate ? String(selectedHotelRate.cost) : '');
      return;
    }

    if (isGuideService) {
      setBaseCost(String(GUIDE_RATES[guideType][guideDuration] + (overnight === 'yes' ? GUIDE_OVERNIGHT_SUPPLEMENT : 0)));
      return;
    }

    if (isTransportService) {
      return;
    }

    setBaseCost(String(selectedService.baseCost));
  }, [
    guideDuration,
    guideType,
    isGuideService,
    isHotelService,
    isTransportService,
    overnight,
    selectedHotelRate,
    selectedService,
  ]);

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

  useEffect(() => {
    if (!isTransportService) {
      return;
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
  }, [apiBaseUrl, isTransportService, paxCount, routeId, routeName, transportServiceTypeId]);

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
        note: effectiveSeasonName || 'Contract rate',
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
        if (!hotelId || !contractId || !seasonName || !roomCategoryId || !occupancyType || !mealPlan) {
          throw new Error('Complete the hotel pricing selection.');
        }

        if (!selectedHotelRate && !manualHotelRateDraft) {
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

      if (useOverride && !overrideCost.trim()) {
        throw new Error('Override cost is required when override is enabled.');
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

      const response = await fetch(endpoint, {
        method: isEditing ? 'PATCH' : 'POST',
        headers: buildAuthHeaders({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          serviceId,
          itineraryId,
          serviceDate: isActivityService && serviceDate ? new Date(`${serviceDate}T09:00:00`).toISOString() : undefined,
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
          quantity: Number(quantity),
          paxCount: Number(paxCount),
          roomCount: isTransportService || isGuideService ? undefined : Number(roomCount),
          nightCount: isTransportService || isGuideService ? undefined : Number(nightCount),
          dayCount: isTransportService || isGuideService ? undefined : Number(dayCount),
          overrideCost: overrideCost.trim() ? Number(overrideCost) : null,
          useOverride,
          markupPercent: Number(markupPercent),
          transportServiceTypeId: isTransportService ? transportServiceTypeId : undefined,
          routeId: isTransportService ? routeId || undefined : undefined,
          routeName: isTransportService ? routeName.trim() : undefined,
          guideType: isGuideService ? guideType : undefined,
          guideDuration: isGuideService ? guideDuration : undefined,
          overnight: isGuideService ? overnight === 'yes' : undefined,
        }),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, `Could not ${isEditing ? 'update' : 'add'} quote item.`));
      }

      if (!isEditing) {
        setQuantity('1');
        setMarkupPercent('20');
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
              Service
              <select value={serviceId} onChange={(event) => setServiceId(event.target.value)} required disabled={filteredServices.length === 0}>
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
                <input value={quantity} onChange={(event) => setQuantity(event.target.value)} type="number" min="1" required />
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

            {!isTransportService ? (
              <label>
                Base cost
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

            {!isTransportService && !isGuideService ? (
              <label>
                Day count
                <input value={dayCount} onChange={(event) => setDayCount(event.target.value)} type="number" min="1" required />
              </label>
            ) : null}
          </div>

          {!isHotelService ? (
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
                <strong>{useOverride ? 'Override active' : 'Using base cost'}</strong>
                <span>
                  {useOverride && overrideCost.trim()
                    ? `${displayCurrency} ${Number(overrideCost).toFixed(2)}`
                    : baseCost
                      ? `${displayCurrency} ${Number(baseCost).toFixed(2)}`
                      : isLoadingTransportCost
                        ? 'Loading transport rate...'
                        : 'Select pricing inputs'}
                </span>
              </div>
            </div>
          ) : null}

          <div className="form-row form-row-3">
            <label>
              Pax count
              <input value={paxCount} onChange={(event) => setPaxCount(event.target.value)} type="number" min="1" required />
            </label>

            {!isHotelService && !isTransportService && !isGuideService ? (
              <label>
                Room count
                <input value={roomCount} onChange={(event) => setRoomCount(event.target.value)} type="number" min="1" required />
              </label>
            ) : null}

            {!isTransportService && !isGuideService ? (
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
                Hotel
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
                Room count
                <input value={roomCount} onChange={(event) => setRoomCount(event.target.value)} type="number" min="1" required />
              </label>

              <label>
                Source rate
                <input
                  value={
                    activeHotelSourceRate
                      ? `${activeHotelSourceRate.currency} ${Number(activeHotelSourceRate.cost || 0).toFixed(2)}`
                        : ''
                  }
                  readOnly
                  placeholder="Select a contract rate reference"
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

                  <div className="quote-item-override-status quote-item-override-status-active">
                    <strong>Quote override active</strong>
                    <span>
                      {overrideCost.trim()
                        ? `${displayCurrency} ${Number(overrideCost).toFixed(2)}`
                        : 'Enter a quote-only override or use the popup below.'}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="quote-item-override-status">
                  <strong>Using source contract rate</strong>
                  <span>
                    {activeHotelSourceRate
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
                Transport service type
                <select value={transportServiceTypeId} onChange={(event) => setTransportServiceTypeId(event.target.value)} required>
                  <option value="">Select service type</option>
                  {transportServiceTypes.map((serviceType) => (
                    <option key={serviceType.id} value={serviceType.id}>
                      {serviceType.name} ({serviceType.code})
                    </option>
                  ))}
                </select>
              </label>

              <RouteCombobox
                label="Saved route"
                routes={routes.filter((route) => route.isActive || route.id === routeId)}
                value={routeId}
                onChange={(value) => {
                  setRouteId(value);
                  if (value) {
                    setRouteName('');
                  }
                }}
                placeholder="Search active routes"
              />
            </div>
          ) : null}

          {isTransportService ? (
            <div className="form-row">
              <label>
                Legacy route text
                <input
                  value={routeName}
                  onChange={(event) => setRouteName(event.target.value)}
                  placeholder="Airport - Hotel"
                  disabled={Boolean(routeId)}
                />
              </label>
            </div>
          ) : null}

          {isTransportService ? (
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
          ) : null}

          {isTransportService &&
          resolvedTransportPricing?.pricingMode === 'capacity_unit' &&
          resolvedTransportPricing.unitCount &&
          resolvedTransportPricing.discountedBaseCost !== undefined ? (
            <p className="form-helper">
              {`${resolvedTransportPricing.currency} ${resolvedTransportPricing.discountedBaseCost.toFixed(2)} per unit -> ${resolvedTransportPricing.unitCount} units -> ${resolvedTransportPricing.currency} ${resolvedTransportPricing.price.toFixed(2)} total`}
            </p>
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
