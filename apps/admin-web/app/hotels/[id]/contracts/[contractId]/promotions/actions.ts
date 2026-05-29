'use server';

import { revalidatePath } from 'next/cache';
import { adminPageFetch } from '../../../../../lib/admin-server';

// Hotels Engine — promotions Server Actions (roadmap Phase 4).
//
// Drives the existing promotions engine, which had no UI. Promotions are
// a TOP-LEVEL resource (/promotions), not nested under the contract, and
// rules are embedded in the create/update payload (no per-rule
// endpoints). The backend update PRESERVES rules when `rules` is omitted
// and REPLACES them wholesale when `rules` is provided
// (promotions.service.ts update()).
//
// Routes (via the existing /api/promotions proxies):
//   POST   /promotions
//   PATCH  /promotions/:id
//   DELETE /promotions/:id
//
// Rule support here is a SINGLE optional applicability rule — covers the
// common cases (early-bird = booking-date window, long-stay = minStay,
// seasonal = travel-date window, room/board targeting). Promotions that
// already carry multiple rules are edited core-only (rules preserved);
// full multi-rule editing is a follow-up.

const API_BASE_URL = '/api';

const PROMOTION_TYPES = new Set(['PERCENTAGE_DISCOUNT', 'FIXED_DISCOUNT', 'STAY_PAY', 'FREE_NIGHT']);
const COMBINABILITY_MODES = new Set(['EXCLUSIVE', 'COMBINABLE', 'BEST_OF_GROUP']);
const BOARD_BASIS = new Set(['RO', 'BB', 'HB', 'FB', 'AI']);

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

function parseEnum(value: FormDataEntryValue | null, label: string, allowed: Set<string>): string {
  const raw = trimOrThrow(value, label).toUpperCase();
  if (!allowed.has(raw)) throw new Error(`${label} must be one of ${[...allowed].join(', ')}.`);
  return raw;
}

function optionalEnum(value: FormDataEntryValue | null, label: string, allowed: Set<string>): string | null {
  if (typeof value !== 'string') return null;
  const raw = value.trim().toUpperCase();
  if (!raw) return null;
  if (!allowed.has(raw)) throw new Error(`${label} must be one of ${[...allowed].join(', ')}.`);
  return raw;
}

function parseOptionalPositiveInt(value: FormDataEntryValue | null, label: string): number | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const n = Number(value.trim());
  if (!Number.isFinite(n) || n < 1 || !Number.isInteger(n)) {
    throw new Error(`${label} must be a whole number of 1 or more.`);
  }
  return n;
}

function parseOptionalNonNegativeNumber(value: FormDataEntryValue | null, label: string): number | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const n = Number(value.trim());
  if (!Number.isFinite(n) || n < 0) throw new Error(`${label} must be a non-negative number.`);
  return n;
}

function parseOptionalDate(value: FormDataEntryValue | null, label: string): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const date = new Date(`${value.trim()}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new Error(`${label} is not a valid date.`);
  return date.toISOString();
}

function parseOptionalInt(value: FormDataEntryValue | null, label: string, min = 0): number | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const n = Number(value.trim());
  if (!Number.isFinite(n) || n < min || !Number.isInteger(n)) {
    throw new Error(`${label} must be a whole number of ${min} or more.`);
  }
  return n;
}

function revalidatePromotionScope(hotelId: string, contractId: string) {
  revalidatePath(`/hotels/${hotelId}/contracts/${contractId}/promotions`);
  revalidatePath(`/hotels/${hotelId}/contracts/${contractId}`);
}

// Build the core promotion payload (everything except rules), validating
// the type-specific required fields exactly as the service does.
function readPromotionCore(formData: FormData) {
  const name = trimOrThrow(formData.get('name'), 'Name');
  const type = parseEnum(formData.get('type'), 'Promotion type', PROMOTION_TYPES);
  const combinabilityMode = parseEnum(formData.get('combinabilityMode'), 'Combinability', COMBINABILITY_MODES);
  const priority = parseOptionalInt(formData.get('priority'), 'Priority', 0) ?? 0;
  const isActive = formData.get('isActive') === 'on' || formData.get('isActive') === 'true';
  const notes = optionalString(formData.get('notes'));

  const value = parseOptionalNonNegativeNumber(formData.get('value'), 'Discount value');
  const stayPayNights = parseOptionalPositiveInt(formData.get('stayPayNights'), 'Stay nights');
  const payNights = parseOptionalPositiveInt(formData.get('payNights'), 'Pay nights');
  const freeNightCount = parseOptionalPositiveInt(formData.get('freeNightCount'), 'Free nights');

  if ((type === 'PERCENTAGE_DISCOUNT' || type === 'FIXED_DISCOUNT') && value == null) {
    throw new Error('Discount promotions need a value.');
  }
  if (type === 'PERCENTAGE_DISCOUNT' && value != null && value > 100) {
    throw new Error('A percentage discount cannot exceed 100.');
  }
  if (type === 'STAY_PAY') {
    if (stayPayNights == null || payNights == null) {
      throw new Error('Stay-pay promotions need both a stay-nights and a pay-nights value.');
    }
    if (payNights >= stayPayNights) {
      throw new Error('Pay nights must be fewer than stay nights (e.g. stay 4, pay 3).');
    }
  }
  if (type === 'FREE_NIGHT' && freeNightCount == null) {
    throw new Error('Free-night promotions need a free-night count.');
  }

  return { name, type, value, stayPayNights, payNights, freeNightCount, isActive, priority, combinabilityMode, notes };
}

// Read the single optional applicability rule. Returns null when every
// field is blank (→ the promotion applies with no restriction).
function readOptionalRule(formData: FormData) {
  const roomCategoryId = optionalString(formData.get('roomCategoryId'));
  const travelDateFrom = parseOptionalDate(formData.get('travelDateFrom'), 'Travel date from');
  const travelDateTo = parseOptionalDate(formData.get('travelDateTo'), 'Travel date to');
  const bookingDateFrom = parseOptionalDate(formData.get('bookingDateFrom'), 'Booking date from');
  const bookingDateTo = parseOptionalDate(formData.get('bookingDateTo'), 'Booking date to');
  const boardBasis = optionalEnum(formData.get('boardBasis'), 'Board basis', BOARD_BASIS);
  const minStay = parseOptionalPositiveInt(formData.get('minStay'), 'Minimum stay');

  const anySet =
    roomCategoryId || travelDateFrom || travelDateTo || bookingDateFrom || bookingDateTo || boardBasis || minStay;
  if (!anySet) return null;

  if (travelDateFrom && travelDateTo && new Date(travelDateFrom) > new Date(travelDateTo)) {
    throw new Error('Travel date from cannot be after travel date to.');
  }
  if (bookingDateFrom && bookingDateTo && new Date(bookingDateFrom) > new Date(bookingDateTo)) {
    throw new Error('Booking date from cannot be after booking date to.');
  }

  return { roomCategoryId, travelDateFrom, travelDateTo, bookingDateFrom, bookingDateTo, boardBasis, minStay, isActive: true };
}

export async function createPromotion(hotelId: string, contractId: string, formData: FormData) {
  const core = readPromotionCore(formData);
  const rule = readOptionalRule(formData);

  const response = await adminPageFetch(`${API_BASE_URL}/promotions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hotelContractId: contractId, ...core, rules: rule ? [rule] : [] }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Could not create promotion: HTTP ${response.status} ${errBody.slice(0, 200)}`);
  }

  revalidatePromotionScope(hotelId, contractId);
}

export async function updatePromotion(
  hotelId: string,
  contractId: string,
  promotionId: string,
  formData: FormData,
) {
  const core = readPromotionCore(formData);
  // manageRule="1" → the edit form exposed the single-rule fields (the
  // promotion had 0 or 1 rules), so we send rules (replacing). "0" →
  // omit rules entirely, which the backend preserves untouched (used for
  // promotions that already carry multiple rules).
  const manageRule = formData.get('manageRule') === '1';
  const body: Record<string, unknown> = { ...core };
  if (manageRule) {
    const rule = readOptionalRule(formData);
    body.rules = rule ? [rule] : [];
  }

  const response = await adminPageFetch(`${API_BASE_URL}/promotions/${encodeURIComponent(promotionId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Could not update promotion: HTTP ${response.status} ${errBody.slice(0, 200)}`);
  }

  revalidatePromotionScope(hotelId, contractId);
}

export async function deletePromotion(hotelId: string, contractId: string, promotionId: string) {
  const response = await adminPageFetch(`${API_BASE_URL}/promotions/${encodeURIComponent(promotionId)}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Could not delete promotion: HTTP ${response.status} ${errBody.slice(0, 200)}`);
  }

  revalidatePromotionScope(hotelId, contractId);
}
