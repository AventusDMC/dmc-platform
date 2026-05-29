'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { adminPageFetch } from '../../../../../lib/admin-server';

// Hotels Engine — contract master-data edit Server Action.
//
// Mirrors the create flow (../../actions.ts createContract) but PATCHes
// the existing contract. The /hotel-contracts/:id PATCH endpoint already
// accepts name / validFrom / validTo / currency; this just validates the
// same way, then revalidates the affected pages and returns to the
// contract detail page. Editing master data was previously impossible in
// v2 — you could create a contract but never rename it or fix its dates.

const API_BASE_URL = '/api';

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
  // Plain YYYY-MM-DD from <input type="date">. Re-emit as ISO at noon
  // UTC to dodge any timezone surprises (same convention as create).
  const date = new Date(`${raw}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${label} is not a valid date.`);
  }
  return date.toISOString();
}

export async function updateContract(hotelId: string, contractId: string, formData: FormData) {
  const name = trimOrThrow(formData.get('name'), 'Contract name');
  const validFrom = parseDateOrThrow(formData.get('validFrom'), 'Valid from');
  const validTo = parseDateOrThrow(formData.get('validTo'), 'Valid to');
  const currency = trimOrThrow(formData.get('currency'), 'Currency').toUpperCase();

  if (new Date(validTo) < new Date(validFrom)) {
    throw new Error('"Valid to" must be on or after "Valid from".');
  }
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new Error('Currency must be a 3-letter ISO code (e.g. USD, JOD, AED, EUR).');
  }

  const response = await adminPageFetch(
    `${API_BASE_URL}/hotel-contracts/${encodeURIComponent(contractId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, validFrom, validTo, currency }),
    },
  );

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(
      `Could not update contract: HTTP ${response.status} ${errBody.slice(0, 200)}`,
    );
  }

  revalidatePath(`/hotels/${hotelId}/contracts/${contractId}`);
  revalidatePath(`/hotels/${hotelId}/contracts`);
  revalidatePath(`/hotels/${hotelId}`);
  redirect(`/hotels/${hotelId}/contracts/${contractId}`);
}
