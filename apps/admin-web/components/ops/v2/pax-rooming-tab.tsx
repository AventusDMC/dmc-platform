import type { PaxRoomingReadiness, PaxRoomingVM } from '../../../app/operations/v2/ops-pax-rooming-vm';
import { OpenInClassicButton } from './open-in-classic-button';
import { PassengerEditor } from './passenger-editor';
import { PassengerManifestTable } from './passenger-manifest-table';
import { ReadOnlyNotice } from './read-only-notice';
import { RoomingEditor } from './rooming-editor';
import { RoomingMap } from './rooming-map';

// PR-1 advisory readiness strip. Flag-gated (default OFF); pure display, no
// controls — advisory warnings only, never blocking. Read at render time so the
// gate is a runtime check (server component) rather than a baked-in constant.
function paxReadinessEnabled(): boolean {
  return process.env.NEXT_PUBLIC_OPS_V2_PAX_READINESS === 'true';
}

function PaxReadinessStrip({ readiness }: { readiness: PaxRoomingReadiness }) {
  if (readiness.isReady) {
    return (
      <div
        aria-label="Passenger and rooming readiness"
        className="flex items-center gap-2 rounded-lg border border-success/20 bg-success/10 px-3 py-2 text-sm font-medium text-success"
      >
        Manifest &amp; rooming ready
      </div>
    );
  }
  return (
    <div aria-label="Passenger and rooming readiness" className="flex flex-wrap items-center gap-2">
      {readiness.warnings.map((w) => (
        <span
          key={w.code}
          className="inline-flex items-center rounded-full border border-warning/20 bg-warning/10 px-2.5 py-1 text-xs font-medium text-warning"
        >
          {w.message}
        </span>
      ))}
    </div>
  );
}

/**
 * Passengers & Rooming tab body. Read-only by default (manifest table + rooming
 * map + "Open in Classic" deep links). When passenger editing is enabled (PR-2b,
 * flag + admin/operations, decided server-side and passed as `canEditPassengers`)
 * the manifest becomes an editor for the non-PII fields; rooming stays read-only
 * (PR-2c). An optional advisory readiness strip (separate flag) surfaces
 * non-blocking warnings.
 */
export function PaxRoomingTab({
  vm,
  bookingId,
  canEditPassengers = false,
}: {
  vm: PaxRoomingVM;
  bookingId: string;
  canEditPassengers?: boolean;
}) {
  const readinessEnabled = paxReadinessEnabled();
  return (
    <div className="space-y-6">
      <ReadOnlyNotice
        message={
          canEditPassengers
            ? 'Passengers and rooms are editable in V2. Passenger–room assignment is still done in Classic.'
            : 'Passenger and rooming data are read-only in V2. Changes are made in Classic.'
        }
      />

      {readinessEnabled ? <PaxReadinessStrip readiness={vm.readiness} /> : null}

      <section aria-label="Passenger manifest" className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-heading text-sm font-semibold text-foreground">Passenger manifest</h2>
          <OpenInClassicButton href={`/bookings/${bookingId}?tab=passengers`} label="Open passengers in Classic" />
        </div>
        {canEditPassengers ? (
          <PassengerEditor bookingId={bookingId} passengers={vm.passengers} />
        ) : (
          <PassengerManifestTable passengers={vm.passengers} showReadinessChips={readinessEnabled} />
        )}
      </section>

      <section aria-label="Rooming map" className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-heading text-sm font-semibold text-foreground">Rooming map</h2>
          <OpenInClassicButton href={`/bookings/${bookingId}?tab=rooming`} label="Open rooming in Classic" />
        </div>
        {canEditPassengers ? (
          <RoomingEditor bookingId={bookingId} rooms={vm.rooms} />
        ) : (
          <RoomingMap rooms={vm.rooms} />
        )}
      </section>
    </div>
  );
}
