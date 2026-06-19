"use client"

import { Card } from "../../../ui/card"
import { Badge } from "../../../ui/badge"
import { Button } from "../../../ui/button"
import { StepHeader } from "../step-header"
import { StepEmptyState } from "../states"
import { cn } from "../../../../lib/utils"
import type { ItineraryDay, Meal } from "../../../../lib/quote-types"
import { MapPin, Hotel, Bus, AlertTriangle, Plus, GripVertical, CalendarRange } from "lucide-react"

const MEAL_LABEL: Record<Meal, string> = { B: "Breakfast", L: "Lunch", D: "Dinner" }

function MealChips({ meals }: { meals: Meal[] }) {
  const all: Meal[] = ["B", "L", "D"]
  return (
    <div className="flex items-center gap-1">
      {all.map((m) => {
        const active = meals.includes(m)
        return (
          <span
            key={m}
            title={MEAL_LABEL[m]}
            className={cn(
              "flex h-6 w-6 items-center justify-center rounded-md text-xs font-medium",
              active ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground/40",
            )}
          >
            {m}
          </span>
        )
      })}
    </div>
  )
}

function DayCard({ day }: { day: ItineraryDay }) {
  const hasWarnings = day.warnings.length > 0
  return (
    <Card className="overflow-hidden p-0">
      <div className="flex">
        <div className="flex w-16 shrink-0 flex-col items-center justify-center border-r border-border bg-muted/40 py-4">
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Day
          </span>
          <span className="text-2xl font-semibold leading-none text-foreground">{day.day}</span>
          <span className="mt-1 text-[10px] text-muted-foreground">{day.date.split(" ")[0]}</span>
        </div>

        <div className="min-w-0 flex-1 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <MapPin className="h-3.5 w-3.5" />
                <span className="font-medium text-foreground">{day.overnightCity}</span>
                <span>·</span>
                <span>{day.date}</span>
              </div>
              <h3 className="mt-1 text-pretty text-sm font-semibold text-foreground">
                {day.title}
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <MealChips meals={day.meals} />
              <GripVertical className="h-4 w-4 cursor-grab text-muted-foreground/40" />
            </div>
          </div>

          <ul className="mt-3 flex flex-wrap gap-1.5">
            {day.visits.map((v) => (
              <li key={v}>
                <Badge variant="secondary" className="font-normal">
                  {v}
                </Badge>
              </li>
            ))}
          </ul>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <div
              className={cn(
                "flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs",
                day.hotelAssigned
                  ? "border-border text-foreground"
                  : "border-dashed border-warning/50 text-muted-foreground",
              )}
            >
              <Hotel className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{day.hotelAssigned ?? "No hotel assigned"}</span>
            </div>
            <div
              className={cn(
                "flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs",
                day.transportAssigned
                  ? "border-border text-foreground"
                  : "border-dashed border-warning/50 text-muted-foreground",
              )}
            >
              <Bus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{day.transportAssigned ?? "No transport assigned"}</span>
            </div>
          </div>

          {hasWarnings && (
            <div className="mt-3 space-y-1">
              {day.warnings.map((w) => (
                <div key={w} className="flex items-center gap-2 text-xs text-warning-foreground">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning" />
                  <span>{w}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}

export interface ItineraryStepProps {
  days: ItineraryDay[]
  onAddDay?: () => void
}

export function ItineraryStep({ days, onAddDay }: ItineraryStepProps) {
  return (
    <div>
      <StepHeader
        title="Itinerary"
        description="Build the day-by-day program. Assign hotels and transport per day; flagged days still need attention."
        action={
          <Button size="sm" variant="outline" onClick={onAddDay}>
            <Plus className="h-4 w-4" />
            Add day
          </Button>
        }
      />
      {days.length === 0 ? (
        <StepEmptyState
          icon={CalendarRange}
          title="No itinerary days yet"
          description="Start building the program by adding the first day of the trip."
          action={
            <Button size="sm" onClick={onAddDay}>
              <Plus className="h-4 w-4" />
              Add first day
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {days.map((day) => (
            <DayCard key={day.id} day={day} />
          ))}
        </div>
      )}
    </div>
  )
}
