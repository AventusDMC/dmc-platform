'use server';

import { revalidatePath } from 'next/cache';
import { adminPageFetch } from '../../../../../lib/admin-server';

// Hotels Engine — rate cell Server Actions (PR-A3, formerly scoped as A2).
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
const TOURISM_FEE_MODES = new Set(['PER_NIGHT_PER_PERSON', 'PER_NIGHT_PER_ROOM']);

// Optional non-negative number → value or null when blank.
function optionalNonNegativeNumber(value: FormDataEntryValue | null, label: string): number | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const n = Number(value.trim());
  if (!Number.isFinite(n) || n < 0) throw new Error(`${label} must be a non-negative number.`);
  return n;
}

function optionalEnum(value: FormDataEntryValue | null, label: string, allowed: Set<string>): string | null {
  if (typeof value !== 'string') return null;
  const raw = value.trim().toUpperCase();
  if (!raw) return null;
  if (!allowed.has(raw)) throw new Error(`${label} must be one of ${[...allowed].join(', ')}.`);
  return raw;
}

// Shared parse of the tax / service-charge / tourism-fee inputs (used by
// create + edit). The backend stores these per-rate; the pricing engine
// applies them. "Incl" flags say net (added on top) vs gross (in the cost).
function readRateTaxFields(formData: FormData) {
  const salesTaxPercent = optionalNonNegativeNumber(formData.get('salesTaxPercent'), 'Sales tax %') ?? 0;
  const salesTaxIncluded = formData.get('salesTaxIncluded') === 'on' || formData.get('salesTaxIncluded') === 'true';
  const serviceChargePercent = optionalNonNegativeNumber(formData.get('serviceChargePercent'), 'Service charge %') ?? 0;
  const serviceChargeIncluded =
    formData.get('serviceChargeIncluded') === 'on' || formData.get('serviceChargeIncluded') === 'true';
  const tourismFeeAmount = optionalNonNegativeNumber(formData.get('tourismFeeAmount'), 'Tourism fee');
  const tourismFeeCurrencyRaw = formData.get('tourismFeeCurrency');
  const tourismFeeCurrency =
    typeof tourismFeeCurrencyRaw === 'string' && tourismFeeCurrencyRaw.trim()
      ? tourismFeeCurrencyRaw.trim().toUpperCase()
      : null;
  const tourismFeeMode = optionalEnum(formData.get('tourismFeeMode'), 'Tourism fee mode', TOURISM_FEE_MODES);
  if (tourismFeeCurrency && !/^[A-Z]{3}$/.test(tourismFeeCurrency)) {
    throw new Error('Tourism fee currency must be a 3-letter ISO code.');
  }
  return {
    salesTaxPercent,
    salesTaxIncluded,
    serviceChargePercent,
    serviceChargeIncluded,
    tourismFeeAmount,
    tourismFeeCurrency,
    tourismFeeMode,
  };
}

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
  const tax = readRateTaxFields(formData);

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
      ...tax,
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(
      `Could not create rate: HTTP ${response.status} ${errBody.slice(0, 200)}`,
    );
  }

  revalidatePath(`/hotels/${hotelId}/contracts/${contractId}/rates`);
  revalidatePath(`/hotels/${hotelId}/contracts/${contractId}`);
  revalidatePath(`/hotels/${hotelId}/contracts`);
}
