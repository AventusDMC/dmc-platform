'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { getErrorMessage, logFetchUrl, readJsonResponse } from '../../lib/api';
import { buildAuthHeaders } from '../../lib/auth-client';
import { calculateCityDistance } from '../../lib/geo';
import { formatRouteLabel, type RouteOption } from '../../lib/routes';
import { formatTransportVehicleDisplay } from '../../lib/transport-vehicles';
import { getQuoteServiceCategoryKey } from './quote-readiness';
import {
  assignGeneratedItineraryCities,
  assignGeneratedItineraryCitiesByNights,
  buildItineraryApplyMessage,
  getAutoItineraryDayCount,
  generateItineraryDays,
  mergeExistingItineraryDays,
  type AutoItineraryExistingDay,
  type NightStop,
} from './QuoteAutoItineraryBuilder.logic';

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
  pricingBasis?: 'PER_PERSON' | 'PER_ROOM' | null;
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
    vehicleType?: string | null;
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
  distanceKm: number | null;
  travelTimeHours: number | null;
  isTravelHeavy: boolean;
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

type SendReadinessState = {
  status: 'ready' | 'warnings' | 'blocked';
  blockers: string[];
  warnings: ItineraryWarning[];
};

type CreatedDay = {
  id: string;
  dayNumber: number;
  title: string;
  description: string | null;
  notes?: string | null;
  isActive?: boolean;
  dayItems?: unknown[];
  items?: unknown[];
};

type QuoteItineraryResponse = {
  quoteId: string;
  days: CreatedDay[];
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

  // Bidirectional match. The seed catalog stores each road-transfer route
  // in a single direction (e.g., "Amman City Center -> Petra Visitor
  // Center") — but in DMC operations a transfer route runs both ways
  // (you also drive Petra -> Amman to fly out). Previously findRoute
  // returned null on every reverse leg, surfacing "No active route
  // matched these cities" warnings on day cards that DO have a valid
  // catalog route, just one stored in the opposite direction.
  //
  // Prefer the exact directional match when one exists (some routes
  // legitimately have asymmetric pricing or different stops in each
  // direction); fall back to the reverse-direction match.
  let exactMatch: RouteOption | null = null;
  let reverseMatch: RouteOption | null = null;

  for (const route of routes) {
    if (!isValidRoute(route)) continue;
    const routeFrom = routeEndpointText(route, 'fromPlace');
    const routeTo = routeEndpointText(route, 'toPlace');
    if (routeFrom.includes(from) && routeTo.includes(to)) {
      exactMatch = route;
      break;
    }
    if (!reverseMatch && routeFrom.includes(to) && routeTo.includes(from)) {
      reverseMatch = route;
    }
  }

  return exactMatch || reverseMatch;
}

function getRouteMetric(route: RouteOption, mode: OptimizationMode) {
  if (mode === 'comfort') {
    return route.durationMinutes ?? route.distanceKm ?? Number.MAX_SAFE_INTEGER;
  }

  return route.distanceKm ?? route.durationMinutes ?? Number.MAX_SAFE_INTEGER;
}

function getRouteDistanceEstimate(route: RouteOption | null, fromCity: string, toCity: string) {
  if (route?.distanceKm || route?.durationMinutes) {
    const distanceKm = route.distanceKm ?? null;
    const travelTimeHours = route.durationMinutes ? Number((route.durationMinutes / 60).toFixed(1)) : null;

    return {
      distanceKm,
      travelTimeHours,
    };
  }

  return calculateCityDistance(fromCity, toCity);
}

function getCityDistanceMetric(fromCity: string, toCity: string, route: RouteOption | null, mode: OptimizationMode) {
  const estimate = getRouteDistanceEstimate(route, fromCity, toCity);

  if (mode === 'comfort') {
    return estimate?.travelTimeHours ?? route?.durationMinutes ?? route?.distanceKm ?? Number.MAX_SAFE_INTEGER;
  }

  return estimate?.distanceKm ?? route?.distanceKm ?? route?.durationMinutes ?? Number.MAX_SAFE_INTEGER;
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

  const arrivalCity = uniqueCities.find((city) => normalizeText(city) === 'amman') || uniqueCities[0];
  const departureCity = uniqueCities[uniqueCities.length - 1];
  const ordered = [arrivalCity];
  const remaining = uniqueCities.filter((city) => normalizeText(city) !== normalizeText(arrivalCity) && normalizeText(city) !== normalizeText(departureCity));

  while (remaining.length > 0) {
    const currentCity = ordered[ordered.length - 1];
    const nextCandidate = remaining
      .map((city, index) => ({
        city,
        index,
        route: findRoute(routes, currentCity, city),
      }))
      .sort(
        (left, right) =>
          getCityDistanceMetric(currentCity, left.city, left.route, mode) -
          getCityDistanceMetric(currentCity, right.city, right.route, mode),
      )[0];

    if (!nextCandidate) {
      ordered.push(remaining.shift() as string);
      continue;
    }

    ordered.push(nextCandidate.city);
    remaining.splice(nextCandidate.index, 1);
  }

  if (normalizeText(departureCity) !== normalizeText(ordered[ordered.length - 1])) {
    ordered.push(departureCity);
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
    const travelTimeHours = transport.travelTimeHours ?? (durationMinutes ? durationMinutes / 60 : null);

    if (transport.isTravelHeavy || (travelTimeHours !== null && travelTimeHours > 4)) {
      warnings.push({
        id: `long-transfer-${transport.dayNumber}`,
        title: `Day ${transport.dayNumber} transfer is over 4 hours`,
        description: `${transport.fromCity} to ${transport.toCity} is approximately ${travelTimeHours?.toFixed(1) || '4+'} hours. Suggest a rest day or short activity after this drive.`,
      });
    }
  });

  values.transports.forEach((transport, index) => {
    const previous = values.transports[index - 1];

    if (previous?.isTravelHeavy && transport.isTravelHeavy) {
      warnings.push({
        id: `back-to-back-long-transfer-${transport.dayNumber}`,
        title: 'Back-to-back long drives detected',
        description: `Avoid stacking ${previous.fromCity} to ${previous.toCity} and ${transport.fromCity} to ${transport.toCity}. Suggest a rest day or a short local activity between them.`,
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

  return warnings;
}

function formatEstimateMoney(value: number, currency: string) {
  const safeValue = Number.isFinite(value) ? value : 0;

  return `${currency || 'USD'} ${safeValue.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function buildSendReadinessState(values: {
  draft: PreviewDraft;
  hasHotelService: boolean;
  hasTransportService: boolean;
  hasActivityService: boolean;
  includeActivities: boolean;
}) {
  const blockers = [
    values.hasTransportService ? null : values.draft.transports.length > 0 ? 'Transport service is missing.' : null,
    values.hasHotelService ? null : values.draft.hotels.length > 0 ? 'Hotel service is missing.' : null,
    values.includeActivities && !values.hasActivityService ? 'Activity service is missing.' : null,
    ...values.draft.transports
      .filter((item) => !item.route || !item.selectedCandidate)
      .map((item) => `Transport is not priced for ${item.fromCity} to ${item.toCity}.`),
    ...values.draft.hotels
      .filter((item) => !item.hotel || !item.contract || !item.rate)
      .map((item) => `Hotel is not priced for ${item.city}.`),
  ].filter((blocker): blocker is string => Boolean(blocker));

  if (blockers.length > 0) {
    return {
      status: 'blocked' as const,
      blockers,
      warnings: values.draft.warnings,
    };
  }

  return {
    status: values.draft.warnings.length > 0 ? ('warnings' as const) : ('ready' as const),
    blockers,
    warnings: values.draft.warnings,
  };
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
      normalizedKey: values.route.normalizedKey,
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
  // When the Guided Builder hands off a per-city night distribution, use
  // it for day-to-city assignment so a "Amman:3, Petra:2" stop list fills
  // 3 days with Amman + 2 with Petra rather than collapsing one day per
  // unique city.
  nightStops?: NightStop[] | null;
}) {
  const optimized = optimizeCitySequence(parseRouteText(values.routeText), values.routes, values.optimizationMode);
  const cities = optimized.cities;
  const generatedDays = generateItineraryDays(values.travelStartDate, values.nightCount);
  const days: PreviewDay[] =
    values.nightStops && values.nightStops.some((stop) => stop.nights > 0)
      ? assignGeneratedItineraryCitiesByNights(generatedDays, values.nightStops)
      : assignGeneratedItineraryCities(generatedDays, cities);

  const itineraryCities = days.map((day) => day.city);
  const transports = await Promise.all(
    itineraryCities.slice(0, -1).map(async (city, index) => {
      const toCity = itineraryCities[index + 1];
      const route = findRoute(values.routes, city, toCity);
      const distanceEstimate = getRouteDistanceEstimate(route, city, toCity);
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
        distanceKm: distanceEstimate?.distanceKm ?? null,
        travelTimeHours: distanceEstimate?.travelTimeHours ?? null,
        isTravelHeavy: (distanceEstimate?.travelTimeHours ?? 0) > 4,
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
  const searchParams = useSearchParams();
  const [travelStartDate, setTravelStartDate] = useState(quote.travelStartDate?.slice(0, 10) || '');
  const [nightCount, setNightCount] = useState(String(Math.max(quote.nightCount ?? 1, 0)));
  const [routeText, setRouteText] = useState('');
  // Guided Quote Builder handoff: when the wizard creates the quote it
  // appends `?source=guided&cities=Amman,Petra,Wadi Rum&nights=5`. Read those
  // once on mount and pre-fill the routeText input so the operator doesn't
  // re-type cities they already configured in Step 2 of the wizard. A ref
  // guards against re-firing if searchParams ever changes; the state flag
  // drives a one-time banner so the operator sees that the form was primed.
  const guidedPrefillAppliedRef = useRef(false);
  const [guidedPrefillBanner, setGuidedPrefillBanner] = useState<{ cities: string[]; nights: number } | null>(null);
  // Per-city night distribution from the Guided Builder, e.g.
  // [{name:'Amman', nights:3}, {name:'Petra', nights:2}, ...]. When present,
  // the day-by-city assignment uses this directly so Amman occupies its 3
  // consecutive days rather than collapsing to a single day. Reset to null
  // once the operator edits the routeText so we don't keep overriding their
  // manual changes.
  const [guidedNightStops, setGuidedNightStops] = useState<NightStop[] | null>(null);
  useEffect(() => {
    if (guidedPrefillAppliedRef.current) return;
    if (!searchParams) return;
    if (searchParams.get('source') !== 'guided') return;
    const citiesParam = searchParams.get('cities');
    let cities: string[] = [];
    let nightStops: NightStop[] = [];
    if (citiesParam) {
      // Parse "Amman:3,Petra:2,Wadi Rum:1,Dead Sea:1" → cities (just names,
      // for the routeText input) + nightStops (per-city nights, for the
      // day-by-day assignment). Falls back gracefully when the segment lacks
      // a :N suffix (older URLs / manual entry).
      for (const entry of citiesParam.split(',').map((value) => value.trim()).filter(Boolean)) {
        const colonIndex = entry.indexOf(':');
        const name = (colonIndex >= 0 ? entry.slice(0, colonIndex) : entry).trim();
        const rawNights = colonIndex >= 0 ? entry.slice(colonIndex + 1).trim() : '';
        if (!name) continue;
        cities.push(name);
        const parsedNights = Math.max(0, Math.floor(Number(rawNights) || 0));
        nightStops.push({ name, nights: parsedNights });
      }
      if (cities.length > 0) {
        setRouteText(cities.join(' -> '));
      }
      if (nightStops.some((stop) => stop.nights > 0)) {
        setGuidedNightStops(nightStops);
      }
    }
    const nightsParam = searchParams.get('nights');
    let nights = 0;
    if (nightsParam) {
      nights = Math.max(0, Math.floor(Number(nightsParam) || 0));
      if (nights > 0) {
        setNightCount(String(nights));
      }
    }
    if (cities.length || nights > 0) {
      setGuidedPrefillBanner({ cities, nights });
    }
    guidedPrefillAppliedRef.current = true;
  }, [searchParams]);
  const [selectedPresetId, setSelectedPresetId] = useState('');
  const [pax, setPax] = useState(String(Math.max(totalPax || quote.adults + quote.children || 1, 1)));
  const [quoteType, setQuoteType] = useState<'FIT' | 'GROUP'>(quote.quoteType || 'FIT');
  const [optimizationMode, setOptimizationMode] = useState<OptimizationMode>('cost');
  const [includeActivities, setIncludeActivities] = useState(false);
  const [preview, setPreview] = useState<PreviewDraft | null>(null);
  const [comparison, setComparison] = useState<ComparisonState | null>(null);
  const [manualDayOverrides, setManualDayOverrides] = useState<ManualDayOverrides>({});
  const [sendReadiness, setSendReadiness] = useState<SendReadinessState | null>(null);
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

  const numericNightCount = Math.max(0, Math.floor(Number(nightCount) || 0));
  const expectedGeneratedDayCount = getAutoItineraryDayCount(numericNightCount);
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
    setSendReadiness(null);
    setMessage(`${preset.name} preset loaded. Preview before applying.`);
  }

  async function generatePreview() {
    setIsGenerating(true);
    setError(null);
    setMessage(null);
    setSendReadiness(null);

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
            nightStops: guidedNightStops,
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
    setSendReadiness(null);
    setMessage('Preview closed. No changes were applied.');
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
    setSendReadiness(null);

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
    setSendReadiness(null);
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

    setSendReadiness(null);
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
    const response = await fetch(logFetchUrl(url), {
      method: 'POST',
      headers: buildAuthHeaders({
        'Content-Type': 'application/json',
      }),
      credentials: 'include',
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(await getErrorMessage(response, fallbackMessage));
    }

    return readJsonResponse<T>(response, fallbackMessage);
  }

  async function patchJson<T>(url: string, body: unknown, fallbackMessage: string) {
    const response = await fetch(logFetchUrl(url), {
      method: 'PATCH',
      headers: buildAuthHeaders({
        'Content-Type': 'application/json',
      }),
      credentials: 'include',
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(await getErrorMessage(response, fallbackMessage));
    }

    return readJsonResponse<T>(response, fallbackMessage);
  }

  async function getCurrentItineraryDays() {
    const response = await fetch(logFetchUrl(`${apiBaseUrl}/quotes/${quote.id}/itinerary`), {
      headers: buildAuthHeaders(),
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(await getErrorMessage(response, 'Could not load current itinerary days.'));
    }

    const itinerary = await readJsonResponse<QuoteItineraryResponse>(response, 'Current quote itinerary');
    return Array.isArray(itinerary.days) ? itinerary.days : [];
  }

  async function getExistingDayAfterDuplicate(dayNumber: number) {
    const currentDays = await getCurrentItineraryDays();
    return currentDays.find((day) => day.dayNumber === dayNumber) || null;
  }

  function buildItineraryDayPayload(day: PreviewDay) {
    return {
      dayNumber: day.dayNumber,
      title: day.title,
      notes: day.city ? `Overnight in ${day.city}` : undefined,
      sortOrder: day.dayNumber,
      isActive: true,
    };
  }

  function isAutoGeneratedShellDay(day: CreatedDay) {
    const title = (day.title || '').trim();
    const notes = (day.notes || '').trim();

    return /^(Arrival|Departure|Day \d+)$/i.test(title) || /^Overnight in /i.test(notes);
  }

  function shouldSyncExistingDay(existingDay: CreatedDay, draftDay: PreviewDay) {
    if (existingDay.isActive === false) {
      return true;
    }

    if (manualDayOverrides[draftDay.dayNumber]) {
      return true;
    }

    return isAutoGeneratedShellDay(existingDay);
  }

  async function saveItineraryDays(days: PreviewDay[]) {
    const currentItineraryDays = await getCurrentItineraryDays().catch(() => [] as CreatedDay[]);
    const existingDays = mergeExistingItineraryDays(
      currentItineraryDays as AutoItineraryExistingDay[],
      quote.itineraries as AutoItineraryExistingDay[],
    );
    const savedDays = new Map<number, AutoItineraryExistingDay>();
    let createdDayCount = 0;

    for (const day of days) {
      const existingDay = existingDays.get(day.dayNumber);

      if (existingDay) {
        const syncedDay = shouldSyncExistingDay(existingDay as CreatedDay, day)
          ? await patchJson<CreatedDay>(
              `${apiBaseUrl}/itinerary/day/${existingDay.id}`,
              buildItineraryDayPayload(day),
              `Could not update Day ${day.dayNumber}.`,
            )
          : existingDay;

        savedDays.set(day.dayNumber, syncedDay);
        continue;
      }

      let wasCreated = false;
      const created = await postJson<CreatedDay>(
        `${apiBaseUrl}/quotes/${quote.id}/itinerary/day`,
        buildItineraryDayPayload(day),
        `Could not create Day ${day.dayNumber}.`,
      )
        .then((createdDay) => {
          wasCreated = true;
          return createdDay;
        })
        .catch(async (error) => {
          const message = error instanceof Error ? error.message : '';

          if (!/already exists/i.test(message)) {
            throw error;
          }

          const duplicateDay = await getExistingDayAfterDuplicate(day.dayNumber);

          if (!duplicateDay) {
            throw error;
          }

          return duplicateDay;
        });
      createdDayCount += wasCreated ? 1 : 0;
      savedDays.set(day.dayNumber, created);
    }

    return { savedDays, createdDayCount };
  }

  function isEmptyAutoGeneratedExtraDay(day: CreatedDay, expectedDayCount: number) {
    if (day.dayNumber <= expectedDayCount || day.isActive === false) {
      return false;
    }

    const assignedItemCount = (day.dayItems?.length ?? day.items?.length ?? 0);

    return assignedItemCount === 0 && isAutoGeneratedShellDay(day);
  }

  async function deactivateExtraGeneratedDays(expectedDayCount: number) {
    const currentItineraryDays = await getCurrentItineraryDays().catch(() => [] as CreatedDay[]);
    const extraGeneratedDays = currentItineraryDays.filter((day) => isEmptyAutoGeneratedExtraDay(day, expectedDayCount));

    await Promise.all(
      extraGeneratedDays.map((day) =>
        patchJson<CreatedDay>(
          `${apiBaseUrl}/itinerary/day/${day.id}`,
          { isActive: false },
          `Could not deactivate extra Day ${day.dayNumber}.`,
        ),
      ),
    );
  }

  function notifySavedDaysReady(savedDays: Map<number, AutoItineraryExistingDay>) {
    const days = Array.from(savedDays.values())
      .sort((left, right) => left.dayNumber - right.dayNumber)
      .map((day) => ({
        id: day.id,
        dayNumber: day.dayNumber,
        title: day.title || `Day ${day.dayNumber}`,
        description: day.description || null,
      }));

    window.dispatchEvent(new CustomEvent('dmc:quote-itinerary-days-ready', { detail: { quoteId: quote.id, days } }));
    window.setTimeout(() => {
      document.querySelector('#quote-base-program-days, .quote-service-day-card')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }, 350);
  }

  async function applyItinerary(draft: PreviewDraft) {
    const expectedDays = draft.days.slice(0, expectedGeneratedDayCount);
    const { savedDays, createdDayCount } = await saveItineraryDays(expectedDays);
    await deactivateExtraGeneratedDays(expectedDays.length);

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
            normalizedKey: item.route.normalizedKey,
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
    setMessage(buildItineraryApplyMessage(expectedDays.length, createdDayCount));
    notifySavedDaysReady(savedDays);
    router.refresh();
    return createdItems;
  }

  function buildDaysOnlyPreview(): PreviewDraft {
    const generatedDays = generateItineraryDays(travelStartDate, numericNightCount);
    // Prefer the per-city night distribution from the Guided Builder when
    // available — that way a 3-night Amman / 2-night Petra / 1-night Wadi
    // Rum / 1-night Dead Sea stop list produces 8 day cards that respect
    // the requested stay durations, rather than the naive index-clamp that
    // would collapse 5 days into the last city.
    const useGuidedNights = guidedNightStops && guidedNightStops.some((stop) => stop.nights > 0);
    const days = useGuidedNights
      ? assignGeneratedItineraryCitiesByNights(generatedDays, guidedNightStops!)
      : assignGeneratedItineraryCities(generatedDays, parseRouteText(routeText));

    return {
      days,
      transports: [],
      hotels: [],
      activities: [],
      optimizationNotes: [],
      warnings: [],
    };
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
        nightStops: guidedNightStops,
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
    setSendReadiness(null);

    try {
      await applyItinerary(preview);
      setSendReadiness(
        buildSendReadinessState({
          draft: preview,
          hasHotelService: Boolean(hotelService),
          hasTransportService: Boolean(transportService),
          hasActivityService: Boolean(activityService),
          includeActivities,
        }),
      );
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save the draft itinerary.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleGenerateDraftItinerary() {
    setIsSaving(true);
    setError(null);
    setMessage(null);
    setSendReadiness(null);

    try {
      const draft = buildDaysOnlyPreview();
      setPreview(draft);
      setComparison(null);
      await applyItinerary(draft);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not generate the draft itinerary.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleGenerateAndPrice() {
    setIsSaving(true);
    setIsGenerating(true);
    setError(null);
    setMessage(null);
    setSendReadiness(null);

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
      await applyItinerary(selectedDraft);
      setSendReadiness(
        buildSendReadinessState({
          draft: selectedDraft,
          hasHotelService: Boolean(hotelService),
          hasTransportService: Boolean(transportService),
          hasActivityService: Boolean(activityService),
          includeActivities,
        }),
      );
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

      {guidedPrefillBanner ? (
        <div
          style={{
            background: '#f5f8f5',
            border: '1px solid #cdd7cd',
            borderRadius: 10,
            padding: '0.65rem 0.9rem',
            marginBottom: '0.85rem',
            display: 'flex',
            alignItems: 'baseline',
            gap: '0.6rem',
            flexWrap: 'wrap',
          }}
        >
          <span
            style={{
              color: '#3a5a3a',
              fontSize: '0.72rem',
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            Guided Builder ready
          </span>
          <span style={{ color: '#475467', fontSize: '0.88rem' }}>
            {guidedPrefillBanner.cities.length > 0
              ? `${guidedPrefillBanner.cities.join(' → ')}`
              : 'Route pre-filled from the wizard.'}
            {guidedPrefillBanner.nights > 0 ? ` · ${guidedPrefillBanner.nights} nights` : ''}
          </span>
          <span style={{ color: '#6b7a6b', fontSize: '0.82rem', marginLeft: 'auto' }}>
            Review the inputs below, then click <strong>Generate Full Itinerary</strong> to populate hotels, transport, and activities.
          </span>
        </div>
      ) : null}

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
          <input value={nightCount} onChange={(event) => setNightCount(event.target.value)} min="0" type="number" />
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

      {/* One-line helper that disambiguates the action group — the
          previous labels ("Generate & Save Draft Itinerary") sounded like
          they produced a populated draft, but secondary actually creates
          empty day shells. Plain language up front fixes that. */}
      <p
        className="detail-copy"
        style={{ marginTop: '0.6rem', marginBottom: '0.3rem', color: '#475467', fontSize: '0.82rem' }}
      >
        Pick how much of the itinerary the auto-builder should do for you.
      </p>

      <div className="quote-auto-itinerary-actions">
        <button type="button" className="primary-button" onClick={() => void handleGenerateAndPrice()} disabled={isSaving || isGenerating}>
          {isSaving && isGenerating
            ? 'Generating & Pricing...'
            : 'Generate Full Itinerary (hotels, transport, activities)'}
        </button>
        <button type="button" className="secondary-button" onClick={() => void handleGenerateDraftItinerary()} disabled={isSaving || isGenerating}>
          {isSaving && !isGenerating ? 'Creating Empty Days...' : 'Create Empty Day Shells Only'}
        </button>
        <button type="button" className="secondary-button" onClick={() => void generatePreview()} disabled={isGenerating}>
          {isGenerating ? 'Optimizing...' : 'Preview Without Saving'}
        </button>
        <button type="button" className="primary-button" onClick={handleSave} disabled={isSaving || isGenerating || !preview}>
          {isSaving ? 'Applying Itinerary...' : 'Apply Previewed Itinerary'}
        </button>
        {preview ? (
          <button type="button" className="secondary-button" onClick={cancelPreview} disabled={isSaving || isGenerating}>
            Cancel
          </button>
        ) : null}
      </div>

      {error ? <p className="form-error">{error}</p> : null}
      {message ? <p className="form-success">{message}</p> : null}
      {sendReadiness ? (
        <section
          className={`quote-auto-itinerary-ready-banner quote-auto-itinerary-ready-banner-${sendReadiness.status}`}
          aria-live="polite"
        >
          <div>
            <p className="eyebrow">Proposal Readiness</p>
            <h3>
              {sendReadiness.status === 'ready'
                ? 'Ready to send'
                : sendReadiness.status === 'warnings'
                  ? 'Ready with warnings'
                  : 'Needs review before sending'}
            </h3>
            {sendReadiness.status === 'blocked' ? (
              <p>{sendReadiness.blockers.slice(0, 2).join(' ')}</p>
            ) : sendReadiness.status === 'warnings' ? (
              <p>{sendReadiness.warnings.length} warning{sendReadiness.warnings.length === 1 ? '' : 's'} should be reviewed before sending.</p>
            ) : (
              <p>The generated itinerary has priced core services and no blocking issues.</p>
            )}
          </div>
          {sendReadiness.status === 'ready' || sendReadiness.status === 'warnings' ? (
            <Link href={`/quotes/${quote.id}/preview`} className="primary-button">
              Open Proposal
            </Link>
          ) : null}
        </section>
      ) : null}

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
                    {formatTransportVehicleDisplay(item.selectedCandidate.vehicle)} | {item.selectedCandidate.currency} {item.selectedCandidate.price}
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
