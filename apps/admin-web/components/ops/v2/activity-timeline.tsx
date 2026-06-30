import { History } from 'lucide-react';
import type { ActivityItemVM } from '../../../app/operations/v2/ops-activity-vm';
import { VARIANT_CLASS } from './operational-status-badge';

const DOT_CLASS: Record<string, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  critical: 'bg-destructive',
  info: 'bg-primary',
  neutral: 'bg-muted-foreground',
};

// Severity accent strip down the left edge of each card (mirrors the dot colour
// so the timeline reads at a glance). Neutral entries get a quiet border tone.
const BAR_CLASS: Record<string, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  critical: 'bg-destructive',
  info: 'bg-primary',
  neutral: 'bg-border',
};

/**
 * Read-only vertical activity timeline (newest first). Display only — no edit
 * controls, no forms, no inputs. Each entry is a self-contained card with a
 * severity accent + dot, a clean action/timestamp row, and a readable old→new
 * summary. Renders sanitized fields from the lean VM; never raw JSON or
 * financial values.
 */
export function ActivityTimeline({ items }: { items: ActivityItemVM[] }) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-card px-6 py-10 text-center">
        <span className="flex size-9 items-center justify-center rounded-full bg-muted" aria-hidden="true">
          <History className="size-4 text-muted-foreground" />
        </span>
        <p className="text-sm font-medium text-foreground">No activity logged yet.</p>
        <p className="max-w-xs text-xs text-muted-foreground">
          Operational events for this booking will appear here as they happen.
        </p>
      </div>
    );
  }

  return (
    <ol className="space-y-2.5">
      {items.map((item) => {
        const severity = DOT_CLASS[item.severity] ? item.severity : 'info';
        return (
          <li
            key={item.id}
            className="relative overflow-hidden rounded-lg border border-border bg-card shadow-sm"
          >
            <span
              className={`absolute inset-y-0 left-0 w-1 ${BAR_CLASS[severity] ?? BAR_CLASS.info}`}
              aria-hidden="true"
            />
            <div className="flex gap-3 py-3 pl-4 pr-3">
              <span
                className={`mt-1.5 size-2.5 shrink-0 rounded-full ring-4 ring-card ${DOT_CLASS[severity] ?? DOT_CLASS.info}`}
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{item.action}</span>
                    {item.entityLabel ? (
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${VARIANT_CLASS.neutral}`}
                      >
                        {item.entityLabel}
                      </span>
                    ) : null}
                  </div>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{item.timestampLabel}</span>
                </div>
                {item.changeSummary ? (
                  <p className="text-sm leading-relaxed text-foreground">{item.changeSummary}</p>
                ) : null}
                {item.detail ? <p className="text-xs leading-relaxed text-muted-foreground">{item.detail}</p> : null}
                <p className="text-xs text-muted-foreground">{item.actor}</p>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
