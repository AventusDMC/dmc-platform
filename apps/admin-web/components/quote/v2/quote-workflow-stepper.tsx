"use client"

import { Check, AlertTriangle, Circle } from "lucide-react"
import { cn } from "../../../lib/utils"
import type { StepId, Status, WorkflowStep } from "../../../lib/quote-types"

function StepIcon({
  index,
  isCurrent,
  status,
}: {
  index: number
  isCurrent: boolean
  status: Status
}) {
  const base =
    "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-colors"

  if (status === "complete") {
    return (
      <span className={cn(base, "border-success bg-success text-success-foreground")}>
        <Check className="size-3.5" aria-hidden="true" />
      </span>
    )
  }
  if (status === "missing") {
    return (
      <span
        className={cn(
          base,
          isCurrent
            ? "border-primary bg-primary text-primary-foreground"
            : "border-destructive/40 bg-destructive/10 text-destructive",
        )}
      >
        {isCurrent ? index + 1 : <Circle className="size-3" aria-hidden="true" />}
      </span>
    )
  }
  return (
    <span
      className={cn(
        base,
        isCurrent
          ? "border-primary bg-primary text-primary-foreground"
          : "border-warning/50 bg-warning/15 text-warning-foreground",
      )}
    >
      {isCurrent ? index + 1 : <AlertTriangle className="size-3" aria-hidden="true" />}
    </span>
  )
}

export function QuoteWorkflowStepper({
  steps,
  current,
  onChange,
}: {
  steps: WorkflowStep[]
  current: StepId
  onChange: (id: StepId) => void
}) {
  const currentIndex = steps.findIndex((s) => s.id === current)

  return (
    <div className="rounded-xl border border-border bg-card p-2">
      {/* Mobile: dropdown */}
      <div className="p-1 md:hidden">
        <label htmlFor="step-select" className="sr-only">
          Select workflow step
        </label>
        <select
          id="step-select"
          value={current}
          onChange={(e) => onChange(e.target.value as StepId)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-medium text-foreground"
        >
          {steps.map((step, i) => (
            <option key={step.id} value={step.id}>
              {`Step ${i + 1} — ${step.label}`}
            </option>
          ))}
        </select>
      </div>

      {/* Desktop / tablet: horizontal stepper */}
      <ol className="hidden items-stretch gap-0.5 md:flex">
        {steps.map((step, index) => {
          const isCurrent = index === currentIndex
          return (
            <li key={step.id} className="flex flex-1 items-center">
              <button
                type="button"
                onClick={() => onChange(step.id)}
                aria-current={isCurrent ? "step" : undefined}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors",
                  isCurrent ? "bg-accent ring-1 ring-primary/20" : "hover:bg-muted",
                )}
              >
                <StepIcon index={index} isCurrent={isCurrent} status={step.status} />
                <span className="hidden min-w-0 lg:block">
                  <span
                    className={cn(
                      "block truncate text-sm font-medium",
                      isCurrent ? "text-accent-foreground" : "text-foreground",
                    )}
                  >
                    {step.label}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {step.description}
                  </span>
                </span>
                <span
                  className={cn(
                    "truncate text-sm font-medium lg:hidden",
                    isCurrent ? "text-accent-foreground" : "text-foreground",
                  )}
                >
                  {step.label}
                </span>
              </button>
              {index < steps.length - 1 && (
                <span className="mx-0.5 h-px w-3 shrink-0 bg-border" aria-hidden="true" />
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
