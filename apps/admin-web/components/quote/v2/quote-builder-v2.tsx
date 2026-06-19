"use client"

import { useMemo, useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "../../ui/button"
import { QuoteBuilderShell } from "./quote-builder-shell"
import { QuoteHeaderSummary } from "./quote-header-summary"
import { QuoteWorkflowStepper } from "./quote-workflow-stepper"
import { QuoteSummarySidebar } from "./quote-summary-sidebar"
import {
  QuoteBuilderLoading,
  QuoteBuilderEmpty,
  QuoteBuilderError,
} from "./states"
import { SetupStep } from "./steps/setup-step"
import { ItineraryStep } from "./steps/itinerary-step"
import { HotelsStep } from "./steps/hotels-step"
import { ExperiencesStep } from "./steps/experiences-step"
import { TransportStep } from "./steps/transport-step"
import { PricingStep } from "./steps/pricing-step"
import { ProposalStep } from "./steps/proposal-step"
import {
  canSendQuote,
  getBlockingItems,
  getComponentStatuses,
  getNextAction,
  getOutstandingItems,
  getReadiness,
} from "../../../lib/quote-helpers"
import type { Quote, StepId } from "../../../lib/quote-types"

export interface QuoteBuilderV2Props {
  /** The quote to render. When omitted (and not loading), the empty state shows. */
  quote?: Quote | null
  /** Show the loading skeleton. */
  isLoading?: boolean
  /** Error message; when set, the error state is shown. */
  error?: string | null
  /** Retry handler for the error state. */
  onRetry?: () => void
  /** Persist a draft. May be async; a saving state is shown while it resolves. */
  onSave?: (quote: Quote) => void | Promise<void>
  /** Send the quote to the client. Only callable when all readiness items pass. */
  onSend?: (quote: Quote) => void | Promise<void>
  /** Generate the client-facing PDF. */
  onGeneratePdf?: (quote: Quote) => void | Promise<void>
  /** Open the client-facing proposal preview (HTML). */
  onPreview?: (quote: Quote) => void | Promise<void>
  /** Which step to open first. */
  initialStep?: StepId
}

export function QuoteBuilderV2({
  quote,
  isLoading = false,
  error = null,
  onRetry,
  onSave,
  onSend,
  onGeneratePdf,
  onPreview,
  initialStep = "setup",
}: QuoteBuilderV2Props) {
  const [current, setCurrent] = useState<StepId>(initialStep)
  const [saving, setSaving] = useState(false)
  const [sending, setSending] = useState(false)

  // Derive everything from the quote (display-only; no pricing math here).
  const insights = useMemo(() => {
    if (!quote) return null
    return {
      readiness: getReadiness(quote),
      canSend: canSendQuote(quote),
      blockingItems: getBlockingItems(quote),
      componentStatuses: getComponentStatuses(quote),
      nextAction: getNextAction(quote),
      outstanding: getOutstandingItems(quote),
    }
  }, [quote])

  // ---- Non-happy states -------------------------------------------------
  if (isLoading) return <QuoteBuilderLoading />
  if (error) return <QuoteBuilderError message={error} onRetry={onRetry} />
  if (!quote || !insights) {
    return (
      <QuoteBuilderEmpty
        action={
          onRetry ? (
            <Button size="sm" onClick={onRetry}>
              Reload
            </Button>
          ) : undefined
        }
      />
    )
  }

  const steps = quote.steps
  const currentIndex = steps.findIndex((s) => s.id === current)
  const safeIndex = currentIndex === -1 ? 0 : currentIndex

  const goPrev = () => {
    if (safeIndex > 0) setCurrent(steps[safeIndex - 1].id)
  }
  const goNext = () => {
    if (safeIndex < steps.length - 1) setCurrent(steps[safeIndex + 1].id)
  }

  const handleSave = async () => {
    if (!onSave) return
    try {
      setSaving(true)
      await onSave(quote)
    } finally {
      setSaving(false)
    }
  }

  const handleSend = async () => {
    if (!onSend || !insights.canSend) return
    try {
      setSending(true)
      await onSend(quote)
    } finally {
      setSending(false)
    }
  }

  const sendDisabledReason = !insights.canSend
    ? `${insights.outstanding.length} item${insights.outstanding.length === 1 ? "" : "s"} still need attention before sending`
    : undefined

  const renderStep = () => {
    switch (current) {
      case "setup":
        return <SetupStep fields={quote.setupFields} />
      case "itinerary":
        return <ItineraryStep days={quote.itinerary} />
      case "hotels":
        return <HotelsStep cities={quote.hotelCities} currency={quote.meta.currency} />
      case "experiences":
        return (
          <ExperiencesStep experiences={quote.experiences} currency={quote.meta.currency} />
        )
      case "transport":
        return <TransportStep services={quote.transport} currency={quote.meta.currency} />
      case "pricing":
        return <PricingStep pricing={quote.pricing} />
      case "proposal":
        return (
          <ProposalStep
            meta={quote.meta}
            pricing={quote.pricing}
            proposal={quote.proposal}
            readiness={quote.readiness}
            canSend={insights.canSend}
            saving={sending}
            onGeneratePdf={onGeneratePdf ? () => onGeneratePdf(quote) : undefined}
            onSend={handleSend}
            onNavigate={setCurrent}
          />
        )
      default:
        return <SetupStep fields={quote.setupFields} />
    }
  }

  return (
    <QuoteBuilderShell
      meta={quote.meta}
      saving={saving || sending}
      canSend={insights.canSend}
      sendDisabledReason={sendDisabledReason}
      onSave={handleSave}
      onPreview={onPreview ? () => onPreview(quote) : undefined}
      onSend={handleSend}
    >
      <div className="mx-auto w-full max-w-[1600px] space-y-5 p-4 md:p-6">
        <QuoteHeaderSummary meta={quote.meta} client={quote.client} />
        <QuoteWorkflowStepper steps={steps} current={current} onChange={setCurrent} />

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0">
            {renderStep()}

            <div className="mt-6 flex items-center justify-between border-t border-border pt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={goPrev}
                disabled={safeIndex === 0}
                className="gap-1.5"
              >
                <ChevronLeft className="size-4" aria-hidden="true" />
                {safeIndex > 0 ? steps[safeIndex - 1].label : "Back"}
              </Button>
              <span className="text-xs text-muted-foreground">
                Step {safeIndex + 1} of {steps.length}
              </span>
              <Button
                size="sm"
                onClick={goNext}
                disabled={safeIndex === steps.length - 1}
                className="gap-1.5"
              >
                {safeIndex < steps.length - 1 ? steps[safeIndex + 1].label : "Done"}
                <ChevronRight className="size-4" aria-hidden="true" />
              </Button>
            </div>
          </div>

          <aside className="xl:sticky xl:top-[120px] xl:h-fit">
            <QuoteSummarySidebar
              pricing={quote.pricing}
              readiness={insights.readiness}
              componentStatuses={insights.componentStatuses}
              blockingItems={insights.blockingItems}
              nextAction={insights.nextAction}
              onNavigate={setCurrent}
            />
          </aside>
        </div>
      </div>
    </QuoteBuilderShell>
  )
}
