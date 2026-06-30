import type { PhaseSectionVM } from '../../../app/operations/v2/ops-view-model';
import { ServiceRow } from './service-row';
import { VARIANT_CLASS } from './operational-status-badge';

/**
 * One phase group (header with count + severity tint, then its service rows).
 * Empty phases still render their header so the fixed 5-phase structure is
 * always visible and scannable.
 */
export function PhaseSection({ section }: { section: PhaseSectionVM }) {
  return (
    <section aria-label={section.phase} className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="font-heading text-sm font-semibold text-foreground">{section.phase}</h3>
        <span
          className={`inline-flex min-w-6 items-center justify-center rounded-full border px-2 py-0.5 text-xs font-medium ${VARIANT_CLASS[section.variant]}`}
        >
          {section.count}
        </span>
      </div>
      {section.rows.length > 0 ? (
        <ul className="space-y-2">
          {section.rows.map((row) => (
            <ServiceRow key={row.id} row={row} />
          ))}
        </ul>
      ) : (
        <p className="rounded-lg border border-dashed border-border bg-card px-3 py-2 text-xs text-muted-foreground">
          Nothing in this phase.
        </p>
      )}
    </section>
  );
}
