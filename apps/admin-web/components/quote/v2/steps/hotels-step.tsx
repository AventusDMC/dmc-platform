"use client"

import { useState } from "react"
import { Card } from "../../../ui/card"
import { Badge } from "../../../ui/badge"
import { Button } from "../../../ui/button"
import { StepHeader } from "../step-header"
import { StepEmptyState } from "../states"
import { ContractBadge } from "../status-badges"
import { ClassicGuidance } from "./classic-guidance"
import { PricingPreviewModal } from "./pricing-preview-modal"
import { cn } from "../../../../lib/utils"
import { formatCurrency } from "../../../../lib/quote-helpers"
import type { ApplyItemPricingHandler, HotelSelection, HotelCityBlock, PreviewItemHandler } from "../../../../lib/quote-types"
import { Star, Check, Tent, Moon, Building2, Loader2, AlertTriangle, Info, ChevronDown, Calculator } from "lucide-react"

/** Short read-only label for the diagnostics contract state (distinct from the badge). */
function contractStateLabel(state?: string): string | null {
  switch (state) {
    case "contracted":
      return "Contract on file"
    case "on-request":
      return "On request"
    case "no-contract":
      return "No contract"
    default:
      return null
  }
}

function CategoryMark({ category }: { category: HotelSelection["category"] }) {
  if (category === "Camp") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Tent className="h-3.5 w-3.5" />
        Desert camp
      </span>
    )
  }
  // Unknown rating: show a neutral label rather than imply a star count.
  if (category === "Unknown") {
    return <span className="text-xs text-muted-foreground">Category n/a</span>
  }
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${category} star`}>
      {Array.from({ length: category }).map((_, i) => (
        <Star key={i} className="h-3 w-3 fill-warning text-warning" />
      ))}
    </span>
  )
}

function HotelOption({
  hotel,
  currency,
  eligible,
  pending,
  disabled,
  onSetPrimary,
  onPreviewItem,
  hotelPreviewEnabled,
  onApplyItemPricing,
  hotelApplyEnabled,
}: {
  hotel: HotelSelection
  currency: string
  /** True when this option may be set as primary (real alternative in its set). */
  eligible: boolean
  /** True while this option's PATCH is in flight. */
  pending: boolean
  /** True while any option in the step is saving (locks the other buttons). */
  disabled: boolean
  onSetPrimary: () => void
  /** Read-only pricing preview handler (role/status-gated by the caller). */
  onPreviewItem?: PreviewItemHandler
  /** Hotel pricing preview is behind a separate flag (default OFF). */
  hotelPreviewEnabled?: boolean
  /** Pricing apply handler (role/status-gated by the caller). */
  onApplyItemPricing?: ApplyItemPricingHandler
  /** Hotel pricing apply is behind a separate flag (default OFF). */
  hotelApplyEnabled?: boolean
}) {
  const [showWhy, setShowWhy] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const diagnostics = hotel.diagnostics
  const reasons = diagnostics?.reasons ?? []
  const stateLabel = contractStateLabel(diagnostics?.contractState)
  // Read-only pricing preview — only when the handler is present, the row has a
  // matched priced hotel QuoteItem, AND the hotel-preview flag is ON.
  const canPreview = Boolean(onPreviewItem && hotel.pricedQuoteItemId && hotelPreviewEnabled)
  // Apply is eligible ONLY for a real, matched priced hotel row (stable
  // pricedQuoteItemId) when BOTH the apply handler and the hotel-apply flag are
  // present. Itinerary-fallback / unmatched / no-contract rows lack a
  // pricedQuoteItemId, so they stay preview-only and never offer apply.
  const canApply = Boolean(canPreview && onApplyItemPricing && hotelApplyEnabled && hotel.pricedQuoteItemId)
  // The row matched multiple priced lines and apply must be hidden — surface a
  // safe explanation, but only when the pricing scope is actually active.
  const ambiguousMatch = Boolean(
    hotel.pricingMatchAmbiguous && !hotel.pricedQuoteItemId && onPreviewItem && (hotelPreviewEnabled || hotelApplyEnabled),
  )
  return (
    <div>
    <div
      className={cn(
        "flex flex-col gap-3 rounded-lg border p-3 transition-colors sm:flex-row sm:items-center sm:justify-between",
        hotel.selected
          ? "border-primary/40 bg-accent/40"
          : "border-border bg-card hover:border-border/80",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-foreground">{hotel.name}</span>
          <CategoryMark category={hotel.category} />
          <ContractBadge status={hotel.contractStatus} />
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>{hotel.mealPlan}</span>
          <span>·</span>
          <span>{hotel.roomingSummary}</span>
          <span>·</span>
          <span>
            City tax {hotel.cityTax > 0 ? `${formatCurrency(hotel.cityTax, currency)}/pax/night` : "—"}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 sm:justify-end">
        <div className="text-right">
          <div className="text-sm font-semibold text-foreground">
            {hotel.ratePerNight > 0 ? formatCurrency(hotel.ratePerNight, currency) : "—"}
          </div>
          <div className="text-[11px] text-muted-foreground">per room / night</div>
        </div>
        {/* "Selected" is a read-only status label (the current proposal primary).
            "Set as primary" only appears for real alternatives in the same set;
            it changes the proposal's primary hotel and does NOT change pricing. */}
        {canPreview ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            onClick={() => setPreviewOpen(true)}
            title={
              canApply
                ? "Preview and apply hotel pricing — nothing is saved until you apply"
                : "Preview projected hotel pricing — read-only, nothing is saved"
            }
          >
            <Calculator className="size-3.5" aria-hidden="true" />
            {canApply ? "Preview & apply hotel pricing" : "Preview hotel pricing"}
          </Button>
        ) : null}
        {hotel.selected ? (
          <span className="inline-flex items-center gap-1.5 rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-accent-foreground">
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
            Selected
          </span>
        ) : eligible ? (
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={onSetPrimary}
            disabled={disabled}
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Star className="h-4 w-4" aria-hidden="true" />
            )}
            {pending ? "Saving…" : "Set as primary"}
          </Button>
        ) : null}
      </div>
    </div>

      {/* Ambiguous match: multiple priced hotel lines share this hotel and we
          could not resolve a single target from stable ids. Offer no preview/
          apply — show safe helper text instead of guessing the wrong line. */}
      {ambiguousMatch ? (
        <p className="mt-1 flex items-start gap-1.5 px-1 text-xs text-muted-foreground">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden="true" />
          <span>
            Multiple priced hotel lines match this hotel, so pricing preview/apply isn&apos;t available here. Resolve
            the duplicate in Classic Builder.
          </span>
        </p>
      ) : null}

      {canPreview ? (
        <PricingPreviewModal
          open={previewOpen}
          onClose={() => setPreviewOpen(false)}
          title={`${hotel.name} — ${hotel.city}`}
          currency={currency}
          quoteItemId={hotel.pricedQuoteItemId!}
          onPreview={onPreviewItem!}
          onApply={canApply ? onApplyItemPricing : undefined}
          applyEnabled={canApply}
          applyLabel="Apply hotel price"
        />
      ) : null}

      {/* Read-only diagnostics — explains why a hotel reads as on-request / needs
          review. No edit/apply controls; hotel edits stay in Classic Builder. */}
      {reasons.length > 0 ? (
        <div className="mt-1 px-1">
          <button
            type="button"
            onClick={() => setShowWhy((v) => !v)}
            aria-expanded={showWhy}
            className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <Info className="size-3.5" aria-hidden="true" />
            Why? {stateLabel ? `(${stateLabel})` : ""}
            <ChevronDown
              className={cn("size-3.5 transition-transform", showWhy && "rotate-180")}
              aria-hidden="true"
            />
          </button>
          {showWhy ? (
            <ul className="mt-1.5 space-y-1 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              {reasons.map((reason, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <span className="mt-1.5 size-1 shrink-0 rounded-full bg-muted-foreground/60" aria-hidden="true" />
                  <span className="min-w-0 flex-1">{reason}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

export interface HotelsStepProps {
  cities: HotelCityBlock[]
  currency: string
  /**
   * Persist the primary hotel for an option-set (PATCH isPrimary:true), then
   * refresh. Only wired for real QuoteHotelOption rows. When omitted, the step
   * stays fully read-only.
   */
  onSetPrimary?: (optionId: string, hotelOptionId: string) => void | Promise<void>
  /** Link to the classic builder for the Classic-only hotel edits. */
  classicHref?: string
  /** When provided (role/status-gated), rows expose a read-only pricing preview. */
  onPreviewItem?: PreviewItemHandler
  /**
   * Hotel pricing PREVIEW scope (separate flag, default OFF). When false, hotel
   * rows stay diagnostics/read-only with no preview affordance.
   */
  hotelPreviewEnabled?: boolean
  /** Pricing apply handler. When omitted (or flag off), hotels stay preview-only. */
  onApplyItemPricing?: ApplyItemPricingHandler
  /**
   * Hotel pricing APPLY scope (separate flag, default OFF). When true (and the
   * apply handler + preview flag are present), eligible matched hotel rows expose
   * an "Apply hotel price" action that re-prices the selected hotel in place.
   * When false, hotels stay preview-only — no apply control is ever shown.
   */
  hotelApplyEnabled?: boolean
}

/**
 * Which option-set ids in a city have 2+ editable options — only those expose
 * a "Set as primary" action (a single option is already the primary; nothing
 * to choose between). Itinerary-fallback rows (editable=false) never qualify.
 */
function eligibleOptionSetIds(block: HotelCityBlock): Set<string> {
  const counts = new Map<string, number>()
  for (const o of block.options) {
    if (o.editable && o.optionId) counts.set(o.optionId, (counts.get(o.optionId) ?? 0) + 1)
  }
  const eligible = new Set<string>()
  for (const [id, n] of counts) if (n >= 2) eligible.add(id)
  return eligible
}

export function HotelsStep({ cities, currency, onSetPrimary, classicHref, onPreviewItem, hotelPreviewEnabled, onApplyItemPricing, hotelApplyEnabled }: HotelsStepProps) {
  const canEdit = Boolean(onSetPrimary)
  // Only claim "Set primary only" when at least one city actually exposes a
  // "Set as primary" action (2+ editable real options in the same set). Fallback
  // hotels, single-option cities, and no-handler all read as "View only" so the
  // badge never over-promises editability.
  const hasEditableAlternatives =
    canEdit && cities.some((b) => eligibleOptionSetIds(b).size > 0)
  // Hotel rows expose a read-only pricing preview when the handler is present AND
  // the hotel-preview flag is ON (default OFF). When active, the header reads
  // "Preview only" (mirrors Transport) instead of "View only".
  const previewActive = Boolean(onPreviewItem && hotelPreviewEnabled)
  // Apply is active only when preview is active AND the apply handler + apply flag
  // are present (default OFF). When active the header reads "Apply enabled".
  const applyActive = Boolean(previewActive && onApplyItemPricing && hotelApplyEnabled)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [error, setError] = useState<{ id: string; message: string } | null>(null)

  const handleSetPrimary = async (hotel: HotelSelection) => {
    if (!onSetPrimary || !hotel.optionId) return
    setPendingId(hotel.id)
    setError(null)
    try {
      await onSetPrimary(hotel.optionId, hotel.id)
      // Parent refreshes the route on success; selected state re-derives from data.
    } catch (err) {
      setError({
        id: hotel.id,
        message: err instanceof Error ? err.message : "Could not update the primary hotel.",
      })
    } finally {
      setPendingId(null)
    }
  }

  return (
    <div>
      <StepHeader
        title="Hotels & Accommodation"
        description="Choose one property per overnight stop. On-request and no-contract hotels must be confirmed before the quote can be sent."
        statusLabel={applyActive ? "Apply enabled" : hasEditableAlternatives ? "Set primary only" : previewActive ? "Preview only" : "View only"}
        statusTone={applyActive ? "editable" : hasEditableAlternatives ? "editable" : previewActive ? "preview" : "view"}
        helper={
          applyActive
            ? "Eligible hotels (matched priced lines) can be re-priced in place: preview the projected pricing, then apply. Apply only updates that hotel line's pricing — it does not change the hotel, primary, rooming, meal plan, or itinerary. Other hotel edits remain in Classic."
            : hasEditableAlternatives
              ? "Where a city has alternative hotels, you can change which one is marked primary for the proposal. This is a display choice and does not change pricing. All other hotel details (rates, rooming, meal plan, nights) are view-only."
              : previewActive
                ? "Hotel selections are shown for review with a read-only pricing preview (no changes are saved and there is no apply). Hotel edits remain in Classic."
                : "Hotel selections are shown for review. Pricing, rooming, meal plan and nights are view-only."
        }
      />

      <ClassicGuidance
        message="Full hotel editing, adding/removing options, room categories, contracts, and manual rates are managed in Classic Builder. V2 currently supports Set as primary only where available."
        classicHref={classicHref}
      />

      {/* Clarify the two independent hotel signals (the screenshot confusion):
          cost-summary "complete" vs proposal-readiness "items to review". */}
      <div className="mb-4 flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        <div className="space-y-0.5">
          <p>
            <span className="font-medium text-foreground">Hotels &ldquo;complete&rdquo;</span> in the cost summary means a hotel
            is selected for each overnight stop. <span className="font-medium text-foreground">&ldquo;Items to review&rdquo;</span>{" "}
            in proposal readiness separately lists selected hotels that are still on request — these are advisory and
            don&apos;t block the cost summary.
          </p>
          <p>
            Hotels whose priced line has a linked contract now show <span className="font-medium text-foreground">Contract
            on file</span> and drop out of the review list. Remaining on-request hotels have no linked contract — use{" "}
            <span className="font-medium text-foreground">Why?</span> to see the contract / rate detail, then{" "}
            <span className="whitespace-nowrap">edit in Classic Builder</span>.
          </p>
        </div>
      </div>

      {cities.length === 0 ? (
        <StepEmptyState
          icon={Building2}
          title="No accommodation stops yet"
          description="Overnight cities will appear here once the itinerary has days with overnight stays."
        />
      ) : (
        <div className="space-y-5">
          {cities.map((block) => {
            const selected = block.options.find((o) => o.selected)
            const eligibleSets = eligibleOptionSetIds(block)
            return (
              <Card key={block.city} className="p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Moon className="h-4 w-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold text-foreground">{block.city}</h3>
                    <Badge variant="secondary" className="font-normal">
                      {block.nights} {block.nights === 1 ? "night" : "nights"}
                    </Badge>
                  </div>
                  {!selected && (
                    <span className="text-xs font-medium text-warning-foreground">
                      No hotel selected
                    </span>
                  )}
                </div>
                <div className="space-y-2">
                  {block.options.map((hotel) => {
                    const eligible =
                      canEdit &&
                      hotel.editable &&
                      !!hotel.optionId &&
                      eligibleSets.has(hotel.optionId)
                    return (
                      <div key={hotel.id}>
                        <HotelOption
                          hotel={hotel}
                          currency={currency}
                          eligible={eligible}
                          pending={pendingId === hotel.id}
                          disabled={pendingId !== null}
                          onSetPrimary={() => handleSetPrimary(hotel)}
                          onPreviewItem={onPreviewItem}
                          hotelPreviewEnabled={hotelPreviewEnabled}
                          onApplyItemPricing={onApplyItemPricing}
                          hotelApplyEnabled={hotelApplyEnabled}
                        />
                        {error && error.id === hotel.id ? (
                          <p
                            className="mt-1 flex items-center gap-1.5 text-xs text-destructive"
                            role="alert"
                          >
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            {error.message}
                          </p>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
