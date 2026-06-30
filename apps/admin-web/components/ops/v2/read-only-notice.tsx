import { Lock } from 'lucide-react';

/** Persistent read-only banner for the Passengers & Rooming tab. */
export function ReadOnlyNotice({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
      <Lock className="size-4 shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}
