import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { OpenInClassicButton } from './open-in-classic-button';

/**
 * Booking Operations V2 in-page header. Renders INSIDE the existing app shell
 * (no second global nav). Mirrors the Quote Builder V2 header pattern:
 * breadcrumb → title + "Read-only V2 Beta" tag → right-side actions. The only
 * action wired in Round 1 is the navigation-only "Open in Classic" link; any
 * future primary action is passed disabled by the caller.
 */
export function OpsBetaHeader({
  breadcrumb,
  title,
  classicHref,
  classicLabel,
  statusSlot,
  rightSlot,
  helper,
}: {
  /** Breadcrumb trail segments, last one is emphasized. */
  breadcrumb: string[];
  title: string;
  /** Deep link to the equivalent Classic surface. Always shown. */
  classicHref: string;
  classicLabel?: string;
  /** Optional status pill rendered next to the title (e.g. booking status). */
  statusSlot?: ReactNode;
  /** Optional extra (disabled "Coming later") controls. */
  rightSlot?: ReactNode;
  /** Optional helper copy rendered under the title row. */
  helper?: string;
}) {
  return (
    <header className="flex flex-col gap-4 border-b border-border bg-card px-4 py-4 md:px-6 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0">
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
          {breadcrumb.map((seg, i) => {
            const last = i === breadcrumb.length - 1;
            return (
              <span key={`${seg}-${i}`} className="flex items-center gap-1.5">
                <span className={last ? 'font-medium text-foreground' : undefined}>{seg}</span>
                {!last ? <ChevronRight className="size-3.5" aria-hidden="true" /> : null}
              </span>
            );
          })}
        </nav>
        <div className="mt-1.5 flex flex-wrap items-center gap-3">
          <h1 className="font-heading text-xl font-semibold tracking-tight text-foreground md:text-2xl">
            {title}
          </h1>
          <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-secondary-foreground">
            Read-only V2 Beta
          </span>
          {statusSlot}
        </div>
        {helper ? <p className="mt-1 text-sm text-muted-foreground">{helper}</p> : null}
      </div>

      <div className="flex flex-wrap items-center gap-2 lg:justify-end">
        {rightSlot}
        <OpenInClassicButton href={classicHref} label={classicLabel} />
      </div>
    </header>
  );
}
