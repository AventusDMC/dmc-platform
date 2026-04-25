'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getErrorMessage, readJsonResponse } from '../../lib/api';
import { buildAuthHeaders } from '../../lib/auth-client';
import { formatRouteLabel, type RouteOption } from '../../lib/routes';
import { getQuoteServiceCategoryKey } from './quote-readiness';

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
  roomCategories: Array<{
    id: string;
    name: string;
    code: string | null;
    isActive: boolean;
  }>;
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

type TransportServiceType = {
  id: string;
  name: string;
  code: string;
};

type OptimizationMode = 'cost' | 'comfort';

type TransportPricingCandidate = {
  routeId?: string | null;
  routeName: string;
  pricingMode?: 'per_vehicle' | 'capacity_unit';
  unitCapacity?: number | null;
  unitCount?: number | null;
  price: number;
  currency: string;
  vehicle: {
    id: string;
    name: string;
    maxPax: number;
    luggageCapacity?: number | null;
  };
  serviceType: {
    id: string;
    name: string;
    code: string | null;
  };
};

type TransportPricingResult = {
  price: number;
  currency: string;
  vehicle: TransportPricingCandidate['vehicle'];
  serviceType: TransportPricingCandidate['serviceType'];
  candidates?: TransportPricingCandidate[];
};

type Quote = {
  id: string;
  quoteType: 'FIT' | 'GROUP';
  travelStartDate: string | null;
  adults: number;
  children: number;
  roomCount: number;
  nightCount: number;
  itineraries: Array<{
    id: string;
    dayNumber: number;
    title: string;
    description: string | null;
  }>;
};

type PreviewDay = {
  dayNumber: number;
  title: string;
  city: string;
  date: string | null;
};

type PreviewTransport = {
  dayNumber: number;
  fromCity: string;
  toCity: string;
  route: RouteOption | null;
  selectedCandidate: TransportPricingCandidate | null;
  optimizationReason: string;
};

type PreviewHotel = {
  dayNumber: number;
  city: string;
  hotel: Hotel | null;
  contract: HotelContract | null;
  rate: HotelRate | null;
};

type PreviewActivity = {
  dayNumber: number;
  city: string;
  service: SupplierService | null;
};

type ItineraryWarning = {
  id: string;
  title: string;
  description: string;
};

type PreviewDraft = {
  days: PreviewDay[];
  transports: PreviewTransport[];
  hotels: PreviewHotel[];
  activities: PreviewActivity[];
  optimizationNotes: string[];
  warnings: ItineraryWarning[];
};

type ComparisonOption = {
  mode: OptimizationMode;
  draft: PreviewDraft;
  totalPrice: number;
  pricePerPax: number;
  currency: string;
};

type ComparisonState = {
  cost: ComparisonOption;
  comfort: ComparisonOption;
};

type ManualDayOverrides = Record<number, Partial<Pick<PreviewDay, 'title' | 'city'>>>;

type CreatedDay = {
  id: string;
  dayNumber: number;
  title: string;
  description: string | null;
};

type QuoteAutoItineraryBuilderProps = {
  apiBaseUrl: string;
  quote: Quote;
  services: SupplierService[];
  transportServiceTypes: TransportServiceType[];
  routes: RouteOption[];
  hotels: Hotel[];
  hotelContracts: HotelContract[];
  hotelRates: HotelRate[];
  totalPax: number;
};

const INVALID_ROUTE_PATTERNS = [/extra\s*km/i, /stationary/i, /per\s*hour/i, /hourly/i];
const KEY_JORDAN_LANDMARKS = ['Petra', 'Wadi Rum', 'Dead Sea'];
const ITINERARY_PRESETS = [
  {
    id: 'jordan-classic',
    name: 'Jordan Classic',
    nights: 4,
    route: 'Amman -> Petra -> Wadi Rum -> Dead Sea',
  },
  {
    id: 'jordan-express',
    name: 'Jordan Express',
    nights: 2,
    route: 'Amman -> Petra -> Amman',
  },
  {
    id: 'jordan-luxury',
    name: 'Jordan Luxury',
    nights: 5,
    route: 'Amman -> Dead Sea -> Petra -> Wadi Rum -> Aqaba',
  },
  {
    id: 'jordan-adventure',
    name: 'Jordan Adventure',
    nights: 5,
    route: 'Amman -> Jerash -> Dana -> Petra -> Wadi Rum',
  },
] as const;

function formatDateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function addDays(dateText: string, offset: number) {
  if (!dateText) {
    return null;
  }

  const date = new Date(`${dateText}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  date.setDate(date.getDate() + offset);
  return formatDateOnly(date);
}

function normalizeText(value: string | null | undefined) {
  return (value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseRouteText(value: string) {
  return value
    .split(/\s*(?:->|>|,|\n|\u2192)\s*/g)
    .map((part) => part.trim())
    .filter(Boolean);
}

function routeEndpointText(route: RouteOption, side: 'fromPlace' | 'toPlace') {
  const place = route[side];
  return normalizeText([place?.name, place?.city, place?.country].filter(Boolean).join(' '));
}

function isValidRoute(route: RouteOption) {
  const label = formatRouteLabel(route);
  return route.isActive !== false && !INVALID_ROUTE_PATTERNS.some((pattern) => pattern.test(label));
}

function findRoute(routes: RouteOption[], fromCity: string, toCity: string) {
  const from = normalizeText(fromCity);
  const to = normalizeText(toCity);

  if (!from || !to || from === to) {
    return null;
  }

  return (
    routes.find((route) => {
      if (!isValidRoute(route)) {
        return false;
      }

      const routeFrom = routeEndpointText(route, 'fromPlace');
      const routeTo = routeEndpointText(route, 'toPlace');
      return routeFrom.includes(from) && routeTo.includes(to);
    }) || null
  );
}

function getRouteMetric(route: RouteOption, mode: OptimizationMode) {
  if (mode === 'comfort') {
    return route.durationMinutes ?? route.distanceKm ?? Number.MAX_SAFE_INTEGER;
  }

  return route.distanceKm ?? route.durationMinutes ?? Number.MAX_SAFE_INTEGER;
}

function optimizeCitySequence(cities: string[], routes: RouteOption[], mode: OptimizationMode) {
  const notes: string[] = [];
  const uniqueCities = cities.filter((city, index) => {
    const normalized = normalizeText(city);

    if (!normalized) {
      return false;
    }

    if (index > 0 && normalizeText(cities[index - 1]) === normalized) {
      notes.push(`Removed duplicate stop in ${city} to avoid an unnecessary transfer.`);
      return false;
    }

    if (cities.slice(0, index).some((previous) => normalizeText(previous) === normalized)) {
      notes.push(`Removed repeat visit to ${city} to avoid backtracking.`);
      return false;
    }

    return true;
  });

  if (uniqueCities.length <= 2) {
    return { cities: uniqueCities, notes };
  }

  const ordered = [uniqueCities[0]];
  const remaining = uniqueCities.slice(1);

  while (remaining.length > 0) {
    const currentCity = ordered[ordered.length - 1];
    const nextCandidate = remaining
      .map((city, index) => ({
        city,
        index,
        route: findRoute(routes, currentCity, city),
      }))
      .filter((candidate): candidate is { city: string; index: number; route: RouteOption } => Boolean(candidate.route))
      .sort((left, right) => getRouteMetric(left.route, mode) - getRouteMetric(right.route, mode))[0];

    if (!nextCandidate) {
      ordered.push(remaining.shift() as string);
      continue;
    }

    ordered.push(nextCandidate.city);
    remaining.splice(nextCandidate.index, 1);
  }

  if (ordered.join('|') !== uniqueCities.join('|')) {
    notes.push(
      mode === 'comfort'
        ? 'Reordered stops to favor shorter drive times and reduce backtracking.'
        : 'Reordered stops to favor shorter route distance and reduce transfer cost.',
    );
  }

  return { cities: ordered, notes };
}

function findService(services: SupplierService[], category: 'hotel' | 'transport' | 'activity') {
  return services.find((service) => getQuoteServiceCategoryKey(service) === category) || null;
}

function findHotelSetup(values: {
  city: string;
  travelDate: string | null;
  hotels: Hotel[];
  hotelContracts: HotelContract[];
  hotelRates: HotelRate[];
  optimizationMode: OptimizationMode;
}) {
  const cityKey = normalizeText(values.city);
  const cityHotels = values.hotels.filter(
    (candidate) => normalizeText(candidate.city).includes(cityKey) || cityKey.includes(normalizeText(candidate.city)),
  );

  if (cityHotels.length === 0) {
    return { hotel: null, contract: null, rate: null };
  }

  const travelTime = values.travelDate ? new Date(`${values.travelDate}T00:00:00`).getTime() : null;
  const setups = cityHotels.map((hotel) => {
    const contracts = values.hotelContracts.filter((contract) => contract.hotelId === hotel.id);
    const validContracts = contracts.filter((candidate) => {
      if (!travelTime) {
        return true;
      }

      return new Date(candidate.validFrom).getTime() <= travelTime && new Date(candidate.validTo).getTime() >= travelTime;
    });
    const contract = validContracts[0] || contracts[0] || null;
    const rates = contract ? values.hotelRates.filter((rate) => rate.contractId === contract.id) : [];
    const rate =
      rates.find((candidate) => candidate.occupancyType === 'DBL' && candidate.mealPlan === 'BB') ||
      rates.find((candidate) => candidate.occupancyType === 'DBL') ||
      rates[0] ||
      null;

    return { hotel, contract, rate, hasValidContract: validContracts.length > 0 };
  });

  return setups.sort((left, right) => {
    const leftReady = left.contract && left.rate ? 1 : 0;
    const rightReady = right.contract && right.rate ? 1 : 0;

    if (leftReady !== rightReady) {
      return rightReady - leftReady;
    }

    if (left.hasValidContract !== right.hasValidContract) {
      return left.hasValidContract ? -1 : 1;
    }

    if (values.optimizationMode === 'cost') {
      return (left.rate?.cost ?? Number.MAX_SAFE_INTEGER) - (right.rate?.cost ?? Number.MAX_SAFE_INTEGER);
    }

    const leftComfort = getHotelComfortScore(left.hotel);
    const rightComfort = getHotelComfortScore(right.hotel);

    if (leftComfort !== rightComfort) {
      return rightComfort - leftComfort;
    }

    return (right.rate?.cost ?? 0) - (left.rate?.cost ?? 0);
  })[0];
}

function getHotelComfortScore(hotel: Hotel) {
  const normalized = normalizeText(`${hotel.category} ${hotel.name}`);
  const starMatch = normalized.match(/\b([1-5])\s*(?:star|stars)\b/);

  if (starMatch?.[1]) {
    return Number(starMatch[1]);
  }

  if (normalized.includes('luxury') || normalized.includes('deluxe') || normalized.includes('5')) {
    return 5;
  }

  if (normalized.includes('superior') || normalized.includes('4')) {
    return 4;
  }

  if (normalized.includes('standard') || normalized.includes('3')) {
    return 3;
  }

  return 1;
}

function getVehicleCategory(vehicleName: string, maxPax: number) {
  const normalized = vehicleName.toLowerCase();

  if (normalized.includes('bus') || normalized.includes('coach') || maxPax >= 20) {
    return 'coach';
  }

  if (normalized.includes('van') || normalized.includes('minibus') || maxPax >= 7) {
    return 'van';
  }

  return 'car';
}

function isRecommendedVehicleCategory(quoteType: Quote['quoteType'], pax: number, category: string) {
  if (quoteType === 'GROUP') {
    return category === 'coach' || (pax <= 18 && category === 'van');
  }

  if (pax <= 3) {
    return category === 'car';
  }

  return category === 'van';
}

function chooseTransportCandidate(
  candidates: TransportPricingCandidate[],
  mode: OptimizationMode,
  quoteType: Quote['quoteType'],
  pax: number,
) {
  const uniqueCandidates = candidates.filter((candidate, index, collection) => {
    const key = `${candidate.vehicle.id}:${candidate.serviceType.id}:${candidate.routeId || candidate.routeName}`;
    return collection.findIndex((entry) => `${entry.vehicle.id}:${entry.serviceType.id}:${entry.routeId || entry.routeName}` === key) === index;
  });

  if (uniqueCandidates.length === 0) {
    return null;
  }

  return [...uniqueCandidates].sort((left, right) => {
    const leftRecommended = isRecommendedVehicleCategory(quoteType, pax, getVehicleCategory(left.vehicle.name, left.vehicle.maxPax));
    const rightRecommended = isRecommendedVehicleCategory(quoteType, pax, getVehicleCategory(right.vehicle.name, right.vehicle.maxPax));
    const leftCapacityGap = left.vehicle.maxPax >= pax ? left.vehicle.maxPax - pax : Number.MAX_SAFE_INTEGER;
    const rightCapacityGap = right.vehicle.maxPax >= pax ? right.vehicle.maxPax - pax : Number.MAX_SAFE_INTEGER;

    if (mode === 'comfort') {
      if (leftRecommended !== rightRecommended) {
        return leftRecommended ? -1 : 1;
      }

      if ((left.vehicle.maxPax >= pax) !== (right.vehicle.maxPax >= pax)) {
        return left.vehicle.maxPax >= pax ? -1 : 1;
      }

      if ((left.vehicle.luggageCapacity || 0) !== (right.vehicle.luggageCapacity || 0)) {
        return (right.vehicle.luggageCapacity || 0) - (left.vehicle.luggageCapacity || 0);
      }

      return leftCapacityGap - rightCapacityGap;
    }

    const leftPricePerPax = left.price / Math.max(pax, 1);
    const rightPricePerPax = right.price / Math.max(pax, 1);

    if (leftPricePerPax !== rightPricePerPax) {
      return leftPricePerPax - rightPricePerPax;
    }

    return leftCapacityGap - rightCapacityGap;
  })[0];
}

function estimateDraftPrice(draft: PreviewDraft, roomCount: number, pax: number, fallbackCurrency = 'USD') {
  const transportTotal = draft.transports.reduce((total, item) => total + (item.selectedCandidate?.price || 0), 0);
  const hotelTotal = draft.hotels.reduce((total, item) => total + (item.rate?.cost || 0) * roomCount, 0);
  const activityTotal = draft.activities.reduce((total, item) => total + (item.service?.baseCost || 0) * pax, 0);
  const currency =
    draft.transports.find((item) => item.selectedCandidate?.currency)?.selectedCandidate?.currency ||
    draft.hotels.find((item) => item.rate?.currency)?.rate?.currency ||
    draft.activities.find((item) => item.service?.currency)?.service?.currency ||
    fallbackCurrency;
  const totalPrice = Number((transportTotal + hotelTotal + activityTotal).toFixed(2));

  return {
    totalPrice,
    pricePerPax: Number((totalPrice / Math.max(pax, 1)).toFixed(2)),
    currency,
  };
}

function applyManualDayOverrides(draft: PreviewDraft, overrides: ManualDayOverrides) {
  return {
    ...draft,
    days: draft.days.map((day) => ({
      ...day,
      ...overrides[day.dayNumber],
    })),
  };
}

function buildItineraryWarnings(values: {
  days: PreviewDay[];
  transports: PreviewTransport[];
  hotels: PreviewHotel[];
  nightCount: number;
}) {
  const warnings: ItineraryWarning[] = [];

  values.transports.forEach((transport) => {
    const durationMinutes = transport.route?.durationMinutes;

    if (durationMinutes && durationMinutes > 240) {
      warnings.push({
        id: `long-transfer-${transport.dayNumber}`,
        title: `Day ${transport.dayNumber} transfer is over 4 hours`,
        description: `${transport.fromCity} to ${transport.toCity} is approximately ${Math.round(durationMinutes / 60)} hours. Consider adding a stop or overnight break.`,
      });
    }
  });

  const hotelStays = values.hotels.filter((hotel) => hotel.hotel);
  const hotelChanges = hotelStays.reduce((count, hotel, index) => {
    const previousHotel = hotelStays[index - 1]?.hotel;
    return previousHotel && hotel.hotel && previousHotel.id !== hotel.hotel.id ? count + 1 : count;
  }, 0);

  if (hotelChanges > 1) {
    warnings.push({
      id: 'hotel-churn',
      title: 'Multiple hotel changes detected',
      description: `${hotelChanges} hotel changes across ${values.nightCount} night${values.nightCount === 1 ? '' : 's'} may feel rushed. Consider grouping consecutive nights in fewer hotels.`,
    });
  }

  if (values.nightCount >= 3) {
    const itineraryText = normalizeText(
      [
        ...values.days.flatMap((day) => [day.city, day.title]),
        ...values.transports.flatMap((transport) => [transport.fromCity, transport.toCity, transport.route?.name || '']),
      ].join(' '),
    );
    const missingLandmarks = KEY_JORDAN_LANDMARKS.filter((landmark) => !itineraryText.includes(normalizeText(landmark)));

    if (missingLandmarks.length > 0) {
      warnings.push({
        id: 'missing-jordan-landmarks',
        title: 'Key Jordan landmarks may be missing',
        description: `Consider adding ${missingLandmarks.join(', ')} for a fuller Jordan itinerary, unless this quote intentionally excludes them.`,
      });
    }
  }

  return warnings;
}

function formatEstimateMoney(value: number, currency: string) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(value || 0);
}

async function resolveTransportCandidate(values: {
  apiBaseUrl: string;
  route: RouteOption;
  transportServiceType: TransportServiceType | null;
  pax: number;
  quoteType: Quote['quoteType'];
  optimizationMode: OptimizationMode;
}) {
  if (!values.transportServiceType) {
    return null;
  }

  const response = await fetch(`${values.apiBaseUrl}/transport-pricing/calculate`, {
    method: 'POST',
    headers: buildAuthHeaders({
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify({
      serviceTypeId: values.transportServiceType.id,
      routeId: values.route.id,
      routeName: '',
      paxCount: values.pax,
    }),
  });

  if (!response.ok) {
    return null;
  }

  const result = await readJsonResponse<TransportPricingResult>(response, 'Could not resolve transport pricing.');
  const candidates = result.candidates?.length
    ? result.candidates
    : [
        {
          routeId: values.route.id,
          routeName: formatRouteLabel(values.route),
          price: result.price,
          currency: result.currency,
          vehicle: result.vehicle,
          serviceType: result.serviceType,
        },
      ];

  return chooseTransportCandidate(candidates, values.optimizationMode, values.quoteType, values.pax);
}

async function buildPreviewDraft(values: {
  apiBaseUrl: string;
  travelStartDate: string;
  nightCount: number;
  routeText: string;
  quoteType: Quote['quoteType'];
  pax: number;
  includeActivities: boolean;
  optimizationMode: OptimizationMode;
  routes: RouteOption[];
  hotels: Hotel[];
  hotelContracts: HotelContract[];
  hotelRates: HotelRate[];
  services: SupplierService[];
  transportServiceType: TransportServiceType | null;
}) {
  const optimized = optimizeCitySequence(parseRouteText(values.routeText), values.routes, values.optimizationMode);
  const cities = optimized.cities;
  const dayCount = Math.max(values.nightCount + 1, cities.length || 1);
  const days: PreviewDay[] = Array.from({ length: dayCount }, (_, index) => {
    const city = cities[Math.min(index, Math.max(cities.length - 1, 0))] || `Day ${index + 1}`;
    return {
      dayNumber: index + 1,
      title: index === 0 ? `Arrival in ${city}` : index === dayCount - 1 ? `Departure from ${city}` : `${city} stay`,
      city,
      date: addDays(values.travelStartDate, index),
    };
  });

  const transports = await Promise.all(
    cities.slice(0, -1).map(async (city, index) => {
      const toCity = cities[index + 1];
      const route = findRoute(values.routes, city, toCity);
      const selectedCandidate = route
        ? await resolveTransportCandidate({
            apiBaseUrl: values.apiBaseUrl,
            route,
            transportServiceType: values.transportServiceType,
            pax: values.pax,
            quoteType: values.quoteType,
            optimizationMode: values.optimizationMode,
          })
        : null;

      return {
        dayNumber: index + 1,
        fromCity: city,
        toCity,
        route,
        selectedCandidate,
        optimizationReason: selectedCandidate
          ? values.optimizationMode === 'comfort'
            ? `Selected ${selectedCandidate.vehicle.name} for comfort, luggage space, and fit for ${values.pax} pax.`
            : `Selected ${selectedCandidate.vehicle.name} as best value at ${selectedCandidate.currency} ${selectedCandidate.price}.`
          : route
            ? 'Route matched, but transport pricing is not configured yet.'
            : 'No active route matched these cities.',
      };
    }),
  );

  const hotels = days.slice(0, values.nightCount).map((day) => ({
    dayNumber: day.dayNumber,
    city: day.city,
    ...findHotelSetup({
      city: day.city,
      travelDate: day.date,
      hotels: values.hotels,
      hotelContracts: values.hotelContracts,
      hotelRates: values.hotelRates,
      optimizationMode: values.optimizationMode,
    }),
  }));

  const activityService = findService(values.services, 'activity');
  const activities = values.includeActivities
    ? days.slice(0, -1).map((day) => ({
        dayNumber: day.dayNumber,
        city: day.city,
        service: activityService,
      }))
    : [];

  const warnings = buildItineraryWarnings({
    days,
    transports,
    hotels,
    nightCount: values.nightCount,
  });

  return { days, transports, hotels, activities, optimizationNotes: optimized.notes, warnings };
}

export function QuoteAutoItineraryBuilder({
  apiBaseUrl,
  quote,
  services,
  transportServiceTypes,
  routes,
  hotels,
  hotelContracts,
  hotelRates,
  totalPax,
}: QuoteAutoItineraryBuilderProps) {
  const router = useRouter();
  const [travelStartDate, setTravelStartDate] = useState(quote.travelStartDate?.slice(0, 10) || '');
  const [nightCount, setNightCount] = useState(String(Math.max(quote.nightCount || 1, 1)));
  const [routeText, setRouteText] = useState('Amman -> Petra -> Wadi Rum');
  const [selectedPresetId, setSelectedPresetId] = useState('');
  const [pax, setPax] = useState(String(Math.max(totalPax || quote.adults + quote.children || 1, 1)));
  const [quoteType, setQuoteType] = useState<'FIT' | 'GROUP'>(quote.quoteType || 'FIT');
  const [optimizationMode, setOptimizationMode] = useState<OptimizationMode>('cost');
  const [includeActivities, setIncludeActivities] = useState(false);
  const [preview, setPreview] = useState<PreviewDraft | null>(null);
  const [comparison, setComparison] = useState<ComparisonState | null>(null);
  const [manualDayOverrides, setManualDayOverrides] = useState<ManualDayOverrides>({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hotelService = useMemo(() => findService(services, 'hotel'), [services]);
  const transportService = useMemo(() => findService(services, 'transport'), [services]);
  const activityService = useMemo(() => findService(services, 'activity'), [services]);
  const transportServiceType = useMemo(
    () =>
      transportServiceTypes.find((serviceType) => /transfer|transport|vehicle/i.test(`${serviceType.name} ${serviceType.code}`)) ||
      transportServiceTypes[0] ||
      null,
    [transportServiceTypes],
  );

  const numericNightCount = Math.max(1, Math.floor(Number(nightCount) || 1));
  const numericPax = Math.max(1, Math.floor(Number(pax) || 1));
  const numericRoomCount = Math.max(1, quote.roomCount || Math.ceil(numericPax / 2));
  const selectedComparison = comparison?.[optimizationMode] || null;

  function applyPreset(presetId: string) {
    setSelectedPresetId(presetId);
    const preset = ITINERARY_PRESETS.find((candidate) => candidate.id === presetId);

    if (!preset) {
      return;
    }

    setRouteText(preset.route);
    setNightCount(String(preset.nights));
    setManualDayOverrides({});
    setPreview(null);
    setComparison(null);
    setMessage(`${preset.name} preset loaded. Preview before applying.`);
  }

  async function generatePreview() {
    setIsGenerating(true);
    setError(null);
    setMessage(null);

    try {
      const [costDraft, comfortDraft] = await Promise.all(
        (['cost', 'comfort'] as OptimizationMode[]).map((mode) =>
          buildPreviewDraft({
            apiBaseUrl,
            quoteType,
            pax: numericPax,
            optimizationMode: mode,
            transportServiceType,
            travelStartDate,
            nightCount: numericNightCount,
            routeText,
            includeActivities,
            routes,
            hotels,
            hotelContracts,
            hotelRates,
            services,
          }),
        ),
      );
      const costDraftWithOverrides = applyManualDayOverrides(costDraft, manualDayOverrides);
      const comfortDraftWithOverrides = applyManualDayOverrides(comfortDraft, manualDayOverrides);
      const costEstimate = estimateDraftPrice(costDraftWithOverrides, numericRoomCount, numericPax);
      const comfortEstimate = estimateDraftPrice(comfortDraftWithOverrides, numericRoomCount, numericPax, costEstimate.currency);
      const nextComparison: ComparisonState = {
        cost: {
          mode: 'cost',
          draft: costDraftWithOverrides,
          ...costEstimate,
        },
        comfort: {
          mode: 'comfort',
          draft: comfortDraftWithOverrides,
          ...comfortEstimate,
        },
      };

      setComparison(nextComparison);
      setPreview(nextComparison[optimizationMode].draft);
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : 'Could not generate optimized itinerary preview.');
    } finally {
      setIsGenerating(false);
    }
  }

  function applyComparisonOption(option: ComparisonOption) {
    setOptimizationMode(option.mode);
    setPreview(applyManualDayOverrides(option.draft, manualDayOverrides));
    setMessage(`${option.mode === 'comfort' ? 'Comfort' : 'Cost'} option applied to the editable preview.`);
  }

  function cancelPreview() {
    setPreview(null);
    setComparison(null);
    setMessage('Itinerary preview cancelled. No changes were applied.');
  }

  function buildComparisonDelta(option: ComparisonOption, baseline: ComparisonOption) {
    const difference = Number((option.totalPrice - baseline.totalPrice).toFixed(2));

    if (difference === 0) {
      return 'No price difference';
    }

    return `${difference > 0 ? '+' : '-'}${formatEstimateMoney(Math.abs(difference), option.currency)} vs ${baseline.mode}`;
  }

  async function generateSelectedPreviewOnly() {
    setIsGenerating(true);
    setError(null);
    setMessage(null);

    try {
      setPreview(
        applyManualDayOverrides(
          await buildPreviewDraft({
          apiBaseUrl,
          quoteType,
          pax: numericPax,
          optimizationMode,
          transportServiceType,
          travelStartDate,
          nightCount: numericNightCount,
          routeText,
          includeActivities,
          routes,
          hotels,
          hotelContracts,
          hotelRates,
          services,
          }),
          manualDayOverrides,
        ),
      );
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : 'Could not generate optimized itinerary preview.');
    } finally {
      setIsGenerating(false);
    }
  }

  function updateManualDay(dayNumber: number, field: 'title' | 'city', value: string) {
    setManualDayOverrides((current) => ({
      ...current,
      [dayNumber]: {
        ...current[dayNumber],
        [field]: value,
      },
    }));
    setPreview((current) =>
      current
        ? (() => {
            const nextDays = current.days.map((candidate) =>
              candidate.dayNumber === dayNumber ? { ...candidate, [field]: value } : candidate,
            );

            return {
              ...current,
              days: nextDays,
              warnings: buildItineraryWarnings({
                days: nextDays,
                transports: current.transports,
                hotels: current.hotels,
                nightCount: numericNightCount,
              }),
            };
          })()
        : current,
    );
  }

  function resetDayToAuto(dayNumber: number) {
    const autoDay = comparison?.[optimizationMode].draft.days.find((day) => day.dayNumber === dayNumber);

    setManualDayOverrides((current) => {
      const next = { ...current };
      delete next[dayNumber];
      return next;
    });

    if (!autoDay) {
      return;
    }

    setPreview((current) =>
      current
        ? (() => {
            const nextDays = current.days.map((candidate) => (candidate.dayNumber === dayNumber ? autoDay : candidate));

            return {
              ...current,
              days: nextDays,
              warnings: buildItineraryWarnings({
                days: nextDays,
                transports: current.transports,
                hotels: current.hotels,
                nightCount: numericNightCount,
              }),
            };
          })()
        : current,
    );
  }

  async function postJson<T>(url: string, body: unknown, fallbackMessage: string) {
    const response = await fetch(url, {
      method: 'POST',
      headers: buildAuthHeaders({
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(await getErrorMessage(response, fallbackMessage));
    }

    return readJsonResponse<T>(response, fallbackMessage);
  }

  async function saveDraft(draft: PreviewDraft, successMessage: string) {
      const existingDays = new Map(quote.itineraries.map((day) => [day.dayNumber, day]));
      const savedDays = new Map<number, CreatedDay>();

      for (const day of draft.days) {
        const existingDay = existingDays.get(day.dayNumber);

        if (existingDay) {
          savedDays.set(day.dayNumber, existingDay);
          continue;
        }

        const created = await postJson<CreatedDay>(
          `${apiBaseUrl}/quotes/${quote.id}/itinerary/day`,
          {
            dayNumber: day.dayNumber,
            title: day.title,
            notes: day.city ? `Overnight in ${day.city}` : undefined,
            sortOrder: day.dayNumber,
            isActive: true,
          },
          `Could not create Day ${day.dayNumber}.`,
        );
        savedDays.set(day.dayNumber, created);
      }

      let createdItems = 0;

      if (transportService && transportServiceType) {
        for (const item of draft.transports) {
          const day = savedDays.get(item.dayNumber);

          if (!day || !item.route) {
            continue;
          }

          await postJson(
            `${apiBaseUrl}/quotes/${quote.id}/items`,
            {
              serviceId: transportService.id,
              itineraryId: day.id,
              quantity: 1,
              paxCount: numericPax,
              dayCount: 1,
              markupPercent: 20,
              transportServiceTypeId: item.selectedCandidate?.serviceType.id || transportServiceType.id,
              routeId: item.route.id,
              routeName: '',
              overrideCost: item.selectedCandidate ? item.selectedCandidate.price : undefined,
              useOverride: Boolean(item.selectedCandidate),
            },
            `Could not add transport for ${item.fromCity} to ${item.toCity}.`,
          );
          createdItems += 1;
        }
      }

      if (hotelService) {
        for (const item of draft.hotels) {
          const day = savedDays.get(item.dayNumber);

          if (!day || !item.hotel || !item.contract || !item.rate) {
            continue;
          }

          await postJson(
            `${apiBaseUrl}/quotes/${quote.id}/items`,
            {
              serviceId: hotelService.id,
              itineraryId: day.id,
              quantity: numericRoomCount,
              paxCount: numericPax,
              roomCount: numericRoomCount,
              nightCount: 1,
              markupPercent: 20,
              hotelId: item.hotel.id,
              contractId: item.contract.id,
              seasonName: item.rate.seasonName,
              roomCategoryId: item.rate.roomCategoryId,
              occupancyType: item.rate.occupancyType,
              mealPlan: item.rate.mealPlan,
            },
            `Could not add hotel placeholder for ${item.city}.`,
          );
          createdItems += 1;
        }
      }

      if (activityService) {
        for (const item of draft.activities) {
          const day = savedDays.get(item.dayNumber);
          const previewDay = draft.days.find((candidate) => candidate.dayNumber === item.dayNumber);

          if (!day || !item.service || !previewDay?.date) {
            continue;
          }

          await postJson(
            `${apiBaseUrl}/quotes/${quote.id}/items`,
            {
              serviceId: item.service.id,
              itineraryId: day.id,
              serviceDate: new Date(`${previewDay.date}T09:00:00`).toISOString(),
              startTime: '09:00',
              meetingPoint: item.city,
              participantCount: numericPax,
              adultCount: Math.min(numericPax, Math.max(quote.adults, 0)),
              childCount: Math.max(numericPax - Math.max(quote.adults, 0), 0),
              quantity: 1,
              paxCount: numericPax,
              markupPercent: 20,
            },
            `Could not add activity placeholder for ${item.city}.`,
          );
          createdItems += 1;
        }
      }

      window.dispatchEvent(new CustomEvent('dmc:quote-pricing-stale', { detail: { quoteId: quote.id } }));
      setMessage(successMessage);
      window.setTimeout(() => {
        document.querySelector('.quote-live-pricing-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 350);
      router.refresh();
      return createdItems;
  }

  async function buildOptimizedDraftForMode(mode: OptimizationMode) {
    return applyManualDayOverrides(
      await buildPreviewDraft({
        apiBaseUrl,
        quoteType,
        pax: numericPax,
        optimizationMode: mode,
        transportServiceType,
        travelStartDate,
        nightCount: numericNightCount,
        routeText,
        includeActivities,
        routes,
        hotels,
        hotelContracts,
        hotelRates,
        services,
      }),
      manualDayOverrides,
    );
  }

  async function handleSave() {
    if (!preview) {
      await generateSelectedPreviewOnly();
      return;
    }

    setIsSaving(true);
    setError(null);
    setMessage(null);

    try {
      await saveDraft(
        preview,
        `Itinerary applied with ${preview.days.length} day${preview.days.length === 1 ? '' : 's'}.`,
      );
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save the draft itinerary.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleGenerateAndPrice() {
    setIsSaving(true);
    setIsGenerating(true);
    setError(null);
    setMessage(null);

    try {
      const [costDraft, comfortDraft] = await Promise.all([buildOptimizedDraftForMode('cost'), buildOptimizedDraftForMode('comfort')]);
      const costEstimate = estimateDraftPrice(costDraft, numericRoomCount, numericPax);
      const comfortEstimate = estimateDraftPrice(comfortDraft, numericRoomCount, numericPax, costEstimate.currency);
      const nextComparison: ComparisonState = {
        cost: { mode: 'cost', draft: costDraft, ...costEstimate },
        comfort: { mode: 'comfort', draft: comfortDraft, ...comfortEstimate },
      };
      const selectedDraft = nextComparison[optimizationMode].draft;

      setComparison(nextComparison);
      setPreview(selectedDraft);
      await saveDraft(selectedDraft, 'Itinerary generated and priced');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not generate and price itinerary.');
    } finally {
      setIsGenerating(false);
      setIsSaving(false);
    }
  }

  const unmatchedRoutes = preview?.transports.filter((item) => !item.route).length || 0;
  const unmatchedHotels = preview?.hotels.filter((item) => !item.hotel || !item.contract || !item.rate).length || 0;

  return (
    <section className="quote-auto-itinerary-builder">
      <div className="quote-auto-itinerary-head">
        <div>
          <p className="eyebrow">Auto Builder</p>
          <h3>Generate a draft itinerary</h3>
        </div>
        <span className="page-tab-badge">{quoteType}</span>
      </div>

      <div className="quote-auto-itinerary-grid">
        <label>
          <span>Preset</span>
          <select value={selectedPresetId} onChange={(event) => applyPreset(event.target.value)}>
            <option value="">Custom route</option>
            {ITINERARY_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Travel start date</span>
          <input value={travelStartDate} onChange={(event) => setTravelStartDate(event.target.value)} type="date" />
        </label>
        <label>
          <span>Nights</span>
          <input value={nightCount} onChange={(event) => setNightCount(event.target.value)} min="1" type="number" />
        </label>
        <label>
          <span>Pax</span>
          <input value={pax} onChange={(event) => setPax(event.target.value)} min="1" type="number" />
        </label>
        <label>
          <span>Quote type</span>
          <select value={quoteType} onChange={(event) => setQuoteType(event.target.value as 'FIT' | 'GROUP')}>
            <option value="FIT">FIT</option>
            <option value="GROUP">GROUP</option>
          </select>
        </label>
        <label>
          <span>Optimize for</span>
          <select value={optimizationMode} onChange={(event) => setOptimizationMode(event.target.value as OptimizationMode)}>
            <option value="cost">Cost</option>
            <option value="comfort">Comfort</option>
          </select>
        </label>
      </div>

      <label className="quote-auto-itinerary-route">
        <span>Cities or route</span>
        <textarea value={routeText} onChange={(event) => setRouteText(event.target.value)} rows={2} placeholder="Amman -> Petra -> Wadi Rum" />
      </label>

      <label className="quote-auto-itinerary-check">
        <input checked={includeActivities} onChange={(event) => setIncludeActivities(event.target.checked)} type="checkbox" />
        <span>Add optional activity placeholders where an activity service exists</span>
      </label>

      <div className="quote-auto-itinerary-actions">
        <button type="button" className="secondary-button" onClick={() => void generatePreview()} disabled={isGenerating}>
          {isGenerating ? 'Optimizing...' : 'Preview Draft'}
        </button>
        <button type="button" className="primary-button" onClick={handleSave} disabled={isSaving || isGenerating || !preview}>
          {isSaving ? 'Applying Itinerary...' : 'Apply Itinerary'}
        </button>
        {preview ? (
          <button type="button" className="secondary-button" onClick={cancelPreview} disabled={isSaving || isGenerating}>
            Cancel
          </button>
        ) : null}
      </div>

      {error ? <p className="form-error">{error}</p> : null}
      {message ? <p className="form-success">{message}</p> : null}

      {preview ? (
        <div className="quote-auto-itinerary-preview">
          <div className="quote-auto-itinerary-preview-head">
            <strong>Preview</strong>
            <span>
              {preview.days.length} days, {preview.transports.length} transfers, {preview.hotels.length} hotel nights
            </span>
          </div>

          {comparison ? (
            <div className="quote-auto-itinerary-comparison">
              {(['cost', 'comfort'] as OptimizationMode[]).map((mode) => {
                const option = comparison[mode];
                const baseline = mode === 'cost' ? comparison.comfort : comparison.cost;

                return (
                  <article
                    key={mode}
                    className={`quote-auto-itinerary-option${optimizationMode === mode ? ' quote-auto-itinerary-option-active' : ''}`}
                  >
                    <div>
                      <span>{mode === 'comfort' ? 'Comfort Option' : 'Cost Option'}</span>
                      <strong>{formatEstimateMoney(option.totalPrice, option.currency)}</strong>
                    </div>
                    <em>{formatEstimateMoney(option.pricePerPax, option.currency)} per pax</em>
                    <em>{buildComparisonDelta(option, baseline)}</em>
                    <button type="button" className="secondary-button" onClick={() => applyComparisonOption(option)}>
                      Apply this option
                    </button>
                  </article>
                );
              })}
            </div>
          ) : selectedComparison ? null : null}

          {selectedComparison ? (
            <div className="quote-auto-itinerary-estimate">
              <span>Estimated cost</span>
              <strong>{formatEstimateMoney(selectedComparison.totalPrice, selectedComparison.currency)}</strong>
              <em>{formatEstimateMoney(selectedComparison.pricePerPax, selectedComparison.currency)} per pax</em>
            </div>
          ) : null}

          {preview.optimizationNotes.length > 0 ? (
            <div className="quote-auto-itinerary-notes">
              {preview.optimizationNotes.map((note) => (
                <span key={note}>{note}</span>
              ))}
            </div>
          ) : null}

          {preview.warnings.length > 0 ? (
            <div className="quote-auto-itinerary-warnings">
              {preview.warnings.map((warning) => (
                <article key={warning.id}>
                  <strong>{warning.title}</strong>
                  <p>{warning.description}</p>
                </article>
              ))}
            </div>
          ) : null}

          <div className="quote-auto-itinerary-status-grid">
            <div>
              <span>Transport matches</span>
              <strong>{unmatchedRoutes === 0 ? 'Ready' : `${unmatchedRoutes} need route setup`}</strong>
            </div>
            <div>
              <span>Hotel matches</span>
              <strong>{unmatchedHotels === 0 ? 'Ready' : `${unmatchedHotels} need hotel setup`}</strong>
            </div>
            <div>
              <span>Optimization</span>
              <strong>{optimizationMode === 'comfort' ? 'Comfort' : 'Cost'}</strong>
            </div>
            <div>
              <span>Services</span>
              <strong>
                {[hotelService ? null : 'hotel', transportService ? null : 'transport', includeActivities && !activityService ? 'activity' : null]
                  .filter(Boolean)
                  .join(', ') || 'Ready'}
              </strong>
            </div>
          </div>

          <div className="quote-auto-itinerary-days">
            {preview.days.map((day) => (
              <article key={day.dayNumber} className="quote-auto-itinerary-day">
                <div>
                  <span>Day {day.dayNumber}</span>
                  <input
                    value={day.title}
                    onChange={(event) => updateManualDay(day.dayNumber, 'title', event.target.value)}
                  />
                </div>
                <div>
                  <span>City</span>
                  <input
                    value={day.city}
                    onChange={(event) => updateManualDay(day.dayNumber, 'city', event.target.value)}
                  />
                </div>
                <div className="quote-auto-itinerary-day-meta">
                  <em>{day.date || 'No date'}</em>
                  {manualDayOverrides[day.dayNumber] ? (
                    <button type="button" className="secondary-button" onClick={() => resetDayToAuto(day.dayNumber)}>
                      Reset to auto
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>

          <div className="quote-auto-itinerary-items">
            {preview.transports.map((item) => (
              <div key={`transport-${item.dayNumber}-${item.fromCity}-${item.toCity}`}>
                <span>Transport</span>
                <strong>
                  Day {item.dayNumber}: {item.fromCity} to {item.toCity}
                </strong>
                <em>{item.route ? formatRouteLabel(item.route) : 'Needs matching active route'}</em>
                {item.selectedCandidate ? (
                  <em>
                    {item.selectedCandidate.vehicle.name} | {item.selectedCandidate.currency} {item.selectedCandidate.price}
                  </em>
                ) : null}
                <em>{item.optimizationReason}</em>
              </div>
            ))}
            {preview.hotels.map((item) => (
              <div key={`hotel-${item.dayNumber}-${item.city}`}>
                <span>Hotel</span>
                <strong>
                  Night {item.dayNumber}: {item.city}
                </strong>
                <em>
                  {item.hotel && item.contract && item.rate
                    ? `${item.hotel.name} | ${item.contract.name} | ${item.rate.occupancyType}/${item.rate.mealPlan}`
                    : 'Needs hotel contract and rate'}
                </em>
              </div>
            ))}
            {preview.activities.map((item) => (
              <div key={`activity-${item.dayNumber}-${item.city}`}>
                <span>Activity</span>
                <strong>
                  Day {item.dayNumber}: {item.city}
                </strong>
                <em>{item.service ? item.service.name : 'Needs activity service'}</em>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
