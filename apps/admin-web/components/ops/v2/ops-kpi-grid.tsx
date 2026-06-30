import type { KpiVM } from '../../../app/operations/v2/ops-command-center-vm';
import { VARIANT_CLASS } from './operational-status-badge';

/** Read-only KPI stat grid using dispatch/dashboard counters. */
export function OpsKpiGrid({ kpis }: { kpis: KpiVM[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {kpis.map((kpi) => (
        <div key={kpi.key} className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{kpi.label}</p>
          <div className="mt-1 flex items-center gap-2">
            <span className="font-heading text-2xl font-semibold text-foreground">{kpi.value ?? '—'}</span>
            {kpi.value != null && kpi.value > 0 ? (
              <span className={`size-2 rounded-full ${VARIANT_CLASS[kpi.variant].split(' ').find((c) => c.startsWith('bg-')) ?? 'bg-muted'}`} aria-hidden="true" />
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
