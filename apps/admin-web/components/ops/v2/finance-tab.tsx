import type { FinanceVM } from '../../../app/operations/v2/ops-finance-vm';
import { DisabledAction } from './disabled-action';
import { FinanceSummary } from './finance-summary';
import { OpenInClassicButton } from './open-in-classic-button';
import { PaymentsTable } from './payments-table';
import { ReadOnlyNotice } from './read-only-notice';

/**
 * Finance tab body (read-only). Internal finance summary + client/supplier
 * payment tables. Future finance actions render DISABLED + "Coming later" — no
 * real record, mark-paid, send, or financial-export mechanics; no forms, no
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

      {/* Future finance actions — disabled in Round 1. */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-3">
        <DisabledAction label="Record payment" />
        <DisabledAction label="Mark paid" />
        <DisabledAction label="Send invoice" />
        <DisabledAction label="Send payment reminder" />
        <DisabledAction label="Export financials" />
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
