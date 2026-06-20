"use client"

import { Card } from "../../../ui/card"
import { Badge } from "../../../ui/badge"
import { Button } from "../../../ui/button"
import { StepHeader } from "../step-header"
import { StepEmptyState } from "../states"
import { ContractBadge } from "../status-badges"
import { cn } from "../../../../lib/utils"
import { formatCurrency } from "../../../../lib/quote-helpers"
import type { HotelSelection, HotelCityBlock } from "../../../../lib/quote-types"
import { Star, Check, Tent, Moon, Building2 } from "lucide-react"

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
  onSelect,
}: {
  hotel: HotelSelection
  currency: string
  onSelect?: (hotelId: string) => void
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
        {hotel.selected ? (
          <Button size="sm" className="gap-1.5" onClick={() => onSelect?.(hotel.id)}>
            <Check className="h-4 w-4" />
            Selected
          </Button>
        ) : (
          <Button size="sm" variant="outline" onClick={() => onSelect?.(hotel.id)}>
            Select
          </Button>
        )}
      </div>
    </div>
  )
}

export interface HotelsStepProps {
  cities: HotelCityBlock[]
  currency: string
  onSelectHotel?: (hotelId: string) => void
}

export function HotelsStep({ cities, currency, onSelectHotel }: HotelsStepProps) {
  return (
    <div>
      <StepHeader
        title="Hotels & Accommodation"
        description="Choose one property per overnight stop. On-request and no-contract hotels must be confirmed before the quote can be sent."
        statusLabel="View only"
        statusTone="view"
        helper="Hotel selections are shown for review. Editing hotel options will come later."
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
                  {block.options.map((hotel) => (
                    <HotelOption
                      key={hotel.id}
                      hotel={hotel}
                      currency={currency}
                      onSelect={onSelectHotel}
                    />
                  ))}
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
