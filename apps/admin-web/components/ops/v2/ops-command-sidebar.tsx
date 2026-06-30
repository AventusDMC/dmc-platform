import type { CommandCenterVM, DispatchSummaryVM } from '../../../app/operations/v2/ops-command-center-vm';
import { VARIANT_CLASS } from './operational-status-badge';
import { DisabledAction } from './disabled-action';
import { OpenInClassicButton } from './open-in-classic-button';

/**
 * Command Center right sidebar (read-only): dispatch summary, fleet readiness,
 * blocking items, and a "next required action" card whose only active controls
 * are navigation (Open in Classic / View in V2). The V2 resolve action is
 * disabled + "Coming later".
 */
export function OpsCommandSidebar({
  sidebar,
  dispatch,
}: {
  sidebar: CommandCenterVM['sidebar'];
  dispatch: DispatchSummaryVM | null;
}) {
  return (
    <aside aria-label="Fleet summary" className="space-y-4">
      {dispatch ? (
        <div className="rounded-lg border border-border bg-card p-5">
          <h3 className="font-heading text-sm font-semibold text-foreground">Dispatch summary</h3>
          <dl className="mt-3 space-y-1.5 text-sm">
            <div className="flex items-center justify-between"><dt className="text-muted-foreground">Window</dt><dd className="font-medium text-foreground">{dispatch.rangeLabel}</dd></div>
            <div className="flex items-center justify-between"><dt className="text-muted-foreground">Services</dt><dd className="font-medium text-foreground">{dispatch.totalRows}</dd></div>
            {dispatch.readyPct != null ? (
              <div className="flex items-center justify-between"><dt className="text-muted-foreground">Operations ready</dt><dd className="font-medium text-foreground">{dispatch.readyPct}%</dd></div>
            ) : null}
          </dl>
        </div>
      ) : null}

      <div className="rounded-lg border border-border bg-card p-5">
        <h3 className="font-heading text-sm font-semibold text-foreground">Fleet readiness</h3>
        {sidebar.fleetReadinessPct != null ? (
          <>
            <div className="mt-3 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Operations ready</span>
              <span className="font-heading text-sm font-semibold text-primary">{sidebar.fleetReadinessPct}%</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={sidebar.fleetReadinessPct} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-primary" style={{ width: `${sidebar.fleetReadinessPct}%` }} />
            </div>
          </>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">Readiness data unavailable.</p>
        )}
        {sidebar.bookingsInOperation != null ? (
          <p className="mt-3 text-xs text-muted-foreground">{sidebar.bookingsInOperation} bookings in operation</p>
        ) : null}
      </div>

      <div className="rounded-lg border border-border bg-card p-5">
        <h3 className="font-heading text-sm font-semibold text-foreground">Blocking items</h3>
        {sidebar.blockingItems.length === 0 ? (
          <p className="mt-2 text-sm text-success">No fleet-level blockers.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {sidebar.blockingItems.map((item) => (
              <li key={item.label} className="flex items-center justify-between gap-2">
                <span className="text-sm text-foreground">{item.label}</span>
                <span className={`inline-flex min-w-6 items-center justify-center rounded-full border px-2 py-0.5 text-xs font-medium ${VARIANT_CLASS[item.variant]}`}>{item.count}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {sidebar.nextAction ? (
        <div className="rounded-lg border border-primary/30 bg-card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Next required action</p>
          <p className="mt-1 text-sm font-medium text-foreground">{sidebar.nextAction.label}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <a href={`/operations/v2/${sidebar.nextAction.bookingId}`} className="inline-flex h-8 items-center rounded-md border border-input bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-secondary">
              View in V2
            </a>
            <OpenInClassicButton href={sidebar.nextAction.classicHref} />
            <DisabledAction label="Resolve in V2" />
          </div>
        </div>
      ) : null}
    </aside>
  );
}
