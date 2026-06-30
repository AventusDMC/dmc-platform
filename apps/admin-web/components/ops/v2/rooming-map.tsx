import type { RoomRowVM, RoomValidity } from '../../../app/operations/v2/ops-pax-rooming-vm';
import { OperationalStatusBadge } from './operational-status-badge';
import type { StatusVariant } from '../../../app/operations/v2/ops-status-map';

const VALIDITY_VARIANT: Record<RoomValidity, StatusVariant> = {
  Valid: 'success',
  Mismatch: 'warning',
  'Needs occupancy': 'warning',
  Assigned: 'neutral',
};

/**
 * Read-only rooming map. Renders rooming entries with occupancy + assigned
 * passengers + a validity badge (Valid / Mismatch / Needs occupancy / Assigned,
 * ported from Classic). No auto-assign, no drag/drop, no edit controls, no
 * forms, no inputs/selects/textareas — display only.
 */
export function RoomingMap({ rooms }: { rooms: RoomRowVM[] }) {
  if (rooms.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
        No rooming entries created. Rooms are created and assigned in Classic.
      </div>
    );
  }
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {rooms.map((room) => (
        <li key={room.id} className="rounded-lg border border-border bg-card p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{room.label}</p>
              <p className="text-xs capitalize text-muted-foreground">
                {room.occupancy}
                {room.capacity != null ? ` · ${room.assignedNames.length}/${room.capacity}` : ` · ${room.assignedNames.length} assigned`}
              </p>
            </div>
            <OperationalStatusBadge variant={VALIDITY_VARIANT[room.validity]} label={room.validity} />
          </div>
          {room.assignedNames.length > 0 ? (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {room.assignedNames.map((name, i) => (
                <li
                  key={`${room.id}-pax-${i}`}
                  className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
                >
                  {name}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">No passengers assigned.</p>
          )}
          {room.notes ? <p className="mt-2 text-xs text-muted-foreground">{room.notes}</p> : null}
        </li>
      ))}
    </ul>
  );
}
