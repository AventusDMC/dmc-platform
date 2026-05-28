'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { adminPageFetch } from '../../../../../../../lib/admin-server';

// Hotels Engine v2 — supplement edit Server Action (PR-A6).
//
// Mirrors createSupplement in the parent /supplements directory but
// PATCHes via the existing /hotel-contracts/:contractId/supplements/:id
// upstream (routed through the catch-all proxy). Pure UI integration.

const API_BASE_URL = '/api';

const SUPPLEMENT_TYPES = new Set([
  'EXTRA_BREAKFAST',
  'EXTRA_LUNCH',
  'EXTRA_DINNER',
  'GALA_DINNER',
  'EXTRA_BED',
]);
const CHARGE_BASES = new Set(['PER_PERSON', 'PER_ROOM', 'PER_STAY', 'PER_NIGHT']);

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

function parsePositiveNumber(value: FormDataEntryValue | null, label: string): number {
  const raw = trimOrThrow(value, label);
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`${label} must be a non-negative number.`);
  }
  return n;
}

export async function updateSupplement(
  hotelId: string,
  contractId: string,
  supplementId: string,
  formData: FormData,
) {
  const roomCategoryRaw = optionalString(formData.get('roomCategoryId'));
  const type = parseEnum(formData.get('type'), 'Supplement type', SUPPLEMENT_TYPES);
  const chargeBasis = parseEnum(formData.get('chargeBasis'), 'Charge basis', CHARGE_BASES);
  const amount = parsePositiveNumber(formData.get('amount'), 'Amount');
  const currency = trimOrThrow(formData.get('currency'), 'Currency').toUpperCase();
  const isMandatory = formData.get('isMandatory') === 'on';
  const notes = optionalString(formData.get('notes'));

  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new Error('Currency must be a 3-letter ISO code (e.g. USD, JOD, AED, EUR).');
  }

  const response = await adminPageFetch(
    `${API_BASE_URL}/hotel-contracts/${encodeURIComponent(contractId)}/supplements/${encodeURIComponent(supplementId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roomCategoryId: roomCategoryRaw,
        type,
        chargeBasis,
        amount,
        currency,
        isMandatory,
        notes,
      }),
    },
  );

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(
      `Could not update supplement: HTTP ${response.status} ${errBody.slice(0, 200)}`,
    );
  }

  revalidatePath(`/hotels-v2/${hotelId}/contracts/${contractId}/supplements`);
  revalidatePath(`/hotels-v2/${hotelId}/contracts/${contractId}/supplements/${supplementId}/edit`);
  revalidatePath(`/hotels-v2/${hotelId}/contracts/${contractId}`);
  revalidatePath(`/hotels-v2/${hotelId}/contracts`);
  redirect(`/hotels-v2/${hotelId}/contracts/${contractId}/supplements`);
}
