import type { OpsRowVM } from '../../../app/operations/v2/ops-view-model';
import { DisabledAction } from './disabled-action';
import { OperationalStatusBadge } from './operational-status-badge';
import { ServiceTypeIcon } from './service-type-icon';

/**
 * One operations service row. Read-only: status badges + reason chips + a
 * disabled action cluster ("Coming later"). Renders only display-safe fields
 * from the lean OpsRowVM — no cost/sell/payable is ever passed in.
 */
export function ServiceRow({ row }: { row: OpsRowVM }) {
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
        <DisabledAction label="Assign supplier" />
        <DisabledAction label="Request confirmation" />
        <DisabledAction label="Generate voucher" />
      </div>
    </li>
  );
}
