"use client"

import {
  Building2,
  Bus,
  Ticket,
  AlertTriangle,
  ArrowRight,
  TrendingUp,
  CheckCircle2,
} from "lucide-react"
import { Card } from "../../ui/card"
import { Progress } from "../../ui/progress"
import { Button } from "../../ui/button"
import { StatusBadge } from "./status-badges"
import { cn } from "../../../lib/utils"
import { formatCurrency } from "../../../lib/quote-helpers"
import type {
  StepId,
  PricingBreakdown,
  ComponentStatus,
  BlockingItem,
  NextAction,
} from "../../../lib/quote-types"

const COMPONENT_ICONS: Record<string, typeof Building2> = {
  hotels: Building2,
  transport: Bus,
  experiences: Ticket,
}

export interface QuoteSummarySidebarProps {
  pricing: PricingBreakdown
  readiness: number
  componentStatuses: ComponentStatus[]
  blockingItems: BlockingItem[]
  nextAction: NextAction | null
  onNavigate: (step: StepId) => void
  /**
   * Whether the current user's role may see sensitive cost/margin (default false
   * → restricted). When false the Margin row is omitted; the client-facing Total
   * quote value + Per person always render. Server-resolved (admin/super_admin/
   * finance); client-facing proposal/PDF redaction is separate and unchanged.
   */
  canViewCostMargin?: boolean
}

export function QuoteSummarySidebar({
  pricing,
  readiness,
  componentStatuses,
  blockingItems,
  nextAction,
  onNavigate,
  canViewCostMargin = false,
}: QuoteSummarySidebarProps) {
  const ready = blockingItems.length === 0

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Total quote value
        </p>
        <p className="font-heading text-3xl font-semibold tracking-tight text-foreground">
          {formatCurrency(pricing.sellingPrice, pricing.currency)}
        </p>
        <div className="mt-3 flex items-center justify-between rounded-lg bg-muted px-3 py-2">
          <span className="text-sm text-muted-foreground">Per person</span>
          <span className="font-heading text-base font-semibold text-foreground">
            {formatCurrency(pricing.perPerson, pricing.currency)}
          </span>
        </div>
        {canViewCostMargin ? (
          <div className="mt-2 flex items-center justify-between px-3">
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <TrendingUp className="size-4" aria-hidden="true" />
              Margin
            </span>
            <span className="text-sm font-medium text-success">
              {formatCurrency(pricing.margin, pricing.currency)} · {pricing.markupPercent}%
            </span>
          </div>
        ) : null}
      </Card>

      <Card className="p-5">
        <h3 className="font-heading text-sm font-semibold text-foreground">Cost components</h3>
        <div className="mt-3 space-y-2.5">
          {componentStatuses.map((c) => {
            const Icon = COMPONENT_ICONS[c.step] ?? Building2
            return (
              <button
                key={c.label}
                type="button"
                onClick={() => onNavigate(c.step)}
                className="flex w-full items-center justify-between rounded-md px-1 py-1 text-left transition-colors hover:bg-muted"
              >
                <span className="flex items-center gap-2 text-sm text-foreground">
                  <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
                  {c.label}
                </span>
                <StatusBadge status={c.status} />
              </button>
            )
          })}
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex items-center justify-between">
          <h3 className="font-heading text-sm font-semibold text-foreground">
            Proposal readiness
          </h3>
          <span className="font-heading text-sm font-semibold text-primary">{readiness}%</span>
        </div>
        {/* The percentage is the required-steps checklist (it gates "Mark as Sent").
            The items below are a separate, advisory review list — they don't change
            this percentage or block sending — so 100% can coexist with review items. */}
        <p className="mt-1 text-xs text-muted-foreground">Required-steps checklist</p>
        <Progress value={readiness} className="mt-3 h-2" />

        <div className="mt-4">
          {ready ? (
            <p className="flex items-center gap-2 text-sm text-success">
              <CheckCircle2 className="size-4" aria-hidden="true" />
              No items to review.
            </p>
          ) : (
            <>
              <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <AlertTriangle className="size-3.5 text-warning-foreground" aria-hidden="true" />
                Items to review ({blockingItems.length})
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Advisory — these don&apos;t affect the checklist above or block sending.
              </p>
              <ul className="mt-2 space-y-1">
                {blockingItems.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => onNavigate(item.step)}
                      className="group flex w-full items-start gap-2 rounded-md px-1 py-1 text-left text-sm text-foreground transition-colors hover:bg-muted"
                    >
                      <span
                        className="mt-1.5 size-1.5 shrink-0 rounded-full bg-destructive"
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1">{item.label}</span>
                      <ArrowRight
                        className="mt-0.5 size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                        aria-hidden="true"
                      />
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </Card>

      {nextAction ? (
        <Card className="border-primary/30 bg-accent p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-accent-foreground/70">
            Next required action
          </p>
          <p className="mt-1 text-sm font-medium text-accent-foreground">{nextAction.label}</p>
          <Button
            size="sm"
            className="mt-3 w-full gap-2"
            onClick={() => onNavigate(nextAction.step)}
          >
            Resolve now
            <ArrowRight className="size-4" aria-hidden="true" />
          </Button>
        </Card>
      ) : null}
    </div>
  )
}
