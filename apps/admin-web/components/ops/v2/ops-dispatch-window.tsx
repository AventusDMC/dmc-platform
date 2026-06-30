import type { DispatchSummaryVM } from '../../../app/operations/v2/ops-command-center-vm';
import { VARIANT_CLASS } from './operational-status-badge';

const RANGES: { value: string; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'tomorrow', label: 'Tomorrow' },
  { value: 'next-7-days', label: 'Next 7 days' },
];

/**
 * Dispatch window: read-only range control (navigation-only links that re-fetch
 * via ?range=) + per-lane summary cards. Empty state when no services.
 */
export function OpsDispatchWindow({ summary, activeRange }: { summary: DispatchSummaryVM; activeRange: string }) {
  return (
    <section aria-label="Dispatch window" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-heading text-sm font-semibold text-foreground">Dispatch · {summary.rangeLabel}</h2>
        <nav aria-label="Dispatch range" className="inline-flex rounded-md border border-input p-0.5">
          {RANGES.map((r) => {
            const active = r.value === activeRange;
            return (
              <a
                key={r.value}
                href={`/operations/v2?range=${r.value}`}
                aria-current={active ? 'page' : undefined}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  active ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {r.label}
              </a>
            );
          })}
        </nav>
      </div>

      {summary.isEmpty ? (
        <div className="rounded-lg border border-dashed border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
          No services in this window.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {summary.lanes.map((lane) => (
            <div key={lane.label} className="rounded-lg border border-border bg-card p-3">
              <p className="text-xs font-medium text-muted-foreground">{lane.label}</p>
              <p className="mt-1 font-heading text-lg font-semibold text-foreground">{lane.total}</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {lane.critical > 0 ? (
                  <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${VARIANT_CLASS.critical}`}>{lane.critical} crit</span>
                ) : null}
                {lane.actionRequired > 0 ? (
                  <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${VARIANT_CLASS.warning}`}>{lane.actionRequired} act</span>
                ) : null}
                {lane.ready > 0 ? (
                  <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${VARIANT_CLASS.success}`}>{lane.ready} ready</span>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
