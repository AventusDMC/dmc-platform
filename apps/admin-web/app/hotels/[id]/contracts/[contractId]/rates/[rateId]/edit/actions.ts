'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { adminPageFetch } from '../../../../../../../lib/admin-server';

// Hotels Engine — rate cell edit / delete Server Actions (PR-A4).
//
// Mirrors createRate in the parent /rates directory. updateRate PATCHes
// the existing /hotel-rates/:id endpoint; deleteRate hits DELETE on the
// same. Both pure UI integration — no backend changes.

const API_BASE_URL = '/api';

const OCCUPANCY_TYPES = new Set(['SGL', 'DBL', 'TPL']);
const MEAL_PLANS = new Set(['RO', 'BB', 'HB', 'FB', 'AI']);
const PRICING_BASES = new Set(['PER_ROOM', 'PER_PERSON']);

function trimOrThrow(value: FormDataEntryValue | null, label: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${label} is required.`);
  }
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} is required.`);
  return trimmed;
}

function parseDateOrThrow(value: FormDataEntryValue | null, label: string): string {
  const raw = trimOrThrow(value, label);
  const date = new Date(`${raw}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${label} is not a valid date.`);
  }
  return date.toISOString();
}

function parseEnum(value: FormDataEntryValue | null, label: string, allowed: Set<string>): string {
  const raw = trimOrThrow(value, label).toUpperCase();
  if (!allowed.has(raw)) {
    throw new Error(`${label} must be one of ${[...allowed].join(', ')}.`);
  }
  return raw;
}

function parsePositiveNumber(value: FormDataEntryValue | null, label: string): number {
  const raw = trimOrThrow(value, label);
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`${label} must be a non-negative number.`);
  }
  return n;
}

function revalidateRateScope(hotelId: string, contractId: string, rateId?: string) {
  revalidatePath(`/hotels/${hotelId}/contracts/${contractId}/rates`);
  revalidatePath(`/hotels/${hotelId}/contracts/${contractId}`);
  revalidatePath(`/hotels/${hotelId}/contracts`);
  if (rateId) {
    revalidatePath(`/hotels/${hotelId}/contracts/${contractId}/rates/${rateId}/edit`);
  }
}

export async function updateRate(
  hotelId: string,
  contractId: string,
  rateId: string,
  formData: FormData,
) {
  const roomCategoryId = trimOrThrow(formData.get('roomCategoryId'), 'Room type');
  const occupancyType = parseEnum(formData.get('occupancyType'), 'Occupancy', OCCUPANCY_TYPES);
  const mealPlan = parseEnum(formData.get('mealPlan'), 'Meal plan', MEAL_PLANS);
  const seasonName = trimOrThrow(formData.get('seasonName'), 'Season name');
  const seasonFrom = parseDateOrThrow(formData.get('seasonFrom'), 'Season from');
  const seasonTo = parseDateOrThrow(formData.get('seasonTo'), 'Season to');
  const pricingBasis = parseEnum(formData.get('pricingBasis'), 'Pricing basis', PRICING_BASES);
  const currency = trimOrThrow(formData.get('currency'), 'Currency').toUpperCase();
  const cost = parsePositiveNumber(formData.get('cost'), 'Cost');

  if (new Date(seasonTo) < new Date(seasonFrom)) {
    throw new Error('"Season to" must be on or after "Season from".');
  }
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new Error('Currency must be a 3-letter ISO code (e.g. USD, JOD, AED, EUR).');
  }

  const response = await adminPageFetch(`${API_BASE_URL}/hotel-rates/${rateId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      roomCategoryId,
      occupancyType,
      mealPlan,
      seasonName,
      seasonFrom,
      seasonTo,
      pricingBasis,
      currency,
      cost,
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(
      `Could not update rate: HTTP ${response.status} ${errBody.slice(0, 200)}`,
    );
  }

  revalidateRateScope(hotelId, contractId, rateId);
  redirect(`/hotels/${hotelId}/contracts/${contractId}/rates`);
}

export async function deleteRate(
  hotelId: string,
  contractId: string,
  rateId: string,
) {
  const response = await adminPageFetch(`${API_BASE_URL}/hotel-rates/${rateId}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(
      `Could not delete rate: HTTP ${response.status} ${errBody.slice(0, 200)}`,
    );
  }

  revalidateRateScope(hotelId, contractId);
  redirect(`/hotels/${hotelId}/contracts/${contractId}/rates`);
}
