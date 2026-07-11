import type { FinanceVM } from '../../../app/operations/v2/ops-finance-vm';
import { OperationalStatusBadge } from './operational-status-badge';
import { humanizeStatus } from '../../../app/operations/v2/ops-status-map';

function money(amount: number | null, currency: string): string {
  if (amount == null) return '—';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString('en-US')}`;
  }
}

/**
 * Read-only internal finance summary cards.
 *
 * Cost + margin are finance-sensitive and gated by `canSeeMargin` (true only for
 * admin / super_admin / finance — see `canAccessFinance`). Other authorized ops
 * roles (operations / agent_admin) get the non-financial summary — quoted total
 * (client-facing sell), statuses, payment count, currency — plus a restricted
 * notice in place of the Realized cost + Margin cards. No cost/margin value is
 * rendered for restricted roles.
 */
export function FinanceSummary({ vm, canSeeMargin }: { vm: FinanceVM; canSeeMargin: boolean }) {
  return (
    <div className={`grid gap-3 sm:grid-cols-2 ${canSeeMargin ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Quoted total</p>
        <p className="mt-1 font-heading text-xl font-semibold text-foreground">{money(vm.quotedTotal, vm.currency)}</p>
      </div>
      {canSeeMargin ? (
        <>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Realized cost</p>
            <p className="mt-1 font-heading text-xl font-semibold text-foreground">{money(vm.realizedCost, vm.currency)}</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Margin</p>
            <p className="mt-1 font-heading text-xl font-semibold text-foreground">
              {money(vm.margin, vm.currency)}
              {vm.marginPercent != null ? (
                <span className="ml-1 text-sm font-medium text-muted-foreground">· {vm.marginPercent}%</span>
              ) : null}
            </p>
          </div>
        </>
      ) : (
        <div className="rounded-lg border border-dashed border-border bg-card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Cost &amp; margin</p>
          <p className="mt-1 text-sm text-muted-foreground">Cost and margin are restricted to finance roles.</p>
        </div>
      )}
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Statuses</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <OperationalStatusBadge prefix="Invoice" variant={vm.clientInvoiceVariant} label={humanizeStatus(vm.clientInvoiceStatus)} />
          <OperationalStatusBadge prefix="Supplier" variant={vm.supplierPaymentVariant} label={humanizeStatus(vm.supplierPaymentStatus)} />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {vm.paymentCount} payment{vm.paymentCount === 1 ? '' : 's'} · {vm.currency}
        </p>
      </div>
    </div>
  );
}
