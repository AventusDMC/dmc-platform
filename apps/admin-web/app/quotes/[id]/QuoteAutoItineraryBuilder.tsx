'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { getErrorMessage, logFetchUrl, readJsonResponse } from '../../lib/api';
import { buildAuthHeaders } from '../../lib/auth-client';
import { calculateCityDistance } from '../../lib/geo';
import { formatRouteLabel, type RouteOption } from '../../lib/routes';
import {
  buildRouteStandardLookup,
  lookupRouteStandardByCode,
  presentRouteTimingConfidence,
  type RouteStandardSummary,
  type TimingConfidencePresentation,
} from '../../lib/route-standards';
import { formatTransportVehicleDisplay } from '../../lib/transport-vehicles';
import { getQuoteServiceCategoryKey } from './quote-readiness';
import {
  assignGeneratedItineraryCities,
  assignGeneratedItineraryCitiesByNights,
  buildItineraryApplyMessage,
  classifyDailyDayType,
  classifyOvernightCity,
  getAutoItineraryDayCount,
  generateItineraryDays,
  isMiddleDay,
  mergeExistingItineraryDays,
  reconstructNightStopsFromDayTitles,
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

type TransportPricingAddOn = {
  rateId: string;
  name: string;
  addOnType: 'DRIVER_OVERNIGHT' | 'STATIONARY_WAITING' | 'OTHER';
  vehicleId?: string | null;
  unitCost?: number | null;
  currency: string;
  defaultQuantity?: number | null;
};

type TransportPricingCandidate = {
  routeId?: string | null;
  vehicleRateId?: string | null;
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
    classification?: string | null;
  };
};

type TransportPricingResult = {
  routeId?: string | null;
  vehicleRateId?: string | null;
  routeName?: string;
  price: number;
  currency: string;
  vehicle: TransportPricingCandidate['vehicle'];
  serviceType: TransportPricingCandidate['serviceType'];
  candidates?: TransportPricingCandidate[];
  optionalAddOns?: TransportPricingAddOn[];
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
  isDailyPackage?: boolean;
  // A stationary (local-standby) daily day vs a full touring day — drives both
  // the cheaper rate and the "min 3 FULL days" warning count (stationary days
  // don't count toward the full-day minimum).
  isStationary?: boolean;
  // A short airport leg billed as a half day of the daily vehicle (coaches that
  // have no transfer rate). Like isDailyPackage it carries dayCount + the daily
  // route, but uses the HALF_DAY service type.
  isHalfDay?: boolean;
  dayCount?: number;
  addOns?: Array<{ rateId: string; quantity: number; label?: string }>;
  // Per-day journey label for daily-package lines ("Amman → Petra",
  // "Petra (full day)") — persisted on the committed item so the line reads
  // the journey rather than the generic disposal-route rate name. Undefined for
  // ordinary per-leg transfers, which keep their route/service-derived label.
  journeyLabel?: string | null;
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
  // Touring routes (canonicalRouteType=TOURING_ROUTE) surface as activity
  // entries with a touringRoute reference instead of a service. The Auto
  // Builder includes them per-city so operators see the full touring
  // catalog alongside the activity catalog. Saved as quote items via
  // touringRouteId on apply.
  touringRoute: RouteOption | null;
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
  // Route Standards (Phase 2A): canonical per-route distance/duration/
  // risk-flags lookup. Optional + defaults to []; when empty, the preview
  // falls back to the existing Route distance/duration estimate.
  routeStandards?: RouteStandardSummary[];
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

/**
 * Locate an airport-arrival or airport-departure route for a given city.
 * Used by buildPreviewDraft to auto-generate Day 1 (Airport → first city)
 * and last-day (last city → Airport) transfers — both are standard DMC
 * inclusions that operators previously had to add manually on every
 * quote. Matches against the seed catalog's "Queen Alia International
 * Airport" / "King Hussein International Airport" entries, plus any
 * other route where the appropriate endpoint contains "airport" in its
 * normalized text.
 */
function findAirportRoute(routes: RouteOption[], city: string, direction: 'arrival' | 'departure') {
  const cityKey = normalizeText(city);
  if (!cityKey) return null;
  const airportSide = direction === 'arrival' ? 'fromPlace' : 'toPlace';
  const matches = routes.filter((route) => {
    if (!isValidRoute(route)) return false;
    const routeFrom = routeEndpointText(route, 'fromPlace');
    const routeTo = routeEndpointText(route, 'toPlace');
    if (direction === 'arrival') {
      // Airport → city: fromPlace has "airport", toPlace contains the city
      return routeFrom.includes('airport') && routeTo.includes(cityKey);
    }
    // city → Airport: fromPlace contains the city, toPlace has "airport"
    return routeFrom.includes(cityKey) && routeTo.includes('airport');
  });
  if (matches.length === 0) return null;
  // A city can have more than one airport (e.g. Amman has Queen Alia
  // INTERNATIONAL plus the secondary Marka field). Inbound tours arrive/
  // depart through the international gateway, so picking the first match
  // blindly (which grabbed "Marka Airport → Amman") is wrong. Prefer the
  // international gateway — recognised by "international" OR the gateway codes
  // operators use in route names (QAIA / Queen Alia / King Hussein), since the
  // catalog has Queen Alia routes named "QAIA Airport" without the word
  // "international". Falls back to the first match for cities with no
  // gateway-flagged route.
  const GATEWAY_AIRPORT = /international|queen alia|qaia|king hussein/;
  const gateway = matches.find((route) => GATEWAY_AIRPORT.test(routeEndpointText(route, airportSide)));
  return gateway || matches[0];
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

/**
 * Locate the daily-package "disposal" route. The DAILY_FULL_DAY (daily
 * package) rates are attached to the same-area "Amman → Amman" self-loop
 * route, because the pricing engine requires a route reference and a daily
 * package's flat per-day cost is route-agnostic. Match by normalizedKey
 * first, then fall back to any active same-place self-loop in Amman.
 */
function findDailyDisposalRoute(routes: RouteOption[]): RouteOption | null {
  // NEVER a touring route: every Amman-based touring route is stored with
  // fromPlace === toPlace === startCity (a self-loop), so the endpoint
  // fallback below would otherwise grab one of them and price against touring
  // pricing instead of the DAILY_FULL_DAY rates. Only real transfer routes
  // qualify as the daily-package disposal route.
  const isTouring = (route: RouteOption) =>
    route.routeType === 'TOURING_ROUTE' ||
    (route as { canonicalRouteType?: string | null }).canonicalRouteType === 'TOURING_ROUTE';
  const transferRoutes = routes.filter((route) => !isTouring(route));
  const byKey = transferRoutes.find((route) => normalizeText(route.normalizedKey) === 'amman amman');
  if (byKey) return byKey;
  return (
    transferRoutes.find((route) => {
      if (route.isActive === false) return false;
      const from = routeEndpointText(route, 'fromPlace');
      const to = routeEndpointText(route, 'toPlace');
      return Boolean(from) && from === to && from.includes('amman');
    }) || null
  );
}

// In daily-package mode, an airport leg is a FULL touring day (flat daily rate)
// when its drive is >= 100 km OR >= 5 h; under BOTH it's "short" — a transfer for
// a car, or a HALF day for a coach (operator rule). This separates the long
// gateways (QAIA↔Petra/Wadi Rum/Aqaba, 200km+/3.5h+) from short hops
// (QAIA↔Amman/Dead Sea, ~35-55 km).
const LONG_AIRPORT_DRIVE_MINUTES = 300;
const LONG_AIRPORT_DRIVE_KM = 100;
function isLongAirportDrive(route: RouteOption | null): boolean {
  if (!route) return false;
  if (route.distanceKm != null && route.distanceKm >= LONG_AIRPORT_DRIVE_KM) return true;
  if (route.durationMinutes != null && route.durationMinutes >= LONG_AIRPORT_DRIVE_MINUTES) return true;
  return false;
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
  const matches = services.filter((service) => getQuoteServiceCategoryKey(service) === category);
  if (category === 'transport') {
    // This representative transport service is linked to EVERY auto-generated
    // transfer line (its name is what the day card shows). Skip niche add-on
    // services — driver overnight, stationary, extra-km, border — the same way
    // NICHE_TRANSPORT_SERVICE_TYPE guards service-type selection. Picking the
    // first transport-category service used to land on "Petra Overnight", so
    // every daily-package line read "Petra Overnight" regardless of the day's
    // city. Fall back to the first match when no general transfer service exists.
    const general = matches.find(
      (service) =>
        !NICHE_TRANSPORT_SERVICE_TYPE.test(
          `${service.name || ''} ${service.category || ''} ${service.serviceType?.name || ''} ${service.serviceType?.code || ''}`,
        ),
    );
    if (general) return general;
  }
  return matches[0] || null;
}

// Niche / add-on transport service types that must never be the default for a
// road transfer: border crossings, overnight surcharges, per-hour disposal,
// extra-km/hour, stationary waiting. Picking the first /transfer/ match used to
// land on "Border Transfer" (it contains "transfer"), so airport + intercity
// legs were priced against a service type that has no rate on those routes →
// "No matching vehicle rate found" and a dead generation.
const NICHE_TRANSPORT_SERVICE_TYPE = /border|overnight|extra|stationary|per.?hour|add.?on|\bkm\b|waiting/i;

/**
 * Pick the transport service type best suited to a leg. Tries an explicit
 * preference list of canonical codes first (AIRPORT_TRANSFER, POINT_TO_POINT,
 * …), then falls back to a name/code regex while excluding the niche add-on
 * types above. Codes are the seeded canonical set; the regex fallback keeps it
 * working if codes differ in some environment.
 */
function pickTransportServiceType(
  types: TransportServiceType[],
  preferredCodes: string[],
  fallbackPattern: RegExp,
): TransportServiceType | null {
  for (const code of preferredCodes) {
    const byCode = types.find((type) => (type.code || '').toUpperCase() === code);
    if (byCode) return byCode;
  }
  return (
    types.find(
      (type) =>
        fallbackPattern.test(`${type.name} ${type.code}`) && !NICHE_TRANSPORT_SERVICE_TYPE.test(`${type.name} ${type.code}`),
    ) || null
  );
}

/**
 * Locate the first Meet & Assist (or equivalent operational-assistance)
 * service in the catalog. The auto-builder inserts this on Day 1 (arrival)
 * and the last day (departure) so the proposal shows airport-meet coverage
 * by default — a standard DMC inclusion the operator otherwise had to add
 * manually every quote.
 */
function findMeetAssistService(services: SupplierService[]) {
  const isMeetAssist = (service: SupplierService) => {
    const code = String(service.serviceType?.code || '').trim().toUpperCase();
    if (code === 'MEET_ASSIST' || code === 'AIRPORT_ASSISTANCE') return true;
    const haystack = `${service.category || ''} ${service.name || ''} ${service.serviceType?.name || ''}`.toLowerCase();
    return haystack.includes('meet') && haystack.includes('assist');
  };
  const matches = services.filter(isMeetAssist);
  // Prefer a per-group price over a per-person one. A meet & assist is a single
  // airport greeter for the whole party, so billing it × pax overstates it
  // (e.g. 30 pax × USD 42 = USD 1,260 for one greeter). When the catalog has a
  // per_group variant, use it; otherwise fall back to the first match.
  return matches.find((service) => service.unitType === 'per_group') || matches[0] || null;
}

type HotelSetupMissingReason = 'no-hotel-in-city' | 'no-valid-contract' | 'no-rate' | null;

function findHotelSetup(values: {
  city: string;
  travelDate: string | null;
  hotels: Hotel[];
  hotelContracts: HotelContract[];
  hotelRates: HotelRate[];
  optimizationMode: OptimizationMode;
}): {
  hotel: Hotel | null;
  contract: HotelContract | null;
  rate: HotelRate | null;
  // missingReason surfaces WHICH piece is absent so the preview UI can
  // give the operator an actionable cue (e.g., "No Petra hotel in catalog
  // — add one in /hotels" vs. "Petra hotel exists but no 2026 contract
  // — add one in /hotel-contracts" vs. "contract exists but no rates —
  // add rates"). Previously the day card said the generic "Needs hotel
  // contract and rate" for all three causes and the operator had no
  // idea what to actually fix.
  missingReason: HotelSetupMissingReason;
} {
  const cityKey = normalizeText(values.city);
  const cityHotels = values.hotels.filter(
    (candidate) => normalizeText(candidate.city).includes(cityKey) || cityKey.includes(normalizeText(candidate.city)),
  );

  if (cityHotels.length === 0) {
    return { hotel: null, contract: null, rate: null, missingReason: 'no-hotel-in-city' };
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

  const best = setups.sort((left, right) => {
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

  // Surface WHICH piece is missing so the day-card preview can give the
  // operator an actionable cue ("Petra hotel has no 2026 contract — add
  // one in /hotel-contracts") instead of the generic "Needs hotel
  // contract and rate" message that fired for all three causes equally.
  let missingReason: HotelSetupMissingReason = null;
  if (!best?.hotel) missingReason = 'no-hotel-in-city';
  else if (!best.contract) missingReason = 'no-valid-contract';
  else if (!best.rate) missingReason = 'no-rate';

  return {
    hotel: best?.hotel ?? null,
    contract: best?.contract ?? null,
    rate: best?.rate ?? null,
    missingReason,
  };
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

// VIP / VVIP vehicles are luxury tiers. The operator quotes standard coaches by
// default and only upgrades to luxury on request, so standard vehicles are
// ranked ahead of VIP/VVIP when both otherwise qualify.
function isLuxuryTransportVehicle(vehicleName: string) {
  return /vip|vvip|luxury|limo/i.test(vehicleName || '');
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

      // Standard coaches before VIP/VVIP luxury when both fit.
      const leftLuxury = isLuxuryTransportVehicle(left.vehicle.name);
      const rightLuxury = isLuxuryTransportVehicle(right.vehicle.name);
      if (leftLuxury !== rightLuxury) {
        return leftLuxury ? 1 : -1;
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

    // Equal price: prefer a standard vehicle over a VIP/VVIP luxury one.
    const leftLuxuryCost = isLuxuryTransportVehicle(left.vehicle.name);
    const rightLuxuryCost = isLuxuryTransportVehicle(right.vehicle.name);
    if (leftLuxuryCost !== rightLuxuryCost) {
      return leftLuxuryCost ? 1 : -1;
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

  // Daily-package supplier minimum: the flat daily rate normally requires at
  // least 3 full touring days. Evaluated once at the PROGRAM level (the count
  // of daily-package days) — not per line — so a 5-full-day trip never warns.
  const dailyFullDays = values.transports.filter(
    (transport) => transport.isDailyPackage && !transport.isStationary,
  ).length;
  if (dailyFullDays >= 1 && dailyFullDays < 3) {
    warnings.push({
      id: 'daily-package-min-days',
      title: 'Daily-package supplier minimum is 3 full days',
      description: `This program has ${dailyFullDays} full touring day${dailyFullDays === 1 ? '' : 's'}. The supplier's flat daily rate usually needs at least 3 — confirm the rate still applies, or price these days per route.`,
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

  // Bulletproof against any throw — the per-leg vehicle-rate lookup can
  // fail in a dozen ways (404 when no rate exists for the route+vehicle+
  // pax combo, content-type mismatch, network blip) and any of those used
  // to bubble up as a verbose backend error message ("No matching vehicle
  // rate found for serviceTypeId=da11e15-...") right in the operator's
  // preview area. Per-leg failures are NOT a preview-level error — the
  // transport row just shows the "Route matched, but pricing not
  // configured yet" cue. Log the detail to console for debugging.
  try {
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
      const bodyPreview = await response.text().catch(() => '');
      if (bodyPreview) {
        // eslint-disable-next-line no-console
        console.warn(`[Auto Builder] transport-pricing/calculate ${response.status}:`, bodyPreview.slice(0, 200));
      }
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
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('[Auto Builder] transport-pricing/calculate threw:', error);
    return null;
  }
}

/**
 * Price one daily-package (DAILY_FULL_DAY) day. The flat daily rate is route-
 * agnostic but the pricing engine requires a route, so we price against the
 * "Amman → Amman" disposal route the DAILY_FULL_DAY rates are attached to.
 * Returns the chosen vehicle candidate plus the supplier's optional add-ons
 * (driver overnights) so the caller can attach overnights per night-stop.
 * Defensive like resolveTransportCandidate — a per-day failure is non-fatal.
 */
async function resolveDailyTransport(values: {
  apiBaseUrl: string;
  disposalRoute: RouteOption;
  dailyServiceType: TransportServiceType | null;
  pax: number;
  quoteType: Quote['quoteType'];
  optimizationMode: OptimizationMode;
}): Promise<{ candidate: TransportPricingCandidate; optionalAddOns: TransportPricingAddOn[] } | null> {
  if (!values.dailyServiceType) {
    return null;
  }
  try {
    const response = await fetch(`${values.apiBaseUrl}/transport-pricing/calculate`, {
      method: 'POST',
      headers: buildAuthHeaders({
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify({
        serviceTypeId: values.dailyServiceType.id,
        routeId: values.disposalRoute.id,
        normalizedKey: values.disposalRoute.normalizedKey,
        routeName: '',
        paxCount: values.pax,
      }),
    });

    if (!response.ok) {
      const bodyPreview = await response.text().catch(() => '');
      if (bodyPreview) {
        // eslint-disable-next-line no-console
        console.warn(`[Auto Builder] daily-package calculate ${response.status}:`, bodyPreview.slice(0, 200));
      }
      return null;
    }

    const result = await readJsonResponse<TransportPricingResult>(response, 'Could not resolve daily-package pricing.');
    if (!result.vehicle || !result.serviceType) {
      return null;
    }
    // Use the PRIMARY matched rate, not a candidate pick: findMatchingRate
    // already returns the smallest-fitting / cheapest vehicle (single unit, no
    // pax multiplication) which is exactly what a flat daily package wants —
    // and the optionalAddOns (driver overnights) are keyed to THIS vehicle, so
    // using it guarantees the overnight add-on matches on apply.
    const candidate: TransportPricingCandidate = {
      routeId: result.routeId ?? values.disposalRoute.id,
      vehicleRateId: result.vehicleRateId ?? null,
      routeName: result.routeName || formatRouteLabel(values.disposalRoute),
      price: result.price,
      currency: result.currency,
      vehicle: result.vehicle,
      serviceType: result.serviceType,
    };
    return { candidate, optionalAddOns: result.optionalAddOns ?? [] };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('[Auto Builder] daily-package calculate threw:', error);
    return null;
  }
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
  // Airport-leg service type (AIRPORT_TRANSFER). Used for the arrival/departure
  // airport transfers; the general transportServiceType above handles transit.
  airportTransferServiceType?: TransportServiceType | null;
  // When the Guided Builder hands off a per-city night distribution, use
  // it for day-to-city assignment so a "Amman:3, Petra:2" stop list fills
  // 3 days with Amman + 2 with Petra rather than collapsing one day per
  // unique city.
  nightStops?: NightStop[] | null;
  // Route Standards lookup (Phase 2A) — when present, each transport
  // entry gets a routeStandard reference attached for canonical distance/
  // duration/risk-flag rendering. Empty map means no standards available
  // and the preview falls back to per-route distanceKm/durationMinutes.
  routeStandardLookup?: Map<string, RouteStandardSummary>;
  // Daily-package transport mode. When on, middle days are billed as flat
  // DAILY_FULL_DAY lines (priced against the disposal route) instead of
  // per-leg intercity transfers, and driver overnights are auto-attached.
  usePackageTransport?: boolean;
  deadSeaOvernight?: boolean;
  dailyPackageServiceType?: TransportServiceType | null;
  // Stationary (local-standby) service type for same-city stay days at
  // overnight bases (Petra / Wadi Rum / Aqaba). Falls back to the full-day
  // service type when absent so the build still produces a (full-day) line.
  stationaryServiceType?: TransportServiceType | null;
  // Half-day service type for short airport drives the daily vehicle can't
  // transfer-price (coaches). Falls back to the transfer when absent.
  halfDayServiceType?: TransportServiceType | null;
  disposalRoute?: RouteOption | null;
}) {
  const optimized = optimizeCitySequence(parseRouteText(values.routeText), values.routes, values.optimizationMode);
  const cities = optimized.cities;
  const generatedDays = generateItineraryDays(values.travelStartDate, values.nightCount);

  // When the operator switches to "comfort" mode the optimizer reorders
  // cities to favor shorter drive times. The Guided-Builder nightStops
  // path was bypassing that reorder — using the operator's original
  // stop sequence regardless of optimization mode. Apply the same
  // reorder to nightStops so a "comfort" run respects both per-city
  // night durations AND the optimized stop order.
  const reorderedNightStops = (() => {
    if (!values.nightStops || values.nightStops.length === 0) return values.nightStops || null;
    if (cities.length === 0) return values.nightStops;
    const byCity = new Map<string, NightStop>();
    for (const stop of values.nightStops) {
      byCity.set(stop.name.trim().toLowerCase(), stop);
    }
    const ordered: NightStop[] = [];
    for (const city of cities) {
      const found = byCity.get(city.trim().toLowerCase());
      if (found) {
        ordered.push(found);
        byCity.delete(city.trim().toLowerCase());
      }
    }
    // Append any stops the optimizer dropped (shouldn't happen with the
    // current optimizer, but defensive — preserves original durations).
    for (const remaining of byCity.values()) ordered.push(remaining);
    return ordered;
  })();

  const days: PreviewDay[] =
    reorderedNightStops && reorderedNightStops.some((stop) => stop.nights > 0)
      ? assignGeneratedItineraryCitiesByNights(generatedDays, reorderedNightStops)
      : assignGeneratedItineraryCities(generatedDays, cities);

  // Per-day transport generation. Operator's mental model: every day card
  // has a corresponding transport row indicating what happens that day:
  //   Day 1 (arrival):     Arrival -> first city  (airport pickup)
  //   In-city stay day:    City -> City  (marker, no actual transfer)
  //   Transit day:         previous city -> current city
  //   Last day (departure): last city -> Departure  (airport dropoff)
  //
  // This is uniform with the day cards — N days -> N transport rows.
  // PR #87 suppressed same-city rows as ghosts; PR #89 split into
  // three buckets. Both were operator-confusing — this single-loop
  // design matches what they expect to see on each day card.

  const buildTransportEntry = async (
    dayNumber: number,
    fromCity: string,
    toCity: string,
    routeOverride: ReturnType<typeof findRoute> | undefined,
    kind: 'arrival' | 'departure' | 'transit' | 'in-city',
  ) => {
    const route = routeOverride !== undefined ? routeOverride : findRoute(values.routes, fromCity, toCity);
    const distanceEstimate = getRouteDistanceEstimate(route, fromCity, toCity);
    // Airport pickup/dropoff legs price as AIRPORT_TRANSFER; transit legs as the
    // general (POINT_TO_POINT-style) transfer type. The catalog is inconsistent
    // across the duplicate airport routes — some Queen Alia routes carry
    // AIRPORT_TRANSFER rates, others only POINT_TO_POINT — so try the leg's
    // preferred type first and fall back to the general type, deduped. Using the
    // right type per leg is what lets the catalog rate actually resolve.
    const legServiceTypes =
      kind === 'arrival' || kind === 'departure'
        ? [values.airportTransferServiceType, values.transportServiceType]
        : [values.transportServiceType];
    const seenServiceTypeIds = new Set<string>();
    let selectedCandidate: TransportPricingCandidate | null = null;
    if (route) {
      // Gather the best candidate from EACH applicable service type rather than
      // stopping at the first that resolves. The airport routes carry
      // AIRPORT_TRANSFER rates (often the pricier coach supplier) AND
      // POINT_TO_POINT rates (the cheap car/van supplier) — stopping at the
      // first (AIRPORT_TRANSFER) made a 2-pax arrival pick a USD coach over a
      // ~20 JOD sedan. In cost mode pick the cheapest across both; in comfort
      // mode keep the leg's preferred (first) service type.
      const winners: TransportPricingCandidate[] = [];
      for (const candidateServiceType of legServiceTypes) {
        if (!candidateServiceType || seenServiceTypeIds.has(candidateServiceType.id)) continue;
        seenServiceTypeIds.add(candidateServiceType.id);
        const winner = await resolveTransportCandidate({
          apiBaseUrl: values.apiBaseUrl,
          route,
          transportServiceType: candidateServiceType,
          pax: values.pax,
          quoteType: values.quoteType,
          optimizationMode: values.optimizationMode,
        });
        if (winner) winners.push(winner);
      }
      if (winners.length <= 1) {
        selectedCandidate = winners[0] ?? null;
      } else if (values.optimizationMode === 'cost') {
        const cheapest = winners.reduce((best, candidate) => (candidate.price < best.price ? candidate : best));
        // On an airport pickup/dropoff, don't split the party across several
        // vehicles just to shave cost. A POINT_TO_POINT car rate billed by
        // capacity unit (e.g. 6 × Mini Van 5 for a group) is cheaper on paper
        // but reads wrong on an arrival/departure and isn't how the trip runs —
        // prefer the dedicated AIRPORT_TRANSFER vehicle when one resolved and it
        // doesn't itself need multiple vehicles. Small parties (a single
        // car/van fits) still keep the cheaper POINT_TO_POINT.
        const splitsVehicles = (candidate: TransportPricingCandidate) =>
          candidate.pricingMode === 'capacity_unit' && (candidate.unitCount ?? 1) > 1;
        const airportWinner =
          (kind === 'arrival' || kind === 'departure') && values.airportTransferServiceType
            ? winners.find((candidate) => candidate.serviceType.id === values.airportTransferServiceType?.id)
            : undefined;
        selectedCandidate =
          airportWinner && airportWinner !== cheapest && splitsVehicles(cheapest) && !splitsVehicles(airportWinner)
            ? airportWinner
            : cheapest;
      } else {
        selectedCandidate = winners[0];
      }
    }
    let optimizationReason: string;
    if (selectedCandidate) {
      optimizationReason =
        values.optimizationMode === 'comfort'
          ? `Selected ${selectedCandidate.vehicle.name} for comfort, luggage space, and fit for ${values.pax} pax.`
          : `Selected ${selectedCandidate.vehicle.name} as best value at ${selectedCandidate.currency} ${selectedCandidate.price}.`;
    } else if (kind === 'in-city') {
      optimizationReason = `Staying in ${fromCity} today — no inter-city transfer required. Add an in-city tour or hourly disposal on the day card if needed.`;
    } else if (route) {
      optimizationReason = 'Route matched, but transport pricing is not configured yet.';
    } else {
      optimizationReason = `No catalog route from ${fromCity} to ${toCity}. Add it in Transfer Routes admin.`;
    }
    // Route Standards lookup (Phase 2A): attach the canonical
    // distance/duration/risk-flag profile when a standard exists for the
    // matched route's code. Display layer prefers these values over the
    // per-route distanceKm/durationMinutes when present.
    const routeStandard = route && values.routeStandardLookup
      ? lookupRouteStandardByCode(values.routeStandardLookup, (route as { code?: string | null }).code || null)
      : null;
    return {
      dayNumber,
      fromCity,
      toCity,
      distanceKm: distanceEstimate?.distanceKm ?? null,
      travelTimeHours: distanceEstimate?.travelTimeHours ?? null,
      isTravelHeavy: (distanceEstimate?.travelTimeHours ?? 0) > 4,
      route,
      routeStandard,
      selectedCandidate,
      optimizationReason,
    };
  };

  // Daily-package mode: middle days are billed as a flat DAILY_FULL_DAY line
  // (the daily rate covers all movement, so per-leg intercity transfers are
  // dropped) plus auto-attached driver overnights. Arrival/departure airport
  // transfers are unchanged. Off by default — the per-route path is untouched.
  const dailyPackageActive = Boolean(
    values.usePackageTransport && values.dailyPackageServiceType && values.disposalRoute,
  );
  // The driver sleeps wherever the guests sleep that night = the day's CURRENT
  // city. So a driver overnight attaches to EVERY middle day whose city is an
  // overnight stop (Petra/Wadi Rum/Aqaba standard; Dead Sea opt-in) — e.g. two
  // nights in Petra → an overnight on each of those days, not lumped onto one.
  const buildDailyEntry = async (dayNumber: number, previousCity: string, currentCity: string) => {
    const disposalRoute = values.disposalRoute as RouteOption;
    const moved = Boolean(previousCity && currentCity) && normalizeText(previousCity) !== normalizeText(currentCity);
    // Stationary applies only on STAY days at overnight bases (Petra / Wadi Rum
    // / Aqaba). A move is always a full touring day; an Amman stay is a full day
    // (city tour); a Dead Sea stay is a FREE day (no vehicle) unless opted in.
    const dayType = classifyDailyDayType(moved, currentCity, {
      includeDeadSea: Boolean(values.deadSeaOvernight),
    });
    if (dayType === 'skip') {
      return null;
    }
    const isStationary = dayType === 'stationary';
    const dailyServiceType = isStationary
      ? values.stationaryServiceType ?? values.dailyPackageServiceType ?? null
      : values.dailyPackageServiceType ?? null;
    const resolved = await resolveDailyTransport({
      apiBaseUrl: values.apiBaseUrl,
      disposalRoute,
      dailyServiceType,
      pax: values.pax,
      quoteType: values.quoteType,
      optimizationMode: values.optimizationMode,
    });
    const selectedCandidate = resolved?.candidate ?? null;
    // Label the line by the day's ACTUAL journey: a move shows "Amman → Petra",
    // a stay shows "Petra (stationary)" or "Amman (full day)". The overnight and
    // the rate differ by day type; the label makes the distinction visible.
    const dayKindLabel = isStationary ? 'stationary' : 'full day';
    const fromCity = moved ? previousCity : currentCity;
    const toCity = currentCity;
    const journeyLabel = moved
      ? `${previousCity} → ${currentCity}`
      : `${currentCity || 'destination'} (${dayKindLabel})`;

    // Driver overnight for the night spent at the current city (1 per day).
    let addOns: Array<{ rateId: string; quantity: number; label?: string }> | undefined;
    const overnightPolicy = classifyOvernightCity(currentCity, { includeOptional: Boolean(values.deadSeaOvernight) });
    if (overnightPolicy !== 'none' && selectedCandidate && resolved) {
      const cityKey = normalizeText(currentCity);
      const match = resolved.optionalAddOns.find(
        (addOn) =>
          addOn.addOnType === 'DRIVER_OVERNIGHT' &&
          addOn.currency === selectedCandidate.currency &&
          (!addOn.vehicleId || addOn.vehicleId === selectedCandidate.vehicle.id) &&
          Boolean(cityKey) &&
          normalizeText(addOn.name).includes(cityKey),
      );
      if (match) {
        addOns = [{ rateId: match.rateId, quantity: 1, label: `${currentCity} driver overnight` }];
      }
    }
    const dayKindNoun = isStationary ? 'stationary standby' : 'daily package';
    let optimizationReason: string;
    if (selectedCandidate) {
      optimizationReason = `${journeyLabel} — ${dayKindNoun}: ${selectedCandidate.vehicle.name} at ${selectedCandidate.currency} ${selectedCandidate.price}/day${addOns ? ` + ${addOns[0].label}` : ''}.`;
    } else {
      const rateHint = isStationary ? 'a STATIONARY_WAITING' : 'a DAILY_FULL_DAY';
      optimizationReason = `${journeyLabel} — ${dayKindNoun} rate not configured for ${values.pax} pax. Load ${rateHint} vehicle rate or add this day manually.`;
    }
    return {
      dayNumber,
      fromCity,
      toCity,
      distanceKm: null,
      travelTimeHours: null,
      isTravelHeavy: false,
      route: disposalRoute,
      routeStandard: null,
      selectedCandidate,
      optimizationReason,
      isDailyPackage: true,
      isStationary,
      dayCount: 1,
      addOns,
      // The day's actual journey ("Amman → Petra" / "Petra (full day)" /
      // "Petra (stationary)"), persisted so the committed line reads the
      // journey instead of the generic disposal-route rate name.
      journeyLabel,
    };
  };

  // A short airport drive (< 100 km / < 5 h) the daily vehicle can't be
  // transfer-priced for (e.g. a coach for a large group) bills as a HALF DAY of
  // the daily vehicle. Returns null if no half-day rate resolves (the caller then
  // keeps the transfer, even if unpriced).
  const buildHalfDayAirportEntry = async (dayNumber: number, fromLabel: string, toLabel: string) => {
    if (!values.halfDayServiceType || !values.disposalRoute) {
      return null;
    }
    const disposalRoute = values.disposalRoute as RouteOption;
    const resolved = await resolveDailyTransport({
      apiBaseUrl: values.apiBaseUrl,
      disposalRoute,
      dailyServiceType: values.halfDayServiceType,
      pax: values.pax,
      quoteType: values.quoteType,
      optimizationMode: values.optimizationMode,
    });
    const selectedCandidate = resolved?.candidate ?? null;
    if (!selectedCandidate) {
      return null;
    }
    const journeyLabel = `${fromLabel} → ${toLabel}`;
    return {
      dayNumber,
      fromCity: fromLabel,
      toCity: toLabel,
      distanceKm: null,
      travelTimeHours: null,
      isTravelHeavy: false,
      route: disposalRoute,
      routeStandard: null,
      selectedCandidate,
      optimizationReason: `${journeyLabel} — half day (short airport drive): ${selectedCandidate.vehicle.name} at ${selectedCandidate.currency} ${selectedCandidate.price}/half-day.`,
      isDailyPackage: true,
      isHalfDay: true,
      dayCount: 1,
      addOns: undefined as Array<{ rateId: string; quantity: number; label?: string }> | undefined,
      journeyLabel,
    };
  };

  // A daily-package airport leg should fall back to a Half Day of the daily
  // vehicle when the per-leg transfer either can't price OR can only price by
  // splitting the party across multiple vehicles (a capacity-unit rate, e.g.
  // Dead Sea → QAIA has only small point-to-point vans, so a group needs 4×Van).
  // The operator bills those short Dead-Sea/Amman ↔ airport runs as a half day,
  // so prefer one Half-Day coach over a multi-van split.
  const airportLegNeedsHalfDayFallback = (
    entry: Awaited<ReturnType<typeof buildTransportEntry>> | null | undefined,
  ) => {
    const candidate = entry?.selectedCandidate;
    if (!candidate) return true;
    return candidate.pricingMode === 'capacity_unit' && (candidate.unitCount ?? 1) > 1;
  };

  const totalDays = days.length;
  const transportEntries = await Promise.all(
    days.map(async (day, index) => {
      const previousDay = index > 0 ? days[index - 1] : null;
      const isFirst = index === 0;
      const isLast = index === days.length - 1;
      const previousCity = previousDay?.city || '';
      const currentCity = day.city;

      if (isFirst) {
        // ARRIVAL transfer: Airport (or "Arrival" placeholder) -> first city.
        const route = currentCity ? findAirportRoute(values.routes, currentCity, 'arrival') : null;
        const fromLabel = route?.fromPlace?.name?.trim() || 'Arrival';
        // In a daily package, a LONG airport drive (~2.5h+, e.g. QAIA↔Petra/
        // Wadi Rum/Aqaba) is effectively a full touring day and bills at the
        // flat daily rate; a short hop (QAIA↔Amman/Dead Sea) stays a transfer.
        if (dailyPackageActive && isLongAirportDrive(route)) {
          return buildDailyEntry(day.dayNumber, fromLabel, currentCity);
        }
        const arrivalTransfer = await buildTransportEntry(day.dayNumber, fromLabel, currentCity, route, 'arrival');
        if (dailyPackageActive && airportLegNeedsHalfDayFallback(arrivalTransfer)) {
          const halfDay = await buildHalfDayAirportEntry(day.dayNumber, fromLabel, currentCity);
          if (halfDay) return halfDay;
        }
        return arrivalTransfer;
      }
      if (isLast) {
        // DEPARTURE transfer: last city -> Airport (or "Departure" placeholder).
        const route = currentCity ? findAirportRoute(values.routes, currentCity, 'departure') : null;
        const toLabel = route?.toPlace?.name?.trim() || 'Departure';
        if (dailyPackageActive && isLongAirportDrive(route)) {
          return buildDailyEntry(day.dayNumber, currentCity, toLabel);
        }
        const departureTransfer = await buildTransportEntry(day.dayNumber, currentCity, toLabel, route, 'departure');
        if (dailyPackageActive && airportLegNeedsHalfDayFallback(departureTransfer)) {
          const halfDay = await buildHalfDayAirportEntry(day.dayNumber, currentCity, toLabel);
          if (halfDay) return halfDay;
        }
        return departureTransfer;
      }
      // DAILY-PACKAGE middle day: one flat DAILY_FULL_DAY line labelled by the
      // day's journey (move = "Amman → Petra", stay = "Petra (full day)") plus
      // a driver overnight for that night's city. Replaces the per-leg
      // transit/in-city transfer entirely.
      if (dailyPackageActive && isMiddleDay(day.dayNumber, totalDays)) {
        return buildDailyEntry(day.dayNumber, previousCity, currentCity);
      }
      const normalizedPrevious = normalizeText(previousCity);
      const normalizedCurrent = normalizeText(currentCity);
      const isInCityStay = normalizedPrevious && normalizedCurrent && normalizedPrevious === normalizedCurrent;
      if (isInCityStay) {
        // SAME-CITY day: "Staying in X today" marker, no inter-city transfer.
        return buildTransportEntry(day.dayNumber, currentCity, currentCity, null, 'in-city');
      }
      // TRANSIT: previous city -> current city.
      return buildTransportEntry(day.dayNumber, previousCity, currentCity, undefined, 'transit');
    }),
  );
  // Daily-package free days (e.g. a Dead Sea stay with no opted-in vehicle)
  // return null from buildDailyEntry — drop them so no empty transport line is
  // created for that day.
  const transports = transportEntries.filter(
    (entry): entry is NonNullable<typeof entry> => entry !== null,
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

  const meetAssistService = findMeetAssistService(values.services);
  // Generate builds the OPERATIONAL SKELETON only: arrival/intercity/departure
  // transfers, hotels per night, and Meet & Assist on the airport days. It does
  // NOT auto-commit tours or activities — those are trip-specific choices the
  // operator adds from the catalog. (Previously it dumped EVERY touring route
  // for EVERY city plus a $0 activity placeholder per day, which flooded the
  // quote with dozens of mislabelled "transport" rows.)
  type ActivityEntry = {
    dayNumber: number;
    city: string;
    service: SupplierService | null;
    touringRoute: RouteOption | null;
  };
  const activities: ActivityEntry[] = [];

  // Meet & Assist on arrival (Day 1) and departure (last day) — operator
  // gets airport-meet coverage by default instead of having to add it
  // manually on every quote. Only fires if the catalog actually has a
  // matching service; otherwise the entries are skipped silently and the
  // existing "needs catalog" empty-state surfaces.
  if (meetAssistService && days.length > 0) {
    const firstDay = days[0];
    const lastDay = days[days.length - 1];
    activities.push({ dayNumber: firstDay.dayNumber, city: firstDay.city, service: meetAssistService, touringRoute: null });
    if (lastDay.dayNumber !== firstDay.dayNumber) {
      activities.push({ dayNumber: lastDay.dayNumber, city: lastDay.city, service: meetAssistService, touringRoute: null });
    }
  }

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
  routeStandards = [],
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

  // Fallback persistence: when the URL doesn't have source=guided (operator
  // navigated away and came back), reconstruct the per-city night
  // distribution from the SAVED day titles. PR #74 standardised titles on
  // "Arrival · Amman" / "Petra" / "Departure · Dead Sea" so the city
  // sequence is recoverable. Without this fallback, the operator who clicks
  // Generate Full Itinerary on a returned-to quote got all-Amman hotels
  // because routeText was empty and findHotelSetup matched everything to
  // the first hotel.
  const reconstructedAppliedRef = useRef(false);
  useEffect(() => {
    if (reconstructedAppliedRef.current) return;
    if (guidedPrefillAppliedRef.current && guidedNightStops) return;
    if (!quote.itineraries || quote.itineraries.length === 0) return;
    const reconstructed = reconstructNightStopsFromDayTitles(quote.itineraries);
    if (!reconstructed || reconstructed.length === 0) return;
    setGuidedNightStops(reconstructed);
    setRouteText(reconstructed.map((stop) => stop.name).join(' -> '));
    reconstructedAppliedRef.current = true;
  }, [quote.itineraries, guidedNightStops]);

  const [selectedPresetId, setSelectedPresetId] = useState('');
  const [pax, setPax] = useState(String(Math.max(totalPax || quote.adults + quote.children || 1, 1)));
  const [quoteType, setQuoteType] = useState<'FIT' | 'GROUP'>(quote.quoteType || 'FIT');
  const [optimizationMode, setOptimizationMode] = useState<OptimizationMode>('cost');
  // Default includeActivities=true so Generate Full Itinerary actually
  // populates activities. Operator can uncheck if they only want hotels +
  // transport. Previously default false meant activities never auto-pulled,
  // surprising operators who clicked the "Full Itinerary" button.
  const [includeActivities, setIncludeActivities] = useState(true);
  // Daily-package transport mode (off by default — preserves the existing
  // per-route behaviour). When on, middle days bill as flat DAILY_FULL_DAY
  // lines + driver overnights. Dead Sea overnight is an extra opt-in.
  const [usePackageTransport, setUsePackageTransport] = useState(false);
  const [deadSeaOvernight, setDeadSeaOvernight] = useState(false);
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
  // Route Standards lookup — built once per render from the loaded
  // route-standards array. Keyed by normalized routeCode so per-leg
  // lookups are O(1). When the catalog is empty the map is empty and the
  // preview transparently falls back to existing Route distance/duration.
  const routeStandardLookup = useMemo(() => buildRouteStandardLookup(routeStandards), [routeStandards]);
  // General / intercity transfer default. Verified against the catalog: every
  // intercity leg (Amman↔Petra, Petra↔Wadi Rum, Wadi Rum↔Dead Sea, …) prices as
  // POINT_TO_POINT (some also PRIVATE_TRANSFER_SERVICE), so prefer those and
  // never the niche "Border Transfer" the old first-/transfer/-match landed on.
  const transportServiceType = useMemo(
    () =>
      pickTransportServiceType(
        transportServiceTypes,
        ['POINT_TO_POINT', 'PRIVATE_TRANSFER_SERVICE', 'PRIVATE_TRANSFER', 'INT', 'TRANSFER'],
        /transfer|transport|vehicle|point.?to.?point|intercity/i,
      ) ||
      transportServiceTypes[0] ||
      null,
    [transportServiceTypes],
  );
  // Airport arrival/departure legs price as AIRPORT_TRANSFER in the catalog —
  // use that for the airport pickup/dropoff instead of the generic transfer
  // type, so the standard inbound/outbound transfers actually resolve a rate.
  const airportTransferServiceType = useMemo(
    () => pickTransportServiceType(transportServiceTypes, ['AIRPORT_TRANSFER', 'ARR', 'DEP'], /airport/i) || transportServiceType,
    [transportServiceTypes, transportServiceType],
  );
  // Daily-package (flat per-day) service type + the disposal route its rates
  // hang off. Both required for daily-package mode; when either is missing the
  // toggle silently no-ops and the per-route path is used.
  const dailyPackageServiceType = useMemo(
    () => pickTransportServiceType(transportServiceTypes, ['DAILY_FULL_DAY'], /daily|full.?day|package/i),
    [transportServiceTypes],
  );
  // Stationary (local-standby) service type for same-city stay days at Petra /
  // Wadi Rum / Aqaba — the vehicle waits locally instead of touring all day, so
  // it bills cheaper than a full day.
  const stationaryServiceType = useMemo(
    () => pickTransportServiceType(transportServiceTypes, ['STATIONARY_WAITING', 'STATIONARY'], /stationary|standby|waiting/i),
    [transportServiceTypes],
  );
  // Half-day service type — used for a SHORT airport drive (< 100 km / < 5 h) that
  // the daily vehicle can't be transfer-priced for (e.g. a coach for a large
  // group): a Dead Sea / Amman → airport run is half a day's vehicle use, not a
  // full touring day.
  const halfDayServiceType = useMemo(
    () => pickTransportServiceType(transportServiceTypes, ['HALF_DAY'], /half.?day/i),
    [transportServiceTypes],
  );
  const dailyDisposalRoute = useMemo(() => findDailyDisposalRoute(routes), [routes]);
  const dailyPackageAvailable = Boolean(dailyPackageServiceType && dailyDisposalRoute);

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
            airportTransferServiceType,
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
            routeStandardLookup,
            usePackageTransport,
            deadSeaOvernight,
            dailyPackageServiceType,
            stationaryServiceType,
            halfDayServiceType,
            disposalRoute: dailyDisposalRoute,
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
          airportTransferServiceType,
          travelStartDate,
          nightCount: numericNightCount,
          routeText,
          includeActivities,
          routes,
          hotels,
          hotelContracts,
          hotelRates,
          services,
          routeStandardLookup,
          usePackageTransport,
          deadSeaOvernight,
          dailyPackageServiceType,
          stationaryServiceType,
          halfDayServiceType,
          disposalRoute: dailyDisposalRoute,
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

  // Existing quote items, used to make re-running Generate idempotent: a second
  // run must not pile up duplicate transfers/hotels/services on days that
  // already have them.
  type ExistingQuoteItemRaw = {
    itineraryId: string | null;
    routeId: string | null;
    transportServiceTypeId: string | null;
    hotelId: string | null;
    touringRouteId: string | null;
    serviceId: string | null;
    // The real day link (auto-builder items leave the legacy itineraryId null).
    quoteItineraryDayItems?: Array<{ dayId: string | null }> | null;
  };
  type ExistingQuoteItem = ExistingQuoteItemRaw & { dayId: string | null };
  async function getExistingQuoteItems(): Promise<ExistingQuoteItem[]> {
    try {
      const response = await fetch(logFetchUrl(`${apiBaseUrl}/quotes/${quote.id}/items`), {
        headers: buildAuthHeaders(),
        credentials: 'include',
      });
      if (!response.ok) return [];
      const items = await readJsonResponse<ExistingQuoteItemRaw[]>(response, 'Existing quote items');
      if (!Array.isArray(items)) return [];
      // Resolve each item's actual day: the QuoteItineraryDayItem join is the
      // source of truth; fall back to the legacy itineraryId for older items.
      return items.map((item) => ({
        ...item,
        dayId: item.quoteItineraryDayItems?.[0]?.dayId ?? item.itineraryId ?? null,
      }));
    } catch {
      return [];
    }
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

    // Idempotency: load what's already on the quote so a second Generate run
    // doesn't duplicate transfers/hotels/services on days that already have
    // them. Keyed per day (itineraryId) + the item's identity. Also preserves
    // anything the operator added manually.
    const existingItems = await getExistingQuoteItems();
    // Dedup on the item's REAL day (dayId from the join) — not the legacy
    // itineraryId, which is null on auto-builder items and made every
    // re-generate pile up duplicates.
    const existingTransportKeys = new Set(
      existingItems.filter((i) => i.routeId).map((i) => `${i.dayId}|${i.routeId}`),
    );
    const existingHotelKeys = new Set(
      existingItems.filter((i) => i.hotelId).map((i) => `${i.dayId}|${i.hotelId}`),
    );
    const existingServiceKeys = new Set(
      existingItems
        .filter((i) => i.serviceId && !i.routeId && !i.hotelId && !i.touringRouteId)
        .map((i) => `${i.dayId}|${i.serviceId}`),
    );

    let createdItems = 0;
    let skippedUnpricedTransfers = 0;
    let skippedUnpricedTours = 0;

    if (transportService && transportServiceType) {
      for (const item of draft.transports) {
        const day = savedDays.get(item.dayNumber);

        if (!day || !item.route) {
          continue;
        }

        // Idempotent re-generate: this day already has this transfer route.
        if (existingTransportKeys.has(`${day.id}|${item.route.id}`)) {
          continue;
        }

        // Route matched but no priceable vehicle rate exists for it (e.g. an
        // airport transfer whose route has no configured vehicle rate). The
        // preview already swallows this per-leg as "pricing not configured
        // yet", but creating the quote item would make the backend throw
        // "No matching vehicle rate found …" and abort the ENTIRE generation,
        // leaving the operator with the raw error and a half-built quote.
        // Skip it instead — same as the hotels loop skips legs missing a
        // contract/rate — and report the count so the operator knows to add
        // those transfers manually.
        if (!item.selectedCandidate) {
          skippedUnpricedTransfers += 1;
          continue;
        }

        // Let the backend price the leg from the route + service type + vehicle
        // (like the manual transport picker) instead of force-overriding with the
        // candidate's price. The candidate price is in the rate's native currency
        // (e.g. JOD), but `overrideCost` is interpreted in the QUOTE currency — so
        // overriding stored "JOD 20" as "USD 20" (no FX conversion). Pricing it
        // server-side runs the JOD→quote-currency conversion correctly. Wrapped so
        // a server-side pricing edge case skips just this leg instead of aborting.
        try {
          await postJson(
            `${apiBaseUrl}/quotes/${quote.id}/items`,
            {
              serviceId: transportService.id,
              itineraryId: day.id,
              quantity: 1,
              paxCount: numericPax,
              // Daily-package lines carry dayCount (backend multiplies the flat
              // daily rate × dayCount) and the driver-overnight add-ons.
              dayCount: item.dayCount ?? 1,
              markupPercent: 20,
              transportServiceTypeId: item.selectedCandidate.serviceType.id,
              transportVehicleId: item.selectedCandidate.vehicle.id,
              routeId: item.route.id,
              normalizedKey: item.route.normalizedKey,
              routeName: '',
              transportLabel: item.journeyLabel ?? null,
              overrideCost: null,
              useOverride: false,
              currency: item.selectedCandidate.currency,
              transportAddOns: item.addOns?.map((addOn) => ({ rateId: addOn.rateId, quantity: addOn.quantity })) ?? [],
            },
            `Could not add transport for ${item.fromCity} to ${item.toCity}.`,
          );
          createdItems += 1;
        } catch (transferError) {
          const transferMessage = transferError instanceof Error ? transferError.message : '';
          if (/no matching vehicle rate|pricing rule|transport cost must be positive|maxpax/i.test(transferMessage)) {
            skippedUnpricedTransfers += 1;
          } else {
            throw transferError;
          }
        }
      }
    }

    if (hotelService) {
      // Group consecutive same-hotel/same-contract/same-rate nights into a
      // single quote item with nightCount=N. Previously a 3-night Amman
      // stay produced 3 separate hotel rows on 3 separate days, which made
      // the Pricing tab look fragmented ("3 distinct bookings") and the
      // client-facing proposal showed the same hotel three times. Anchor
      // each grouped item on the FIRST night's day (operationally that's
      // the check-in day) and skip the follow-on nights' day attachments.
      const groupedHotels: Array<{
        firstDayNumber: number;
        nightCount: number;
        hotel: NonNullable<typeof draft.hotels[number]['hotel']>;
        contract: NonNullable<typeof draft.hotels[number]['contract']>;
        rate: NonNullable<typeof draft.hotels[number]['rate']>;
        city: string;
      }> = [];
      for (const item of draft.hotels) {
        if (!item.hotel || !item.contract || !item.rate) continue;
        const last = groupedHotels[groupedHotels.length - 1];
        if (
          last &&
          last.hotel.id === item.hotel.id &&
          last.contract.id === item.contract.id &&
          last.rate.roomCategoryId === item.rate.roomCategoryId &&
          last.rate.occupancyType === item.rate.occupancyType &&
          last.rate.mealPlan === item.rate.mealPlan &&
          item.dayNumber === last.firstDayNumber + last.nightCount
        ) {
          last.nightCount += 1;
        } else {
          groupedHotels.push({
            firstDayNumber: item.dayNumber,
            nightCount: 1,
            hotel: item.hotel,
            contract: item.contract,
            rate: item.rate,
            city: item.city,
          });
        }
      }

      for (const group of groupedHotels) {
        const day = savedDays.get(group.firstDayNumber);
        if (!day) continue;
        // Idempotent re-generate: this day already has this hotel.
        if (existingHotelKeys.has(`${day.id}|${group.hotel.id}`)) {
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
            nightCount: group.nightCount,
            markupPercent: 20,
            hotelId: group.hotel.id,
            contractId: group.contract.id,
            seasonName: group.rate.seasonName,
            roomCategoryId: group.rate.roomCategoryId,
            occupancyType: group.rate.occupancyType,
            mealPlan: group.rate.mealPlan,
          },
          `Could not add hotel placeholder for ${group.city}.`,
        );
        createdItems += 1;
      }
    }

    for (const item of draft.activities) {
      const day = savedDays.get(item.dayNumber);
      const previewDay = draft.days.find((candidate) => candidate.dayNumber === item.dayNumber);

      if (!day || !previewDay?.date) {
        continue;
      }

      // Touring-route entry: save as a quote item with touringRouteId.
      // No serviceId needed — backend infers the operational service type
      // from the route's touringRoutePricings configuration.
      if (item.touringRoute) {
        if (!transportService) continue;
        // Safety net: findTouringRoutesForCity already filters out tours with no
        // active pricing, but if a variant's pricing is inactive/missing in a
        // way the client list didn't catch, the backend rejects the item
        // ("…has no active pricing row"). Skip that one tour instead of letting
        // it abort the whole generation, and report the count.
        try {
          await postJson(
            `${apiBaseUrl}/quotes/${quote.id}/items`,
            {
              serviceId: transportService.id,
              itineraryId: day.id,
              serviceDate: new Date(`${previewDay.date}T09:00:00`).toISOString(),
              startTime: '09:00',
              meetingPoint: item.city,
              participantCount: numericPax,
              quantity: 1,
              paxCount: numericPax,
              dayCount: 1,
              markupPercent: 20,
              touringRouteId: item.touringRoute.id,
              normalizedKey: item.touringRoute.normalizedKey,
            },
            `Could not add touring route ${item.touringRoute.name} for ${item.city}.`,
          );
          createdItems += 1;
        } catch (tourError) {
          const tourMessage = tourError instanceof Error ? tourError.message : '';
          if (/no active pricing row|touring route variant not found/i.test(tourMessage)) {
            skippedUnpricedTours += 1;
          } else {
            throw tourError;
          }
        }
        continue;
      }

      // Service entry (Meet & Assist on the airport days).
      if (!activityService || !item.service) {
        continue;
      }
      // Idempotent re-generate: this day already has this service.
      if (existingServiceKeys.has(`${day.id}|${item.service.id}`)) {
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

    window.dispatchEvent(new CustomEvent('dmc:quote-pricing-stale', { detail: { quoteId: quote.id } }));
    const applyMessage = buildItineraryApplyMessage(expectedDays.length, createdDayCount);
    const skipNotes = [
      skippedUnpricedTransfers > 0
        ? `${skippedUnpricedTransfers} transfer${skippedUnpricedTransfers === 1 ? '' : 's'} with no vehicle rate yet`
        : null,
      skippedUnpricedTours > 0
        ? `${skippedUnpricedTours} touring route${skippedUnpricedTours === 1 ? '' : 's'} with no active pricing`
        : null,
    ].filter(Boolean);
    setMessage(
      skipNotes.length > 0
        ? `${applyMessage} Skipped ${skipNotes.join(' and ')} — add pricing in the relevant admin, then add them to the day cards.`
        : applyMessage,
    );
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
        airportTransferServiceType,
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
        usePackageTransport,
        deadSeaOvernight,
        dailyPackageServiceType,
        stationaryServiceType,
        halfDayServiceType,
        disposalRoute: dailyDisposalRoute,
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

      <label className="quote-auto-itinerary-check" title={dailyPackageAvailable ? undefined : 'No DAILY_FULL_DAY rate or disposal route found in the catalog.'}>
        <input
          checked={usePackageTransport}
          disabled={!dailyPackageAvailable}
          onChange={(event) => setUsePackageTransport(event.target.checked)}
          type="checkbox"
        />
        <span>Use daily-package transport (drive days + Amman = full day; Petra / Wadi Rum / Aqaba stay days = stationary; driver overnights auto-added)</span>
      </label>
      {usePackageTransport && dailyPackageAvailable ? (
        <label className="quote-auto-itinerary-check" style={{ marginLeft: 24 }}>
          <input checked={deadSeaOvernight} onChange={(event) => setDeadSeaOvernight(event.target.checked)} type="checkbox" />
          <span>Add Dead Sea vehicle + driver overnight (off by default — Dead Sea stay days are free days with no transport)</span>
        </label>
      ) : null}

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
                {/* When no route matches, name the missing city pair and
                    link straight to the Transfer Routes admin so the
                    operator can add it without leaving context. Previously
                    this said the generic "Needs matching active route"
                    which left the operator wondering why or what to do. */}
                {item.route ? (
                  <em>{formatRouteLabel(item.route)}</em>
                ) : item.fromCity && item.toCity ? (
                  <em>
                    No route from {item.fromCity} to {item.toCity} —{' '}
                    <Link href="/routes" style={{ color: '#175cd3', textDecoration: 'underline' }}>
                      add it in Transfer Routes
                    </Link>
                  </em>
                ) : (
                  <em>Needs city assignment before a route can be matched</em>
                )}
                {item.selectedCandidate ? (
                  <em>
                    {formatTransportVehicleDisplay(item.selectedCandidate.vehicle)} | {item.selectedCandidate.currency} {item.selectedCandidate.price}
                  </em>
                ) : null}
                {/* Route Standards (Phase 2A): when a canonical standard is
                    available for the matched route, render its distance/
                    duration/confidence as the authoritative operational
                    profile. Falls back silently when no standard exists. */}
                {(() => {
                  const standard = (item as { routeStandard?: RouteStandardSummary | null }).routeStandard;
                  if (!standard) return null;
                  const confidence: TimingConfidencePresentation = presentRouteTimingConfidence(standard);
                  const distance = standard.standardDistanceKm !== null ? `${standard.standardDistanceKm} km` : null;
                  const duration = standard.standardDurationHours !== null ? `${standard.standardDurationHours} h` : null;
                  const buffer = standard.operationalBufferMinutes !== null ? `+${standard.operationalBufferMinutes} min buffer` : null;
                  const bits = [distance, duration, buffer].filter(Boolean);
                  return (
                    <em style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center' }}>
                      <span
                        style={{
                          background: confidence.bg,
                          color: confidence.text,
                          padding: '0.1rem 0.5rem',
                          borderRadius: 999,
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          letterSpacing: '0.02em',
                        }}
                        title={confidence.detail}
                      >
                        {confidence.label}
                      </span>
                      {bits.length > 0 ? <span style={{ color: '#475467' }}>{bits.join(' · ')}</span> : null}
                      {standard.notes ? <span style={{ color: '#6b7a6b' }}>· {standard.notes}</span> : null}
                    </em>
                  );
                })()}
                <em>{item.optimizationReason}</em>
              </div>
            ))}
            {preview.hotels.map((item) => {
              const ready = item.hotel && item.contract && item.rate;
              // Build an actionable cue based on what's actually missing.
              // Generic "Needs hotel contract and rate" used to fire for
              // three distinct causes — now the operator sees which.
              let cue: React.ReactNode;
              if (ready) {
                cue = `${item.hotel!.name} | ${item.contract!.name} | ${item.rate!.occupancyType}/${item.rate!.mealPlan}`;
              } else if ((item as { missingReason?: string }).missingReason === 'no-hotel-in-city') {
                cue = (
                  <>
                    No {item.city} hotel in catalog —{' '}
                    <Link href="/hotels" style={{ color: '#175cd3', textDecoration: 'underline' }}>
                      add one in Hotels admin
                    </Link>
                  </>
                );
              } else if ((item as { missingReason?: string }).missingReason === 'no-valid-contract') {
                cue = (
                  <>
                    {item.hotel?.name || item.city} has no contract covering this travel date —{' '}
                    <Link href="/hotel-contracts" style={{ color: '#175cd3', textDecoration: 'underline' }}>
                      add a contract
                    </Link>
                  </>
                );
              } else if ((item as { missingReason?: string }).missingReason === 'no-rate') {
                cue = (
                  <>
                    {item.hotel?.name || item.city} contract has no rates —{' '}
                    <Link href="/hotel-rates" style={{ color: '#175cd3', textDecoration: 'underline' }}>
                      add rates
                    </Link>
                  </>
                );
              } else {
                cue = 'Needs hotel contract and rate';
              }
              return (
                <div key={`hotel-${item.dayNumber}-${item.city}`}>
                  <span>Hotel</span>
                  <strong>
                    Night {item.dayNumber}: {item.city}
                  </strong>
                  <em>{cue}</em>
                </div>
              );
            })}
            {preview.activities.map((item, activityIndex) => {
              const touringRoute = (item as { touringRoute?: { id: string; name: string } | null }).touringRoute;
              const label = touringRoute ? `Touring route · ${touringRoute.name}` : item.service?.name || 'Needs activity service';
              const tagText = touringRoute ? 'Touring Route' : 'Activity';
              const keySuffix = touringRoute ? touringRoute.id : item.service?.id || 'placeholder';
              return (
                <div key={`activity-${item.dayNumber}-${item.city}-${keySuffix}-${activityIndex}`}>
                  <span>{tagText}</span>
                  <strong>
                    Day {item.dayNumber}: {item.city}
                  </strong>
                  <em>{label}</em>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}
