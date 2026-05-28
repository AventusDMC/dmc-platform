'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { adminPageFetch } from '../../../lib/admin-server';

// Hotels Engine v2 — Server Actions for hotel master-data editing.
//
// Edits the name / city / category / supplier on the hotel row plus
// the fact sheet description / check-in / check-out times via the
// existing /hotels/:id PATCH and /hotels/:id/fact-sheet PATCH
// endpoints.

const API_BASE_URL = '/api';

function trimOrUndefined(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function trimOrNull(value: FormDataEntryValue | null): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function updateHotel(hotelId: string, formData: FormData) {
  const name = trimOrUndefined(formData.get('name'));
  if (!name) {
    throw new Error('Hotel name is required.');
  }

  // Catalog references — these come from the v2 edit form's <select>
  // dropdowns. The backend resolves cityId → city.name and
  // hotelCategoryId → hotelCategory.name and writes both the relation
  // and the denormalized fallback string. Supplier is required.
  const cityId = trimOrUndefined(formData.get('cityId'));
  const hotelCategoryId = trimOrUndefined(formData.get('hotelCategoryId'));
  const supplierId = trimOrUndefined(formData.get('supplierId'));
  if (!supplierId) {
    throw new Error('Supplier is required.');
  }

  const masterBody: Record<string, unknown> = {
    name,
    supplierId,
  };
  if (cityId) {
    masterBody.cityId = cityId;
  }
  if (hotelCategoryId) {
    masterBody.hotelCategoryId = hotelCategoryId;
  }

  const masterResponse = await adminPageFetch(
    `${API_BASE_URL}/hotels/${encodeURIComponent(hotelId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(masterBody),
    },
  );

  if (!masterResponse.ok) {
    const errBody = await masterResponse.text();
    throw new Error(
      `Could not update hotel: HTTP ${masterResponse.status} ${errBody.slice(0, 200)}`,
    );
  }

  // Fact sheet PATCH — covers four professional-ERP sections:
  //   1. Identity & location  → highlightsJson.identity
  //   2. Stays                → highlightsJson.stays
  //   3. Facilities           → amenitiesJson
  //   4. Operational profile  → highlightsJson.operational
  // The three top-level columns (shortDescription, checkInTime,
  // checkOutTime) stay flat for convenience.
  //
  // Empty strings come through as null so the operator can CLEAR a
  // previously-set value.

  const shortDescription = trimOrNull(formData.get('shortDescription'));
  const checkInTime = trimOrNull(formData.get('checkInTime'));
  const checkOutTime = trimOrNull(formData.get('checkOutTime'));

  // helper for optional numbers
  const toNumber = (raw: FormDataEntryValue | null): number | null => {
    if (typeof raw !== 'string') return null;
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  };

  // 1. Identity & location
  const identity = {
    address: trimOrNull(formData.get('address')),
    phone: trimOrNull(formData.get('phone')),
    email: trimOrNull(formData.get('email')),
    website: trimOrNull(formData.get('website')),
    coordinates: {
      lat: toNumber(formData.get('lat')),
      lng: toNumber(formData.get('lng')),
    },
    distanceToAirport: trimOrNull(formData.get('distanceToAirport')),
    distanceToCityCenter: trimOrNull(formData.get('distanceToCityCenter')),
  };

  // 2. Stays
  const stays = {
    totalRooms: toNumber(formData.get('totalRooms')),
    yearBuilt: toNumber(formData.get('yearBuilt')),
    yearRenovated: toNumber(formData.get('yearRenovated')),
    chain: trimOrNull(formData.get('chain')),
  };

  // 4. Operational
  const operational = {
    groupCapacity: toNumber(formData.get('groupCapacity')),
    earlyCheckIn: trimOrNull(formData.get('earlyCheckIn')),
    lateCheckOut: trimOrNull(formData.get('lateCheckOut')),
    notes: trimOrNull(formData.get('operationalNotes')),
  };

  // 3. Facilities — checkbox booleans
  const facilities = {
    pool: formData.get('pool') === 'on',
    spa: formData.get('spa') === 'on',
    gym: formData.get('gym') === 'on',
    wifi: trimOrNull(formData.get('wifi')) || 'unknown', // free / paid / none
    parking: trimOrNull(formData.get('parking')) || 'unknown', // free / paid / valet / none
    beachAccess: trimOrNull(formData.get('beachAccess')) || 'unknown', // private / public / nearby / none
    petFriendly: formData.get('petFriendly') === 'on',
    wheelchair: formData.get('wheelchair') === 'on',
    restaurants: toNumber(formData.get('restaurants')),
    bars: toNumber(formData.get('bars')),
  };

  // Fire one PATCH covering all fact-sheet shape.
  const factSheetResponse = await adminPageFetch(
    `${API_BASE_URL}/hotels/${encodeURIComponent(hotelId)}/fact-sheet`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shortDescription,
        checkInTime,
        checkOutTime,
        highlightsJson: { identity, stays, operational },
        amenitiesJson: facilities,
      }),
    },
  );
  if (!factSheetResponse.ok) {
    const errBody = await factSheetResponse.text();
    throw new Error(
      `Hotel master data saved, but fact sheet update failed: HTTP ${factSheetResponse.status} ${errBody.slice(0, 200)}`,
    );
  }

  revalidatePath(`/hotels-v2/${hotelId}`);
  revalidatePath('/hotels-v2');
  redirect(`/hotels-v2/${hotelId}`);
}
