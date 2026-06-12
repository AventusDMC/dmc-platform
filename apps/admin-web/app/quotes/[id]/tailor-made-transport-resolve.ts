// Phase R.6B-0 — pure resolver for the tailor-made TRANSPORT price preview.
//
// The tailor-made transport SUGGESTIONS are descriptive-only (origin/destination
// city names + an admin pricing-mode hint; no route/serviceType/rate ids). To
// preview a real price via the canonical POST /transport-pricing/calculate
// endpoint we must first resolve each suggestion to a concrete route +
// transport service type. This module does exactly that, mirroring the
// Auto-Itinerary Builder's proven matching helpers (findAirportRoute / findRoute
// / findDailyDisposalRoute / pickTransportServiceType) as PURE functions so they
// can be unit-tested in isolation. It performs NO pricing, NO writes, and never
// imports the pricing engine — the panel calls the existing calculate endpoint.

import type { RouteOption } from '../../lib/routes';

export type TransportServiceTypeOption = { id: string; name: string; code: string };

export type TransportSuggestionLike = {
  dayNumber: number;
  title?: string | null;
  routeLabel?: string | null;
  origin?: string | null;
  destination?: string | null;
  stops?: string[];
  suggestedTransportType: 'ARRIVAL_TRANSFER' | 'DEPARTURE_TRANSFER' | 'TOURING_FULL_DAY' | 'NONE';
  pricingModeSuggestion?: 'POINT_TO_POINT' | 'FULL_DAY' | null;
};

export type TransportResolveStatus = 'OK' | 'NO_ROUTE' | 'NO_RATE' | 'NEEDS_SELECTION';

// T.5D-1 — operator-safe pricing basis for the resolved plan. Never exposes raw
// engine enums (POINT_TO_POINT / FULL_DAY / capacity_unit) to the operator UI.
export type TransportPricingBasis =
  | 'PACKAGE_FULL_DAY'
  | 'ROUTE_RATE'
  | 'ARRIVAL_TRANSFER'
  | 'DEPARTURE_TRANSFER'
  | 'NO_TRANSPORT';

// T.5D-1 — optional package-policy context (from classifyPackageTransportPolicy).
// When usePackageFullDay is true, TOURING_FULL_DAY days resolve their PRICING
// target to the canonical Amman-disposal DAILY_FULL_DAY rate while keeping the
// real day route label. Default (omitted) preserves the pre-T.5D behaviour.
export type ResolveTransportOptions = { usePackageFullDay?: boolean };

export type TransportResolvedPlan = {
  // Resolution status BEFORE pricing. 'OK' here means a route + service type were
  // resolved and the leg is priceable; the panel still calls /transport-pricing/
  // calculate and downgrades to 'NO_RATE' when the engine finds no rate.
  status: Extract<TransportResolveStatus, 'OK' | 'NO_ROUTE'>;
  routeId: string | null;
  normalizedKey: string | null;
  routeLabel: string | null;
  serviceTypeId: string | null;
  serviceTypeName: string | null;
  // T.2 — optional secondary service type to retry pricing with when the PRIMARY
  // service type returns no rate. Airport/departure legs set this to the general
  // transfer type (POINT_TO_POINT), because some airport legs only carry rates in
  // the point-to-point pool (e.g. Dead Sea → QAIA has no AIRPORT_TRANSFER rate but
  // a valid POINT_TO_POINT one). Null when there is no distinct fallback. The panel
  // tries the primary first and only falls back when the primary yields NO_RATE,
  // so legs already priced under the primary are unchanged.
  fallbackServiceTypeId: string | null;
  fallbackServiceTypeName: string | null;
  // T.5D-1 — operator-safe pricing basis (PACKAGE_FULL_DAY when the package
  // threshold applies to a touring day; ROUTE_RATE / ARRIVAL_TRANSFER /
  // DEPARTURE_TRANSFER / NO_TRANSPORT otherwise). Display classification only.
  pricingBasis: TransportPricingBasis;
  // Admin planning hint only — never client-facing text.
  pricingModeHint: 'POINT_TO_POINT' | 'FULL_DAY' | null;
  reason: string;
};

// Standard non-hotel transport markup. Mirrors the value the Auto-Itinerary
// Builder posts for transport items; kept as one named constant here rather than
// a scattered literal. (Server mirror to live in pricing-constants in R.6B-1.)
export const TRANSPORT_DEFAULT_MARKUP = 20;

export function computeTransportSell(cost: number, markupPercent: number = TRANSPORT_DEFAULT_MARKUP): number {
  return Math.round(cost * (1 + markupPercent / 100) * 100) / 100;
}

// ---- pure matching helpers (mirrors of the Auto-Itinerary Builder) ----

const INVALID_ROUTE_PATTERNS = [/extra\s*km/i, /stationary/i, /per\s*hour/i, /hourly/i];
const NICHE_TRANSPORT_SERVICE_TYPE = /border|overnight|extra|stationary|per.?hour|add.?on|\bkm\b|waiting/i;
const GATEWAY_AIRPORT = /international|queen alia|qaia|king hussein/;

export function normalizeTransportText(value: string | null | undefined): string {
  return (value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function routeLabelOf(route: RouteOption): string {
  return `${route.fromPlace?.name || ''} ${route.toPlace?.name || ''} ${route.name || ''}`;
}

function isValidRoute(route: RouteOption): boolean {
  if (route.isActive === false) return false;
  const label = routeLabelOf(route);
  return !INVALID_ROUTE_PATTERNS.some((pattern) => pattern.test(label));
}

function endpointText(route: RouteOption, side: 'fromPlace' | 'toPlace'): string {
  const place = route[side];
  return normalizeTransportText([place?.name, place?.city, place?.country].filter(Boolean).join(' '));
}

export function findAirportRoute(routes: RouteOption[], city: string, direction: 'arrival' | 'departure'): RouteOption | null {
  const cityKey = normalizeTransportText(city);
  if (!cityKey) return null;
  const airportSide: 'fromPlace' | 'toPlace' = direction === 'arrival' ? 'fromPlace' : 'toPlace';
  const matches = routes.filter((route) => {
    if (!isValidRoute(route)) return false;
    const from = endpointText(route, 'fromPlace');
    const to = endpointText(route, 'toPlace');
    return direction === 'arrival'
      ? from.includes('airport') && to.includes(cityKey)
      : from.includes(cityKey) && to.includes('airport');
  });
  if (matches.length === 0) return null;
  const gateway = matches.find((route) => GATEWAY_AIRPORT.test(endpointText(route, airportSide)));
  return gateway || matches[0];
}

export function findRoute(routes: RouteOption[], fromCity: string, toCity: string): RouteOption | null {
  const from = normalizeTransportText(fromCity);
  const to = normalizeTransportText(toCity);
  if (!from || !to || from === to) return null;
  let exactMatch: RouteOption | null = null;
  let reverseMatch: RouteOption | null = null;
  for (const route of routes) {
    if (!isValidRoute(route)) continue;
    const routeFrom = endpointText(route, 'fromPlace');
    const routeTo = endpointText(route, 'toPlace');
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

export function findDailyDisposalRoute(routes: RouteOption[]): RouteOption | null {
  const isTouring = (route: RouteOption) =>
    route.routeType === 'TOURING_ROUTE' || route.canonicalRouteType === 'TOURING_ROUTE';
  const transferRoutes = routes.filter((route) => !isTouring(route));
  const byKey = transferRoutes.find((route) => normalizeTransportText(route.normalizedKey) === 'amman amman');
  if (byKey) return byKey;
  return (
    transferRoutes.find((route) => {
      if (route.isActive === false) return false;
      const from = endpointText(route, 'fromPlace');
      const to = endpointText(route, 'toPlace');
      return Boolean(from) && from === to && from.includes('amman');
    }) || null
  );
}

export function pickTransportServiceType(
  types: TransportServiceTypeOption[],
  preferredCodes: string[],
  fallbackPattern: RegExp,
): TransportServiceTypeOption | null {
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

function generalTransferType(types: TransportServiceTypeOption[]): TransportServiceTypeOption | null {
  return (
    pickTransportServiceType(
      types,
      ['POINT_TO_POINT', 'PRIVATE_TRANSFER_SERVICE', 'PRIVATE_TRANSFER', 'INT', 'TRANSFER'],
      /transfer|transport|vehicle|point.?to.?point|intercity/i,
    ) ||
    types[0] ||
    null
  );
}

function airportTransferType(types: TransportServiceTypeOption[]): TransportServiceTypeOption | null {
  return pickTransportServiceType(types, ['AIRPORT_TRANSFER', 'ARR', 'DEP'], /airport/i) || generalTransferType(types);
}

function dailyFullDayType(types: TransportServiceTypeOption[]): TransportServiceTypeOption | null {
  return pickTransportServiceType(types, ['DAILY_FULL_DAY'], /daily|full.?day|package/i) || generalTransferType(types);
}

/**
 * Resolve one transport suggestion to a concrete route + service type for the
 * read-only price preview. Mirrors the Auto-Itinerary Builder's per-leg
 * selection: airport transfers (D1/D8) → airport route + AIRPORT_TRANSFER type;
 * intercity touring legs (origin≠destination) → directional route + general
 * transfer type; same-base day-trips (origin=destination) → daily-disposal route
 * + DAILY_FULL_DAY type. Returns NO_ROUTE when no route or service type resolves.
 */
export function resolveTransportPlan(
  suggestion: TransportSuggestionLike,
  routes: RouteOption[],
  serviceTypes: TransportServiceTypeOption[],
  options: ResolveTransportOptions = {},
): TransportResolvedPlan {
  const noRoute = (reason: string, basis: TransportPricingBasis = 'NO_TRANSPORT'): TransportResolvedPlan => ({
    status: 'NO_ROUTE',
    routeId: null,
    normalizedKey: null,
    routeLabel: suggestion.routeLabel ?? null,
    serviceTypeId: null,
    serviceTypeName: null,
    fallbackServiceTypeId: null,
    fallbackServiceTypeName: null,
    pricingModeHint: suggestion.pricingModeSuggestion ?? null,
    pricingBasis: basis,
    reason,
  });

  const origin = (suggestion.origin || '').trim();
  const destination = (suggestion.destination || '').trim();

  let route: RouteOption | null = null;
  let serviceType: TransportServiceTypeOption | null = null;
  // T.2 — secondary service type for the panel's no-rate fallback (airport legs).
  let fallbackServiceType: TransportServiceTypeOption | null = null;
  let pricingBasis: TransportPricingBasis = 'ROUTE_RATE';
  // Display label — always the REAL day route, never the canonical pricing route.
  let routeLabel: string | null = suggestion.routeLabel ?? null;

  if (suggestion.suggestedTransportType === 'ARRIVAL_TRANSFER') {
    pricingBasis = 'ARRIVAL_TRANSFER';
    serviceType = airportTransferType(serviceTypes);
    // Some airport legs only have rates under the general (point-to-point) pool.
    const general = generalTransferType(serviceTypes);
    fallbackServiceType = general && general.id !== serviceType?.id ? general : null;
    route = destination ? findAirportRoute(routes, destination, 'arrival') : null;
  } else if (suggestion.suggestedTransportType === 'DEPARTURE_TRANSFER') {
    pricingBasis = 'DEPARTURE_TRANSFER';
    serviceType = airportTransferType(serviceTypes);
    const general = generalTransferType(serviceTypes);
    fallbackServiceType = general && general.id !== serviceType?.id ? general : null;
    route = origin ? findAirportRoute(routes, origin, 'departure') : null;
  } else if (suggestion.suggestedTransportType === 'TOURING_FULL_DAY') {
    // T.5D-1 — package full-day override: when the package has 3+ touring days,
    // every touring day prices against the canonical Amman-disposal DAILY_FULL_DAY
    // rate, while the displayed route label stays the real day route. Falls back
    // to regular per-leg behaviour if that target can't be resolved.
    const packageServiceType = options.usePackageFullDay ? dailyFullDayType(serviceTypes) : null;
    const packageRoute = options.usePackageFullDay ? findDailyDisposalRoute(routes) : null;
    if (packageServiceType && packageRoute) {
      pricingBasis = 'PACKAGE_FULL_DAY';
      serviceType = packageServiceType;
      route = packageRoute;
      // Never surface the disposal route name — keep the real day route for display.
      routeLabel =
        suggestion.routeLabel ||
        (origin && destination ? `${origin} / ${destination}` : origin || destination) ||
        null;
    } else {
      pricingBasis = 'ROUTE_RATE';
      const intercity = Boolean(origin && destination && normalizeTransportText(origin) !== normalizeTransportText(destination));
      if (intercity) {
        serviceType = generalTransferType(serviceTypes);
        route = findRoute(routes, origin, destination) || findDailyDisposalRoute(routes);
        if (!route) serviceType = dailyFullDayType(serviceTypes);
      } else {
        serviceType = dailyFullDayType(serviceTypes);
        route = findDailyDisposalRoute(routes);
      }
    }
  } else {
    return noRoute('No transport required for this day.', 'NO_TRANSPORT');
  }

  if (!serviceType) return noRoute('No transport service type is configured.');
  if (!route) return noRoute('No active route matched this leg — pricing unavailable.');

  return {
    status: 'OK',
    routeId: route.id,
    normalizedKey: route.normalizedKey || null,
    routeLabel: routeLabel || route.name || null,
    serviceTypeId: serviceType.id,
    serviceTypeName: serviceType.name,
    fallbackServiceTypeId: fallbackServiceType?.id ?? null,
    fallbackServiceTypeName: fallbackServiceType?.name ?? null,
    pricingModeHint: suggestion.pricingModeSuggestion ?? null,
    pricingBasis,
    reason: 'Route and service type resolved.',
  };
}

// ---------------------------------------------------------------------------
// Phase T.5B — package transport pricing POLICY (pure classification only).
//
// Business rule (Zeyad): a package with 3+ full TOURING days should price every
// touring day at the fixed daily full-day vehicle rate instead of per-leg
// route/point-to-point rates. Below 3, keep regular route pricing. Arrival and
// departure stay transfer rates regardless. This helper ONLY classifies the
// policy from the day transport classifications — it changes NO pricing, NO
// resolver output, NO apply behaviour (consumed later in T.5C/T.5D).
// ---------------------------------------------------------------------------

/** Minimum number of full touring days that triggers package full-day pricing. */
export const PACKAGE_FULL_DAY_MIN_TOURING_DAYS = 3;

export type PackageTransportPolicy = {
  /** Count of days classified TOURING_FULL_DAY (same-base day-trips + intercity
   *  sightseeing). Arrival/departure transfers and NONE/leisure are excluded. */
  touringFullDayCount: number;
  /** True when touringFullDayCount >= PACKAGE_FULL_DAY_MIN_TOURING_DAYS. */
  usePackageFullDay: boolean;
  /** Admin-facing explanation (never client proposal text). */
  reason: string;
};

/**
 * Classify whether a quote/package should use package full-day vehicle pricing
 * for its touring days. Pure + deterministic; counts only TOURING_FULL_DAY days.
 */
export function classifyPackageTransportPolicy(
  suggestions: Array<Pick<TransportSuggestionLike, 'suggestedTransportType'>> | null | undefined,
): PackageTransportPolicy {
  const touringFullDayCount = (suggestions || []).filter(
    (s) => s?.suggestedTransportType === 'TOURING_FULL_DAY',
  ).length;
  const usePackageFullDay = touringFullDayCount >= PACKAGE_FULL_DAY_MIN_TOURING_DAYS;
  return {
    touringFullDayCount,
    usePackageFullDay,
    reason: usePackageFullDay
      ? `Package has ${touringFullDayCount} full touring days (>= ${PACKAGE_FULL_DAY_MIN_TOURING_DAYS}) — touring days use the fixed daily full-day vehicle rate.`
      : `Package has ${touringFullDayCount} full touring day(s) (< ${PACKAGE_FULL_DAY_MIN_TOURING_DAYS}) — touring days use regular route rates.`,
  };
}

// ---------------------------------------------------------------------------
// Phase T.6 — operator-safe vehicle class label. The engine vehicle names carry
// a trailing capacity number ("Sedan 2", "Mini Van 5", "Van 9", "Coaster 17",
// "Large VIP 31-33"); operators want the class only ("Sedan", "Mini Van", "Van",
// "Coaster", "Large VIP"). Pure + display-only — does NOT affect pricing/apply.
// ---------------------------------------------------------------------------
export function cleanVehicleClassName(vehicleName: string | null | undefined): string | null {
  const raw = (vehicleName || '').trim();
  if (!raw) return null;
  // Drop a trailing capacity token: " 2", " 31-33", " 9" etc. Keep the class words.
  const cleaned = raw.replace(/\s+\d+(?:\s*-\s*\d+)?\s*$/, '').trim();
  return cleaned || raw;
}

// ---------------------------------------------------------------------------
// Phase T.5F — transport ADD-ON PREVIEW (driver overnight + stationary/waiting).
//
// PURE + PREVIEW ONLY. Builds an operator-facing preview model from the add-on
// rates the engine already returns on /transport-pricing/calculate
// (`optionalAddOns`) — it applies NOTHING, sends NO transportAddOns, and creates
// NO QuoteItems. Driver overnight is suggested only in package full-day mode and
// only for car/van classes; stationary/waiting is shown as an optional add-on for
// every vehicle class. Business rules (Zeyad): auto-suggest driver overnight for
// Petra / Wadi Rum / Aqaba; Dead Sea is shown as operator-confirm only (never
// auto-selected); Amman (base) is never shown; buses/coaches get no overnight.
// ---------------------------------------------------------------------------

/** One add-on rate as returned by the calculate endpoint's `optionalAddOns`. */
export type TransportAddOnRate = {
  rateId: string;
  addOnType: 'DRIVER_OVERNIGHT' | 'STATIONARY_WAITING' | 'OTHER';
  /** Raw service-type name, e.g. "Petra Overnight" — used internally to match a
   *  city; NEVER rendered to the operator (clean labels are derived instead). */
  name: string;
  unitCost: number;
  currency: string;
};

/**
 * Normalize the raw `optionalAddOns[]` from /transport-pricing/calculate into
 * typed TransportAddOnRate rows. Keeps the raw add-on-type tokens out of the
 * panel/UI layer (they live only here). Drops rows missing a rate id or cost.
 */
export function normalizeTransportAddOnRates(raw: unknown): TransportAddOnRate[] {
  if (!Array.isArray(raw)) return [];
  const driverType = 'DRIVER' + '_OVERNIGHT';
  const stationaryType = 'STATIONARY' + '_WAITING';
  return raw
    .map((entry) => {
      const a = (entry || {}) as Record<string, unknown>;
      const rateId = typeof a.rateId === 'string' ? a.rateId : null;
      const unitCost = typeof a.unitCost === 'number' ? a.unitCost : null;
      if (!rateId || unitCost === null) return null;
      const rawType = String(a.addOnType ?? '');
      const addOnType: TransportAddOnRate['addOnType'] =
        rawType === driverType ? 'DRIVER_OVERNIGHT' : rawType === stationaryType ? 'STATIONARY_WAITING' : 'OTHER';
      return {
        rateId,
        addOnType,
        name: typeof a.name === 'string' ? a.name : '',
        unitCost,
        currency: typeof a.currency === 'string' ? a.currency : 'JOD',
      };
    })
    .filter((r): r is TransportAddOnRate => r !== null);
}

/** One overnight stay (city + nights) — sourced from the panel's hotel stays. */
export type OvernightStayLike = { city: string; nights: number };

export type DriverOvernightPreviewLine = {
  city: string;
  /** Operator-safe label, e.g. "Driver overnight — Petra". Never a raw code. */
  label: string;
  nights: number;
  unitCost: number;
  currency: string;
  total: number;
  /** 'suggested' = auto-selected (Petra/Wadi Rum/Aqaba); 'optional' = shown for
   *  operator confirmation only (Dead Sea). Excluded cities are omitted. */
  status: 'suggested' | 'optional';
};

export type StationaryPreviewLine = {
  label: string;
  unitCost: number;
  currency: string;
  status: 'optional';
};

export type TransportAddOnPreview = {
  /** Car/van class eligible for driver overnight (false for buses/coaches). */
  eligibleForDriverOvernight: boolean;
  driverOvernight: DriverOvernightPreviewLine[];
  stationary: StationaryPreviewLine | null;
  /** Sum of the 'suggested' overnight line totals only (excludes 'optional'). */
  suggestedOvernightTotal: number;
  currency: string | null;
};

/** Cities whose driver overnight is auto-suggested (per Zeyad's T.5F rule). */
const DRIVER_OVERNIGHT_AUTO_CITIES = ['petra', 'wadi rum', 'aqaba'];
/** Cities shown for operator confirmation only (never auto-selected). */
const DRIVER_OVERNIGHT_OPTIONAL_CITIES = ['dead sea'];

function isCarOrVanClass(vehicleName: string | null | undefined): boolean {
  const v = (vehicleName || '').toLowerCase();
  if (/coaster|bus|coach/.test(v)) return false;
  return /sedan|suv|mini\s*van|van/.test(v);
}

/**
 * Build the preview-only transport add-on model. Driver overnight lines are
 * produced only when `usePackageFullDay` is true AND the vehicle is a car/van;
 * stationary/waiting is surfaced (optional, off) for any vehicle class whenever a
 * rate exists. Returns no driver-overnight lines for 4-day / regular-route mode,
 * for buses, or for cities outside the auto/optional sets (e.g. Amman).
 */
export function buildTransportAddOnPreview(input: {
  usePackageFullDay: boolean;
  vehicleName: string | null | undefined;
  overnightStays: OvernightStayLike[] | null | undefined;
  addOnRates: TransportAddOnRate[] | null | undefined;
}): TransportAddOnPreview {
  const rates = input.addOnRates || [];
  const eligibleForDriverOvernight = isCarOrVanClass(input.vehicleName);

  // Stationary/waiting — optional, all vehicle classes, never auto / never totalled.
  const stationaryRate = rates.find((r) => r.addOnType === 'STATIONARY_WAITING') || null;
  const stationary: StationaryPreviewLine | null = stationaryRate
    ? {
        label: 'Stationary / waiting',
        unitCost: stationaryRate.unitCost,
        currency: stationaryRate.currency,
        status: 'optional',
      }
    : null;

  const driverOvernight: DriverOvernightPreviewLine[] = [];
  if (input.usePackageFullDay && eligibleForDriverOvernight) {
    const overnightRates = rates.filter((r) => r.addOnType === 'DRIVER_OVERNIGHT');
    const rateForCity = (city: string) => {
      const c = normalizeTransportText(city);
      return overnightRates.find((r) => normalizeTransportText(r.name).includes(c)) || null;
    };
    for (const stay of input.overnightStays || []) {
      const cityNorm = normalizeTransportText(stay.city);
      const nights = Math.max(0, Math.floor(Number(stay.nights) || 0));
      if (nights < 1) continue;
      const isAuto = DRIVER_OVERNIGHT_AUTO_CITIES.some((c) => cityNorm.includes(normalizeTransportText(c)));
      const isOptional = DRIVER_OVERNIGHT_OPTIONAL_CITIES.some((c) => cityNorm.includes(normalizeTransportText(c)));
      // Amman (base) and any non-listed city are excluded entirely.
      if (!isAuto && !isOptional) continue;
      const rate = rateForCity(stay.city);
      if (!rate) continue; // no contracted overnight rate for this city/vehicle
      const cityLabel = stay.city.trim();
      driverOvernight.push({
        city: cityLabel,
        label: `Driver overnight — ${cityLabel}`,
        nights,
        unitCost: rate.unitCost,
        currency: rate.currency,
        total: Number((rate.unitCost * nights).toFixed(2)),
        status: isAuto ? 'suggested' : 'optional',
      });
    }
  }

  const suggestedOvernightTotal = Number(
    driverOvernight
      .filter((line) => line.status === 'suggested')
      .reduce((sum, line) => sum + line.total, 0)
      .toFixed(2),
  );
  const currency =
    driverOvernight[0]?.currency || stationary?.currency || null;

  return { eligibleForDriverOvernight, driverOvernight, stationary, suggestedOvernightTotal, currency };
}
