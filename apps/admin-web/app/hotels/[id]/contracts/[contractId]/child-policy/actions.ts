'use server';

import { revalidatePath } from 'next/cache';
import { adminPageFetch } from '../../../../../lib/admin-server';

// Hotels Engine — child policy Server Actions (PR-A8).
//
// Same structural pattern as the cancellation policy (PR-A7): a single
// policy row per contract carrying a list of age-banded charge rules.
// PUT upserts the header; POST/DELETE manage individual bands.
//
// Routes (NestJS, contract-child-policy.controller.ts):
//   PUT    /hotel-contracts/:contractId/child-policy
//   POST   /hotel-contracts/:contractId/child-policy/bands
//   PATCH  /hotel-contracts/:contractId/child-policy/bands/:bandId
//   DELETE /hotel-contracts/:contractId/child-policy/bands/:bandId
//
// Reached through the existing /api/hotel-contracts/[id]/[...path]
// catch-all proxy. PUT was added to the catch-all in PR-A7.

const API_BASE_URL = '/api';

const CHARGE_BASES = new Set(['FREE', 'PERCENT_OF_ADULT', 'FIXED_AMOUNT']);

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

function parseNonNegativeInt(value: FormDataEntryValue | null, label: string): number {
  const raw = trimOrThrow(value, label);
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
  return n;
}

function parseOptionalNumber(value: FormDataEntryValue | null, label: string): number | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`${label} must be a non-negative number.`);
  }
  return n;
}

function revalidateChildPolicyScope(hotelId: string, contractId: string) {
  revalidatePath(`/hotels/${hotelId}/contracts/${contractId}/child-policy`);
  revalidatePath(`/hotels/${hotelId}/contracts/${contractId}`);
  revalidatePath(`/hotels/${hotelId}/contracts`);
}

export async function upsertPolicy(
  hotelId: string,
  contractId: string,
  formData: FormData,
) {
  const infantMaxAge = parseNonNegativeInt(formData.get('infantMaxAge'), 'Infant max age');
  const childMaxAge = parseNonNegativeInt(formData.get('childMaxAge'), 'Child max age');
  const notes = optionalString(formData.get('notes'));

  // Infant max must be strictly less than child max — otherwise the age
  // bands collapse and the quote engine can't decide which rate applies.
  if (infantMaxAge >= childMaxAge) {
    throw new Error('Infant max age must be less than child max age.');
  }
  if (childMaxAge > 25) {
    throw new Error('Child max age over 25 looks like a typo — please double-check.');
  }

  const response = await adminPageFetch(
    `${API_BASE_URL}/hotel-contracts/${encodeURIComponent(contractId)}/child-policy`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ infantMaxAge, childMaxAge, notes }),
    },
  );

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(
      `Could not save child policy: HTTP ${response.status} ${errBody.slice(0, 200)}`,
    );
  }

  revalidateChildPolicyScope(hotelId, contractId);
}

export async function createBand(
  hotelId: string,
  contractId: string,
  formData: FormData,
) {
  const label = trimOrThrow(formData.get('label'), 'Band label');
  const minAge = parseNonNegativeInt(formData.get('minAge'), 'Min age');
  const maxAge = parseNonNegativeInt(formData.get('maxAge'), 'Max age');
  const chargeBasis = parseEnum(formData.get('chargeBasis'), 'Charge basis', CHARGE_BASES);
  // FREE bands carry no numeric value; the others do.
  const rawChargeValue = parseOptionalNumber(formData.get('chargeValue'), 'Charge value');
  const chargeValue = chargeBasis === 'FREE' ? null : rawChargeValue;
  const notes = optionalString(formData.get('notes'));

  if (minAge > maxAge) {
    throw new Error('Min age must be less than or equal to max age.');
  }
  if (chargeBasis !== 'FREE' && chargeValue === null) {
    throw new Error('This charge basis requires a numeric value.');
  }
  if (chargeBasis === 'PERCENT_OF_ADULT' && chargeValue !== null && chargeValue > 100) {
    throw new Error('Percent-of-adult charge cannot exceed 100.');
  }

  const response = await adminPageFetch(
    `${API_BASE_URL}/hotel-contracts/${encodeURIComponent(contractId)}/child-policy/bands`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        label,
        minAge,
        maxAge,
        chargeBasis,
        chargeValue,
        isActive: true,
        notes,
      }),
    },
  );

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(
      `Could not add child policy band: HTTP ${response.status} ${errBody.slice(0, 200)}`,
    );
  }

  revalidateChildPolicyScope(hotelId, contractId);
}

export async function deleteBand(
  hotelId: string,
  contractId: string,
  bandId: string,
) {
  const response = await adminPageFetch(
    `${API_BASE_URL}/hotel-contracts/${encodeURIComponent(contractId)}/child-policy/bands/${encodeURIComponent(bandId)}`,
    { method: 'DELETE' },
  );

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(
      `Could not delete child policy band: HTTP ${response.status} ${errBody.slice(0, 200)}`,
    );
  }

  revalidateChildPolicyScope(hotelId, contractId);
}
