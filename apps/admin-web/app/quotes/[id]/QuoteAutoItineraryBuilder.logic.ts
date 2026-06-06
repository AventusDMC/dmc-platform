export type AutoItineraryExistingDay = {
  id: string;
  dayNumber: number;
  title?: string | null;
  description?: string | null;
  notes?: string | null;
};

export type GeneratedItineraryDay = {
  dayNumber: number;
  title: string;
  date: string | null;
};

export type GeneratedItineraryDayWithCity = GeneratedItineraryDay & {
  city: string;
};

function formatDateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function addDays(dateText: string | null | undefined, offset: number) {
  if (!dateText) {
    return null;
  }

  const date = new Date(`${dateText}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  date.setUTCDate(date.getUTCDate() + offset);
  return formatDateOnly(date);
}

export function getAutoItineraryDayTitle(dayNumber: number, totalDays: number) {
  if (dayNumber <= 1) {
    return 'Arrival';
  }

  if (dayNumber >= totalDays) {
    return 'Departure';
  }

  return `Day ${dayNumber}`;
}

export function getAutoItineraryDayCount(nights: number | null | undefined) {
  return Math.max(0, Math.floor(Number(nights) || 0)) + 1;
}

export function generateItineraryDays(startDate: string | null | undefined, nights: number) {
  const totalDays = getAutoItineraryDayCount(nights);

  return Array.from({ length: totalDays }, (_, index): GeneratedItineraryDay => {
    const dayNumber = index + 1;

    return {
      dayNumber,
      title: getAutoItineraryDayTitle(dayNumber, totalDays),
      date: addDays(startDate, index),
    };
  });
}

export type NightStop = {
  name: string;
  nights: number;
};

/**
 * Expand a per-city night stop list into a per-day city array. Each city is
 * repeated as many times as its night count, with one extra trailing entry
 * to cover the Departure day (which is spent in the last city's location
 * before the flight out). Used by the Guided Builder handoff so a journey
 * configured as "Amman:3, Petra:2, Wadi Rum:1, Dead Sea:1" produces day
 * cards labelled "Amman, Amman, Amman, Petra, Petra, Wadi Rum, Dead Sea,
 * Dead Sea (Departure)" rather than the naive index-clamp default.
 */
/**
 * Inverse of expandNightStopsToDayCities — given the saved day titles
 * (which PR #74 standardised on "Arrival · Amman" / "Petra" / "Departure
 * · Dead Sea") reconstruct the per-city night distribution so the Auto
 * Builder can re-use it on subsequent generations after the operator
 * has navigated away and lost the URL params. Returns null when the
 * titles aren't recognisable (e.g., a quote built before the city-led
 * titles landed) so the caller can fall back to other sources.
 */
export function reconstructNightStopsFromDayTitles(
  days: Array<{ dayNumber: number; title: string | null }>,
): NightStop[] | null {
  if (!days || days.length === 0) return null;
  const sorted = [...days].sort((a, b) => a.dayNumber - b.dayNumber);
  const cities: string[] = [];
  for (const day of sorted) {
    const title = (day.title || '').trim();
    if (!title) {
      cities.push('');
      continue;
    }
    // Patterns we saved post-PR #74:
    //   "Arrival · Amman" / "Departure · Dead Sea" — bookend markers
    //   "Petra" / "Wadi Rum" — mid-trip city-only
    //   "Day N" — legacy stale title (operator skipped the wizard)
    const bookendMatch = title.match(/^(?:Arrival|Departure)\s*·\s*(.+)$/i);
    if (bookendMatch) {
      cities.push(bookendMatch[1].trim());
      continue;
    }
    const dayPrefixMatch = title.match(/^Day\s+\d+\s*·\s*(.+)$/i);
    if (dayPrefixMatch) {
      cities.push(dayPrefixMatch[1].trim());
      continue;
    }
    // Bare "Day N" — pre-city-led titles, can't infer city.
    if (/^day\s+\d+$/i.test(title) || /^(arrival|departure)$/i.test(title)) {
      cities.push('');
      continue;
    }
    // Otherwise treat the whole title as a city name (mid-trip "Petra").
    cities.push(title);
  }
  // Drop the departure day (last entry) — Departure shares the last city
  // but should not contribute an extra night.
  const nightCities = cities.slice(0, -1);
  if (nightCities.every((city) => !city)) return null;

  const stops: NightStop[] = [];
  for (const city of nightCities) {
    if (!city) continue;
    const last = stops[stops.length - 1];
    if (last && last.name === city) {
      last.nights += 1;
    } else {
      stops.push({ name: city, nights: 1 });
    }
  }
  return stops.length > 0 ? stops : null;
}

export function expandNightStopsToDayCities(stops: NightStop[]): string[] {
  const dayCities: string[] = [];
  for (const stop of stops) {
    const name = (stop.name || '').trim();
    if (!name) continue;
    const nights = Math.max(0, Math.floor(Number(stop.nights) || 0));
    for (let i = 0; i < nights; i += 1) {
      dayCities.push(name);
    }
  }
  // Departure day shares the last city (you sleep there the last night and
  // depart from there the next day).
  if (dayCities.length > 0) {
    dayCities.push(dayCities[dayCities.length - 1]);
  }
  return dayCities;
}

function buildCityAwareTitle(rawTitle: string, city: string): string {
  if (!city || rawTitle.toLowerCase().includes(city.toLowerCase())) {
    return rawTitle;
  }
  const lower = rawTitle.toLowerCase();
  if (lower === 'arrival' || lower === 'departure') {
    return `${rawTitle} · ${city}`;
  }
  if (/^day\s+\d+$/i.test(rawTitle)) {
    return city;
  }
  return `${rawTitle} · ${city}`;
}

export function assignGeneratedItineraryCities(generatedDays: GeneratedItineraryDay[], cities: string[]): GeneratedItineraryDayWithCity[] {
  const providedCities = cities.map((city) => city.trim()).filter(Boolean);

  return generatedDays.map((day, index) => {
    const city = providedCities.length > 0 ? providedCities[Math.min(index, providedCities.length - 1)] : '';
    // When a city is known for this day, prefer a city-led title so the
    // itinerary reads as a journey:
    //   - mid-trip "Day N" → just the city ("Petra"), since formatDayHeading
    //     already prepends "Day 02 -" elsewhere (avoiding "Day 02 - Day 2 · Petra").
    //   - bookends "Arrival" / "Departure" → keep the marker but tack on the
    //     city so the operator sees "Arrival · Amman".
    // If the title already names the city, leave it alone (no "Petra · Petra").
    return { ...day, city, title: buildCityAwareTitle(day.title, city) };
  });
}

/**
 * Variant of assignGeneratedItineraryCities that respects per-city night
 * counts (instead of assigning one city per day-index). Used when the
 * Guided Builder hands off a "Amman:3, Petra:2, Wadi Rum:1, Dead Sea:1"
 * style structure — each city occupies its requested run of consecutive
 * days rather than getting collapsed into a single day.
 */
export function assignGeneratedItineraryCitiesByNights(
  generatedDays: GeneratedItineraryDay[],
  stops: NightStop[],
): GeneratedItineraryDayWithCity[] {
  const dayCities = expandNightStopsToDayCities(stops);
  if (dayCities.length === 0) {
    // No night data — fall back to title-only days with empty city.
    return generatedDays.map((day) => ({ ...day, city: '' }));
  }
  return generatedDays.map((day, index) => {
    const city = dayCities[Math.min(index, dayCities.length - 1)] || '';
    return { ...day, city, title: buildCityAwareTitle(day.title, city) };
  });
}

export function mergeExistingItineraryDays(...dayGroups: AutoItineraryExistingDay[][]) {
  const existingDays = new Map<number, AutoItineraryExistingDay>();

  for (const days of dayGroups) {
    for (const day of days) {
      if (!Number.isFinite(day.dayNumber) || day.dayNumber < 1 || existingDays.has(day.dayNumber)) {
        continue;
      }

      existingDays.set(day.dayNumber, day);
    }
  }

  return existingDays;
}

export function buildItineraryApplyMessage(totalDays: number, _addedDays: number) {
  return `${totalDays} itinerary day${totalDays === 1 ? '' : 's'} ready.`;
}

// ---------------------------------------------------------------------------
// Daily-package transport helpers
//
// In daily-package mode the supplier bills a flat rate per full day plus
// arrival/departure transfers, plus a *driver overnight* supplement whenever
// the driver sleeps out at certain stops. Standard overnight stops (auto):
// Petra, Wadi Rum, Aqaba. Optional (operator opt-in): Dead Sea. Amman /
// everywhere else: none (driver is home-based or close enough).
// ---------------------------------------------------------------------------

export type OvernightPolicy = 'standard' | 'optional' | 'none';

const OVERNIGHT_CITY_POLICY: Array<{ rx: RegExp; policy: Exclude<OvernightPolicy, 'none'> }> = [
  { rx: /petra/, policy: 'standard' },
  { rx: /wadi\s*rum/, policy: 'standard' },
  { rx: /aqaba/, policy: 'standard' },
  { rx: /dead\s*sea/, policy: 'optional' },
];

function normalizeCityName(city: string | null | undefined): string {
  return String(city || '').trim().toLowerCase();
}

/**
 * Classify a city's driver-overnight policy. When `includeOptional` is false
 * (the default), optional stops (Dead Sea) collapse to 'none' so no overnight
 * supplement is added unless the operator opts in.
 */
export function classifyOvernightCity(
  city: string | null | undefined,
  options: { includeOptional?: boolean } = {},
): OvernightPolicy {
  const norm = normalizeCityName(city);
  if (!norm) return 'none';
  for (const entry of OVERNIGHT_CITY_POLICY) {
    if (entry.rx.test(norm)) {
      if (entry.policy === 'optional' && !options.includeOptional) return 'none';
      return entry.policy;
    }
  }
  return 'none';
}

/** A "middle" day is any day that is neither arrival (1) nor departure (last). */
export function isMiddleDay(dayNumber: number, totalDays: number): boolean {
  return dayNumber > 1 && dayNumber < totalDays;
}

export type DailyDayType = 'full' | 'stationary' | 'skip';

/**
 * In daily-package mode, classify a middle day's vehicle engagement so it bills
 * at the right rate:
 *  - 'full'       — an inter-city DRIVE day (the vehicle is out touring all day),
 *                   OR a same-city stay in a touring base (Amman, where there is
 *                   usually a city/region tour). Billed at the flat full-day rate.
 *  - 'stationary' — a same-city STAY in an overnight base where the vehicle is on
 *                   local standby only (Petra / Wadi Rum / Aqaba — hotel ↔ site ↔
 *                   hotel). Billed at the cheaper stationary rate. The driver
 *                   overnight still applies (he sleeps there either way).
 *  - 'skip'       — a same-city STAY that is a FREE day with no vehicle service
 *                   (Dead Sea), unless the operator opts in (then 'stationary').
 *
 * A move (different previous vs current city) is always 'full': the vehicle
 * makes the inter-city journey regardless of the destination's stay policy.
 */
export function classifyDailyDayType(
  moved: boolean,
  currentCity: string | null | undefined,
  options: { includeDeadSea?: boolean } = {},
): DailyDayType {
  if (moved) return 'full';
  const policy = classifyOvernightCity(currentCity, { includeOptional: true });
  if (policy === 'standard') return 'stationary'; // Petra / Wadi Rum / Aqaba
  if (policy === 'optional') return options.includeDeadSea ? 'stationary' : 'skip'; // Dead Sea
  return 'full'; // Amman + anywhere else: assume a touring day
}

export type OvernightRun = { dayNumber: number; city: string; nights: number };

/**
 * Given the per-day city array (length = totalDays, the last entry being the
 * departure day which shares the final city but is NOT a slept night), group
 * consecutive nights spent at each overnight-eligible stop into runs. Each run
 * is anchored on the driver's first sleep day at that stop, with `nights` =
 * the number of consecutive nights — this drives the overnight add-on quantity
 * (one add-on line per run, quantity = nights).
 */
export function computeOvernightRuns(
  dayCities: string[],
  options: { includeOptional?: boolean } = {},
): OvernightRun[] {
  const nights = dayCities.slice(0, Math.max(0, dayCities.length - 1));
  const runs: OvernightRun[] = [];
  let current: OvernightRun | null = null;
  nights.forEach((rawCity, index) => {
    const isOvernight = classifyOvernightCity(rawCity, options) !== 'none';
    if (isOvernight) {
      if (current && normalizeCityName(current.city) === normalizeCityName(rawCity)) {
        current.nights += 1;
      } else {
        if (current) runs.push(current);
        current = { dayNumber: index + 1, city: rawCity, nights: 1 };
      }
    } else if (current) {
      runs.push(current);
      current = null;
    }
  });
  if (current) runs.push(current);
  return runs;
}

// ---------------------------------------------------------------------------
// Phase 3D.1A — POI-aware touring-route → quote generation (PURE helpers).
//
// No DB writes, no fetch, no DOM. Pure functions over a touring-route DETAIL
// payload (GET /touring-routes/:id, which now returns ordered stops with
// poiId + pointOfInterest{id,code,name,translations}). Used by the generator
// preview (Phase 3D.1B) and apply (Phase 3D.1C).
//
// Rules (conservative, per Phase 3D.0):
//   - Only stops linked to a POI (poiId + pointOfInterest) become assignments.
//     Base / operational / null-POI stops are SKIPPED — they never create a
//     QuoteItineraryDayPoi row.
//   - One-day route → all content POIs on day 1.
//   - Multi-day route → an automatic STARTING SUGGESTION, always operator-
//     adjustable; ambiguity is surfaced (never hidden) via `ambiguous` +
//     `ambiguityReasons`, and days with no usable POIs are flagged.
// ---------------------------------------------------------------------------

export type TouringRoutePoiTranslation = { locale: string; title?: string | null; shortDescription?: string | null };
export type TouringRouteStopPoi = { id: string; code: string; name: string; translations?: TouringRoutePoiTranslation[] | null };
export type TouringRouteStopForGen = {
  id?: string | null;
  order: number;
  city: string;
  location?: string | null;
  poiId?: string | null;
  pointOfInterest?: TouringRouteStopPoi | null;
};
export type TouringRouteForGen = {
  id: string;
  name?: string | null;
  startCity?: string | null;
  durationDays?: number | null;
  mainDestinations?: string[] | null;
  stops?: TouringRouteStopForGen[] | null;
};

function cleanStr(value: string | null | undefined): string {
  return String(value || '').trim();
}

function sameCity(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizeCityName(a);
  return na !== '' && na === normalizeCityName(b);
}

function clampDurationDays(value: number | null | undefined): number {
  const v = Math.floor(Number(value) || 0);
  return v >= 1 ? v : 1;
}

/**
 * Derive a base/overnight city per day (length = durationDays). Prefers the
 * route's explicit `mainDestinations` as the overnight sequence; otherwise
 * derives from the ordered stop cities (collapsing consecutive duplicates and
 * dropping a trailing round-trip return to the start); finally falls back to
 * `startCity`. Maps the sequence onto N days (pad with the last base when
 * shorter, take the leading bases when longer). Pure + deterministic.
 */
export function deriveTouringRouteBaseCities(route: TouringRouteForGen): string[] {
  const days = clampDurationDays(route.durationDays);
  const orderedStops = [...(route.stops || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  // Collapse consecutive duplicate cities and drop a trailing round-trip return
  // to the start (e.g. Amman → … → Amman → just the inner sequence + base).
  const collapse = (cities: Array<string | null | undefined>): string[] => {
    const out: string[] = [];
    for (const raw of cities) {
      const c = cleanStr(raw);
      if (!c) continue;
      if (out.length === 0 || !sameCity(out[out.length - 1], c)) out.push(c);
    }
    if (out.length > 1 && sameCity(out[0], out[out.length - 1])) out.pop();
    return out;
  };
  const fromMain = (route.mainDestinations || []).map(cleanStr).filter(Boolean);
  const fromContent = collapse(orderedStops.filter((s) => s.poiId && s.pointOfInterest).map((s) => s.city));
  const fromAllStops = collapse(orderedStops.map((s) => s.city));

  let seq = fromMain;
  // Phase 3D.1E refinement: for MULTI-DAY routes whose mainDestinations is
  // SHORTER than durationDays, prefer the ordered content-stop cities when they
  // form a longer (better-fitting) sequence — BEFORE padding the last
  // destination. Fixes e.g. Petra → Wadi Rum ON (mainDestinations=["Wadi Rum"],
  // durationDays 2) → [Petra, Wadi Rum] instead of [Wadi Rum, Wadi Rum].
  // One-day routes and routes whose mainDestinations already fill the days are
  // unchanged.
  if (days > 1 && seq.length < days && fromContent.length > seq.length) {
    seq = fromContent;
  }
  // Empty mainDestinations → derive from ALL stop cities (preserves prior
  // behavior, including the round-trip collapse).
  if (seq.length === 0) seq = fromAllStops;
  if (seq.length === 0) {
    const start = cleanStr(route.startCity);
    seq = start ? [start] : [];
  }
  if (seq.length === 0) return Array.from({ length: days }, () => '');
  if (seq.length === days) return seq;
  if (seq.length < days) {
    const last = seq[seq.length - 1];
    return [...seq, ...Array.from({ length: days - seq.length }, () => last)];
  }
  return seq.slice(0, days);
}

export type GeneratedDayPoi = { poiId: string; code: string; name: string; title: string; sourceStopId: string | null };
export type GeneratedRouteDay = { dayNumber: number; baseCity: string; pois: GeneratedDayPoi[]; hasUsablePois: boolean };
export type TouringRoutePartition = {
  days: GeneratedRouteDay[];
  totalPois: number;
  /** Base / operational / null-POI stops that were skipped (never assigned). */
  skippedStops: number;
  hasUsablePois: boolean;
  /** True when the multi-day partition is a suggestion the operator should review. */
  ambiguous: boolean;
  ambiguityReasons: string[];
};

function poiDisplayTitle(poi: TouringRouteStopPoi): string {
  const en = (poi.translations || []).find((t) => (t.locale || '').toLowerCase() === 'en');
  return cleanStr(en?.title) || cleanStr(poi.name);
}

function toGeneratedPoi(stop: TouringRouteStopForGen): GeneratedDayPoi {
  const poi = stop.pointOfInterest as TouringRouteStopPoi;
  return {
    poiId: String(stop.poiId),
    code: poi.code,
    name: poi.name,
    title: poiDisplayTitle(poi),
    sourceStopId: stop.id ?? null,
  };
}

/**
 * Partition a touring route's POI-linked stops into per-day suggestions for the
 * quote generator. Pure; no side effects. See module header for the rules.
 */
export function partitionTouringRoutePoisToDays(route: TouringRouteForGen): TouringRoutePartition {
  const N = clampDurationDays(route.durationDays);
  const bases = deriveTouringRouteBaseCities(route);
  const orderedStops = [...(route.stops || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const content = orderedStops.filter((s) => s.poiId && s.pointOfInterest);
  const skippedStops = orderedStops.length - content.length;

  if (content.length === 0) {
    return {
      days: Array.from({ length: N }, (_, i) => ({ dayNumber: i + 1, baseCity: bases[i] || '', pois: [], hasUsablePois: false })),
      totalPois: 0,
      skippedStops,
      hasUsablePois: false,
      ambiguous: false,
      ambiguityReasons: ['This route has no POI-linked stops — no POI assignments will be generated. Days fall back to manual notes.'],
    };
  }

  if (N <= 1) {
    return {
      days: [{ dayNumber: 1, baseCity: bases[0] || '', pois: content.map(toGeneratedPoi), hasUsablePois: true }],
      totalPois: content.length,
      skippedStops,
      hasUsablePois: true,
      ambiguous: false,
      ambiguityReasons: [],
    };
  }

  // Multi-day: assign each content stop to the day whose base city matches its
  // city; if none matches, fall back to a proportional position split (flagged).
  const buckets: GeneratedDayPoi[][] = Array.from({ length: N }, () => []);
  let usedPositionFallback = false;
  content.forEach((stop, i) => {
    let idx = bases.findIndex((b) => sameCity(b, stop.city));
    if (idx < 0) {
      idx = Math.min(N - 1, Math.floor((i * N) / content.length));
      usedPositionFallback = true;
    }
    buckets[idx].push(toGeneratedPoi(stop));
  });

  const days = buckets.map((pois, i) => ({ dayNumber: i + 1, baseCity: bases[i] || '', pois, hasUsablePois: pois.length > 0 }));
  const emptyDays = days.filter((d) => !d.hasUsablePois).length;
  const ambiguityReasons = ['Multi-day partition is an automatic suggestion — please review and adjust each day’s POIs before applying.'];
  if (usedPositionFallback) ambiguityReasons.push('Some POI stops did not match an overnight base city and were distributed by position.');
  if (emptyDays > 0) ambiguityReasons.push(`${emptyDays} generated day(s) have no POIs from this route — review or assign manually.`);

  return {
    days,
    totalPois: content.length,
    skippedStops,
    hasUsablePois: true,
    ambiguous: true,
    ambiguityReasons,
  };
}

// ---------------------------------------------------------------------------
// Phase 3D.1B — preview model + local-edit reducers (PURE; no fetch/DOM/writes).
// The Generate-from-Touring-Route panel renders `buildTouringRoutePreview(...)`
// and lets the operator move / reorder / drop POIs via the reducers below — all
// in local UI state. NOTHING here writes to the DB.
// ---------------------------------------------------------------------------

export type TouringRoutePricingRow = {
  id: string;
  currency?: string | null;
  baseCost?: number | null;
  pricingBasis?: string | null;
  minPax?: number | null;
  maxPax?: number | null;
  active?: boolean | null;
  vehicle?: { name?: string | null } | null;
  transportServiceType?: { name?: string | null } | null;
};

export type TouringRouteDetailForGen = TouringRouteForGen & {
  pricings?: TouringRoutePricingRow[] | null;
};

export type TouringRoutePreviewDay = {
  dayNumber: number;
  date: string | null;
  title: string;
  baseCity: string;
  pois: GeneratedDayPoi[];
  hasUsablePois: boolean;
};

export type TouringRouteTransportPreview = {
  routeId: string;
  routeName: string;
  pricingRowId: string | null;
  pricingLabel: string;
  currency: string;
  cost: number | null;
  dayCount: number;
} | null;

export type TouringRoutePreview = {
  routeId: string;
  routeName: string;
  days: TouringRoutePreviewDay[];
  transport: TouringRouteTransportPreview;
  totalPois: number;
  skippedStops: number;
  hasUsablePois: boolean;
  ambiguous: boolean;
  ambiguityReasons: string[];
};

export function formatTouringRoutePricingLabel(row: TouringRoutePricingRow): string {
  const vehicle = cleanStr(row.vehicle?.name) || 'Vehicle';
  const basis = cleanStr(row.pricingBasis);
  const currency = cleanStr(row.currency) || 'USD';
  const cost = typeof row.baseCost === 'number' ? row.baseCost.toFixed(2) : '—';
  return [vehicle, basis, `${currency} ${cost}`].filter(Boolean).join(' | ');
}

export function buildTouringRoutePreview(
  route: TouringRouteDetailForGen,
  opts: { pricingRowId?: string | null; startDate?: string | null } = {},
): TouringRoutePreview {
  const partition = partitionTouringRoutePoisToDays(route);
  const days: TouringRoutePreviewDay[] = partition.days.map((day) => ({
    dayNumber: day.dayNumber,
    date: addDays(opts.startDate, day.dayNumber - 1),
    title: day.baseCity || `Day ${day.dayNumber}`,
    baseCity: day.baseCity,
    pois: day.pois,
    hasUsablePois: day.hasUsablePois,
  }));

  const pricingRows = route.pricings || [];
  const selected =
    (opts.pricingRowId && pricingRows.find((r) => r.id === opts.pricingRowId)) ||
    pricingRows.find((r) => r.active !== false) ||
    pricingRows[0] ||
    null;

  const transport: TouringRouteTransportPreview = selected
    ? {
        routeId: route.id,
        routeName: cleanStr(route.name) || 'Touring route',
        pricingRowId: selected.id,
        pricingLabel: formatTouringRoutePricingLabel(selected),
        currency: cleanStr(selected.currency) || 'USD',
        cost: typeof selected.baseCost === 'number' ? selected.baseCost : null,
        dayCount: clampDurationDays(route.durationDays),
      }
    : null;

  return {
    routeId: route.id,
    routeName: cleanStr(route.name) || 'Touring route',
    days,
    transport,
    totalPois: partition.totalPois,
    skippedStops: partition.skippedStops,
    hasUsablePois: partition.hasUsablePois,
    ambiguous: partition.ambiguous,
    ambiguityReasons: partition.ambiguityReasons,
  };
}

function recomputePreviewTotals(preview: TouringRoutePreview, days: TouringRoutePreviewDay[]): TouringRoutePreview {
  const normalizedDays = days.map((d) => ({ ...d, hasUsablePois: d.pois.length > 0 }));
  const totalPois = normalizedDays.reduce((sum, d) => sum + d.pois.length, 0);
  return { ...preview, days: normalizedDays, totalPois, hasUsablePois: totalPois > 0 };
}

/** Move a POI from one day to the end of another day (local state only). */
export function movePreviewPoi(
  preview: TouringRoutePreview,
  fromDayNumber: number,
  poiIndex: number,
  toDayNumber: number,
): TouringRoutePreview {
  if (fromDayNumber === toDayNumber) return preview;
  const days = preview.days.map((d) => ({ ...d, pois: [...d.pois] }));
  const from = days.find((d) => d.dayNumber === fromDayNumber);
  const to = days.find((d) => d.dayNumber === toDayNumber);
  if (!from || !to || poiIndex < 0 || poiIndex >= from.pois.length) return preview;
  const [moved] = from.pois.splice(poiIndex, 1);
  to.pois.push(moved);
  return recomputePreviewTotals(preview, days);
}

/** Reorder a POI within a single day (local state only). */
export function reorderPreviewPoi(
  preview: TouringRoutePreview,
  dayNumber: number,
  fromIndex: number,
  toIndex: number,
): TouringRoutePreview {
  const days = preview.days.map((d) => ({ ...d, pois: [...d.pois] }));
  const day = days.find((d) => d.dayNumber === dayNumber);
  if (!day) return preview;
  const n = day.pois.length;
  if (fromIndex < 0 || fromIndex >= n || toIndex < 0 || toIndex >= n || fromIndex === toIndex) return preview;
  const [moved] = day.pois.splice(fromIndex, 1);
  day.pois.splice(toIndex, 0, moved);
  return recomputePreviewTotals(preview, days);
}

/** Drop/remove a POI from a day in the preview (local state only). */
export function removePreviewPoi(preview: TouringRoutePreview, dayNumber: number, poiIndex: number): TouringRoutePreview {
  const days = preview.days.map((d) => ({ ...d, pois: [...d.pois] }));
  const day = days.find((d) => d.dayNumber === dayNumber);
  if (!day || poiIndex < 0 || poiIndex >= day.pois.length) return preview;
  day.pois.splice(poiIndex, 1);
  return recomputePreviewTotals(preview, days);
}

// ---------------------------------------------------------------------------
// Phase 3D.1C — non-destructive APPLY plan (PURE). Turns an (operator-edited)
// preview into the exact create-only operations the panel will execute against
// the EXISTING endpoints. Safety: blocks when the quote already has itinerary
// days (no replace mode in 3D.1C); never describes a delete/overwrite. The
// composer remains the narrative source — generated days carry NO notes text.
// ---------------------------------------------------------------------------

export type ApplyPlanDay = {
  dayNumber: number;
  title: string;
  poiAssignments: { poiId: string; sourceTouringRouteStopId: string | null }[];
};

export type ApplyPlanTransport = {
  serviceId: string;
  touringRouteId: string;
  touringRoutePricingId: string;
  /** Currency of the selected TouringRoutePricing row (e.g. "JOD"). Sent in the
   *  POST /items payload so the backend knows the cost currency of overrideCost
   *  when it performs FX conversion to the quote currency (Phase 3D.1H). */
  currency: string;
  overrideCost: number;
  useOverride: true;
  dayCount: number;
  paxCount: number;
  attachToDayNumber: number;
} | null;

// Phase 3D.2C-A — a hotel item to create on apply, for an OPERATOR-CONFIRMED,
// valid overnight suggestion. Fields mirror the EXISTING Auto-Builder hotel-item
// payload (POST /quotes/:id/items) exactly, so the apply runner (3D.2C-B) reuses
// the unchanged createItem → HotelPricingResolver path. One item per confirmed
// night (consecutive-night grouping is deferred). 3D.2C-A only BUILDS this list;
// no POST happens here.
export type ApplyPlanHotel = {
  serviceId: string;
  /** = nightNumber; the check-in day the hotel item attaches to. */
  attachToDayNumber: number;
  nightCount: number;
  hotelId: string;
  contractId: string;
  roomCategoryId: string;
  occupancyType: string;
  seasonName: string;
  mealPlan: string;
  paxCount: number;
  roomCount: number;
  markupPercent: number;
  /** Display-only (messaging / idempotency key); not sent as a pricing input. */
  city: string;
};

export type TouringRouteApplyPlan = {
  canApply: boolean;
  blockedReason: string | null;
  warnings: string[];
  days: ApplyPlanDay[];
  transport: ApplyPlanTransport;
  hotels: ApplyPlanHotel[];
  totalPoiAssignments: number;
};

export function buildTouringRouteApplyPlan(
  preview: TouringRoutePreview,
  opts: {
    pax: number;
    transportServiceId?: string | null;
    existingDayCount?: number;
    existingItemCount?: number;
    existingPoiAssignmentCount?: number;
    // Phase 3D.2C-A — optional hotel apply inputs (pure; no writes here).
    // `hotelSuggestions` is the 3D.2B suggestion list; `confirmedNights` flags
    // which nightNumbers the operator explicitly confirmed (default: none).
    // A hotel item is emitted ONLY for a confirmed, valid, enabled suggestion.
    hotelSuggestions?: OvernightHotelSuggestion[];
    confirmedNights?: Record<number, boolean>;
    hotelServiceId?: string | null;
    roomCount?: number;
  },
): TouringRouteApplyPlan {
  const existingDayCount = opts.existingDayCount ?? 0;
  const existingItemCount = opts.existingItemCount ?? 0;
  const existingPoiAssignmentCount = opts.existingPoiAssignmentCount ?? 0;

  const days: ApplyPlanDay[] = preview.days.map((day) => ({
    dayNumber: day.dayNumber,
    title: day.title,
    poiAssignments: day.pois.map((poi) => ({ poiId: poi.poiId, sourceTouringRouteStopId: poi.sourceStopId ?? null })),
  }));
  const totalPoiAssignments = days.reduce((sum, d) => sum + d.poiAssignments.length, 0);

  // Non-destructive: apply only into a quote with no existing itinerary days.
  let blockedReason: string | null = null;
  if (existingDayCount > 0 || existingPoiAssignmentCount > 0) {
    blockedReason = `This quote already has ${existingDayCount} itinerary day(s). Apply is only available on a quote with no itinerary days — replace mode is a later phase.`;
  } else if (!preview.transport || !preview.transport.pricingRowId) {
    blockedReason = 'Select a pricing row before applying.';
  } else if (typeof preview.transport.cost !== 'number') {
    blockedReason = 'The selected pricing row has no base cost.';
  } else if (!opts.transportServiceId) {
    blockedReason = 'No transport service is configured to attach the package to.';
  } else if (!(opts.pax >= 1)) {
    blockedReason = 'Enter a valid number of guests (pax).';
  }

  const canApply = blockedReason === null;

  const warnings: string[] = [];
  if (existingItemCount > 0) {
    warnings.push(`This quote already has ${existingItemCount} service item(s); the transport package will be added alongside them (nothing existing is changed).`);
  }
  if (!preview.hasUsablePois) {
    warnings.push('This route has no POI-linked stops — days and the transport package will be created, but no POI assignments.');
  }
  if (preview.ambiguous) {
    warnings.push('Multi-day POI partition is an automatic suggestion — review the per-day POIs before applying.');
  }

  const transport: ApplyPlanTransport =
    canApply && preview.transport && typeof preview.transport.cost === 'number' && opts.transportServiceId
      ? {
          serviceId: opts.transportServiceId,
          touringRouteId: preview.routeId,
          touringRoutePricingId: preview.transport.pricingRowId as string,
          // Phase 3D.1H: pass the pricing row's currency explicitly so the backend
          // knows the cost currency of overrideCost and can convert to quote currency.
          currency: preview.transport.currency,
          overrideCost: preview.transport.cost,
          useOverride: true,
          dayCount: preview.transport.dayCount,
          paxCount: opts.pax,
          attachToDayNumber: 1,
        }
      : null;

  // Phase 3D.2C-A — confirmed-hotel apply items (one per confirmed night;
  // consecutive-night grouping deferred). Emitted ONLY when:
  //   - the plan can apply (empty-quote gate passed), AND a hotel service exists;
  //   - the operator explicitly confirmed this night (confirmedNights[n] === true);
  //   - the suggestion is enabled (not skipped) and has no missingReason; AND
  //   - every id the createItem payload needs is present + a non-empty city.
  // Unconfirmed / skipped / unmatched nights produce NO item. No POST happens
  // here — this just describes the create-only operations for the 3D.2C-B runner.
  const hotelServiceId = opts.hotelServiceId ?? null;
  const roomCount = opts.roomCount && opts.roomCount > 0 ? opts.roomCount : Math.max(1, Math.ceil(opts.pax / 2));
  const confirmedNights = opts.confirmedNights || {};
  const hotels: ApplyPlanHotel[] =
    canApply && hotelServiceId
      ? (opts.hotelSuggestions || [])
          .filter(
            (s) =>
              confirmedNights[s.nightNumber] === true &&
              !s.disabled &&
              s.missingReason === null &&
              !!s.hotelId &&
              !!s.contractId &&
              !!s.roomCategoryId &&
              !!s.occupancyType &&
              !!s.seasonName &&
              !!s.mealPlan &&
              cleanStr(s.city) !== '',
          )
          .map((s) => ({
            serviceId: hotelServiceId,
            attachToDayNumber: s.nightNumber,
            nightCount: 1,
            hotelId: s.hotelId as string,
            contractId: s.contractId as string,
            roomCategoryId: s.roomCategoryId as string,
            occupancyType: s.occupancyType as string,
            seasonName: s.seasonName as string,
            mealPlan: s.mealPlan as string,
            paxCount: opts.pax,
            roomCount,
            markupPercent: 20,
            city: cleanStr(s.city),
          }))
      : [];

  return { canApply, blockedReason, warnings, days, transport, hotels, totalPoiAssignments };
}

// ---------------------------------------------------------------------------
// Phase 3D.2A — hotel matcher (lift-and-shift, byte-for-byte) + overnight-night
// derivation. `findHotelSetup` and `getHotelComfortScore` were moved here from
// QuoteAutoItineraryBuilder.tsx UNCHANGED so both the Auto Itinerary Builder and
// the touring-route generator can reuse the SAME matcher. No logic change. The
// module-private `normalizeText` below is a byte-identical copy of the .tsx
// helper the hotel functions call (the .tsx keeps its own copy for route
// matching); it is intentionally distinct from `normalizeCityName` above
// (alphanumeric strip). No UI, no writes, no hotel-item creation, no pricing.
// ---------------------------------------------------------------------------

export type Hotel = {
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

export type HotelContract = {
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

export type HotelRate = {
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

export type OptimizationMode = 'cost' | 'comfort';

export type HotelSetupMissingReason = 'no-hotel-in-city' | 'no-valid-contract' | 'no-rate' | null;

// Byte-identical copy of the .tsx `normalizeText`, used only by the hotel matcher.
function normalizeText(value: string | null | undefined) {
  return (value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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

// Moved byte-for-byte from QuoteAutoItineraryBuilder.tsx (Phase 3D.2A). Pure;
// matches a hotel/contract/rate for a city and returns the best setup + a
// missingReason that says WHICH piece is absent. Does NOT compute sell price —
// sell is produced by the pricing engine when a hotel item is created.
export function findHotelSetup(values: {
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

// Phase 3D.2A — derive the overnight NIGHTS for a touring route (suggestions
// only; consumed later by the preview/apply, never auto-applied). Conservative:
//   - nights = durationDays - 1 (a one-day route returns 0 nights -> no hotel).
//   - Overnight cities are the real DESTINATION cities (POI-linked content stops
//     only; base/operational/null-POI stops never create an overnight city by
//     themselves), in order, de-duplicated, excluding the origin/start city.
//     Falls back to mainDestinations when there are no POI-linked stop cities.
//   - A single-night route sleeps at the FURTHEST destination (e.g. Petra, not
//     an intermediate Dana). Whenever the destination/night mapping is not 1:1,
//     or no destination city exists, `ambiguous` is set so the operator confirms
//     /edits later -- ambiguity is surfaced, never hidden.
export type OvernightNight = {
  nightNumber: number;
  city: string;
  ambiguous: boolean;
  reason: string | null;
};

export type OvernightNightsResult = {
  nights: OvernightNight[];
  ambiguous: boolean;
  reasons: string[];
};

export function deriveOvernightNights(route: TouringRouteForGen): OvernightNightsResult {
  const days = clampDurationDays(route.durationDays);
  const nightCount = Math.max(days - 1, 0);
  if (nightCount === 0) {
    return { nights: [], ambiguous: false, reasons: [] };
  }

  const origin = normalizeCityName(route.startCity);
  const orderedStops = [...(route.stops || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const pushDistinct = (acc: string[], rawCity: string | null | undefined) => {
    const city = cleanStr(rawCity);
    if (!city) return;
    if (normalizeCityName(city) === origin) return;
    if (acc.length && sameCity(acc[acc.length - 1], city)) return;
    acc.push(city);
  };

  const dests: string[] = [];
  for (const stop of orderedStops) {
    if (stop.poiId && stop.pointOfInterest) pushDistinct(dests, stop.city);
  }
  if (dests.length === 0) {
    for (const main of route.mainDestinations || []) pushDistinct(dests, main);
  }

  const reasons: string[] = [];

  if (dests.length === 0) {
    const emptyNights: OvernightNight[] = [];
    for (let n = 1; n <= nightCount; n += 1) {
      emptyNights.push({ nightNumber: n, city: '', ambiguous: true, reason: 'no-destination-city' });
    }
    reasons.push('No POI-linked destination city found for the overnight(s); operator must choose.');
    return { nights: emptyNights, ambiguous: true, reasons };
  }

  let perNight: string[];
  let mappingAmbiguous = false;
  if (dests.length === nightCount) {
    perNight = dests.slice();
  } else if (dests.length > nightCount) {
    // Sleep at the furthest destination(s).
    perNight = dests.slice(dests.length - nightCount);
    mappingAmbiguous = true;
    reasons.push(
      `Route visits ${dests.length} destination cities for ${nightCount} overnight(s); suggested the final destination(s). Edit if needed.`,
    );
  } else {
    perNight = [...dests];
    while (perNight.length < nightCount) perNight.push(dests[dests.length - 1]);
    mappingAmbiguous = true;
    reasons.push(
      `Route has fewer destination cities (${dests.length}) than overnight(s) (${nightCount}); padded with the last. Edit if needed.`,
    );
  }

  const nights: OvernightNight[] = perNight.map((city, index) => ({
    nightNumber: index + 1,
    city,
    ambiguous: mappingAmbiguous,
    reason: mappingAmbiguous ? 'destination-night-count-mismatch' : null,
  }));

  return { nights, ambiguous: mappingAmbiguous, reasons };
}

// Phase 3D.2B — build per-night hotel SUGGESTIONS for the touring-route preview.
// Suggestions ONLY: the panel renders these, the operator confirms/edits, and
// NOTHING is created here (no fetch, no writes, no hotel item). Pure; reuses
// deriveOvernightNights + findHotelSetup. Per-night operator overrides (change
// overnight city / disable a suggestion) are applied before matching. A disabled
// night, or a night with no overnight city yet, returns no hotel.
export type OvernightHotelOverride = { city?: string | null; disabled?: boolean };

export type OvernightHotelSuggestion = {
  nightNumber: number;
  city: string;
  ambiguous: boolean;
  ambiguityReason: string | null;
  disabled: boolean;
  hotelName: string | null;
  roomName: string | null;
  mealPlan: string | null;
  rateCost: number | null;
  rateCurrency: string | null;
  missingReason: HotelSetupMissingReason;
  // Phase 3D.2C-A — apply IDs (passed through from findHotelSetup, additive).
  // Display fields above are unchanged. These are what the EXISTING hotel-item
  // payload (POST /quotes/:id/items) needs; null whenever there is no match
  // (disabled, no overnight city, or missingReason set). 3D.2C-A only carries
  // them in the model — no item is created here.
  hotelId: string | null;
  contractId: string | null;
  roomCategoryId: string | null;
  occupancyType: string | null;
  seasonName: string | null;
};

export type OvernightHotelSuggestionsResult = {
  suggestions: OvernightHotelSuggestion[];
  ambiguous: boolean;
  reasons: string[];
};

export function buildOvernightHotelSuggestions(
  route: TouringRouteForGen,
  options: {
    hotels: Hotel[];
    hotelContracts: HotelContract[];
    hotelRates: HotelRate[];
    travelStartDate?: string | null;
    optimizationMode?: OptimizationMode;
    overrides?: Record<number, OvernightHotelOverride>;
  },
): OvernightHotelSuggestionsResult {
  const overnight = deriveOvernightNights(route);
  const mode: OptimizationMode = options.optimizationMode || 'cost';
  const overrides = options.overrides || {};

  const suggestions: OvernightHotelSuggestion[] = overnight.nights.map((night) => {
    const override = overrides[night.nightNumber] || {};
    const disabled = override.disabled === true;
    const city = cleanStr(override.city != null ? override.city : night.city);

    const base = {
      nightNumber: night.nightNumber,
      city,
      ambiguous: night.ambiguous,
      ambiguityReason: night.reason,
    };

    if (disabled || !city) {
      return {
        ...base,
        disabled,
        hotelName: null,
        roomName: null,
        mealPlan: null,
        rateCost: null,
        rateCurrency: null,
        missingReason: null,
        hotelId: null,
        contractId: null,
        roomCategoryId: null,
        occupancyType: null,
        seasonName: null,
      };
    }

    const travelDate = addDays(options.travelStartDate || null, night.nightNumber - 1);
    const setup = findHotelSetup({
      city,
      travelDate,
      hotels: options.hotels,
      hotelContracts: options.hotelContracts,
      hotelRates: options.hotelRates,
      optimizationMode: mode,
    });

    return {
      ...base,
      disabled: false,
      hotelName: setup.hotel?.name ?? null,
      roomName: setup.rate?.roomCategory?.name ?? null,
      mealPlan: setup.rate?.mealPlan ?? null,
      rateCost: setup.rate?.cost ?? null,
      rateCurrency: setup.rate?.currency ?? null,
      missingReason: setup.missingReason,
      hotelId: setup.hotel?.id ?? null,
      contractId: setup.contract?.id ?? null,
      roomCategoryId: setup.rate?.roomCategoryId ?? null,
      occupancyType: setup.rate?.occupancyType ?? null,
      seasonName: setup.rate?.seasonName ?? null,
    };
  });

  return { suggestions, ambiguous: overnight.ambiguous, reasons: overnight.reasons };
}
