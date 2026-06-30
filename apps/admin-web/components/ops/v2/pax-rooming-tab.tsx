import type { PaxRoomingVM } from '../../../app/operations/v2/ops-pax-rooming-vm';
import { OpenInClassicButton } from './open-in-classic-button';
import { PassengerManifestTable } from './passenger-manifest-table';
import { ReadOnlyNotice } from './read-only-notice';
import { RoomingMap } from './rooming-map';

/**
 * Passengers & Rooming tab body (read-only). Persistent notice + manifest table
 * + rooming map, each with a navigation-only "Open in Classic" deep link. No
 * edit controls, no forms, no inputs — display only.
 */
export function PaxRoomingTab({ vm, bookingId }: { vm: PaxRoomingVM; bookingId: string }) {
  return (
    <div className="space-y-6">
      <ReadOnlyNotice message="Passenger and rooming data are read-only in V2. Changes are made in Classic." />

      <section aria-label="Passenger manifest" className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-heading text-sm font-semibold text-foreground">Passenger manifest</h2>
          <OpenInClassicButton href={`/bookings/${bookingId}?tab=passengers`} label="Open passengers in Classic" />
        </div>
        <PassengerManifestTable passengers={vm.passengers} />
      </section>

      <section aria-label="Rooming map" className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-heading text-sm font-semibold text-foreground">Rooming map</h2>
          <OpenInClassicButton href={`/bookings/${bookingId}?tab=rooming`} label="Open rooming in Classic" />
        </div>
        <RoomingMap rooms={vm.rooms} />
      </section>
    </div>
  );
}
