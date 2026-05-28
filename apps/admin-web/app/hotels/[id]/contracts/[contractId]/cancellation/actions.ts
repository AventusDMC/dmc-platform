'use server';

import { revalidatePath } from 'next/cache';
import { adminPageFetch } from '../../../../../lib/admin-server';

// Hotels Engine — cancellation policy Server Actions (PR-A7).
//
// The policy itself is a single row per contract — upserted via PUT —
// and carries a list of cancellation rules (cancel-windows + penalty
// amounts). The backend handles create/update/null cases internally so
// the action layer just validates and forwards.
//
// Routes (NestJS, contract-policies.controller.ts):
//   PUT    /hotel-contracts/:contractId/cancellation-policy
//   POST   /hotel-contracts/:contractId/cancellation-policy/rules
//   PATCH  /hotel-contracts/:contractId/cancellation-policy/rules/:ruleId
//   DELETE /hotel-contracts/:contractId/cancellation-policy/rules/:ruleId
//
// Reached through the existing /api/hotel-contracts/[id]/[...path]
// catch-all proxy (this PR also adds PUT to that catch-all).

const API_BASE_URL = '/api';

const PENALTY_TYPES = new Set(['PERCENT', 'NIGHTS', 'FULL_STAY', 'FIXED']);
const DEADLINE_UNITS = new Set(['DAYS', 'HOURS']);

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

function optionalEnum(value: FormDataEntryValue | null, label: string, allowed: Set<string>): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toUpperCase();
  if (!trimmed) return null;
  if (!allowed.has(trimmed)) {
    throw new Error(`${label} must be one of ${[...allowed].join(', ')}.`);
  }
  return trimmed;
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

function revalidateCancellationScope(hotelId: string, contractId: string) {
  revalidatePath(`/hotels/${hotelId}/contracts/${contractId}/cancellation`);
  revalidatePath(`/hotels/${hotelId}/contracts/${contractId}`);
  revalidatePath(`/hotels/${hotelId}/contracts`);
}

export async function upsertPolicy(
  hotelId: string,
  contractId: string,
  formData: FormData,
) {
  const summary = optionalString(formData.get('summary'));
  const notes = optionalString(formData.get('notes'));
  const noShowPenaltyType = optionalEnum(formData.get('noShowPenaltyType'), 'No-show penalty type', PENALTY_TYPES);
  const noShowPenaltyValue = parseOptionalNumber(formData.get('noShowPenaltyValue'), 'No-show penalty value');

  // The backend tolerates a type without a value, but a value without a
  // type is meaningless. Surface the inconsistency before sending.
  if (noShowPenaltyValue !== null && noShowPenaltyType === null) {
    throw new Error('Pick a no-show penalty type to go with the value (or clear the value).');
  }

  const response = await adminPageFetch(
    `${API_BASE_URL}/hotel-contracts/${encodeURIComponent(contractId)}/cancellation-policy`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        summary,
        notes,
        noShowPenaltyType,
        noShowPenaltyValue,
      }),
    },
  );

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(
      `Could not save cancellation policy: HTTP ${response.status} ${errBody.slice(0, 200)}`,
    );
  }

  revalidateCancellationScope(hotelId, contractId);
}

export async function createRule(
  hotelId: string,
  contractId: string,
  formData: FormData,
) {
  const windowFromValue = parseNonNegativeInt(formData.get('windowFromValue'), 'Window start');
  const windowToValue = parseNonNegativeInt(formData.get('windowToValue'), 'Window end');
  const deadlineUnit = parseEnum(formData.get('deadlineUnit'), 'Deadline unit', DEADLINE_UNITS);
  const penaltyType = parseEnum(formData.get('penaltyType'), 'Penalty type', PENALTY_TYPES);
  // FULL_STAY doesn't take a numeric value; the rest do.
  const rawPenaltyValue = parseOptionalNumber(formData.get('penaltyValue'), 'Penalty value');
  const penaltyValue = penaltyType === 'FULL_STAY' ? null : rawPenaltyValue;
  const notes = optionalString(formData.get('notes'));

  if (windowFromValue < windowToValue) {
    throw new Error(
      'Window start must be greater than or equal to window end (rules count down toward arrival, e.g. "30 → 14 days before arrival").',
    );
  }
  if (penaltyType !== 'FULL_STAY' && penaltyValue === null) {
    throw new Error('This penalty type requires a numeric value.');
  }
  if (penaltyType === 'PERCENT' && penaltyValue !== null && penaltyValue > 100) {
    throw new Error('Percent penalty cannot exceed 100.');
  }

  const response = await adminPageFetch(
    `${API_BASE_URL}/hotel-contracts/${encodeURIComponent(contractId)}/cancellation-policy/rules`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        windowFromValue,
        windowToValue,
        deadlineUnit,
        penaltyType,
        penaltyValue,
        isActive: true,
        notes,
      }),
    },
  );

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(
      `Could not add cancellation rule: HTTP ${response.status} ${errBody.slice(0, 200)}`,
    );
  }

  revalidateCancellationScope(hotelId, contractId);
}

export async function deleteRule(
  hotelId: string,
  contractId: string,
  ruleId: string,
) {
  const response = await adminPageFetch(
    `${API_BASE_URL}/hotel-contracts/${encodeURIComponent(contractId)}/cancellation-policy/rules/${encodeURIComponent(ruleId)}`,
    { method: 'DELETE' },
  );

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(
      `Could not delete cancellation rule: HTTP ${response.status} ${errBody.slice(0, 200)}`,
    );
  }

  revalidateCancellationScope(hotelId, contractId);
}
