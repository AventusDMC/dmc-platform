import { Check, AlertTriangle, CircleDashed } from "lucide-react"
import { cn } from "../../../lib/utils"
import type { Status, ContractStatus } from "../../../lib/quote-types"

const statusConfig: Record<
  Status,
  { label: string; className: string; icon: typeof Check }
> = {
  complete: {
    label: "Complete",
    className: "bg-success/10 text-success border-success/20",
    icon: Check,
  },
  partial: {
    label: "Needs attention",
    className: "bg-warning/15 text-warning-foreground border-warning/30",
    icon: AlertTriangle,
  },
  missing: {
    label: "Missing",
    className: "bg-destructive/10 text-destructive border-destructive/20",
    icon: CircleDashed,
  },
}

export function StatusBadge({
  status,
  label,
  className,
}: {
  status: Status
  label?: string
  className?: string
}) {
  const { label: defaultLabel, className: styles, icon: Icon } = statusConfig[status]
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        styles,
        className,
      )}
    >
      <Icon className="size-3" aria-hidden="true" />
      {label ?? defaultLabel}
    </span>
  )
}

const contractConfig: Record<ContractStatus, { label: string; className: string }> = {
  contracted: {
    label: "Contracted",
    className: "bg-success/10 text-success border-success/20",
  },
  "on-request": {
    label: "On request",
    className: "bg-warning/15 text-warning-foreground border-warning/30",
  },
  "no-contract": {
    label: "No contract",
    className: "bg-destructive/10 text-destructive border-destructive/20",
  },
}

export function ContractBadge({
  status,
  className,
}: {
  status: ContractStatus
  className?: string
}) {
  const { label, className: styles } = contractConfig[status]
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        styles,
        className,
      )}
    >
      {label}
    </span>
  )
}
