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
  /** Download the client-facing proposal PDF in the given language. */
  onDownloadPdf?: (quote: Quote, language: string) => void | Promise<void>
  /** Open the client-facing proposal preview (HTML) in the given language. */
  onPreview?: (quote: Quote, language: string) => void | Promise<void>
  /**
   * Set the primary hotel for an option-set (PATCH isPrimary). Proposal-display
   * only — does not change pricing. When omitted, Hotels stays read-only.
   */
  onSetPrimaryHotel?: (optionId: string, hotelOptionId: string) => void | Promise<void>
  /**
   * Update a quote item's client-facing display text (pricing-inert). Limited to
   * external-package text + transport route labels. When omitted,
   * Experiences/Transport stay read-only.
   */
  onUpdateDisplayText?: (quoteItemId: string, patch: Record<string, string | null>) => void | Promise<void>
  /** Enable the public proposal link; resolves to the new public state. */
  onEnablePublicLink?: (quote: Quote) => Promise<{ publicEnabled: boolean; publicToken: string | null }>
  /** Disable the public proposal link; resolves to the new public state. */
  onDisablePublicLink?: (quote: Quote) => Promise<{ publicEnabled: boolean; publicToken: string | null }>
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
  onDownloadPdf,
  onPreview,
  onSetPrimaryHotel,
  onUpdateDisplayText,
  onEnablePublicLink,
  onDisablePublicLink,
  initialStep = "setup",
}: QuoteBuilderV2Props) {
  const [current, setCurrent] = useState<StepId>(initialStep)
  const [saving, setSaving] = useState(false)
  const [sending, setSending] = useState(false)
  // Backend error from the last "Mark as Sent" attempt (e.g. completeness 400).
  const [sendError, setSendError] = useState<string | null>(null)
  // Proposal language (render-time only; seeded from the quote's normalized code).
  const [language, setLanguage] = useState<string>(quote?.meta.proposalLanguage ?? "en")

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

  // "Mark as Sent" = status → SENT only (no email, no public link). Allowed when
  // readiness passes AND the quote is not already past the draft stage. The
  // backend independently enforces completeness and rejects invalid transitions.
  const LIFECYCLE_LOCKED = new Set(["SENT", "ACCEPTED", "CONFIRMED", "CANCELLED"])
  const statusCode = (quote.meta.statusCode ?? "").toUpperCase()
  const lifecycleLocked = LIFECYCLE_LOCKED.has(statusCode)
  const canMarkSent = insights.canSend && !lifecycleLocked

  const sendDisabledReason = lifecycleLocked
    ? `Quote is already ${statusCode.toLowerCase()} — it can no longer be marked as sent here.`
    : !insights.canSend
      ? `${insights.outstanding.length} item${insights.outstanding.length === 1 ? "" : "s"} still need attention before this quote can be marked as sent.`
      : undefined

  const handleSend = async () => {
    if (!onSend || !canMarkSent) return
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        "Mark this quote as sent? This will update the quote status only. No email will be sent.",
      )
    ) {
      return
    }
    setSending(true)
    setSendError(null)
    try {
      await onSend(quote)
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Could not mark the quote as sent.")
    } finally {
      setSending(false)
    }
  }

  const renderStep = () => {
    switch (current) {
      case "setup":
        return <SetupStep fields={quote.setupFields} />
      case "itinerary":
        return <ItineraryStep days={quote.itinerary} />
      case "hotels":
        return (
          <HotelsStep
            cities={quote.hotelCities}
            currency={quote.meta.currency}
            onSetPrimary={onSetPrimaryHotel}
          />
        )
      case "experiences":
        return (
          <ExperiencesStep
            experiences={quote.experiences}
            currency={quote.meta.currency}
            onUpdateDisplayText={onUpdateDisplayText}
          />
        )
      case "transport":
        return (
          <TransportStep
            services={quote.transport}
            currency={quote.meta.currency}
            onUpdateDisplayText={onUpdateDisplayText}
          />
        )
      case "pricing":
        return <PricingStep pricing={quote.pricing} />
      case "proposal":
        return (
          <ProposalStep
            meta={quote.meta}
            pricing={quote.pricing}
            proposal={quote.proposal}
            readiness={quote.readiness}
            canSend={canMarkSent}
            saving={sending}
            sendDisabledReason={sendDisabledReason}
            sendError={sendError}
            language={language}
            onLanguageChange={setLanguage}
            onDownloadPdf={onDownloadPdf ? (l) => onDownloadPdf(quote, l) : undefined}
            onSend={handleSend}
            onNavigate={setCurrent}
            itineraryDays={quote.itinerary}
            publicToken={quote.meta.publicToken}
            publicEnabled={quote.meta.publicEnabled}
            onEnablePublicLink={onEnablePublicLink ? () => onEnablePublicLink(quote) : undefined}
            onDisablePublicLink={onDisablePublicLink ? () => onDisablePublicLink(quote) : undefined}
          />
        )
      default:
        return <SetupStep fields={quote.setupFields} />
    }
  }

  return (
    <QuoteBuilderShell
      meta={quote.meta}
      saving={sending}
      canSend={canMarkSent}
      sendDisabledReason={sendDisabledReason}
      sendError={sendError}
      classicHref={`/quotes/${quote.id}/classic`}
      onPreview={onPreview ? () => onPreview(quote, language) : undefined}
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
