import { Star } from 'lucide-react';
import type { PaxRowVM } from '../../../app/operations/v2/ops-pax-rooming-vm';

/** Muted placeholder for an absent field. */
function Muted({ value, fallback = '—' }: { value: string | null; fallback?: string }) {
  if (value && value.trim()) return <span className="text-foreground">{value}</span>;
  return <span className="text-muted-foreground">{fallback}</span>;
}

/**
 * A PII manifest cell. For restricted roles the backend redacts these fields
 * (PR-3a) so they arrive null; show an explicit "Restricted" placeholder rather
 * than a misleading "Missing"/"—" (PR-3d). Full-PII roles see the real value.
 */
function PiiCell({
  value,
  canSeeFullPii,
  fallback = '—',
}: {
  value: string | null;
  canSeeFullPii: boolean;
  fallback?: string;
}) {
  if (!canSeeFullPii) return <span className="text-muted-foreground italic">Restricted</span>;
  return <Muted value={value} fallback={fallback} />;
}

/**
 * Read-only passenger manifest. No inputs/selects/textareas, no forms, no edit
 * controls — display only. Renders allowlisted identity fields from the lean VM
 * (passport is the API's already-masked value). Missing fields show muted text.
 * For restricted roles (`canSeeFullPii=false`) the redacted PII columns show a
 * "Restricted" placeholder and passport readiness chips are suppressed (PR-3d).
 */
export function PassengerManifestTable({
  passengers,
  showReadinessChips = false,
  canSeeFullPii = true,
}: {
  passengers: PaxRowVM[];
  showReadinessChips?: boolean;
  canSeeFullPii?: boolean;
}) {
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
                  {showReadinessChips && canSeeFullPii && p.missingPassport ? (
                    <span className="inline-flex items-center rounded-full border border-warning/20 bg-warning/10 px-1.5 py-0.5 text-[10px] font-semibold text-warning">
                      No passport
                    </span>
                  ) : null}
                  {showReadinessChips && canSeeFullPii && p.passportExpiring ? (
                    <span className="inline-flex items-center rounded-full border border-warning/20 bg-warning/10 px-1.5 py-0.5 text-[10px] font-semibold text-warning">
                      Passport expiring
                    </span>
                  ) : null}
                </span>
              </td>
              <td className="px-3 py-2"><PiiCell value={p.nationality} canSeeFullPii={canSeeFullPii} /></td>
              <td className="px-3 py-2"><PiiCell value={p.passportMasked} canSeeFullPii={canSeeFullPii} fallback="Missing" /></td>
              <td className="px-3 py-2"><PiiCell value={p.arrivalFlight} canSeeFullPii={canSeeFullPii} /></td>
              <td className="px-3 py-2"><PiiCell value={p.departureFlight} canSeeFullPii={canSeeFullPii} /></td>
              <td className="px-3 py-2"><PiiCell value={p.dietaryNotes} canSeeFullPii={canSeeFullPii} /></td>
              <td className="px-3 py-2"><PiiCell value={p.roomingNotes} canSeeFullPii={canSeeFullPii} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
