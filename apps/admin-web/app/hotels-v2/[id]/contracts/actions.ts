'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { adminPageFetch } from '../../../lib/admin-server';

// Hotels Engine v2 — contracts Server Actions.
//
// PR-A1 wires the minimal create flow (name + validity + currency). The
// existing /hotel-contracts POST endpoint handles everything; we just
// validate input + revalidate the list + redirect to the contract
// detail page on success.

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
  // UTC to dodge any timezone surprises.
  const date = new Date(`${raw}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${label} is not a valid date.`);
  }
  return date.toISOString();
}

export async function createContract(hotelId: string, formData: FormData) {
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

  const response = await adminPageFetch(`${API_BASE_URL}/hotel-contracts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hotelId, name, validFrom, validTo, currency }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(
      `Could not create contract: HTTP ${response.status} ${errBody.slice(0, 200)}`,
    );
  }

  const created = (await response.json()) as { id: string };
  revalidatePath(`/hotels-v2/${hotelId}/contracts`);
  revalidatePath(`/hotels-v2/${hotelId}`);
  redirect(`/hotels-v2/${hotelId}/contracts/${created.id}`);
}
