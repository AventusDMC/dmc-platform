import type { FinancePaymentVM } from '../../../app/operations/v2/ops-finance-vm';
import { OperationalStatusBadge } from './operational-status-badge';

function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString('en-US')}`;
  }
}

function dateLabel(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' }).format(d);
}

/**
 * Read-only payments table (client or supplier). No inputs/forms/edit controls.
 * References are shown only as "Reference recorded"; notes are summarized when
 * sensitive. Renders only allowlisted payment fields from the lean VM.
 */
export function PaymentsTable({ title, payments }: { title: string; payments: FinancePaymentVM[] }) {
  return (
    <section aria-label={title} className="space-y-2">
      <h3 className="font-heading text-sm font-semibold text-foreground">{title}</h3>
      {payments.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
          No payments recorded.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th scope="col" className="px-3 py-2 font-medium">Amount</th>
                <th scope="col" className="px-3 py-2 font-medium">Status</th>
                <th scope="col" className="px-3 py-2 font-medium">Method</th>
                <th scope="col" className="px-3 py-2 font-medium">Due</th>
                <th scope="col" className="px-3 py-2 font-medium">Paid</th>
                <th scope="col" className="px-3 py-2 font-medium">Reference</th>
                <th scope="col" className="px-3 py-2 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 font-medium text-foreground">{money(p.amount, p.currency)}</td>
                  <td className="px-3 py-2">
                    <OperationalStatusBadge variant={p.statusVariant} label={p.overdue && p.status !== 'PAID' ? `${p.statusLabel} · Overdue` : p.statusLabel} />
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{p.method}</td>
                  <td className="px-3 py-2 text-muted-foreground">{dateLabel(p.dueDate)}</td>
                  <td className="px-3 py-2 text-muted-foreground">{dateLabel(p.paidDate)}</td>
                  <td className="px-3 py-2 text-muted-foreground">{p.reference ?? '—'}</td>
                  <td className="px-3 py-2 text-muted-foreground">{p.notes ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
