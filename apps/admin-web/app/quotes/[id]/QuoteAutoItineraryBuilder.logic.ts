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

function formatDateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function addDays(dateText: string | null | undefined, offset: number) {
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

export function getAutoItineraryDayTitle(dayNumber: number, totalDays: number) {
  if (dayNumber <= 1) {
    return 'Arrival';
  }

  if (dayNumber >= totalDays) {
    return 'Departure';
  }

  return `Day ${dayNumber}`;
}

export function generateItineraryDays(startDate: string | null | undefined, nights: number) {
  const nightCount = Math.max(0, Math.floor(Number(nights) || 0));
  const totalDays = nightCount + 1;

  return Array.from({ length: totalDays }, (_, index): GeneratedItineraryDay => {
    const dayNumber = index + 1;

    return {
      dayNumber,
      title: getAutoItineraryDayTitle(dayNumber, totalDays),
      date: addDays(startDate, index),
    };
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
