'use server';

import { revalidatePath } from 'next/cache';
import { adminPageFetch } from '../../../../../lib/admin-server';

// Hotels Engine — contract meal plans Server Actions (PR-A9).
//
// Simpler shape than cancellation / child policy — meal plans are a
// flat list (no nested rules), one row per board type the contract
// offers (RO / BB / HB / FB / AI). Backend enforces uniqueness per
// (contract, code) so we don't need to dedupe client-side.
//
// Routes (NestJS, contract-meal-plans.controller.ts):
//   GET    /hotel-contracts/:contractId/meal-plans
//   POST   /hotel-contracts/:contractId/meal-plans
//   PATCH  /hotel-contracts/:contractId/meal-plans/:mealPlanId
//   DELETE /hotel-contracts/:contractId/meal-plans/:mealPlanId
//
// Reached through the existing /api/hotel-contracts/[id]/[...path]
// catch-all proxy. No proxy changes needed.

const API_BASE_URL = '/api';

const MEAL_PLAN_CODES = new Set(['RO', 'BB', 'HB', 'FB', 'AI']);

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
  if (!allowed.has(raw)) {
    throw new Error(`${label} must be one of ${[...allowed].join(', ')}.`);
  }
  return raw;
}

function revalidateMealPlanScope(hotelId: string, contractId: string) {
  revalidatePath(`/hotels/${hotelId}/contracts/${contractId}/meal-plans`);
  revalidatePath(`/hotels/${hotelId}/contracts/${contractId}`);
  revalidatePath(`/hotels/${hotelId}/contracts`);
}

export async function createMealPlan(
  hotelId: string,
  contractId: string,
  formData: FormData,
) {
  const code = parseEnum(formData.get('code'), 'Meal plan code', MEAL_PLAN_CODES);
  const isActive = formData.get('isActive') === 'on';
  const notes = optionalString(formData.get('notes'));

  const response = await adminPageFetch(
    `${API_BASE_URL}/hotel-contracts/${encodeURIComponent(contractId)}/meal-plans`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, isActive, notes }),
    },
  );

  if (!response.ok) {
    const errBody = await response.text();
    // Most likely failure: unique constraint on (contractId, code) — the
    // upstream returns 4xx with a message we surface verbatim so the
    // operator sees "code already exists" rather than a generic error.
    throw new Error(
      `Could not add meal plan: HTTP ${response.status} ${errBody.slice(0, 200)}`,
    );
  }

  revalidateMealPlanScope(hotelId, contractId);
}

export async function toggleMealPlanActive(
  hotelId: string,
  contractId: string,
  mealPlanId: string,
  nextActive: boolean,
) {
  const response = await adminPageFetch(
    `${API_BASE_URL}/hotel-contracts/${encodeURIComponent(contractId)}/meal-plans/${encodeURIComponent(mealPlanId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: nextActive }),
    },
  );

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(
      `Could not toggle meal plan: HTTP ${response.status} ${errBody.slice(0, 200)}`,
    );
  }

  revalidateMealPlanScope(hotelId, contractId);
}

export async function updateMealPlan(
  hotelId: string,
  contractId: string,
  mealPlanId: string,
  formData: FormData,
) {
  const code = parseEnum(formData.get('code'), 'Meal plan code', MEAL_PLAN_CODES);
  const isActive = formData.get('isActive') === 'on' || formData.get('isActive') === 'true';
  const notes = optionalString(formData.get('notes'));

  const response = await adminPageFetch(
    `${API_BASE_URL}/hotel-contracts/${encodeURIComponent(contractId)}/meal-plans/${encodeURIComponent(mealPlanId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, isActive, notes }),
    },
  );

  if (!response.ok) {
    const errBody = await response.text();
    // Likeliest failure: changing the code collides with the
    // (contractId, code) unique constraint — surfaced verbatim.
    throw new Error(
      `Could not update meal plan: HTTP ${response.status} ${errBody.slice(0, 200)}`,
    );
  }

  revalidateMealPlanScope(hotelId, contractId);
}

export async function deleteMealPlan(
  hotelId: string,
  contractId: string,
  mealPlanId: string,
) {
  const response = await adminPageFetch(
    `${API_BASE_URL}/hotel-contracts/${encodeURIComponent(contractId)}/meal-plans/${encodeURIComponent(mealPlanId)}`,
    { method: 'DELETE' },
  );

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(
      `Could not delete meal plan: HTTP ${response.status} ${errBody.slice(0, 200)}`,
    );
  }

  revalidateMealPlanScope(hotelId, contractId);
}
