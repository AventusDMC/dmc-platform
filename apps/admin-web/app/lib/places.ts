export type PlaceOption = {
  id: string;
  name: string;
  type: string;
  placeTypeId: string | null;
  cityId: string | null;
  city: string | null;
  country: string | null;
  isActive: boolean;
  placeType?: {
    id: string;
    name: string;
    isActive: boolean;
  } | null;
  cityRecord?: {
    id: string;
    name: string;
    country: string | null;
    latitude: number;
    longitude: number;
    isActive: boolean;
  } | null;
};

export function formatPlaceLabel(place: Pick<PlaceOption, 'name' | 'type' | 'city' | 'country'>) {
  const location = [place.city, place.country].filter(Boolean).join(', ');
  const base = location ? `${place.name} - ${location}` : place.name;

  return `${base} (${place.type})`;
}

function normalizePlaceText(value: string | null | undefined) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanRepeatedTypeWords(label: string) {
  return label
    .replace(/\bAirport\s+Airport\b/gi, 'Airport')
    .replace(/\bCity\s+Center\s+City\s+Center\b/gi, 'City Center')
    .replace(/\bCity\s+City\b/gi, 'City')
    .replace(/\bBorder\s+Border\b/gi, 'Border')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanPlaceType(type: string | null | undefined) {
  const normalized = normalizePlaceText(type);
  if (normalized.includes('airport')) return 'Airport';
  if (normalized.includes('border')) return 'Border';
  if (normalized.includes('port')) return 'Port';
  if (normalized.includes('city')) return 'City';
  if (normalized.includes('site')) return 'Site';
  if (normalized.includes('destination')) return 'Destination';
  if (normalized.includes('landmark')) return 'Landmark';
  if (normalized.includes('heritage')) return 'Heritage Site';
  if (normalized.includes('tourism')) return 'Tourism Site';
  if (normalized.includes('archaeological')) return 'Archaeological Site';
  if (normalized.includes('region')) return 'Region';
  if (normalized.includes('location')) return 'Location';
  return cleanRepeatedTypeWords(String(type || '').trim());
}

export function getCanonicalPlaceDisplayName(place: Pick<PlaceOption, 'name' | 'type' | 'city' | 'country'>) {
  const name = cleanRepeatedTypeWords(String(place.name || '').trim());
  const normalized = normalizePlaceText([name, place.type, place.city].filter(Boolean).join(' '));

  if (/\b(qaia|queen alia international)\b/.test(normalized)) return 'QAIA Airport';
  if (/\bmarka\b/.test(normalized) && /\bairport\b/.test(normalized)) return 'Marka Airport';
  if (/\b(aqj|king hussein international)\b/.test(normalized) && /\bairport\b/.test(normalized)) return 'AQJ Airport';
  if (/\baqaba\b/.test(normalized) && /\b(city center|city centre|downtown|city)\b/.test(normalized)) return 'Aqaba City';
  if (/\bamman\b/.test(normalized) && /\bcity\b/.test(normalized)) return 'Amman';
  if (/\bpetra\b/.test(normalized) && /\b(visitor center|visitor centre|site|location)\b/.test(normalized)) return 'Petra';
  if (/\bdead sea\b/.test(normalized)) return 'Dead Sea';
  if (/\bwadi rum\b/.test(normalized)) return 'Wadi Rum';
  if (/\ballenby\b/.test(normalized)) return 'Allenby Border';
  if (/\bsheikh hussein\b/.test(normalized)) return 'Sheikh Hussein Border';
  if (/\b(south border|aqaba south border|wadi araba|arava)\b/.test(normalized)) return 'South Border';

  return name
    .replace(/\s+-\s+.*$/, '')
    .replace(/\bAirport\s*-\s*/i, 'Airport ')
    .replace(/\bCity Center\b/i, 'City')
    .trim();
}

export function getCanonicalPlaceSecondaryText(place: Pick<PlaceOption, 'name' | 'type' | 'city' | 'country'>) {
  const type = cleanPlaceType(place.type);
  const city = cleanRepeatedTypeWords(String(place.city || '').trim());
  const displayName = getCanonicalPlaceDisplayName(place);
  const normalizedDisplay = normalizePlaceText(displayName);
  const normalizedCity = normalizePlaceText(city);

  if (!type && !city) return '';
  if (!city || normalizedDisplay.includes(normalizedCity)) return type;
  return type ? `${type} · ${city}` : city;
}

export function formatPlaceSelectorLabel(place: Pick<PlaceOption, 'name' | 'type' | 'city' | 'country'>) {
  const secondary = getCanonicalPlaceSecondaryText(place);
  return secondary ? `${getCanonicalPlaceDisplayName(place)} (${secondary})` : getCanonicalPlaceDisplayName(place);
}

export function getCanonicalPlaceSelectorKey(place: Pick<PlaceOption, 'name' | 'type' | 'city' | 'country'>) {
  return normalizePlaceText([getCanonicalPlaceDisplayName(place), cleanPlaceType(place.type), place.city].filter(Boolean).join(' '));
}

const NON_GEOGRAPHIC_PLACE_PATTERNS = [
  /\bextra\s*km\b/i,
  /\bextra\s*(hour|hr|hrs|h)\b/i,
  /\bovernight\b/i,
  /\btransfer\s*deduction\b/i,
  /\bfull\s*day\b/i,
  /\bhalf\s*day\b/i,
  /\bstationary\b/i,
  /\bwaiting\b/i,
  /\bdisposal\b/i,
  /\bdriver\b/i,
  /\bpricing\b/i,
  /\brate\b/i,
  /\bprice\b/i,
  /\bservice\b/i,
  /\badd[-\s]?on\b/i,
  /\bper\s*(vehicle|day|hour|km)\b/i,
  /\b\d+\s*(km|h|hr|hrs)\b/i,
];

const CANONICAL_GEOGRAPHIC_PLACE_TYPE_PATTERNS = [
  /\bcity\b/i,
  /\bairport\b/i,
  /\bborder\b/i,
  /\bport\b/i,
  /\bsite\b/i,
  /\blocation\b/i,
  /\bdestination\b/i,
  /\blandmark\b/i,
  /\barchaeological[_\s-]?site\b/i,
  /\btourism[_\s-]?site\b/i,
  /\bheritage[_\s-]?site\b/i,
  /\bregion\b/i,
];

export function isCanonicalGeographicPlace(place: Pick<PlaceOption, 'name' | 'type' | 'isActive'>) {
  if (place.isActive === false) {
    return false;
  }

  const label = `${place.name || ''} ${place.type || ''}`.trim();
  const placeType = String(place.type || '').trim();
  return CANONICAL_GEOGRAPHIC_PLACE_TYPE_PATTERNS.some((pattern) => pattern.test(placeType)) && !NON_GEOGRAPHIC_PLACE_PATTERNS.some((pattern) => pattern.test(label));
}

function comparePlaceSelectorOptions<T extends Pick<PlaceOption, 'name' | 'type' | 'city' | 'country'>>(left: T, right: T) {
  const leftName = getCanonicalPlaceDisplayName(left);
  const rightName = getCanonicalPlaceDisplayName(right);
  if (left.name === leftName && right.name !== rightName) return -1;
  if (right.name === rightName && left.name !== leftName) return 1;
  return String(left.name || '').length - String(right.name || '').length;
}

export function filterCanonicalGeographicPlaces<T extends Pick<PlaceOption, 'id' | 'name' | 'type' | 'isActive' | 'city' | 'country'>>(places: T[], selectedIds: Array<string | null | undefined> = []) {
  const selectedIdSet = new Set(selectedIds.filter(Boolean));
  const selectedPlaces = places.filter((place) => selectedIdSet.has(place.id));
  const dedupedPlaces = new Map<string, T>();

  for (const place of places) {
    if (!isCanonicalGeographicPlace(place)) continue;

    const key = getCanonicalPlaceSelectorKey(place);
    const current = dedupedPlaces.get(key);
    if (!current || comparePlaceSelectorOptions(place, current) < 0) {
      dedupedPlaces.set(key, place);
    }
  }

  const deduped = Array.from(dedupedPlaces.values());
  for (const selectedPlace of selectedPlaces) {
    if (!deduped.some((place) => place.id === selectedPlace.id)) {
      deduped.push(selectedPlace);
    }
  }

  return deduped;
}

export function buildRouteName(
  fromPlace: Pick<PlaceOption, 'name'> | null | undefined,
  toPlace: Pick<PlaceOption, 'name'> | null | undefined,
) {
  if (!fromPlace || !toPlace) {
    return '';
  }

  return `${fromPlace.name} - ${toPlace.name}`;
}

export async function fetchPlaces(apiBaseUrl: string) {
  const response = await fetch(`${apiBaseUrl}/places?selector=true`, {
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error('Failed to load places');
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('application/json')) {
    const bodyPreview = await response.text();
    throw new Error(`Failed to load places. Expected JSON but received ${contentType || 'unknown'}: ${bodyPreview.slice(0, 200)}`);
  }

  return (await response.json()) as PlaceOption[];
}
