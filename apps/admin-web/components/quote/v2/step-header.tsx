import type { ReactNode } from "react"
import { cn } from "../../../lib/utils"

/** Visual tone for the small per-step status label. */
export type StepStatusTone = "editable" | "view" | "preview"

const STATUS_TONE: Record<StepStatusTone, string> = {
  // Editable / interactive steps get the accent tone.
  editable: "border-transparent bg-accent text-accent-foreground",
  preview: "border-transparent bg-accent text-accent-foreground",
  // View-only steps get a neutral, muted tone so they read as non-editable.
  view: "border border-border bg-muted text-muted-foreground",
}

export function StepHeader({
  title,
  description,
  action,
  statusLabel,
  statusTone = "view",
  helper,
}: {
  title: string
  description: string
  action?: ReactNode
  /** Small label clarifying whether the step is editable / view-only / preview. */
  statusLabel?: string
  statusTone?: StepStatusTone
  /** One-line helper text explaining what the user can or cannot do here. */
  helper?: string
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-heading text-lg font-semibold tracking-tight text-foreground">
            {title}
          </h2>
          {statusLabel ? (
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                STATUS_TONE[statusTone],
              )}
            >
              {statusLabel}
            </span>
          ) : null}
        </div>
        <p className="text-pretty text-sm text-muted-foreground">{description}</p>
        {helper ? (
          <p className="mt-1 text-pretty text-xs text-muted-foreground">{helper}</p>
        ) : null}
      </div>
      {action ? <div className="flex items-center gap-2">{action}</div> : null}
    </div>
  )
}
