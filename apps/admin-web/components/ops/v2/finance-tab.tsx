import type { FinanceVM } from '../../../app/operations/v2/ops-finance-vm';
import { FinanceSummary } from './finance-summary';
import { OpenInClassicButton } from './open-in-classic-button';
import { PaymentsTable } from './payments-table';
import { ReadOnlyNotice } from './read-only-notice';

/**
 * Finance tab body (read-only). Internal finance summary + client/supplier
 * payment tables. Finance actions live in Classic: instead of inert buttons,
 * the tab shows a read-only "Classic handoff" panel that names the Classic-only
 * actions as plain text and links once to the Classic booking financials tab —
 * no record, mark-paid, send, or financial-export mechanics; no forms, no
 * inputs, and no PDF, download, or print hrefs.
 *
 * `canSeeMargin` (F1 margin/role gate) is true only for finance-visibility roles
 * (admin / super_admin / finance — see `canAccessFinance`). When false, the
 * cost/margin summary cards are replaced with a restricted notice AND the
 * supplier payments table is withheld, because supplier payment amounts reveal
 * supplier cost. The client payments table (client-facing sell) stays visible.
 */
export function FinanceTab({ vm, bookingId, canSeeMargin }: { vm: FinanceVM; bookingId: string; canSeeMargin: boolean }) {
  return (
    <div className="space-y-6">
      <ReadOnlyNotice message="Internal financial summary. Payment and invoice actions remain in Classic." />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-heading text-sm font-semibold text-foreground">Financial summary</h2>
        <OpenInClassicButton href={`/bookings/${bookingId}?tab=financials`} label="Open financials in Classic" />
      </div>

      <FinanceSummary vm={vm} canSeeMargin={canSeeMargin} />

      {/* Classic handoff — finance actions are performed in Classic. Read-only:
          a plain-text list of the Classic-only actions + one navigation link to
          the Classic booking financials tab. No buttons, no forms, no mutation
          or export/download mechanics. */}
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <h3 className="font-heading text-sm font-semibold text-foreground">Finance actions are handled in Classic.</h3>
            <p className="text-xs text-muted-foreground">
              These actions are available in the Classic booking financials workspace:
            </p>
            <ul className="grid gap-x-6 gap-y-1 text-sm text-muted-foreground sm:grid-cols-2">
              <li>Record payment</li>
              <li>Mark paid</li>
              <li>Invoice / send invoice</li>
              <li>Payment reminder</li>
              <li>Reconciliation</li>
              <li>Exports</li>
            </ul>
          </div>
          <OpenInClassicButton href={`/bookings/${bookingId}?tab=financials`} label="Open financials in Classic" />
        </div>
      </div>

      <PaymentsTable title="Client payments" payments={vm.clientPayments} />
      {canSeeMargin ? (
        <PaymentsTable title="Supplier payments" payments={vm.supplierPayments} />
      ) : (
        <section aria-label="Supplier payments" className="space-y-2">
          <h3 className="font-heading text-sm font-semibold text-foreground">Supplier payments</h3>
          <div className="rounded-lg border border-dashed border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
            Supplier payment amounts are restricted to finance roles.
          </div>
        </section>
      )}
    </div>
  );
}
