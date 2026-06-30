import { Star } from 'lucide-react';
import type { PaxRowVM } from '../../../app/operations/v2/ops-pax-rooming-vm';

/** Muted placeholder for an absent field. */
function Muted({ value, fallback = '—' }: { value: string | null; fallback?: string }) {
  if (value && value.trim()) return <span className="text-foreground">{value}</span>;
  return <span className="text-muted-foreground">{fallback}</span>;
}

/**
 * Read-only passenger manifest. No inputs/selects/textareas, no forms, no edit
 * controls — display only. Renders allowlisted identity fields from the lean VM
 * (passport is the API's already-masked value). Missing fields show muted text.
 */
export function PassengerManifestTable({ passengers }: { passengers: PaxRowVM[] }) {
  if (passengers.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
        No passengers recorded yet.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th scope="col" className="px-3 py-2 font-medium">Passenger</th>
            <th scope="col" className="px-3 py-2 font-medium">Nationality</th>
            <th scope="col" className="px-3 py-2 font-medium">Passport</th>
            <th scope="col" className="px-3 py-2 font-medium">Arrival</th>
            <th scope="col" className="px-3 py-2 font-medium">Departure</th>
            <th scope="col" className="px-3 py-2 font-medium">Dietary</th>
            <th scope="col" className="px-3 py-2 font-medium">Rooming notes</th>
          </tr>
        </thead>
        <tbody>
          {passengers.map((p) => (
            <tr key={p.id} className="border-b border-border last:border-0">
              <td className="px-3 py-2">
                <span className="flex items-center gap-1.5 font-medium text-foreground">
                  {p.isLead ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-success/20 bg-success/10 px-1.5 py-0.5 text-[10px] font-semibold text-success">
                      <Star className="size-3" aria-hidden="true" /> Lead
                    </span>
                  ) : null}
                  {p.name}
                </span>
              </td>
              <td className="px-3 py-2"><Muted value={p.nationality} /></td>
              <td className="px-3 py-2"><Muted value={p.passportMasked} fallback="Missing" /></td>
              <td className="px-3 py-2"><Muted value={p.arrivalFlight} /></td>
              <td className="px-3 py-2"><Muted value={p.departureFlight} /></td>
              <td className="px-3 py-2"><Muted value={p.dietaryNotes} /></td>
              <td className="px-3 py-2"><Muted value={p.roomingNotes} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
