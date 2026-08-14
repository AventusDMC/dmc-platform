"use client"

import { useMemo, useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "../../ui/button"
import { QuoteBuilderShell } from "./quote-builder-shell"
import { CreateBookingCard } from "./create-booking-card"
import { QuoteHeaderSummary } from "./quote-header-summary"
import { QuoteWorkflowStepper } from "./quote-workflow-stepper"
import { QuoteSummarySidebar } from "./quote-summary-sidebar"
import { V2ReadinessPanel } from "./v2-readiness-panel"
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
import { PassengersStep } from "./steps/passengers-step"
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
import { buildV2ReadinessAudit } from "../../../lib/quote-v2-readiness"
import type { Quote, StepId, VersionReadiness, SavedVersionSummary, VersionSummary } from "../../../lib/quote-types"

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
  /** VV-1: save a proposal version (snapshot) via the existing createVersion. */
  onSaveVersion?: (label?: string) => Promise<{ versionNumber?: number | null }>
  /** Whether the Save-proposal-version affordance is available (role + status). */
  canSaveVersion?: boolean
  /** VV-2: read-only version-readiness for the non-blocking Proposal advisory. */
  versionReadiness?: VersionReadiness | null
  /** True while the version-readiness fetch is in flight. */
  versionReadinessLoading?: boolean
  /** Non-blocking error from the last version-readiness fetch. */
  versionReadinessError?: string | null
  /** VV-3 Slice 1: read-only saved-versions metadata list (no snapshotJson). */
  savedVersions?: SavedVersionSummary[]
  /** True while the saved-versions list fetch is in flight. */
  savedVersionsLoading?: boolean
  /** Non-blocking error from the last saved-versions fetch. */
  savedVersionsError?: string | null
  /** VV-3 Slice 2B: fetch ONE version's safe curated summary (drawer). */
  onViewVersion?: (versionId: string) => Promise<VersionSummary>
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
  /**
   * Request a read-only dry-run pricing preview for an existing item edit.
   * Role/status-gated by the caller. When provided, Experiences/Transport rows
   * expose a "Preview pricing" affordance. Never applies — display only.
   */
  onPreviewItem?: import("../../../lib/quote-types").PreviewItemHandler
  /**
   * Apply a previewed MEAL pricing edit (role/status-gated). When provided, meal
   * rows expose "Preview & apply meal pricing". Reuses the preview + apply-preview
   * endpoints; never writes via the existing item PATCH path.
   */
  onApplyItemPricing?: import("../../../lib/quote-types").ApplyItemPricingHandler
  /** HC-2: fetch a priced hotel line's safe contract/rate summary (read-only drawer). */
  onViewHotelContract?: import("../../../lib/quote-types").ViewHotelContractHandler
  /**
   * Load the read-only `quote.pricing.apply` audit history for this quote
   * (role/status-gated). When provided, the Experiences step shows a collapsible
   * "Pricing Apply Audit" panel. Read-only — never mutates the quote.
   */
  onLoadApplyAudit?: import("../../../lib/quote-types").LoadApplyAuditHandler
  /**
   * Entrance / Jordan-Pass apply scope (PR #561), behind a separate frontend flag
   * (default OFF). When true (and apply is otherwise enabled), entrance rows expose
   * preview + apply; when false they stay read-only.
   */
  entrancePricingEnabled?: boolean
  /**
   * Transport pricing PREVIEW scope, behind a separate frontend flag (default OFF).
   * When true (and onPreviewItem is provided), transport rows expose a read-only
   * "Preview transport pricing" affordance; when false transport rows stay fully
   * Classic/read-only.
   */
  transportPreviewEnabled?: boolean
  /**
   * Transport pricing APPLY scope — Phase T-A (separate frontend flag, default OFF).
   * When true (and onApplyItemPricing + transportPreviewEnabled are provided),
   * eligible standalone single-leg transfer rows expose an "Apply transport price"
   * action; when false, transport stays preview-only.
   */
  transportApplyEnabled?: boolean
  /**
   * Hotel pricing PREVIEW scope, behind a separate frontend flag (default OFF).
   * When true (and onPreviewItem is provided), hotel rows with a matched priced
   * line expose a read-only "Preview hotel pricing" affordance; when false hotel
   * rows stay diagnostics/read-only.
   */
  hotelPreviewEnabled?: boolean
  /**
   * Hotel pricing APPLY scope, behind a separate frontend flag (default OFF). When
   * true (and onApplyItemPricing + hotelPreviewEnabled are provided), eligible
   * matched hotel rows expose an "Apply hotel price" action that re-prices the
   * selected hotel in place. When false, hotels stay preview-only.
   */
  hotelApplyEnabled?: boolean
  /**
   * External-package read-only pricing preview scope, behind a separate frontend
   * flag (default OFF). When true (and onPreviewItem is provided), external-package
   * rows expose a read-only "Preview external package pricing" affordance; when
   * false they stay Classic/read-only.
   */
  externalPackagePreviewEnabled?: boolean
  /**
   * External-package pricing APPLY scope, behind a separate frontend flag (default
   * OFF). When true (and onApplyItemPricing + externalPackagePreviewEnabled are
   * provided), eligible external-package rows expose an "Apply external package
   * price" action that re-prices the entered package in place. When false, external
   * packages stay preview-only.
   */
  externalPackageApplyEnabled?: boolean
  /**
   * Update an EXISTING passenger's PII (pricing-inert). When provided, the
   * Passengers step exposes per-passenger inline editing. Rooming stays
   * read-only. When omitted, passengers are read-only.
   */
  onUpdatePassenger?: (passengerId: string, patch: Record<string, string | null>) => void | Promise<void>
  /**
   * Add a NEW passenger (pricing-inert; existing POST endpoint). Does NOT change
   * the priced pax count. When omitted, no Add affordance is shown.
   */
  onAddPassenger?: (patch: Record<string, string | null>) => void | Promise<void>
  /**
   * Delete an EXISTING passenger (pricing-inert; existing DELETE endpoint).
   * Should be wired only for admin/operations roles. The Delete control is
   * additionally hidden by status (finalized quotes) and load-failure guards.
   */
  onDeletePassenger?: (passengerId: string) => void | Promise<void>
  /**
   * Assign / unassign an EXISTING passenger to an EXISTING rooming group
   * (pricing-inert). When both are provided, Rooming exposes assignment editing
   * only. When omitted, rooming stays read-only.
   */
  onAssignRoom?: (roomingGroupId: string, passengerId: string) => void | Promise<void>
  onUnassignRoom?: (roomingGroupId: string, passengerId: string) => void | Promise<void>
  /** Enable the public proposal link; resolves to the new public state. */
  onEnablePublicLink?: (quote: Quote) => Promise<{ publicEnabled: boolean; publicToken: string | null }>
  /** Disable the public proposal link; resolves to the new public state. */
  onDisablePublicLink?: (quote: Quote) => Promise<{ publicEnabled: boolean; publicToken: string | null }>
  /** Proposal email-send affordance flag (NEXT_PUBLIC_QUOTE_PROPOSAL_EMAIL_SEND). */
  proposalEmailSendEnabled?: boolean
  /**
   * Send the proposal email to the client contact. Returns the backend result
   * (blocked/dryRun/delivered). Present only when the flag + role allow it;
   * status eligibility is enforced here and by the backend. Separate from
   * onSend (Mark as Sent), which only changes status.
   */
  onSendProposalEmail?: (opts?: { attachPdf?: boolean }) => Promise<{
    sent?: boolean
    dryRun?: boolean
    delivered?: boolean
    blocked?: boolean
    blockedReason?: string | null
    recipient?: string | null
    messageId?: string | null
  }>
  /**
   * Itinerary day management (Phase B, Slice 1) flag. When true AND the edit
   * handlers are provided, the Itinerary step exposes "Add day", delete-empty, and
   * routes day-meta edits through the V2 endpoints. When false, the step keeps the
   * existing inline text edit via the shared route (unchanged) with no Add/Delete.
   */
  itineraryEditEnabled?: boolean
  /** Add a new itinerary day (pricing-inert; V2 route). Omitted → no Add affordance. */
  onAddDay?: (patch: Record<string, string | null>) => void | Promise<void>
  /**
   * Edit an itinerary day's meta (title/notes; V2 route, pricing-inert). When
   * provided, day edits route through the audited V2 endpoint; when omitted the step
   * falls back to the existing shared-route text edit.
   */
  onEditDay?: (dayId: string, patch: Record<string, string | null>) => void | Promise<void>
  /** Delete an EMPTY itinerary day (V2 route; the backend rejects non-empty days). */
  onDeleteDay?: (dayId: string) => void | Promise<void>
  /**
   * Add Activity item (Phase B, Slice 2) flag. When true AND onAddItem is provided,
   * the Experiences step exposes an "Add activity" affordance. Activity only.
   */
  itemCreateEnabled?: boolean
  /**
   * Add ONE Activity item via the V2 route. Payload:
   * { itemType:'activity', dayId, activityId, activityRateVariantId, serviceDate }.
   * Omitted → no Add affordance. Resolves to the create result (with new quote total).
   */
  /**
   * Slice 2B-2 step 1 — READ-ONLY create-preview for add-activity. Projects the
   * price and returns a signed previewToken the create replays. No writes.
   */
  onPreviewAddItem?: (payload: Record<string, unknown>) => Promise<{ projected?: { sell?: number; currency?: string | null }; previewToken?: string }>
  /**
   * Slice 2B-2 step 2 — guarded create. Replays the previewToken + acknowledgedDelta
   * from the confirmed preview (the backend fails closed on stale/rate drift).
   */
  onAddItem?: (payload: Record<string, unknown>, previewToken?: string, acknowledgedDelta?: boolean) => void | Promise<unknown>
  /** D-b: read-only remove-preview (projected selling totals + previewToken). Omitted → no Remove affordance. */
  onPreviewRemoveItem?: (itemId: string) => Promise<{ currentTotalSell?: number; projectedTotalSell?: number; sellDelta?: number; currency?: string | null; previewToken?: string }>
  /** D-b: guarded item DELETE (replays the previewToken). Omitted → no Remove affordance. */
  onRemoveItem?: (itemId: string, previewToken: string) => void | Promise<unknown>
  /**
   * Booking Creation V2 (Slice 1D). When true, the "Create booking" card renders in
   * the sidebar. Server-gated: NEXT_PUBLIC_QUOTE_BOOKING_CREATE + admin/operations +
   * convertible status (ACCEPTED/CONFIRMED). Backend re-enforces everything.
   */
  canCreateBooking?: boolean
  /**
   * Whether the current user's role may see sensitive cost/margin in the internal
   * UI (net cost, markup, margin, per-line cost). Default false → restricted:
   * Pricing step + summary sidebar redact those figures and show only the
   * client-facing sell / per-person. Server-resolved (admin / super_admin /
   * finance); the backend/proposal redaction is unchanged and independent.
   */
  canViewCostMargin?: boolean
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
  onSaveVersion,
  canSaveVersion = false,
  versionReadiness = null,
  versionReadinessLoading = false,
  versionReadinessError = null,
  savedVersions = [],
  savedVersionsLoading = false,
  savedVersionsError = null,
  onViewVersion,
  onDownloadPdf,
  onPreview,
  onSetPrimaryHotel,
  hotelPreviewEnabled,
  hotelApplyEnabled,
  onUpdateDisplayText,
  onPreviewItem,
  onApplyItemPricing,
  onViewHotelContract,
  onLoadApplyAudit,
  entrancePricingEnabled,
  transportPreviewEnabled,
  transportApplyEnabled,
  externalPackagePreviewEnabled,
  externalPackageApplyEnabled,
  onUpdatePassenger,
  onAddPassenger,
  onDeletePassenger,
  onAssignRoom,
  onUnassignRoom,
  onEnablePublicLink,
  onDisablePublicLink,
  proposalEmailSendEnabled = false,
  onSendProposalEmail,
  itineraryEditEnabled = false,
  onAddDay,
  onEditDay,
  onDeleteDay,
  itemCreateEnabled = false,
  onPreviewAddItem,
  onAddItem,
  onPreviewRemoveItem,
  onRemoveItem,
  canCreateBooking = false,
  canViewCostMargin = false,
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
      v2Readiness: buildV2ReadinessAudit(quote, { externalPackagePreviewEnabled }),
    }
  }, [quote, externalPackagePreviewEnabled])

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

  // Passenger DELETE status guard (destructive) — ALLOWLIST of editable statuses
  // only. Default-safe: any finalized status (SENT/ACCEPTED/CONFIRMED/CANCELLED/
  // EXPIRED/CONVERTED) AND any unknown/empty status hides Delete.
  const PASSENGER_DELETE_EDITABLE_STATUSES = new Set(["DRAFT", "READY", "REVISION_REQUESTED"])
  const passengerDeleteStatusOk = PASSENGER_DELETE_EDITABLE_STATUSES.has(statusCode)

  // Proposal email send: status policy mirrors the backend (READY first send +
  // SENT resend). The button shows only when the flag/role provided a handler AND
  // the status is eligible; missing recipient disables it (handled in the step).
  const PROPOSAL_EMAIL_STATUSES = new Set(["READY", "SENT"])
  const proposalEmailStatusOk = PROPOSAL_EMAIL_STATUSES.has(statusCode)
  const canSendProposalEmail = Boolean(onSendProposalEmail) && proposalEmailSendEnabled && proposalEmailStatusOk

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
        return <SetupStep fields={quote.setupFields} classicHref={`/quotes/${quote.id}/classic`} />
      case "itinerary":
        return (
          <ItineraryStep
            days={quote.itinerary}
            editEnabled={itineraryEditEnabled}
            onAddDay={onAddDay}
            onEditDay={onEditDay}
            onDeleteDay={onDeleteDay}
            classicHref={`/quotes/${quote.id}/classic`}
          />
        )
      case "hotels":
        return (
          <HotelsStep
            cities={quote.hotelCities}
            currency={quote.meta.currency}
            onSetPrimary={onSetPrimaryHotel}
            classicHref={`/quotes/${quote.id}/classic`}
            onPreviewItem={onPreviewItem}
            hotelPreviewEnabled={hotelPreviewEnabled}
            onApplyItemPricing={onApplyItemPricing}
            hotelApplyEnabled={hotelApplyEnabled}
            onViewHotelContract={onViewHotelContract}
          />
        )
      case "experiences":
        return (
          <ExperiencesStep
            experiences={quote.experiences}
            currency={quote.meta.currency}
            onUpdateDisplayText={onUpdateDisplayText}
            classicHref={`/quotes/${quote.id}/classic`}
            onPreviewItem={onPreviewItem}
            onApplyItemPricing={onApplyItemPricing}
            onLoadApplyAudit={onLoadApplyAudit}
            entrancePricingEnabled={entrancePricingEnabled}
            externalPackagePreviewEnabled={externalPackagePreviewEnabled}
            externalPackageApplyEnabled={externalPackageApplyEnabled}
            addItemEnabled={itemCreateEnabled}
            onPreviewAddItem={onPreviewAddItem}
            onAddItem={onAddItem}
            onPreviewRemoveItem={onPreviewRemoveItem}
            onRemoveItem={onRemoveItem}
            itineraryDays={quote.itinerary}
            mealCostOverrideEnabled={canViewCostMargin}
            externalPackageCreateEnabled={canViewCostMargin}
          />
        )
      case "transport":
        return (
          <TransportStep
            services={quote.transport}
            currency={quote.meta.currency}
            onUpdateDisplayText={onUpdateDisplayText}
            classicHref={`/quotes/${quote.id}/classic`}
            onPreviewItem={onPreviewItem}
            onApplyItemPricing={onApplyItemPricing}
            transportPreviewEnabled={transportPreviewEnabled}
            transportApplyEnabled={transportApplyEnabled}
          />
        )
      case "passengers":
        return (
          <PassengersStep
            passengers={quote.passengers}
            roomingGroups={quote.roomingGroups}
            passengersError={quote.passengersLoadError}
            roomingError={quote.roomingLoadError}
            onUpdatePassenger={onUpdatePassenger}
            onAddPassenger={onAddPassenger}
            onDeletePassenger={onDeletePassenger}
            statusDeletable={passengerDeleteStatusOk}
            onAssignRoom={onAssignRoom}
            onUnassignRoom={onUnassignRoom}
            pricedPax={quote.meta.pax}
            classicHref={`/quotes/${quote.id}/classic`}
          />
        )
      case "pricing":
        return <PricingStep pricing={quote.pricing} classicHref={`/quotes/${quote.id}/classic`} canViewCostMargin={canViewCostMargin} />
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
            onSaveVersion={onSaveVersion}
            canSaveVersion={canSaveVersion}
            versionReadiness={versionReadiness}
            versionReadinessLoading={versionReadinessLoading}
            versionReadinessError={versionReadinessError}
            savedVersions={savedVersions}
            savedVersionsLoading={savedVersionsLoading}
            savedVersionsError={savedVersionsError}
            onViewVersion={onViewVersion}
            onNavigate={setCurrent}
            itineraryDays={quote.itinerary}
            publicToken={quote.meta.publicToken}
            publicEnabled={quote.meta.publicEnabled}
            onEnablePublicLink={onEnablePublicLink ? () => onEnablePublicLink(quote) : undefined}
            onDisablePublicLink={onDisablePublicLink ? () => onDisablePublicLink(quote) : undefined}
            classicHref={`/quotes/${quote.id}/classic`}
            canSendProposalEmail={canSendProposalEmail}
            proposalEmailRecipient={quote.meta.contactEmail ?? null}
            onSendProposalEmail={canSendProposalEmail ? onSendProposalEmail : undefined}
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

          <aside className="space-y-4 xl:sticky xl:top-[120px] xl:h-fit">
            <QuoteSummarySidebar
              pricing={quote.pricing}
              readiness={insights.readiness}
              componentStatuses={insights.componentStatuses}
              blockingItems={insights.blockingItems}
              nextAction={insights.nextAction}
              onNavigate={setCurrent}
              canViewCostMargin={canViewCostMargin}
            />
            {/* Booking Creation V2 (Slice 1D): renders only when server-gated
                (flag + admin/operations + convertible status). */}
            <CreateBookingCard quoteId={quote.id} canCreateBooking={canCreateBooking} />
            {/* Read-only "can this quote be handled in V2?" audit (informational). */}
            <V2ReadinessPanel audit={insights.v2Readiness} />
          </aside>
        </div>
      </div>
    </QuoteBuilderShell>
  )
}
