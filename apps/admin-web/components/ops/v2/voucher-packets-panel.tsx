/**
 * Supplier Voucher Packet V2 — S2 read-only panel.
 *
 * Display-only: shows the computed supplier packet groups for a booking. No
 * buttons, no forms, no mutation — no generate / preview / download / send in
 * S2. Rendered only when the caller passes the flag-gated groups (the page gates
 * on NEXT_PUBLIC_OPS_V2_VOUCHER_PACKET). Finance/PII-free by construction (the
 * group DTO carries only supplier name, type, counts, dates, and service labels).
 */

export type VoucherPacketGroupVM = {
  groupingKey: string;
  groupingType: string;
  supplierId: string;
  supplierName: string | null;
  serviceIds: string[];
  serviceCount: number;
  dateRange: { start: string | null; end: string | null };
  dayNumbers: number[];
  memberLabels: string[];
};

function dateRangeLabel(range: { start: string | null; end: string | null }): string | null {
  if (!range.start && !range.end) return null;
  if (range.start && range.end && range.start !== range.end) return `${range.start} → ${range.end}`;
  return range.start ?? range.end;
}

export function VoucherPacketsPanel({ groups }: { groups: VoucherPacketGroupVM[] }) {
  return (
    <section aria-label="Supplier packets" className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="font-heading text-sm font-semibold text-foreground">Supplier packets</h2>
        <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          Preview · read-only
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        Proposed groupings of assigned services by supplier. Creating and sending packets is not available yet.
      </p>

      {groups.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
          No supplier packets yet. Assign suppliers to services to see proposed groupings.
        </div>
      ) : (
        <ul className="space-y-2">
          {groups.map((g) => {
            const range = dateRangeLabel(g.dateRange);
            return (
              <li key={g.groupingKey} className="rounded-lg border border-border bg-card p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {g.groupingType.replace(/_/g, ' ')}
                  </span>
                  <span className="text-sm font-medium text-foreground">{g.supplierName ?? 'Unnamed supplier'}</span>
                  <span className="text-xs text-muted-foreground">
                    {g.serviceCount} service{g.serviceCount === 1 ? '' : 's'}
                    {range ? ` · ${range}` : ''}
                    {g.dayNumbers.length ? ` · day${g.dayNumbers.length === 1 ? '' : 's'} ${g.dayNumbers.join(', ')}` : ''}
                  </span>
                </div>
                {g.memberLabels.length ? (
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {g.memberLabels.map((label, i) => (
                      <li
                        key={`${g.groupingKey}-m-${i}`}
                        className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
                      >
                        {label}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
