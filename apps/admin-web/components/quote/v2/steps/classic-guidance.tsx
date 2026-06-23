"use client"

import { Info, ExternalLink } from "lucide-react"

/**
 * Small, non-blocking informational banner that tells the operator a given V2
 * step is intentionally read-only / limited and points them to the classic
 * builder for the Classic-only edits. Purely presentational — no mutations.
 */
export function ClassicGuidance({ message, classicHref }: { message: string; classicHref?: string }) {
  return (
    <div className="mb-4 flex flex-col gap-2 rounded-md border border-border bg-muted/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-2 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>{message}</span>
      </div>
      {classicHref ? (
        <a
          href={classicHref}
          className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-input bg-background px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          title="Open the full classic quote workspace"
        >
          <ExternalLink className="size-3.5" aria-hidden="true" />
          Open Classic Builder
        </a>
      ) : null}
    </div>
  )
}
