/**
 * A mutating affordance rendered INERT for Round 1 (read-only). Always a
 * `disabled` button with `aria-disabled` and a "Coming later" tooltip/label —
 * never wires an onClick, a form, or a fetch. This is the ONLY button primitive
 * permitted for any non-navigation action in the V2 ops surface, so "read-only"
 * is enforced by construction (and asserted by the read-only invariant test).
 */
export function DisabledAction({ label }: { label: string }) {
  return (
    <button
      type="button"
      disabled
      aria-disabled="true"
      title={`${label} — Coming later`}
      className="inline-flex h-7 cursor-not-allowed items-center gap-1 rounded-md border border-input bg-background px-2.5 text-xs font-medium text-muted-foreground opacity-70"
    >
      {label}
      <span className="rounded-full bg-muted px-1.5 py-px text-[10px] font-medium text-muted-foreground">
        Coming later
      </span>
    </button>
  );
}
