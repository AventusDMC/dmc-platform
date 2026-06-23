"use client"

import { useState } from "react"
import { Card } from "../../../ui/card"
import { Badge } from "../../../ui/badge"
import { Button } from "../../../ui/button"
import { StepHeader } from "../step-header"
import { StepEmptyState } from "../states"
import { ContractBadge } from "../status-badges"
import { ClassicGuidance } from "./classic-guidance"
import { cn } from "../../../../lib/utils"
import { formatCurrency } from "../../../../lib/quote-helpers"
import type { HotelSelection, HotelCityBlock } from "../../../../lib/quote-types"
import { Star, Check, Tent, Moon, Building2, Loader2, AlertTriangle } from "lucide-react"

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
}) {
  return (
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

export function HotelsStep({ cities, currency, onSetPrimary, classicHref }: HotelsStepProps) {
  const canEdit = Boolean(onSetPrimary)
  // Only claim "Set primary only" when at least one city actually exposes a
  // "Set as primary" action (2+ editable real options in the same set). Fallback
  // hotels, single-option cities, and no-handler all read as "View only" so the
  // badge never over-promises editability.
  const hasEditableAlternatives =
    canEdit && cities.some((b) => eligibleOptionSetIds(b).size > 0)
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
        statusLabel={hasEditableAlternatives ? "Set primary only" : "View only"}
        statusTone={hasEditableAlternatives ? "editable" : "view"}
        helper={
          hasEditableAlternatives
            ? "Where a city has alternative hotels, you can change which one is marked primary for the proposal. This is a display choice and does not change pricing. All other hotel details (rates, rooming, meal plan, nights) are view-only."
            : "Hotel selections are shown for review. Pricing, rooming, meal plan and nights are view-only."
        }
      />

      <ClassicGuidance
        message="Full hotel editing, adding/removing options, room categories, contracts, and manual rates are managed in Classic Builder. V2 currently supports Set as primary only where available."
        classicHref={classicHref}
      />

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
