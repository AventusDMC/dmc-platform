import type { CommandCenterVM } from '../../../app/operations/v2/ops-command-center-vm';
import { OpsAttentionTable } from './ops-attention-table';
import { OpsCommandSidebar } from './ops-command-sidebar';
import { OpsDispatchWindow } from './ops-dispatch-window';
import { OpsErrorCard } from './ops-error-card';
import { OpsKpiGrid } from './ops-kpi-grid';

/**
 * Command Center (Screen 1) body. Read-only fleet triage. Each region degrades
 * independently: if one data source failed, that region shows an error card
 * (with Open in Classic) while the others still render.
 */
export function CommandCenter({ vm, activeRange }: { vm: CommandCenterVM; activeRange: string }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="min-w-0 space-y-6">
        {vm.kpisAvailable ? (
          <OpsKpiGrid kpis={vm.kpis} />
        ) : (
          <OpsErrorCard classicHref="/operations/dispatch" message="Fleet KPIs are temporarily unavailable. You can continue in Classic." />
        )}

        {vm.dispatchAvailable && vm.dispatch ? (
          <OpsDispatchWindow summary={vm.dispatch} activeRange={activeRange} />
        ) : (
          <OpsErrorCard classicHref="/operations/dispatch" message="The dispatch window is temporarily unavailable. You can continue in Classic." />
        )}

        {vm.queueAvailable ? (
          <OpsAttentionTable queue={vm.queue} />
        ) : (
          <OpsErrorCard classicHref="/bookings" message="The bookings queue is temporarily unavailable. You can continue in Classic." />
        )}
      </div>

      <div className="lg:sticky lg:top-4 lg:self-start">
        <OpsCommandSidebar sidebar={vm.sidebar} dispatch={vm.dispatch} />
      </div>
    </div>
  );
}
