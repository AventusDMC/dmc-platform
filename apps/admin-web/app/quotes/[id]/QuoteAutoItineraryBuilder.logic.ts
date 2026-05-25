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
    let title = day.title;
    if (city && !day.title.toLowerCase().includes(city.toLowerCase())) {
      const lower = day.title.toLowerCase();
      if (lower === 'arrival' || lower === 'departure') {
        title = `${day.title} · ${city}`;
      } else if (/^day\s+\d+$/i.test(day.title)) {
        title = city;
      } else {
        title = `${day.title} · ${city}`;
      }
    }
    return { ...day, city, title };
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
