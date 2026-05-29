'use server';

import { revalidatePath } from 'next/cache';
import { adminPageFetch } from '../../../../../lib/admin-server';

// Hotels Engine — allotment (inventory) Server Actions.
//
// Allotments are the committed room blocks per room category + date
// range: how many rooms are held, the release deadline, and a stop-sale
// flag. The backend (hotel-contracts.controller.ts) already exposes the
// full CRUD; this just validates input and forwards.
//
// Routes (reached via the /api/hotel-contracts/[id]/[...path] catch-all):
//   POST   /hotel-contracts/:id/allotments
//   PATCH  /hotel-contracts/:id/allotments/:allotmentId
//   DELETE /hotel-contracts/:id/allotments/:allotmentId
//
// Validation mirrors the service (hotel-contracts.service.ts
// validateAllotmentInput): dateFrom <= dateTo, non-negative counts, and
// dates within the contract validity range (the latter enforced
// server-side; we surface its error verbatim).

const API_BASE_URL = '/api';

function trimOrThrow(value: FormDataEntryValue | null, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} is required.`);
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} is required.`);
  return trimmed;
}

function optionalString(value: FormDataEntryValue | null): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function parseDateOrThrow(value: FormDataEntryValue | null, label: string): string {
  const raw = trimOrThrow(value, label);
  // Plain YYYY-MM-DD from <input type="date">. Re-emit as ISO at noon
  // UTC, matching the contract-validity convention so the within-range
  // check on the backend compares like-for-like.
  const date = new Date(`${raw}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${label} is not a valid date.`);
  }
  return date.toISOString();
}

function parseNonNegativeInt(value: FormDataEntryValue | null, label: string): number {
  const raw = trimOrThrow(value, label);
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
  return n;
}

function revalidateAllotmentScope(hotelId: string, contractId: string) {
  revalidatePath(`/hotels/${hotelId}/contracts/${contractId}/allotments`);
  revalidatePath(`/hotels/${hotelId}/contracts/${contractId}`);
  revalidatePath(`/hotels/${hotelId}/contracts`);
}

// Shared field parsing for create + edit. `requireRoom` is true on
// create (the dropdown is always present) and on edit (the row carries
// its current room).
function readAllotmentFields(formData: FormData) {
  const roomCategoryId = trimOrThrow(formData.get('roomCategoryId'), 'Room category');
  const dateFrom = parseDateOrThrow(formData.get('dateFrom'), 'Date from');
  const dateTo = parseDateOrThrow(formData.get('dateTo'), 'Date to');
  const allotment = parseNonNegativeInt(formData.get('allotment'), 'Room count');
  const releaseDays = parseNonNegativeInt(formData.get('releaseDays'), 'Release days');
  const stopSale = formData.get('stopSale') === 'on' || formData.get('stopSale') === 'true';
  const notes = optionalString(formData.get('notes'));

  if (new Date(dateTo) < new Date(dateFrom)) {
    throw new Error('"Date to" must be on or after "Date from".');
  }

  return { roomCategoryId, dateFrom, dateTo, allotment, releaseDays, stopSale, notes };
}

export async function createAllotment(hotelId: string, contractId: string, formData: FormData) {
  const fields = readAllotmentFields(formData);

  const response = await adminPageFetch(
    `${API_BASE_URL}/hotel-contracts/${encodeURIComponent(contractId)}/allotments`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...fields, isActive: true }),
    },
  );

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Could not add allotment: HTTP ${response.status} ${errBody.slice(0, 200)}`);
  }

  revalidateAllotmentScope(hotelId, contractId);
}

export async function updateAllotment(
  hotelId: string,
  contractId: string,
  allotmentId: string,
  formData: FormData,
) {
  const fields = readAllotmentFields(formData);
  const isActive = formData.get('isActive') === 'on' || formData.get('isActive') === 'true';

  const response = await adminPageFetch(
    `${API_BASE_URL}/hotel-contracts/${encodeURIComponent(contractId)}/allotments/${encodeURIComponent(allotmentId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...fields, isActive }),
    },
  );

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Could not update allotment: HTTP ${response.status} ${errBody.slice(0, 200)}`);
  }

  revalidateAllotmentScope(hotelId, contractId);
}

export async function deleteAllotment(hotelId: string, contractId: string, allotmentId: string) {
  const response = await adminPageFetch(
    `${API_BASE_URL}/hotel-contracts/${encodeURIComponent(contractId)}/allotments/${encodeURIComponent(allotmentId)}`,
    { method: 'DELETE' },
  );

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Could not delete allotment: HTTP ${response.status} ${errBody.slice(0, 200)}`);
  }

  revalidateAllotmentScope(hotelId, contractId);
}
