'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { adminPageFetch, adminPageFetchJson } from '../../../lib/admin-server';
import { suggestRoomCode } from '../../lib/room-code-suggester';

// Hotels Engine — Server Actions for room type CRUD.
//
// All mutations go through the existing /hotels/:hotelId/room-categories
// REST endpoints. Server Actions let the v2 architecture stay free of
// client components for forms — operators submit a plain HTML <form>,
// the action runs server-side, mutates via the API, and revalidates
// the page so the new state appears on next render.

const API_BASE_URL = '/api';

function trimOrUndefined(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

// Fetch the existing room types for a hotel — used to feed the
// dedupe set for suggestRoomCode().
async function fetchExistingRooms(hotelId: string): Promise<Array<{ id: string; name: string; code: string | null }>> {
  try {
    return await adminPageFetchJson<Array<{ id: string; name: string; code: string | null }>>(
      `${API_BASE_URL}/hotels/${encodeURIComponent(hotelId)}/room-categories-summary`,
      'Hotel room codes lookup',
      { cache: 'no-store' },
    );
  } catch (caughtError) {
    console.warn('[hotels/rooms/actions] could not load existing rooms for dedupe', caughtError);
    return [];
  }
}

export async function createRoomType(hotelId: string, formData: FormData) {
  const name = trimOrUndefined(formData.get('name'));
  if (!name) {
    // Defensive — the form has `required` on the name input, but
    // belt-and-braces here.
    throw new Error('Room type name is required.');
  }
  let code = trimOrUndefined(formData.get('code'));
  const description = trimOrUndefined(formData.get('description'));
  const isActive = formData.get('isActive') !== 'inactive';

  // Auto-suggest a standardized code if the operator left the field
  // blank. Looks up existing codes so the new one is unique within
  // the hotel.
  if (!code) {
    const existing = await fetchExistingRooms(hotelId);
    code = suggestRoomCode(name, existing.map((r) => r.code));
  }

  const response = await adminPageFetch(
    `${API_BASE_URL}/hotels/${encodeURIComponent(hotelId)}/room-categories`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, code, description, isActive }),
    },
  );

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Could not create room type: HTTP ${response.status} ${errBody.slice(0, 200)}`);
  }

  revalidatePath(`/hotels/${hotelId}/rooms`);
  revalidatePath(`/hotels/${hotelId}`);
}

/**
 * Bulk-fill action — walks the hotel's room types, finds every row
 * with an empty / null code, and assigns a standardized one via the
 * suggester. Each suggestion is deduped against previously-assigned
 * codes inside the same run, so two rooms can't end up with the
 * same code.
 */
export async function autoFillEmptyRoomCodes(hotelId: string) {
  const rooms = await fetchExistingRooms(hotelId);
  // Start with all NON-empty codes as taken; we'll add each new
  // suggestion as we go so subsequent rows don't collide with it.
  const taken = new Set<string>();
  for (const r of rooms) {
    if (r.code && r.code.trim().length > 0) {
      taken.add(r.code.trim().toUpperCase());
    }
  }

  const targets = rooms.filter((r) => !r.code || r.code.trim().length === 0);
  if (targets.length === 0) {
    revalidatePath(`/hotels/${hotelId}/rooms`);
    return;
  }

  for (const room of targets) {
    const suggested = suggestRoomCode(room.name, taken);
    taken.add(suggested.toUpperCase());

    const response = await adminPageFetch(
      `${API_BASE_URL}/hotels/${encodeURIComponent(hotelId)}/room-categories/${encodeURIComponent(room.id)}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: suggested }),
      },
    );
    if (!response.ok) {
      const errBody = await response.text();
      console.error(
        `[hotels/rooms/autoFillEmptyRoomCodes] failed to patch room ${room.id}: HTTP ${response.status} ${errBody.slice(0, 200)}`,
      );
      // Continue with remaining rooms — don't abort the bulk operation.
    }
  }

  revalidatePath(`/hotels/${hotelId}/rooms`);
  revalidatePath(`/hotels/${hotelId}`);
}

export async function updateRoomType(hotelId: string, roomId: string, formData: FormData) {
  const name = trimOrUndefined(formData.get('name'));
  const code = trimOrUndefined(formData.get('code'));
  const description = trimOrUndefined(formData.get('description'));
  const isActive = formData.get('isActive') !== 'inactive';

  const response = await adminPageFetch(
    `${API_BASE_URL}/hotels/${encodeURIComponent(hotelId)}/room-categories/${encodeURIComponent(roomId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        code,
        description,
        isActive,
      }),
    },
  );

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Could not update room type: HTTP ${response.status} ${errBody.slice(0, 200)}`);
  }

  revalidatePath(`/hotels/${hotelId}/rooms`);
  revalidatePath(`/hotels/${hotelId}`);
  redirect(`/hotels/${hotelId}/rooms`);
}

export async function deleteRoomType(hotelId: string, roomId: string) {
  const response = await adminPageFetch(
    `${API_BASE_URL}/hotels/${encodeURIComponent(hotelId)}/room-categories/${encodeURIComponent(roomId)}`,
    { method: 'DELETE' },
  );

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Could not delete room type: HTTP ${response.status} ${errBody.slice(0, 200)}`);
  }

  revalidatePath(`/hotels/${hotelId}/rooms`);
  revalidatePath(`/hotels/${hotelId}`);
}
