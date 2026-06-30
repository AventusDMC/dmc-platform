import type { ActivityVM } from '../../../app/operations/v2/ops-activity-vm';
import { ActivityTimeline } from './activity-timeline';
import { OpenInClassicButton } from './open-in-classic-button';
import { ReadOnlyNotice } from './read-only-notice';

/**
 * Activity tab body (read-only, auditLogs-only for Round 1). Persistent notice
 * + a navigation-only "Open audit log in Classic" link + the timeline. No edit
 * controls, no forms, no inputs, no resend/replay/revert.
 */
export function ActivityTab({ vm, bookingId }: { vm: ActivityVM; bookingId: string }) {
  return (
    <div className="space-y-6">
      <ReadOnlyNotice message="Audit and dispatch events are read-only in V2. Changes are made in Classic." />

      <section aria-label="Activity" className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-heading text-sm font-semibold text-foreground">Activity</h2>
          <OpenInClassicButton href={`/bookings/${bookingId}?tab=audit-log`} label="Open audit log in Classic" />
        </div>
        <ActivityTimeline items={vm.items} />
      </section>
    </div>
  );
}
