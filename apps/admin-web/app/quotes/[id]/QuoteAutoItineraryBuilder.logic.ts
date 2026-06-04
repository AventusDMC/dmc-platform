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

export type TouringRouteForDerivation = {
  startCity?: string | null;
  durationDays?: number | null;
  mainDestinations?: string[] | null;
};

export type DerivedTouringDays = {
  /** Base/overnight city per day. Length === dayCount. */
  cities: string[];
  /** Day count, clamped to >= 1 (authoritative = route.durationDays). */
  dayCount: number;
  /** Derivation warnings for the operator to review (collapses, clamps). */
  notes: string[];
};

// Words that mark a destination entry as an activity/day-trip ANCHOR rather
// than an overnight base (e.g. "Amman City Tour" is a tour OF the base, not a
// place you sleep). Stripping them lets us tell "Amman City Tour" (anchor on
// the Amman base) from "Petra" (a genuine overnight base on the way).
const TOURING_ANCHOR_WORDS = /\b(city tour|sightseeing|panoramic|tour|excursion|day[ -]?trip|visit)\b/gi;

function stripTouringAnchorWords(value: string): string {
  return value.replace(TOURING_ANCHOR_WORDS, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Derive a per-day base/overnight city array from a touring route's
 * startCity + mainDestinations + durationDays, so the generator can title
 * each day and match an overnight hotel per base. Handles the round-trip
 * day-anchor case (e.g. "Amman - Amman City Tour - Jerash - Amman", 1 day →
 * a single Amman base, NOT three days) by dropping anchor-like labels and
 * collapsing consecutive repeats, then distributing the authoritative
 * durationDays across the distinct bases. Pure; emits notes for any
 * collapse/clamp so the operator can correct in the preview.
 */
export function deriveTouringRouteBaseCities(route: TouringRouteForDerivation): DerivedTouringDays {
  const notes: string[] = [];
  const dayCount = Math.max(1, Math.floor(Number(route.durationDays) || 1));
  const start = (route.startCity || '').trim();
  const dests = Array.isArray(route.mainDestinations)
    ? route.mainDestinations.map((entry) => String(entry || '').trim()).filter(Boolean)
    : [];

  const bases: string[] = [];
  for (const raw of [start, ...dests].filter(Boolean)) {
    const stripped = stripTouringAnchorWords(raw) || raw;
    const norm = normalizeCityName(stripped);
    if (!norm) continue;
    const prevNorm = bases.length ? normalizeCityName(bases[bases.length - 1]) : '';
    if (norm === prevNorm) continue; // consecutive repeat of the same base
    // An anchor variant ("Amman City Tour" -> "Amman") of a base already in the
    // sequence is part of that base's day, not a new overnight.
    if (stripped !== raw && bases.some((b) => normalizeCityName(b) === norm)) continue;
    bases.push(stripped);
  }
  if (bases.length === 0) bases.push(start || 'To be confirmed');

  let cities: string[];
  if (bases.length === dayCount) {
    cities = [...bases];
  } else if (bases.length > dayCount) {
    cities = bases.slice(0, dayCount);
    notes.push(
      `Route lists ${bases.length} base cities but the duration is ${dayCount} day${dayCount === 1 ? '' : 's'} — extra cities were collapsed. Review the day cities.`,
    );
  } else {
    // Fewer bases than days: one night each, then add the remaining nights to
    // overnight-eligible bases (Petra/Wadi Rum/Aqaba), else to the home base.
    const nightsPerBase = bases.map(() => 1);
    let remaining = dayCount - bases.length;
    const eligible = bases
      .map((b, index) => ({ index, eligible: classifyOvernightCity(b, { includeOptional: true }) !== 'none' }))
      .filter((x) => x.eligible)
      .map((x) => x.index);
    const targets = eligible.length ? eligible : [0];
    let cursor = 0;
    while (remaining > 0) {
      nightsPerBase[targets[cursor % targets.length]] += 1;
      remaining -= 1;
      cursor += 1;
    }
    cities = bases.flatMap((base, index) => Array.from({ length: nightsPerBase[index] }, () => base));
    notes.push(
      `Duration (${dayCount} days) exceeds the ${bases.length} distinct base${bases.length === 1 ? '' : 's'} — extra nights were assigned automatically. Review the night distribution.`,
    );
  }

  return { cities, dayCount, notes };
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
