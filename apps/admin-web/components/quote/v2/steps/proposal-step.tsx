"use client"

import { Card } from "../../../ui/card"
import { Button } from "../../../ui/button"
import { StepHeader } from "../step-header"
import { cn } from "../../../../lib/utils"
import { formatCurrency } from "../../../../lib/quote-helpers"
import type {
  QuoteMeta,
  PricingBreakdown,
  ProposalContent,
  ProposalReadinessItem,
  StepId,
} from "../../../../lib/quote-types"
import { Check, X, FileText, Download, Send, AlertTriangle, ArrowRight, Loader2 } from "lucide-react"

export interface ProposalStepProps {
  meta: QuoteMeta
  pricing: PricingBreakdown
  proposal: ProposalContent
  readiness: ProposalReadinessItem[]
  canSend: boolean
  saving?: boolean
  onGeneratePdf?: () => void
  onSend?: () => void
  onNavigate: (step: StepId) => void
}

export function ProposalStep({
  meta,
  pricing,
  proposal,
  readiness,
  canSend,
  saving = false,
  onGeneratePdf,
  onSend,
  onNavigate,
}: ProposalStepProps) {
  const outstanding = readiness.filter((c) => !c.done)

  return (
    <div>
      <StepHeader
        title="Proposal & Review"
        description="Final pre-flight check before generating the client-facing PDF or sending the quote."
        action={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={onGeneratePdf}>
              <Download className="h-4 w-4" />
              Generate PDF
            </Button>
            <Button
              size="sm"
              disabled={!canSend || saving}
              onClick={onSend}
              title={!canSend ? "Resolve all readiness items before sending" : undefined}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {saving ? "Sending…" : "Send to client"}
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3">
          <Card className="overflow-hidden p-0">
            <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-4 py-2.5">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold text-foreground">{meta.title}</span>
            </div>
            <div className="grid gap-4 p-4 sm:grid-cols-2">
              <div>
                <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-success">
                  Included
                </h4>
                <ul className="space-y-1.5">
                  {proposal.included.map((item) => (
                    <li key={item} className="flex gap-2 text-xs text-foreground">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Not included
                </h4>
                <ul className="space-y-1.5">
                  {proposal.excluded.map((item) => (
                    <li key={item} className="flex gap-2 text-xs text-muted-foreground">
                      <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="flex items-center justify-between border-t border-border bg-accent/40 px-4 py-3">
              <span className="text-xs text-muted-foreground">
                Total for {pricing.pax} travellers
              </span>
              <div className="text-right">
                <div className="text-lg font-semibold text-foreground">
                  {formatCurrency(pricing.sellingPrice, pricing.currency)}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {formatCurrency(pricing.perPerson, pricing.currency)} per person
                </div>
              </div>
            </div>
          </Card>
        </div>

        <Card className="p-5 lg:col-span-2">
          <h3 className="text-sm font-semibold text-foreground">Readiness checklist</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {canSend
              ? "All checks passed — ready to send."
              : `${outstanding.length} item${outstanding.length === 1 ? "" : "s"} still need attention. Select one to jump to its step.`}
          </p>
          <ul className="mt-3 space-y-1">
            {readiness.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onNavigate(item.step)}
                  className="group flex w-full items-start gap-2.5 rounded-md px-1.5 py-1.5 text-left transition-colors hover:bg-muted"
                >
                  <span
                    className={cn(
                      "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full",
                      item.done
                        ? "bg-success text-success-foreground"
                        : "bg-warning/20 text-warning",
                    )}
                  >
                    {item.done ? (
                      <Check className="h-3 w-3" />
                    ) : (
                      <AlertTriangle className="h-2.5 w-2.5" />
                    )}
                  </span>
                  <span
                    className={cn(
                      "min-w-0 flex-1 text-xs",
                      item.done ? "text-muted-foreground line-through" : "text-foreground",
                    )}
                  >
                    {item.label}
                  </span>
                  {!item.done && (
                    <ArrowRight
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                      aria-hidden="true"
                    />
                  )}
                </button>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  )
}
