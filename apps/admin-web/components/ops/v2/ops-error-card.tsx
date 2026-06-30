import { AlertTriangle } from 'lucide-react';
import { OpenInClassicButton } from './open-in-classic-button';

/**
 * Region/page error for the read-only ops surface. Never a raw Next error
 * overlay, never a blank screen — always offers the Classic fallback.
 */
export function OpsErrorCard({ classicHref, message }: { classicHref: string; message?: string }) {
  return (
    <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-8 text-center">
      <AlertTriangle className="mx-auto size-6 text-destructive" aria-hidden="true" />
      <h2 className="mt-2 font-heading text-lg font-semibold text-foreground">
        Couldn&rsquo;t load this view
      </h2>
      <p className="mx-auto mt-2 max-w-md text-pretty text-sm text-muted-foreground">
        {message ?? 'The operations data is temporarily unavailable. You can continue in Classic.'}
      </p>
      <div className="mt-4 flex justify-center">
        <OpenInClassicButton href={classicHref} />
      </div>
    </div>
  );
}
