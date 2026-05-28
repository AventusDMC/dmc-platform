'use server';

import { revalidatePath } from 'next/cache';
import { adminPageFetch } from '../../../../../lib/admin-server';

// Hotels Engine v2 — rate cell Server Actions (PR-A3, formerly scoped as A2).
//
// PR-A2 (per-contract seasons editor) was deferred — the schema stores
// seasons denormalized on each HotelRate row (seasonName + seasonFrom +
// seasonTo) rather than as a per-contract child table, so a real seasons
// editor would need a new HotelContractSeason model + migration + endpoints.
// Until that lands, operators address seasons directly via the seasonName
// field when creating a rate cell here.
//
// This action does pure validation + POST to the existing /hotel-rates
// endpoint. No backend changes. Mirrors createContract in the parent
// directory.

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

export async function createRate(
  hotelId: string,
  contractId: string,
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

  const response = await adminPageFetch(`${API_BASE_URL}/hotel-rates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contractId,
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
      `Could not create rate: HTTP ${response.status} ${errBody.slice(0, 200)}`,
    );
  }

  revalidatePath(`/hotels-v2/${hotelId}/contracts/${contractId}/rates`);
  revalidatePath(`/hotels-v2/${hotelId}/contracts/${contractId}`);
  revalidatePath(`/hotels-v2/${hotelId}/contracts`);
}
