import type { ActivityItemVM } from '../../../app/operations/v2/ops-activity-vm';
import { VARIANT_CLASS } from './operational-status-badge';

const DOT_CLASS: Record<string, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  critical: 'bg-destructive',
  info: 'bg-primary',
  neutral: 'bg-muted-foreground',
};

/**
 * Read-only vertical activity timeline (newest first). Display only — no edit
 * controls, no forms, no inputs. Renders sanitized fields from the lean VM;
 * never raw JSON or financial values.
 */
export function ActivityTimeline({ items }: { items: ActivityItemVM[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
        No activity logged yet.
      </div>
    );
  }
  return (
    <ol className="relative space-y-4 border-l border-border pl-5">
      {items.map((item) => (
        <li key={item.id} className="relative">
          <span
            className={`absolute -left-[1.4rem] top-1.5 size-2.5 rounded-full ring-2 ring-background ${DOT_CLASS[item.severity] ?? DOT_CLASS.info}`}
            aria-hidden="true"
          />
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-foreground">{item.action}</span>
            {item.entityLabel ? (
              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${VARIANT_CLASS.neutral}`}>
                {item.entityLabel}
              </span>
            ) : null}
            <span className="text-xs text-muted-foreground">{item.timestampLabel}</span>
          </div>
          {item.changeSummary ? (
            <p className="mt-0.5 text-sm text-muted-foreground">{item.changeSummary}</p>
          ) : null}
          {item.detail ? <p className="mt-0.5 text-xs text-muted-foreground">{item.detail}</p> : null}
          <p className="mt-0.5 text-xs text-muted-foreground">{item.actor}</p>
        </li>
      ))}
    </ol>
  );
}
