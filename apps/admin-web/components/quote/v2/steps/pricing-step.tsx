"use client"

import { Card } from "../../../ui/card"
import { StepHeader } from "../step-header"
import { StepEmptyState } from "../states"
import { StatusBadge } from "../status-badges"
import { ClassicGuidance } from "./classic-guidance"
import { formatCurrency } from "../../../../lib/quote-helpers"
import type { PricingBreakdown } from "../../../../lib/quote-types"
import { Calculator } from "lucide-react"

export interface PricingStepProps {
  pricing: PricingBreakdown
  /** Link to the classic builder for the Classic-only pricing edits. */
  classicHref?: string
  /**
   * Whether the current user's role may see sensitive cost/margin (default false
   * → restricted). When false the per-line Cost breakdown and the Net cost /
   * Markup / Margin figures are hidden behind a "Restricted" state; the
   * client-facing Selling price + Per person always render. Server-resolved
   * (admin/super_admin/finance); proposal/PDF redaction is separate and unchanged.
   */
  canViewCostMargin?: boolean
}

export function PricingStep({ pricing, classicHref, canViewCostMargin = false }: PricingStepProps) {
  const { lines, netCost, markupPercent, margin, sellingPrice, pax, perPerson, currency } = pricing

  return (
    <div>
      <StepHeader
        title="Pricing & Margin"
        description="Net costs roll up from each component. Markup and selling price are calculated by the pricing engine."
        statusLabel="View only"
        statusTone="view"
        helper="Pricing is displayed from the existing pricing engine and is not editable in V2 yet."
      />

      <ClassicGuidance
        message="Pricing, markups, overrides, pax/room counts, FOC, single supplement, and recalculation are managed in Classic Builder. V2 pricing is read-only."
        classicHref={classicHref}
      />

      {lines.length === 0 ? (
        <StepEmptyState
          icon={Calculator}
          title="Nothing to price yet"
          description="Cost lines appear here once hotels, transport and experiences have been added."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-5">
          {canViewCostMargin ? (
            <Card className="overflow-hidden p-0 lg:col-span-3">
              <div className="border-b border-border bg-muted/40 px-4 py-2.5">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Cost breakdown
                </span>
              </div>
              <div className="divide-y divide-border">
                {lines.map((line) => (
                  <div key={line.id} className="flex items-center justify-between gap-4 px-4 py-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">{line.label}</span>
                        <StatusBadge status={line.status} />
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">{line.note}</p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold text-foreground">
                      {formatCurrency(line.amount, currency)}
                    </span>
                  </div>
                ))}
                <div className="flex items-center justify-between bg-muted/30 px-4 py-3">
                  <span className="text-sm font-semibold text-foreground">Net cost</span>
                  <span className="text-sm font-semibold text-foreground">
                    {formatCurrency(netCost, currency)}
                  </span>
                </div>
              </div>
            </Card>
          ) : (
            <Card className="overflow-hidden p-0 lg:col-span-3">
              <div className="border-b border-border bg-muted/40 px-4 py-2.5">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Cost breakdown
                </span>
              </div>
              <div className="flex flex-col items-center justify-center gap-1 px-4 py-8 text-center">
                <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Restricted
                </span>
                <p className="mt-1 text-xs text-muted-foreground">
                  Per-line cost and net cost are visible to finance / admin roles only.
                </p>
              </div>
            </Card>
          )}

          <Card className="flex flex-col gap-4 p-5 lg:col-span-2">
            <h3 className="text-sm font-semibold text-foreground">
              {canViewCostMargin ? "Margin & selling price" : "Selling price"}
            </h3>

            {canViewCostMargin ? (
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Net cost</span>
                  <span className="font-medium text-foreground">
                    {formatCurrency(netCost, currency)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Markup</span>
                  <span className="font-medium text-foreground">{markupPercent}%</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Margin</span>
                  <span className="font-medium text-success">
                    {formatCurrency(margin, currency)}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Net cost, markup, and margin are <span className="font-medium">Restricted</span> —
                visible to finance / admin roles only.
              </p>
            )}

            <div className="rounded-lg bg-accent/50 p-4">
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Selling price
                </span>
                <span className="text-xl font-semibold text-foreground">
                  {formatCurrency(sellingPrice, currency)}
                </span>
              </div>
              <div className="mt-2 flex items-baseline justify-between border-t border-border/60 pt-2">
                <span className="text-xs text-muted-foreground">Per person ({pax} pax)</span>
                <span className="text-sm font-semibold text-foreground">
                  {formatCurrency(perPerson, currency)}
                </span>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
