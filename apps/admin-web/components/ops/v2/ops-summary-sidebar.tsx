import type { OperationsBoardVM } from '../../../app/operations/v2/ops-view-model';
import { VARIANT_CLASS } from './operational-status-badge';
import { severityVariant } from '../../../app/operations/v2/ops-status-map';

/**
 * Booking-scoped readiness + action-center summary (read-only). Values come
 * from the V2-local action-center derivation (ops-phase), not re-derived here.
 */
export function OpsSummarySidebar({ summary, manifestIncomplete, roomingIncompleteCount }: {
  summary: OperationsBoardVM['summary'];
  manifestIncomplete: boolean;
  roomingIncompleteCount: number;
}) {
  const ready = summary.readinessPercent;
  return (
    <aside aria-label="Operational summary" className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-center justify-between">
          <h3 className="font-heading text-sm font-semibold text-foreground">Readiness</h3>
          <span className="font-heading text-sm font-semibold text-primary">{ready}%</span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={ready} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-primary" style={{ width: `${ready}%` }} />
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-5">
        <h3 className="font-heading text-sm font-semibold text-foreground">Needs attention</h3>
        <ul className="mt-3 space-y-2">
          {summary.actionItems.map((item) => (
            <li key={item.label} className="flex items-center justify-between gap-2">
              <span className="text-sm text-foreground">{item.label}</span>
              <span className={`inline-flex min-w-6 items-center justify-center rounded-full border px-2 py-0.5 text-xs font-medium ${VARIANT_CLASS[severityVariant(item.severity)]}`}>
                {item.count}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-lg border border-border bg-card p-5">
        <h3 className="font-heading text-sm font-semibold text-foreground">State</h3>
        <dl className="mt-3 space-y-1.5 text-sm">
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">Manifest</dt>
            <dd className="font-medium text-foreground">{manifestIncomplete ? 'Incomplete' : 'Ready'}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">Rooming</dt>
            <dd className="font-medium text-foreground">{roomingIncompleteCount > 0 ? 'Incomplete' : 'Ready'}</dd>
          </div>
        </dl>
      </div>
    </aside>
  );
}
