export type AutoItineraryExistingDay = {
  id: string;
  dayNumber: number;
  title?: string | null;
  description?: string | null;
  notes?: string | null;
};

export function getAutoItineraryDayTitle(dayNumber: number, totalDays: number) {
  if (dayNumber <= 1) {
    return 'Arrival';
  }

  if (dayNumber >= totalDays) {
    return 'Departure';
  }

  return `Day ${dayNumber}`;
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

export function buildItineraryApplyMessage(totalDays: number, addedDays: number) {
  if (addedDays > 0 && addedDays < totalDays) {
    return `Added ${addedDays} missing itinerary day${addedDays === 1 ? '' : 's'}.`;
  }

  return `${totalDays} itinerary day${totalDays === 1 ? '' : 's'} ready.`;
}
