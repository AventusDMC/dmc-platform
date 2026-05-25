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
