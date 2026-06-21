"use client"

import type { ReactNode } from "react"
import { ChevronRight, Eye, Send, Loader2, ExternalLink } from "lucide-react"
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
  /** True while the Mark-as-Sent status change is in flight. */
  saving?: boolean
  /** Whether "Mark as Sent" is allowed (readiness passes + not lifecycle-locked). */
  canSend?: boolean
  /** Why Mark-as-Sent is disabled (readiness or lifecycle reason) — shown as tooltip. */
  sendDisabledReason?: string
  /** Backend error from the last Mark-as-Sent attempt (e.g. completeness 400). */
  sendError?: string | null
  onPreview?: () => void
  /** Mark the quote as Sent (status → SENT). Confirms before mutating. */
  onSend?: () => void
  /** Link to the classic quote workspace (fallback for not-yet-in-V2 editing). */
  classicHref?: string
}

export function QuoteBuilderShell({
  meta,
  children,
  saving = false,
  canSend = false,
  sendDisabledReason,
  sendError,
  onPreview,
  onSend,
  classicHref,
}: QuoteBuilderShellProps) {
  // "Mark as Sent" performs a status-only change (status → SENT). It does NOT
  // email the client or create a public link. The Itinerary step keeps its own
  // working Save for title/notes; Preview Proposal / Download PDF are functional.
  const sendDisabled = !canSend || saving
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

        <div className="flex flex-col items-stretch gap-1 lg:items-end">
          <div className="flex flex-wrap items-center gap-2">
            {classicHref ? (
              <a
                href={classicHref}
                className="inline-flex h-8 items-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                title="Open the full classic quote workspace (services, pricing, versions, etc.)"
              >
                <ExternalLink className="size-4" aria-hidden="true" />
                Open Classic Builder
              </a>
            ) : null}
            <Button variant="outline" size="sm" className="gap-2" onClick={onPreview}>
              <Eye className="size-4" aria-hidden="true" />
              Preview Proposal
            </Button>
            {/* Mark as Sent — status-only change (no email, no public link). */}
            <Button
              size="sm"
              className="gap-2"
              onClick={onSend}
              disabled={sendDisabled}
              aria-disabled={sendDisabled}
              title={sendDisabled ? sendDisabledReason : undefined}
            >
              {saving ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Send className="size-4" aria-hidden="true" />
              )}
              {saving ? "Marking…" : "Mark as Sent"}
            </Button>
          </div>
          {sendError ? (
            <p className="max-w-xs text-pretty text-right text-xs text-destructive" role="alert">
              {sendError}
            </p>
          ) : sendDisabled && sendDisabledReason ? (
            <span className="text-right text-[11px] text-muted-foreground" role="note">
              {sendDisabledReason}
            </span>
          ) : null}
        </div>
      </header>
      {children}
    </div>
  )
}
