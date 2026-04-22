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
    isActive: boolean;
  } | null;
};

export function formatPlaceLabel(place: Pick<PlaceOption, 'name' | 'type' | 'city' | 'country'>) {
  const location = [place.city, place.country].filter(Boolean).join(', ');
  const base = location ? `${place.name} - ${location}` : place.name;

  return `${base} (${place.type})`;
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
