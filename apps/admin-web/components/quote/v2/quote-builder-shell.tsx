"use client"

import type { ReactNode } from "react"
import { ChevronRight, Eye, Send } from "lucide-react"
import { Button } from "../../ui/button"
import { cn } from "../../../lib/utils"
import type { QuoteMeta, QuoteStatus } from "../../../lib/quote-types"

// NOTE: Builder V2 renders INSIDE the existing ERP/global app chrome (the
// shared app sidebar + top bar from app/layout.tsx). This shell therefore does
// NOT render its own sidebar and is NOT a full-screen (h-screen) shell — that
// would duplicate the app chrome and create nested scroll contexts. It is just
// an in-page builder header (breadcrumb / title / status + top actions)
// followed by the builder content in normal page flow.

const statusStyles: Record<QuoteStatus, string> = {
  draft: "bg-muted text-muted-foreground border-border",
  "in-review": "bg-warning/15 text-warning-foreground border-warning/30",
  sent: "bg-accent text-accent-foreground border-accent-foreground/20",
  confirmed: "bg-success/10 text-success border-success/20",
}

const statusLabels: Record<QuoteStatus, string> = {
  draft: "Draft",
  "in-review": "In Review",
  sent: "Sent",
  confirmed: "Confirmed",
}

function StatusPill({ status }: { status: QuoteStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
        statusStyles[status],
      )}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {statusLabels[status]}
    </span>
  )
}

export interface QuoteBuilderShellProps {
  meta: QuoteMeta
  children: ReactNode
  saving?: boolean
  canSend?: boolean
  sendDisabledReason?: string
  onSave?: () => void
  onPreview?: () => void
  onSend?: () => void
}

export function QuoteBuilderShell({
  meta,
  children,
  onPreview,
}: QuoteBuilderShellProps) {
  // NOTE: Save Draft and Send Quote are intentionally not wired in V2 yet, so
  // the global Save Draft button is omitted and Send Quote is always disabled
  // with a clear tooltip. The Itinerary step keeps its own working Save for
  // descriptive title/notes; Preview Proposal / Download PDF are functional.
  return (
    <div className="bg-background">
      <header className="flex flex-col gap-4 border-b border-border bg-card px-4 py-4 md:px-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <nav
            aria-label="Breadcrumb"
            className="flex items-center gap-1.5 text-sm text-muted-foreground"
          >
            <span>Quotes</span>
            <ChevronRight className="size-3.5" aria-hidden="true" />
            <span>{meta.destination}</span>
            <ChevronRight className="size-3.5" aria-hidden="true" />
            <span className="font-medium text-foreground">{meta.reference}</span>
          </nav>
          <div className="mt-1.5 flex flex-wrap items-center gap-3">
            <h1 className="font-heading text-xl font-semibold tracking-tight text-foreground md:text-2xl">
              Quote Builder
            </h1>
            <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-foreground">
              V2 Beta
            </span>
            <StatusPill status={meta.status} />
            <span className="text-xs text-muted-foreground">Saved {meta.lastSaved}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={onPreview}>
            <Eye className="size-4" aria-hidden="true" />
            Preview Proposal
          </Button>
          {/* Not wired in V2 yet — always disabled with a clear tooltip. */}
          <Button
            size="sm"
            className="gap-2"
            disabled
            aria-disabled="true"
            title="Send Quote is not available in V2 yet."
          >
            <Send className="size-4" aria-hidden="true" />
            Send Quote
          </Button>
          <span className="sr-only" role="note">
            Send Quote is not available in V2 yet.
          </span>
        </div>
      </header>
      {children}
    </div>
  )
}
