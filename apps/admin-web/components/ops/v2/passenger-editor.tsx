'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { PaxRowVM } from '../../../app/operations/v2/ops-pax-rooming-vm';
import {
  ALLOWED_PASSENGER_FIELDS,
  buildPassengerCreateRequest,
  buildPassengerDeleteRequest,
  buildPassengerUpdateRequest,
  buildSetLeadRequest,
  resolvePassengerErrorMessage,
  type PassengerMutationRequest,
} from '../../../app/operations/v2/ops-passenger-request';

/**
 * Booking Operations V2 — passenger editor (PR-2b, flag-gated by the caller).
 *
 * Editable fields are the non-PII allowlist ONLY (name/title/nationality/flights/
 * notes). Passport, DOB, gender, entry point, visa, and emergency contacts are
 * intentionally absent — PR-3 owns PII editing. The lead is changed only via the
 * dedicated Set-lead action (never through create/update). Mutations go through
 * the V2 JSON proxies and, on success, `router.refresh()` re-fetches server truth
 * so the readiness strip + manifest update. No optimistic local data mutation.
 */

type FieldValues = Record<string, string>;

const FIELD_LABELS: Record<string, string> = {
  firstName: 'First name',
  lastName: 'Last name',
  title: 'Title',
  nationality: 'Nationality',
  arrivalFlight: 'Arrival flight',
  departureFlight: 'Departure flight',
  dietaryNotes: 'Dietary notes',
  roomingNotes: 'Rooming notes',
};

const REQUIRED_FIELDS = new Set(['firstName', 'lastName']);

function emptyValues(): FieldValues {
  const values: FieldValues = {};
  for (const field of ALLOWED_PASSENGER_FIELDS) values[field] = '';
  return values;
}

function valuesFromPassenger(p: PaxRowVM): FieldValues {
  return {
    firstName: p.firstName ?? '',
    lastName: p.lastName ?? '',
    title: p.title ?? '',
    nationality: p.nationality ?? '',
    arrivalFlight: p.arrivalFlight ?? '',
    departureFlight: p.departureFlight ?? '',
    dietaryNotes: p.dietaryNotes ?? '',
    roomingNotes: p.roomingNotes ?? '',
  };
}

/** Pure error banner — exported so the inline-error rendering is render-testable. */
export function PassengerEditorError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
    >
      {message}
    </p>
  );
}

function PassengerFields({
  values,
  disabled,
  onChange,
}: {
  values: FieldValues;
  disabled: boolean;
  onChange: (field: string, value: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {ALLOWED_PASSENGER_FIELDS.map((field) => (
        <label key={field} className="flex flex-col gap-1 text-xs text-muted-foreground">
          <span>
            {FIELD_LABELS[field]}
            {REQUIRED_FIELDS.has(field) ? ' *' : ''}
          </span>
          <input
            name={field}
            aria-label={FIELD_LABELS[field]}
            value={values[field] ?? ''}
            required={REQUIRED_FIELDS.has(field)}
            disabled={disabled}
            onChange={(e) => onChange(field, e.target.value)}
            className="rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground"
          />
        </label>
      ))}
    </div>
  );
}

export function PassengerEditor({ bookingId, passengers }: { bookingId: string; passengers: PaxRowVM[] }) {
  const router = useRouter();
  const [addValues, setAddValues] = useState<FieldValues>(emptyValues);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<FieldValues>(emptyValues);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(req: PassengerMutationRequest): Promise<boolean> {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(req.url, {
        method: req.method,
        headers: req.body ? { 'Content-Type': 'application/json' } : undefined,
        body: req.body ? JSON.stringify(req.body) : undefined,
        cache: 'no-store',
      });
      if (!res.ok) {
        let json: unknown = null;
        try {
          json = await res.json();
        } catch {
          /* keep the fallback message */
        }
        setError(resolvePassengerErrorMessage(json));
        return false;
      }
      return true;
    } catch {
      setError('Could not reach the server. Please try again.');
      return false;
    } finally {
      setSubmitting(false);
    }
  }

  async function onAdd() {
    if (!addValues.firstName.trim() || !addValues.lastName.trim()) {
      setError('First name and last name are required.');
      return;
    }
    if (await run(buildPassengerCreateRequest(bookingId, addValues))) {
      setAddValues(emptyValues());
      router.refresh();
    }
  }

  function startEdit(p: PaxRowVM) {
    setEditingId(p.id);
    setEditValues(valuesFromPassenger(p));
    setError(null);
  }

  async function onUpdate(id: string) {
    if (!editValues.firstName.trim() || !editValues.lastName.trim()) {
      setError('First name and last name are required.');
      return;
    }
    if (await run(buildPassengerUpdateRequest(bookingId, id, editValues))) {
      setEditingId(null);
      router.refresh();
    }
  }

  async function onDelete(id: string) {
    if (await run(buildPassengerDeleteRequest(bookingId, id))) {
      router.refresh();
    }
  }

  async function onSetLead(id: string) {
    if (await run(buildSetLeadRequest(bookingId, id))) {
      router.refresh();
    }
  }

  return (
    <div className="space-y-4">
      <PassengerEditorError message={error} />

      <ul className="divide-y divide-border rounded-lg border border-border">
        {passengers.length === 0 ? (
          <li className="px-3 py-4 text-center text-xs text-muted-foreground">No passengers yet. Add one below.</li>
        ) : (
          passengers.map((p) => (
            <li key={p.id} className="px-3 py-2">
              {editingId === p.id ? (
                <div className="space-y-2">
                  <PassengerFields
                    values={editValues}
                    disabled={submitting}
                    onChange={(field, value) => setEditValues((s) => ({ ...s, [field]: value }))}
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => onUpdate(p.id)}
                      className="inline-flex h-7 items-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground disabled:opacity-60"
                    >
                      {submitting ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="text-xs text-muted-foreground hover:underline"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-sm text-foreground">
                    {p.isLead ? (
                      <span className="inline-flex items-center rounded-full border border-success/20 bg-success/10 px-1.5 py-0.5 text-[10px] font-semibold text-success">
                        Lead
                      </span>
                    ) : null}
                    {p.name}
                  </span>
                  <div className="flex items-center gap-3">
                    <button type="button" onClick={() => startEdit(p)} className="text-xs text-foreground hover:underline">
                      Edit
                    </button>
                    {p.isLead ? null : (
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => onSetLead(p.id)}
                        className="text-xs text-foreground hover:underline disabled:opacity-60"
                      >
                        Set lead
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => onDelete(p.id)}
                      className="text-xs text-destructive hover:underline disabled:opacity-60"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))
        )}
      </ul>

      <div className="space-y-2 rounded-lg border border-dashed border-border p-3">
        <h3 className="text-xs font-semibold text-foreground">Add passenger</h3>
        <PassengerFields
          values={addValues}
          disabled={submitting}
          onChange={(field, value) => setAddValues((s) => ({ ...s, [field]: value }))}
        />
        <button
          type="button"
          disabled={submitting}
          onClick={onAdd}
          className="inline-flex h-7 items-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground disabled:opacity-60"
        >
          {submitting ? 'Saving…' : 'Add passenger'}
        </button>
      </div>
    </div>
  );
}
