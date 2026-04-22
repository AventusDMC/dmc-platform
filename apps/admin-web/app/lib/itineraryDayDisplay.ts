type ItineraryDayDisplayInput = {
  dayNumber: number;
  title: string;
  description: string | null;
};

type ItineraryDayDisplay = {
  dayLabel: string;
  city: string;
  title: string;
  description: string;
};

const DEFAULT_CITY = 'Destination';
const DEFAULT_TITLE = 'Day Highlights';
const DEFAULT_DESCRIPTION = 'Details for this day will be confirmed separately.';
const TITLE_SPLIT_PATTERN = /\s(?:\||-|:|\u2013)\s/;

function cleanText(value: string | null | undefined) {
  return (value || '')
    .replace(/\s+/g, ' ')
    .replace(/\s*\|\s*/g, ' | ')
    .trim();
}

function normalizeCaseKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toSentenceCase(value: string) {
  if (!value) {
    return value;
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}

function splitSentences(value: string) {
  return value
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function dedupeSentences(value: string, excludedKeys: Set<string>) {
  const seen = new Set<string>(excludedKeys);
  const unique: string[] = [];

  for (const sentence of splitSentences(value)) {
    const key = normalizeCaseKey(sentence);
    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(sentence);
  }

  return unique.join(' ');
}

function splitTitleParts(value: string) {
  if (TITLE_SPLIT_PATTERN.test(value)) {
    return value
      .split(TITLE_SPLIT_PATTERN)
      .map((part) => part.trim())
      .filter(Boolean);
  }

  return [value];
}

function extractFromPattern(value: string) {
  const match = value.match(/^(.*?)(?:\s+\b(?:in|at|to)\b\s+)([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,2})$/);
  if (!match) {
    return null;
  }

  const title = cleanText(match[1]);
  const city = cleanText(match[2]);
  if (!title || !city) {
    return null;
  }

  return { city, title };
}

function getCityAndTitle(rawTitle: string) {
  const cleanedTitle = cleanText(rawTitle).replace(/^Day\s+\d+\s*(?::|-|\u2013)?\s*/i, '').trim();
  if (!cleanedTitle) {
    return {
      city: DEFAULT_CITY,
      title: DEFAULT_TITLE,
    };
  }

  const parts = splitTitleParts(cleanedTitle);
  if (parts.length >= 2) {
    const [city, ...rest] = parts;
    const title = cleanText(rest.join(' - '));
    return {
      city: city || DEFAULT_CITY,
      title: title || DEFAULT_TITLE,
    };
  }

  const patterned = extractFromPattern(cleanedTitle);
  if (patterned) {
    return patterned;
  }

  return {
    city: cleanedTitle,
    title: DEFAULT_TITLE,
  };
}

export function getItineraryDayDisplay(values: ItineraryDayDisplayInput): ItineraryDayDisplay {
  const { city, title } = getCityAndTitle(values.title);
  const excludedKeys = new Set<string>();

  const normalizedCity = cleanText(city) || DEFAULT_CITY;
  const normalizedTitle = cleanText(title) || DEFAULT_TITLE;

  excludedKeys.add(normalizeCaseKey(normalizedCity));
  excludedKeys.add(normalizeCaseKey(normalizedTitle));

  const cleanedDescription = dedupeSentences(cleanText(values.description), excludedKeys);

  return {
    dayLabel: `Day ${values.dayNumber}`,
    city: normalizedCity,
    title: normalizedTitle,
    description: toSentenceCase(cleanedDescription || DEFAULT_DESCRIPTION),
  };
}
