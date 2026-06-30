/**
 * Inline "Coming later" placeholder pill. Used on tabs/cards/actions that are
 * intentionally inert in Round 1 (read-only). Non-interactive — it only labels
 * a deferred capability; it never wires a mutation.
 */
export function ComingLaterTag({ label = 'Coming later' }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
      {label}
    </span>
  );
}
