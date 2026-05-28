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

  // Fact sheet PATCH — only fire if any fact-sheet field was touched.
  // Empty strings come through as null so the operator can CLEAR a
  // previously-set value.
  const shortDescription = trimOrNull(formData.get('shortDescription'));
  const checkInTime = trimOrNull(formData.get('checkInTime'));
  const checkOutTime = trimOrNull(formData.get('checkOutTime'));
  const factSheetTouched =
    formData.has('shortDescription') ||
    formData.has('checkInTime') ||
    formData.has('checkOutTime');

  if (factSheetTouched) {
    const factSheetResponse = await adminPageFetch(
      `${API_BASE_URL}/hotels/${encodeURIComponent(hotelId)}/fact-sheet`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shortDescription,
          checkInTime,
          checkOutTime,
        }),
      },
    );
    if (!factSheetResponse.ok) {
      const errBody = await factSheetResponse.text();
      // Don't roll back the master-data PATCH — it already landed.
      // Surface the partial failure clearly to the operator.
      throw new Error(
        `Hotel master data saved, but fact sheet update failed: HTTP ${factSheetResponse.status} ${errBody.slice(0, 200)}`,
      );
    }
  }

  revalidatePath(`/hotels-v2/${hotelId}`);
  revalidatePath('/hotels-v2');
  redirect(`/hotels-v2/${hotelId}`);
}
