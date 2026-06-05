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
  let seq = (route.mainDestinations || []).map(cleanStr).filter(Boolean);
  if (seq.length === 0) {
    const ordered = [...(route.stops || [])]
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((s) => cleanStr(s.city))
      .filter(Boolean);
    const collapsed: string[] = [];
    for (const c of ordered) {
      if (collapsed.length === 0 || !sameCity(collapsed[collapsed.length - 1], c)) collapsed.push(c);
    }
    if (collapsed.length > 1 && sameCity(collapsed[0], collapsed[collapsed.length - 1])) collapsed.pop();
    seq = collapsed;
  }
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
  overrideCost: number;
  useOverride: true;
  dayCount: number;
  paxCount: number;
  attachToDayNumber: number;
} | null;

export type TouringRouteApplyPlan = {
  canApply: boolean;
  blockedReason: string | null;
  warnings: string[];
  days: ApplyPlanDay[];
  transport: ApplyPlanTransport;
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
          overrideCost: preview.transport.cost,
          useOverride: true,
          dayCount: preview.transport.dayCount,
          paxCount: opts.pax,
          attachToDayNumber: 1,
        }
      : null;

  return { canApply, blockedReason, warnings, days, transport, totalPoiAssignments };
}
