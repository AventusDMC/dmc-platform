import type { ManifestVM } from '../../../app/operations/v2/ops-view-model';
import { OperationalStatusBadge } from './operational-status-badge';

/** Read-only passenger-manifest summary (from operations-grid.passengerManifest). */
export function ManifestSummaryCard({ manifest }: { manifest: ManifestVM }) {
  if (!manifest) {
    return null;
  }
  return (
    <section id="manifest-summary" aria-label="Passenger manifest" className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-heading text-sm font-semibold text-foreground">Passenger manifest</h3>
        <OperationalStatusBadge
          variant={manifest.incomplete ? 'warning' : 'success'}
          label={manifest.incomplete ? 'Incomplete' : 'Complete'}
        />
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs text-muted-foreground">Received</dt>
          <dd className="font-medium text-foreground">{manifest.received}/{manifest.expected}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Missing</dt>
          <dd className="font-medium text-foreground">{manifest.missingRecords}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Incomplete</dt>
          <dd className="font-medium text-foreground">{manifest.incompleteRecords}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Status</dt>
          <dd className="font-medium text-foreground">{manifest.status}</dd>
        </div>
      </dl>
    </section>
  );
}
