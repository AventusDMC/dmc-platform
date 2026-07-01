import type { OpsRowVM } from '../../../app/operations/v2/ops-view-model';
import { isOpsV2SupplierAssignEnabled } from '../../../app/operations/v2/ops-supplier-assign-flag';
import { isOpsV2SupplierConfirmEnabled } from '../../../app/operations/v2/ops-supplier-confirm-flag';
import { DisabledAction } from './disabled-action';
import { OperationalStatusBadge } from './operational-status-badge';
import { ServiceTypeIcon } from './service-type-icon';
import { SupplierAssignmentControl } from './supplier-assignment-control';
import { SupplierConfirmationControl } from './supplier-confirmation-control';

/**
 * One operations service row. Read-only by default: status badges + reason chips
 * + a disabled action cluster ("Coming later"). Renders only display-safe fields
 * from the lean OpsRowVM — no cost/sell/payable is ever passed in.
 *
 * Phase 2A: when NEXT_PUBLIC_OPS_V2_SUPPLIER_ASSIGN is ON, "Assign supplier"
 * becomes the live (supplier-only) assignment control.
 * Phase 2B: when NEXT_PUBLIC_OPS_V2_SUPPLIER_CONFIRM_STATUS is ON, the
 * "Request confirmation" affordance becomes the manual confirmation-status
 * control. Every other action stays a disabled "Coming later" placeholder.
 */
export function ServiceRow({ row, bookingId }: { row: OpsRowVM; bookingId: string }) {
  const supplierAssignEnabled = isOpsV2SupplierAssignEnabled();
  const supplierConfirmEnabled = isOpsV2SupplierConfirmEnabled();
  return (
    <li id={`operation-${row.id}`} className="rounded-lg border border-border bg-card p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <ServiceTypeIcon serviceType={row.serviceType} />
            <span className="truncate text-sm font-medium text-foreground">{row.description}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {row.dayLabel ? <span>{row.dayLabel}</span> : null}
            <span>{row.supplierLabel ?? 'Unassigned'}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <OperationalStatusBadge prefix="Confirmation" variant={row.confirmation.variant} label={row.confirmation.label} />
          <OperationalStatusBadge prefix="Voucher" variant={row.voucher.variant} label={row.voucher.label} />
          <OperationalStatusBadge prefix="Status" variant={row.operation.variant} label={row.operation.label} />
        </div>
      </div>

      {row.reasons.length > 0 ? (
        <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Reasons">
          {row.reasons.map((reason, i) => (
            <li
              key={`${row.id}-reason-${i}`}
              className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
            >
              {reason}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
        {supplierAssignEnabled ? (
          <SupplierAssignmentControl
            bookingId={bookingId}
            operationId={row.id}
            currentSupplierId={row.assignedSupplierId}
            currentSupplierLabel={row.supplierLabel}
          />
        ) : (
          <DisabledAction label="Assign supplier" />
        )}
        {supplierConfirmEnabled ? (
          <SupplierConfirmationControl
            bookingId={bookingId}
            operationId={row.id}
            currentStatus={row.supplierConfirmationStatus}
            hasSupplier={Boolean(row.assignedSupplierId)}
          />
        ) : (
          <DisabledAction label="Request confirmation" />
        )}
        <DisabledAction label="Generate voucher" />
      </div>
    </li>
  );
}
