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
];

export function isCanonicalGeographicPlace(place: Pick<PlaceOption, 'name' | 'type' | 'isActive'>) {
  if (place.isActive === false) {
    return false;
  }

  const label = `${place.name || ''} ${place.type || ''}`.trim();
  const placeType = String(place.type || '').trim();
  return CANONICAL_GEOGRAPHIC_PLACE_TYPE_PATTERNS.some((pattern) => pattern.test(placeType)) && !NON_GEOGRAPHIC_PLACE_PATTERNS.some((pattern) => pattern.test(label));
}

export function filterCanonicalGeographicPlaces<T extends Pick<PlaceOption, 'id' | 'name' | 'type' | 'isActive'>>(places: T[], selectedIds: Array<string | null | undefined> = []) {
  const selectedIdSet = new Set(selectedIds.filter(Boolean));
  return places.filter((place) => selectedIdSet.has(place.id) || isCanonicalGeographicPlace(place));
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
  const response = await fetch(`${apiBaseUrl}/places`, {
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
