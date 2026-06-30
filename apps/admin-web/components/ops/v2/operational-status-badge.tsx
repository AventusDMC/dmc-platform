import type { StatusVariant } from '../../../app/operations/v2/ops-status-map';

/**
 * Variant → Tailwind class map (scoped tokens from ops-v2.css, matching Quote
 * Builder V2). Exported so phase headers / action cards reuse the same palette.
 * Every variant pairs a tint with text — never color-only — for a11y contrast.
 */
export const VARIANT_CLASS: Record<StatusVariant, string> = {
  success: 'bg-success/10 text-success border-success/20',
  warning: 'bg-warning/15 text-warning-foreground border-warning/30',
  critical: 'bg-destructive/10 text-destructive border-destructive/20',
  info: 'bg-primary/10 text-primary border-primary/20',
  neutral: 'bg-muted text-muted-foreground border-border',
};

export function OperationalStatusBadge({
  variant,
  label,
  prefix,
}: {
  variant: StatusVariant;
  label: string;
  /** Optional axis prefix shown muted, e.g. "Confirmation". */
  prefix?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${VARIANT_CLASS[variant]}`}
    >
      {prefix ? <span className="opacity-70">{prefix}:</span> : null}
      {label}
    </span>
  );
}
