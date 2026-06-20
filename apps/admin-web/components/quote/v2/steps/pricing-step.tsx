"use client"

import { Card } from "../../../ui/card"
import { StepHeader } from "../step-header"
import { StepEmptyState } from "../states"
import { StatusBadge } from "../status-badges"
import { formatCurrency } from "../../../../lib/quote-helpers"
import type { PricingBreakdown } from "../../../../lib/quote-types"
import { Calculator } from "lucide-react"

export interface PricingStepProps {
  pricing: PricingBreakdown
}

export function PricingStep({ pricing }: PricingStepProps) {
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

      {lines.length === 0 ? (
        <StepEmptyState
          icon={Calculator}
          title="Nothing to price yet"
          description="Cost lines appear here once hotels, transport and experiences have been added."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-5">
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

          <Card className="flex flex-col gap-4 p-5 lg:col-span-2">
            <h3 className="text-sm font-semibold text-foreground">Margin & selling price</h3>

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
