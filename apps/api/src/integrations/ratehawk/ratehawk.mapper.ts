// RateHawk → DMC schema field mapping.
//
// All functions in here are pure (no I/O, no Prisma) so they can be
// unit-tested cheaply and audited without spinning up the API. The
// service layer composes these against fetched RateHawk records and
// the catalog (cities / hotel categories) before writing.

import type { RateHawkHotelRaw } from './ratehawk.types';

// Stop-words / generic tokens we drop when normalizing city names so
// "Amman, Jordan" / "AMMAN" / "amman" all collapse to "Amman" for the
// catalog match.
function normalizeCityName(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Drop any ", country" suffix.
  const beforeComma = trimmed.split(',')[0]!.trim();
  if (!beforeComma) return null;
  // Title-case.
  return beforeComma
    .toLowerCase()
    .split(/\s+/)
    .map((tok) => (tok.length === 0 ? tok : tok[0]!.toUpperCase() + tok.slice(1)))
    .join(' ');
}

// RateHawk uses ISO 3166-1 alpha-2 lowercase in some endpoints and
// uppercase in others. Normalize to uppercase for our storage.
function normalizeCountryCode(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().toUpperCase();
  return trimmed.length === 2 ? trimmed : null;
}

export function extractCandidateFields(raw: RateHawkHotelRaw): {
  rateHawkId: string | null;
  name: string | null;
  countryCode: string | null;
  cityName: string | null;
  addressLine: string | null;
  starRating: number | null;
  latitude: number | null;
  longitude: number | null;
  chainName: string | null;
  kind: string | null;
  photoCount: number;
} {
  const rateHawkId = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : null;
  const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : null;
  const countryCode = normalizeCountryCode(raw.region?.country_code);
  const cityName = normalizeCityName(raw.region?.name);
  const addressLine =
    typeof raw.address === 'string' && raw.address.trim() ? raw.address.trim() : null;
  const starRating =
    typeof raw.star_rating === 'number' && raw.star_rating >= 0 && raw.star_rating <= 5
      ? Math.round(raw.star_rating)
      : null;
  const latitude = typeof raw.latitude === 'number' && Number.isFinite(raw.latitude) ? raw.latitude : null;
  const longitude =
    typeof raw.longitude === 'number' && Number.isFinite(raw.longitude) ? raw.longitude : null;
  const chainName = typeof raw.chain === 'string' && raw.chain.trim() ? raw.chain.trim() : null;
  const kind = typeof raw.kind === 'string' && raw.kind.trim() ? raw.kind.trim() : null;
  const photoCount = Array.isArray(raw.images) ? raw.images.length : 0;

  return {
    rateHawkId,
    name,
    countryCode,
    cityName,
    addressLine,
    starRating,
    latitude,
    longitude,
    chainName,
    kind,
    photoCount,
  };
}

// Pull the English description string out of RateHawk's nested
// `description_struct` array of { title, paragraphs[] } blocks.
// Returns the concatenated paragraphs of the first block, capped at
// 600 chars to fit the existing factSheet.shortDescription column.
export function extractShortDescription(raw: RateHawkHotelRaw): string | null {
  if (!Array.isArray(raw.description_struct) || raw.description_struct.length === 0) {
    return null;
  }
  const first = raw.description_struct[0];
  if (!first || !Array.isArray(first.paragraphs)) return null;
  const joined = first.paragraphs.filter((p) => typeof p === 'string').join(' ').trim();
  if (!joined) return null;
  return joined.length > 600 ? `${joined.slice(0, 597)}…` : joined;
}

// Pull a usable thumbnail URL out of the images array. RateHawk
// returns either string[] or { url, type }[] depending on endpoint.
export function extractThumbnailUrl(raw: RateHawkHotelRaw): string | null {
  if (!Array.isArray(raw.images) || raw.images.length === 0) return null;
  const first = raw.images[0];
  if (typeof first === 'string') return first;
  if (first && typeof first === 'object' && typeof first.url === 'string') return first.url;
  return null;
}

// Pull the full gallery as a string[] of URLs.
export function extractImageGallery(raw: RateHawkHotelRaw): string[] {
  if (!Array.isArray(raw.images)) return [];
  return raw.images
    .map((img) => (typeof img === 'string' ? img : img && typeof img === 'object' ? img.url : null))
    .filter((u): u is string => typeof u === 'string' && u.length > 0);
}

// --- Amenity taxonomy mapping -------------------------------------------------
// RateHawk groups amenities into thematic groups (general, business,
// in_room, etc.) with their own slug list. We map the slugs that
// matter to our amenitiesJson booleans + enum values. Slugs not in
// the table are preserved in raw_json but not surfaced on the form.

const POOL_SLUGS = new Set(['pool', 'outdoor-pool', 'indoor-pool', 'swimming-pool', 'rooftop-pool']);
const SPA_SLUGS = new Set(['spa', 'spa-centre', 'spa-and-wellness', 'spa-wellness', 'wellness']);
const GYM_SLUGS = new Set(['fitness-center', 'fitness-centre', 'gym', 'fitness']);
const PET_SLUGS = new Set(['pet-friendly', 'pets-allowed', 'pets']);
const WHEELCHAIR_SLUGS = new Set([
  'wheelchair-accessible',
  'accessibility',
  'disabled-access',
  'facilities-for-disabled-guests',
]);
const RESTAURANT_SLUGS = new Set(['restaurant', 'restaurants', 'on-site-restaurant']);
const BAR_SLUGS = new Set(['bar', 'bars', 'lounge', 'cocktail-bar']);

// Wi-Fi / parking / beach are tri-state — RateHawk often signals
// "free", "paid", or "none" via dedicated slugs.
const WIFI_FREE = new Set(['free-wifi', 'free-internet', 'wifi-free', 'wifi']);
const WIFI_PAID = new Set(['paid-wifi', 'paid-internet']);
const PARKING_FREE = new Set(['free-parking', 'parking-free']);
const PARKING_PAID = new Set(['paid-parking', 'parking-paid']);
const PARKING_VALET = new Set(['valet-parking']);
const BEACH_PRIVATE = new Set(['private-beach', 'private-beach-area']);
const BEACH_PUBLIC = new Set(['public-beach']);
const BEACH_NEARBY = new Set(['beach', 'beach-front', 'beachfront', 'beach-nearby']);

function collectAllAmenitySlugs(raw: RateHawkHotelRaw): string[] {
  if (!Array.isArray(raw.amenity_groups)) return [];
  const out: string[] = [];
  for (const grp of raw.amenity_groups) {
    if (!grp || !Array.isArray(grp.amenities)) continue;
    for (const a of grp.amenities) {
      if (typeof a === 'string' && a.trim()) {
        out.push(a.trim().toLowerCase());
      }
    }
  }
  return out;
}

function countMatchingSlugs(slugs: string[], set: Set<string>): number {
  let n = 0;
  for (const s of slugs) if (set.has(s)) n += 1;
  return n;
}

function pickTriState(
  slugs: string[],
  options: Array<{ value: string; set: Set<string> }>,
  fallback: string,
): string {
  for (const { value, set } of options) {
    if (slugs.some((s) => set.has(s))) return value;
  }
  return fallback;
}

export type AmenitiesJsonShape = {
  pool: boolean;
  spa: boolean;
  gym: boolean;
  petFriendly: boolean;
  wheelchair: boolean;
  wifi: string; // 'free' | 'paid' | 'unknown'
  parking: string; // 'free' | 'paid' | 'valet' | 'unknown'
  beachAccess: string; // 'private' | 'public' | 'nearby' | 'unknown'
  restaurants: number;
  bars: number;
};

export function mapAmenities(raw: RateHawkHotelRaw): AmenitiesJsonShape {
  const slugs = collectAllAmenitySlugs(raw);
  return {
    pool: slugs.some((s) => POOL_SLUGS.has(s)),
    spa: slugs.some((s) => SPA_SLUGS.has(s)),
    gym: slugs.some((s) => GYM_SLUGS.has(s)),
    petFriendly: slugs.some((s) => PET_SLUGS.has(s)),
    wheelchair: slugs.some((s) => WHEELCHAIR_SLUGS.has(s)),
    wifi: pickTriState(
      slugs,
      [
        { value: 'free', set: WIFI_FREE },
        { value: 'paid', set: WIFI_PAID },
      ],
      'unknown',
    ),
    parking: pickTriState(
      slugs,
      [
        { value: 'valet', set: PARKING_VALET },
        { value: 'free', set: PARKING_FREE },
        { value: 'paid', set: PARKING_PAID },
      ],
      'unknown',
    ),
    beachAccess: pickTriState(
      slugs,
      [
        { value: 'private', set: BEACH_PRIVATE },
        { value: 'public', set: BEACH_PUBLIC },
        { value: 'nearby', set: BEACH_NEARBY },
      ],
      'unknown',
    ),
    restaurants: countMatchingSlugs(slugs, RESTAURANT_SLUGS),
    bars: countMatchingSlugs(slugs, BAR_SLUGS),
  };
}

export type HighlightsJsonShape = {
  identity: {
    address: string | null;
    phone: string | null;
    email: string | null;
    website: string | null;
    coordinates: { lat: number | null; lng: number | null };
    distanceToAirport: string | null;
    distanceToCityCenter: string | null;
  };
  stays: {
    totalRooms: number | null;
    yearBuilt: number | null;
    yearRenovated: number | null;
    chain: string | null;
  };
  operational: {
    groupCapacity: number | null;
    earlyCheckIn: string | null;
    lateCheckOut: string | null;
    notes: string | null;
  };
};

export function mapHighlights(raw: RateHawkHotelRaw): HighlightsJsonShape {
  return {
    identity: {
      address: typeof raw.address === 'string' && raw.address.trim() ? raw.address.trim() : null,
      phone: typeof raw.phone === 'string' && raw.phone.trim() ? raw.phone.trim() : null,
      email: typeof raw.email === 'string' && raw.email.trim() ? raw.email.trim() : null,
      website: null, // RateHawk doesn't surface websites in the standard content payload.
      coordinates: {
        lat:
          typeof raw.latitude === 'number' && Number.isFinite(raw.latitude) ? raw.latitude : null,
        lng:
          typeof raw.longitude === 'number' && Number.isFinite(raw.longitude) ? raw.longitude : null,
      },
      distanceToAirport: null,
      distanceToCityCenter: null,
    },
    stays: {
      totalRooms: null, // not reliably in content payload
      yearBuilt: null,
      yearRenovated: null,
      chain: typeof raw.chain === 'string' && raw.chain.trim() ? raw.chain.trim() : null,
    },
    operational: {
      groupCapacity: null,
      earlyCheckIn: null,
      lateCheckOut: null,
      notes: null,
    },
  };
}

export function mapCheckInOut(raw: RateHawkHotelRaw): {
  checkInTime: string | null;
  checkOutTime: string | null;
} {
  const checkInTime =
    typeof raw.check_in_time === 'string' && raw.check_in_time.trim()
      ? raw.check_in_time.trim()
      : null;
  const checkOutTime =
    typeof raw.check_out_time === 'string' && raw.check_out_time.trim()
      ? raw.check_out_time.trim()
      : null;
  return { checkInTime, checkOutTime };
}

// Star rating → catalog category name. The catalog stores names like
// "3 Star", "4 Star", "5 Star" — see /admin/hotel-categories.
export function starRatingToCategoryName(starRating: number | null): string | null {
  if (starRating == null) return null;
  const rounded = Math.round(starRating);
  if (rounded < 1 || rounded > 5) return null;
  return `${rounded} Star`;
}
