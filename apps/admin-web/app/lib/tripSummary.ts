const MIN_TRIP_SUMMARY_LENGTH = 20;
const INVALID_SUMMARY_PATTERNS = [
  /\blorem ipsum\b/i,
  /\bplaceholder\b/i,
  /\bdummy text\b/i,
  /\bsample text\b/i,
  /\bcoming soon\b/i,
  /\bto be advised\b/i,
  /\b(?:tbd|tba|tbc|n\/a)\b/i,
  /^day\s+\d+/im,
  /\bimported itinerary\b/i,
];

function cleanTripSummary(value: string) {
  return value
    .replace(/\s*\|\s*/g, ', ')
    .replace(/\bDescription:\s*/gi, '')
    .replace(/\bNotes:\s*/gi, '')
    .replace(/\bImported itinerary:\s*/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isValidTripSummary(value: string) {
  if (!value || value.length < MIN_TRIP_SUMMARY_LENGTH) {
    return false;
  }

  return !INVALID_SUMMARY_PATTERNS.some((pattern) => pattern.test(value));
}

function extractDestination(value: string) {
  return value
    .replace(/^Imported itinerary:\s*/i, '')
    .replace(/\bexperience\b$/i, '')
    .replace(/^Day\s+\d+\s*[:\-]\s*/i, '')
    .trim();
}

function summarizeDestinations(destinations: string[]) {
  const cleaned = Array.from(new Set(destinations.map((destination) => extractDestination(destination)).filter(Boolean)));

  if (cleaned.length === 0) {
    return '';
  }

  if (cleaned.length === 1) {
    return cleaned[0];
  }

  if (cleaned.length === 2) {
    return `${cleaned[0]} and ${cleaned[1]}`;
  }

  return `${cleaned.slice(0, -1).join(', ')}, and ${cleaned[cleaned.length - 1]}`;
}

function formatGuestCountLabel(value: number) {
  return `${value} guest${value === 1 ? '' : 's'}`;
}

export function getValidatedTripSummary(values: {
  quoteTitle: string;
  quoteDescription: string | null;
  dayTitles?: string[];
  totalPax: number;
  nightCount: number;
}) {
  const cleanedDescription = cleanTripSummary(values.quoteDescription || '');
  if (isValidTripSummary(cleanedDescription)) {
    return cleanedDescription;
  }

  const dayCount = Math.max(values.dayTitles?.length || 0, values.nightCount + 1 || 0, 1);
  const destination = extractDestination(values.quoteTitle) || summarizeDestinations(values.dayTitles || []);
  const guestCountLabel = formatGuestCountLabel(values.totalPax);

  if (destination) {
    return `This ${dayCount}-day, ${values.nightCount}-night journey through ${destination} has been professionally planned for ${guestCountLabel}, combining carefully coordinated touring, quality accommodation, and seamless ground arrangements.`;
  }

  return `This ${dayCount}-day, ${values.nightCount}-night journey has been professionally planned for ${guestCountLabel}, combining carefully coordinated touring, quality accommodation, and seamless ground arrangements.`;
}
