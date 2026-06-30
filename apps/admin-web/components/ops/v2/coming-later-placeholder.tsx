import { ComingLaterTag } from './coming-later-tag';

/**
 * Read-only placeholder for the not-yet-built secondary tabs. Carries no data,
 * no actions, no downloads.
 */
export function ComingLaterPlaceholder({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-8 text-center">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Read-only</p>
      <h2 className="mt-2 font-heading text-lg font-semibold text-foreground">
        {title} <ComingLaterTag />
      </h2>
      <p className="mx-auto mt-2 max-w-md text-pretty text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
