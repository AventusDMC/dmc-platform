'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { adminPageFetch } from '../../../lib/admin-server';

// Hotels Engine v2 — Server Actions for room type CRUD.
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

export async function createRoomType(hotelId: string, formData: FormData) {
  const name = trimOrUndefined(formData.get('name'));
  if (!name) {
    // Defensive — the form has `required` on the name input, but
    // belt-and-braces here.
    throw new Error('Room type name is required.');
  }
  const code = trimOrUndefined(formData.get('code'));
  const description = trimOrUndefined(formData.get('description'));
  const isActive = formData.get('isActive') !== 'inactive';

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

  revalidatePath(`/hotels-v2/${hotelId}/rooms`);
  revalidatePath(`/hotels-v2/${hotelId}`);
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

  revalidatePath(`/hotels-v2/${hotelId}/rooms`);
  revalidatePath(`/hotels-v2/${hotelId}`);
  redirect(`/hotels-v2/${hotelId}/rooms`);
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

  revalidatePath(`/hotels-v2/${hotelId}/rooms`);
  revalidatePath(`/hotels-v2/${hotelId}`);
}
