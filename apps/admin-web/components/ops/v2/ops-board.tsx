import type { OperationsBoardVM } from '../../../app/operations/v2/ops-view-model';
import { ManifestSummaryCard } from './manifest-summary-card';
import { OpsSummarySidebar } from './ops-summary-sidebar';
import { PhaseSection } from './phase-section';

/**
 * Operations tab body: the 5-phase board (fixed order) + manifest summary, with
 * a sticky booking-scoped readiness/action sidebar. Fully read-only and
 * server-rendered — no client boundary, no data beyond the lean board VM.
 */
export function OpsBoard({ vm, bookingId }: { vm: OperationsBoardVM; bookingId: string }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="min-w-0 space-y-6">
        <ManifestSummaryCard manifest={vm.manifest} />
        <div className="space-y-6">
          {vm.phases.map((section) => (
            <PhaseSection key={section.phase} section={section} bookingId={bookingId} />
          ))}
        </div>
      </div>
      <div className="lg:sticky lg:top-4 lg:self-start">
        <OpsSummarySidebar
          summary={vm.summary}
          manifestIncomplete={vm.summary.manifestIncomplete}
          roomingIncompleteCount={vm.summary.roomingIncompleteCount}
        />
      </div>
    </div>
  );
}
