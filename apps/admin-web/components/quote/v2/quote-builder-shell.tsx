"use client"

import type { ReactNode } from "react"
import { ChevronRight, Save, Eye, Send, Loader2 } from "lucide-react"
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
  saving = false,
  canSend = false,
  sendDisabledReason,
  onSave,
  onPreview,
  onSend,
}: QuoteBuilderShellProps) {
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
            <StatusPill status={meta.status} />
            <span className="text-xs text-muted-foreground">Saved {meta.lastSaved}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" className="gap-2" onClick={onSave} disabled={saving}>
            {saving ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="size-4" aria-hidden="true" />
            )}
            {saving ? "Saving…" : "Save Draft"}
          </Button>
          <Button variant="outline" size="sm" className="gap-2" onClick={onPreview}>
            <Eye className="size-4" aria-hidden="true" />
            Preview Proposal
          </Button>
          <Button
            size="sm"
            className="gap-2"
            disabled={sendDisabled}
            onClick={onSend}
            aria-disabled={sendDisabled}
            title={sendDisabled ? sendDisabledReason : undefined}
          >
            <Send className="size-4" aria-hidden="true" />
            Send Quote
          </Button>
          {sendDisabled && sendDisabledReason ? (
            <span className="sr-only" role="note">
              {sendDisabledReason}
            </span>
          ) : null}
        </div>
      </header>
      {children}
    </div>
  )
}
