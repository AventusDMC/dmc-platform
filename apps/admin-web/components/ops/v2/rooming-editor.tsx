'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { PaxRowVM, RoomRowVM } from '../../../app/operations/v2/ops-pax-rooming-vm';
import {
  ROOM_OCCUPANCIES,
  buildAssignPassengerRequest,
  buildAutoAssignRequest,
  buildRoomCreateRequest,
  buildRoomDeleteRequest,
  buildRoomUpdateRequest,
  buildUnassignPassengerRequest,
  resolveRoomingErrorMessage,
  type RoomAssignmentRequest,
  type RoomMutationRequest,
  type RoomOccupancyValue,
} from '../../../app/operations/v2/ops-rooming-request';

/**
 * Booking Operations V2 — rooming editor (PR-2c-1 + PR-2c-2, flag-gated by the
 * caller).
 *
 * Room CRUD (create / edit / delete) plus passenger assignment / unassignment /
 * auto-assign (PR-2c-2). The assign picker lists only currently-unassigned
 * passengers; capacity / already-assigned errors are surfaced inline from the
 * backend. Mutations go through the V2 JSON proxies and, on success,
 * `router.refresh()` reloads server truth so the readiness strip + room validity
 * update. No optimistic local mutation. No PII, no finance.
 */

type RoomFormValues = { roomType: string; occupancy: RoomOccupancyValue; notes: string };

function emptyRoom(): RoomFormValues {
  return { roomType: '', occupancy: 'double', notes: '' };
}

function valuesFromRoom(room: RoomRowVM): RoomFormValues {
  return { roomType: room.roomType ?? '', occupancy: room.occupancy, notes: room.notes ?? '' };
}

/** Pure error banner — exported so the inline-error rendering is render-testable. */
export function RoomingEditorError({ message }: { message: string | null }) {
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

function RoomFields({
  values,
  disabled,
  onChange,
}: {
  values: RoomFormValues;
  disabled: boolean;
  onChange: (field: keyof RoomFormValues, value: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        <span>Room type</span>
        <input
          name="roomType"
          aria-label="Room type"
          value={values.roomType}
          disabled={disabled}
          onChange={(e) => onChange('roomType', e.target.value)}
          className="rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        <span>Occupancy</span>
        <select
          name="occupancy"
          aria-label="Occupancy"
          value={values.occupancy}
          disabled={disabled}
          onChange={(e) => onChange('occupancy', e.target.value)}
          className="rounded-md border border-input bg-background px-2 py-1 text-xs capitalize text-foreground"
        >
          {ROOM_OCCUPANCIES.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        <span>Notes</span>
        <input
          name="notes"
          aria-label="Room notes"
          value={values.notes}
          disabled={disabled}
          onChange={(e) => onChange('notes', e.target.value)}
          className="rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground"
        />
      </label>
    </div>
  );
}

export function RoomingEditor({
  bookingId,
  rooms,
  passengers,
}: {
  bookingId: string;
  rooms: RoomRowVM[];
  passengers: PaxRowVM[];
}) {
  const router = useRouter();
  const [addValues, setAddValues] = useState<RoomFormValues>(emptyRoom);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<RoomFormValues>(emptyRoom);
  const [assignSelection, setAssignSelection] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Passengers not currently assigned to any room (the assign-picker options).
  const assignedIds = new Set(rooms.flatMap((r) => r.assignedPassengers.map((p) => p.id)));
  const unassignedPassengers = passengers.filter((p) => !assignedIds.has(p.id));

  async function run(req: RoomMutationRequest | RoomAssignmentRequest): Promise<boolean> {
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
          /* keep fallback */
        }
        setError(resolveRoomingErrorMessage(json));
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
    if (await run(buildRoomCreateRequest(bookingId, addValues))) {
      setAddValues(emptyRoom());
      router.refresh();
    }
  }

  function startEdit(room: RoomRowVM) {
    setEditingId(room.id);
    setEditValues(valuesFromRoom(room));
    setError(null);
  }

  async function onUpdate(id: string) {
    if (await run(buildRoomUpdateRequest(bookingId, id, editValues))) {
      setEditingId(null);
      router.refresh();
    }
  }

  async function onDelete(id: string) {
    if (await run(buildRoomDeleteRequest(bookingId, id))) {
      router.refresh();
    }
  }

  async function onAssign(roomId: string) {
    const passengerId = assignSelection[roomId];
    if (!passengerId) {
      setError('Choose a passenger to assign.');
      return;
    }
    if (await run(buildAssignPassengerRequest(bookingId, roomId, passengerId))) {
      setAssignSelection((s) => ({ ...s, [roomId]: '' }));
      router.refresh();
    }
  }

  async function onUnassign(roomId: string, passengerId: string) {
    if (await run(buildUnassignPassengerRequest(bookingId, roomId, passengerId))) {
      router.refresh();
    }
  }

  async function onAutoAssign() {
    if (await run(buildAutoAssignRequest(bookingId))) {
      router.refresh();
    }
  }

  return (
    <div className="space-y-4">
      <RoomingEditorError message={error} />

      {unassignedPassengers.length > 0 ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
          <span className="text-xs text-muted-foreground">
            {unassignedPassengers.length} passenger{unassignedPassengers.length === 1 ? '' : 's'} not assigned to a room.
          </span>
          <button
            type="button"
            disabled={submitting}
            onClick={onAutoAssign}
            className="inline-flex h-7 items-center rounded-md border border-input bg-background px-3 text-xs font-medium text-foreground disabled:opacity-60"
          >
            Auto-assign
          </button>
        </div>
      ) : null}

      <ul className="space-y-2">
        {rooms.length === 0 ? (
          <li className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
            No rooms yet. Add one below.
          </li>
        ) : (
          rooms.map((room) => (
            <li key={room.id} className="rounded-lg border border-border bg-card p-3">
              {editingId === room.id ? (
                <div className="space-y-2">
                  <RoomFields
                    values={editValues}
                    disabled={submitting}
                    onChange={(field, value) => setEditValues((s) => ({ ...s, [field]: value }))}
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => onUpdate(room.id)}
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
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{room.label}</p>
                      <p className="text-xs capitalize text-muted-foreground">
                        {room.occupancy}
                        {room.capacity != null
                          ? ` · ${room.assignedNames.length}/${room.capacity}`
                          : ` · ${room.assignedNames.length} assigned`}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <button type="button" onClick={() => startEdit(room)} className="text-xs text-foreground hover:underline">
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => onDelete(room.id)}
                        className="text-xs text-destructive hover:underline disabled:opacity-60"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  {room.assignedPassengers.length > 0 ? (
                    <ul className="flex flex-wrap gap-1.5">
                      {room.assignedPassengers.map((p) => (
                        <li
                          key={`${room.id}-pax-${p.id}`}
                          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
                        >
                          {p.name}
                          <button
                            type="button"
                            disabled={submitting}
                            onClick={() => onUnassign(room.id, p.id)}
                            aria-label={`Unassign ${p.name}`}
                            className="text-destructive hover:underline disabled:opacity-60"
                          >
                            Unassign
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-muted-foreground">No passengers assigned.</p>
                  )}
                  {unassignedPassengers.length > 0 ? (
                    <div className="flex items-center gap-2">
                      <select
                        aria-label={`Assign passenger to ${room.label}`}
                        value={assignSelection[room.id] ?? ''}
                        disabled={submitting}
                        onChange={(e) => setAssignSelection((s) => ({ ...s, [room.id]: e.target.value }))}
                        className="rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground"
                      >
                        <option value="">Assign passenger…</option>
                        {unassignedPassengers.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => onAssign(room.id)}
                        className="inline-flex h-7 items-center rounded-md border border-input px-3 text-xs font-medium text-foreground disabled:opacity-60"
                      >
                        Assign
                      </button>
                    </div>
                  ) : null}
                  {room.notes ? <p className="text-xs text-muted-foreground">{room.notes}</p> : null}
                </div>
              )}
            </li>
          ))
        )}
      </ul>

      <div className="space-y-2 rounded-lg border border-dashed border-border p-3">
        <h3 className="text-xs font-semibold text-foreground">Add room</h3>
        <RoomFields
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
          {submitting ? 'Saving…' : 'Add room'}
        </button>
      </div>
    </div>
  );
}
