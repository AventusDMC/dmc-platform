"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Card } from "../../../ui/card"
import { Badge } from "../../../ui/badge"
import { Button } from "../../../ui/button"
import { StepHeader } from "../step-header"
import { StepEmptyState } from "../states"
import { cn } from "../../../../lib/utils"
import type { ItineraryDay, Meal } from "../../../../lib/quote-types"
import {
  MapPin,
  Hotel,
  Bus,
  AlertTriangle,
  Plus,
  GripVertical,
  CalendarRange,
  Pencil,
  Save,
  X,
  Loader2,
} from "lucide-react"

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
  const router = useRouter()
  const hasWarnings = day.warnings.length > 0

  const [editing, setEditing] = useState(false)
  const [titleDraft, setTitleDraft] = useState(day.title)
  const [notesDraft, setNotesDraft] = useState(day.notes ?? "")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const startEdit = () => {
    // Re-seed drafts from the current (possibly refreshed) day values.
    setTitleDraft(day.title)
    setNotesDraft(day.notes ?? "")
    setError(null)
    setEditing(true)
  }

  const cancelEdit = () => {
    setEditing(false)
    setError(null)
  }

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      // Existing read-only-safe save path: PATCH /api/itinerary/day/:dayId
      // (proxy → backend updateDay). Descriptive text only — no pricing/services.
      const res = await fetch(`/api/itinerary/day/${day.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: titleDraft.trim(), notes: notesDraft }),
      })
      if (!res.ok) {
        const body = await res.text()
        throw new Error(body?.slice(0, 200) || `Save failed (${res.status})`)
      }
      setEditing(false)
      // Refresh server data so read mode shows the persisted title/notes.
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save itinerary text.")
    } finally {
      setSaving(false)
    }
  }

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
              {!editing && (
                <h3 className="mt-1 text-pretty text-sm font-semibold text-foreground">
                  {day.title}
                </h3>
              )}
            </div>
            <div className="flex items-center gap-2">
              <MealChips meals={day.meals} />
              {!editing ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1.5 px-2"
                  onClick={startEdit}
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                  Edit
                </Button>
              ) : (
                <GripVertical className="h-4 w-4 text-muted-foreground/40" aria-hidden="true" />
              )}
            </div>
          </div>

          {editing ? (
            // ---- Edit mode: descriptive text only (title + narrative) ----
            <div className="mt-3 space-y-2">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted-foreground">Day title</span>
                <input
                  type="text"
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  disabled={saving}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder="Day title"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted-foreground">
                  Descriptive narrative
                </span>
                <textarea
                  value={notesDraft}
                  onChange={(e) => setNotesDraft(e.target.value)}
                  disabled={saving}
                  rows={5}
                  className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder="Client-facing description of the day…"
                />
              </label>
              {error ? (
                <p className="flex items-center gap-1.5 text-xs text-destructive" role="alert">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {error}
                </p>
              ) : null}
              <div className="flex items-center gap-2">
                <Button size="sm" className="gap-1.5" onClick={save} disabled={saving || titleDraft.trim() === ""}>
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Save className="h-4 w-4" aria-hidden="true" />
                  )}
                  {saving ? "Saving…" : "Save"}
                </Button>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={cancelEdit} disabled={saving}>
                  <X className="h-4 w-4" aria-hidden="true" />
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            // ---- Read mode: narrative (preserve line breaks) or empty state ----
            <div className="mt-2">
              {day.notes && day.notes.trim() ? (
                <p className="whitespace-pre-line text-pretty text-sm text-foreground/90">
                  {day.notes}
                </p>
              ) : (
                <p className="text-sm italic text-muted-foreground">No descriptive text yet.</p>
              )}
            </div>
          )}

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
        description="Edit the client-facing day title and descriptive narrative. Hotels, transport and services are managed elsewhere."
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
