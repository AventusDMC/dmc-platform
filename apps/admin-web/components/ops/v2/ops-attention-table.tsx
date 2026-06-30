import type { CommandCenterVM } from '../../../app/operations/v2/ops-command-center-vm';
import { OperationalStatusBadge } from './operational-status-badge';

/**
 * "Needs attention" fleet queue (read-only). Built from GET /api/bookings only,
 * risk-sorted. Row actions are navigation-only: View in V2 / Open in Classic.
 * No row mutation, no inputs, no forms.
 */
export function OpsAttentionTable({ queue }: { queue: CommandCenterVM['queue'] }) {
  if (queue.rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
        No bookings need attention.
      </div>
    );
  }
  return (
    <section aria-label="Needs attention" className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-sm font-semibold text-foreground">Needs attention</h2>
        {queue.capped ? (
          <span className="text-xs text-muted-foreground">Showing {queue.shownCount} of {queue.totalCount}</span>
        ) : (
          <span className="text-xs text-muted-foreground">{queue.totalCount} active</span>
        )}
      </div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th scope="col" className="px-3 py-2 font-medium">Booking</th>
              <th scope="col" className="px-3 py-2 font-medium">Client</th>
              <th scope="col" className="px-3 py-2 font-medium">Dates</th>
              <th scope="col" className="px-3 py-2 font-medium">Pax</th>
              <th scope="col" className="px-3 py-2 font-medium">Status</th>
              <th scope="col" className="px-3 py-2 font-medium">Blockers</th>
              <th scope="col" className="px-3 py-2 font-medium">Invoice</th>
              <th scope="col" className="px-3 py-2 font-medium">Supplier</th>
              <th scope="col" className="px-3 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {queue.rows.map((row) => (
              <tr key={row.id} className="border-b border-border last:border-0 align-top">
                <td className="px-3 py-2">
                  <p className="font-medium text-foreground">{row.bookingRef}</p>
                  {row.title ? <p className="text-xs text-muted-foreground">{row.title}</p> : null}
                </td>
                <td className="px-3 py-2 text-muted-foreground">{row.client ?? '—'}</td>
                <td className="px-3 py-2 text-muted-foreground">{row.dateLabel ?? '—'}</td>
                <td className="px-3 py-2 text-muted-foreground">{row.pax ?? '—'}</td>
                <td className="px-3 py-2"><OperationalStatusBadge variant={row.statusVariant} label={row.status} /></td>
                <td className="px-3 py-2">
                  {row.blockers.length > 0 ? (
                    <span className="flex flex-wrap gap-1">
                      {row.blockers.map((b, i) => (
                        <span key={`${row.id}-b-${i}`} className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{b}</span>
                      ))}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">None</span>
                  )}
                </td>
                <td className="px-3 py-2"><OperationalStatusBadge variant={row.invoiceVariant} label={row.invoiceStatus} /></td>
                <td className="px-3 py-2"><OperationalStatusBadge variant={row.supplierVariant} label={row.supplierPaymentStatus} /></td>
                <td className="px-3 py-2">
                  <span className="flex flex-col gap-1">
                    <a href={`/operations/v2/${row.id}`} className="text-xs font-medium text-primary hover:underline">View in V2</a>
                    <a href={`/bookings/${row.id}/operations`} className="text-xs text-muted-foreground hover:underline">Open in Classic</a>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
