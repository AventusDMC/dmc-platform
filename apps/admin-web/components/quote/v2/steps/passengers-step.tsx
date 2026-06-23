"use client"

import { useState } from "react"
import { Card } from "../../../ui/card"
import { Badge } from "../../../ui/badge"
import { Button } from "../../../ui/button"
import { StepHeader } from "../step-header"
import { StepEmptyState } from "../states"
import type { Passenger, RoomingGroupSummary } from "../../../../lib/quote-types"
import { Users, BedDouble, ExternalLink, AlertTriangle, Pencil, Loader2 } from "lucide-react"

export type UpdatePassenger = (
  passengerId: string,
  patch: Record<string, string | null>,
) => void | Promise<void>

// Non-blocking load-failure notice — shown when a best-effort GET failed, so a
// transient error is never mistaken for a genuinely empty list.
function LoadWarning({ label }: { label: string }) {
  return (
    <div
      role="status"
      className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 px-4 py-3 text-xs text-warning-foreground"
    >
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" aria-hidden="true" />
      <span>
        Couldn’t load {label} right now. This is a temporary issue — try refreshing, or open the classic
        builder. (Nothing here has changed.)
      </span>
    </div>
  )
}

// ISO datetime → "YYYY-MM-DD" for <input type="date">; "" when not a clean date.
function toDateInput(iso: string | null | undefined): string {
  if (!iso) return ""
  const m = String(iso).match(/^(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : ""
}

const TEXT_FIELDS: Array<{ key: keyof Passenger; label: string; required?: boolean; multiline?: boolean }> = [
  { key: "firstName", label: "First name", required: true },
  { key: "lastName", label: "Last name", required: true },
  { key: "gender", label: "Gender" },
  { key: "nationality", label: "Nationality" },
  { key: "passportNumber", label: "Passport number" },
  { key: "emergencyContact", label: "Emergency contact" },
  { key: "dietaryNotes", label: "Dietary notes", multiline: true },
  { key: "mobilityNotes", label: "Mobility notes", multiline: true },
  { key: "remarks", label: "Remarks", multiline: true },
]

// Inline editor for a single passenger's PII. Sends ONLY the whitelisted
// passenger fields; never any pricing/rooming/pax-count field. Pricing-inert by
// construction (the backend passenger PATCH does not recalculate).
function PassengerEditForm({
  passenger,
  onSave,
  onCancel,
}: {
  passenger: Passenger
  onSave: (patch: Record<string, string | null>) => void | Promise<void>
  onCancel: () => void
}) {
  const [form, setForm] = useState<Record<string, string>>(() => {
    // Prefer structured names; fall back to splitting fullName (e.g. demo rows).
    const [firstFromFull, ...restFromFull] = (passenger.fullName || "").trim().split(/\s+/)
    return {
    firstName: passenger.firstName ?? (firstFromFull || ""),
    lastName: passenger.lastName ?? (restFromFull.join(" ") || ""),
    gender: passenger.gender ?? "",
    nationality: passenger.nationality ?? "",
    passportNumber: passenger.passportNumber ?? "",
    emergencyContact: passenger.emergencyContact ?? "",
    dietaryNotes: passenger.dietaryNotes ?? "",
    mobilityNotes: passenger.mobilityNotes ?? "",
    remarks: passenger.remarks ?? "",
    dateOfBirth: toDateInput(passenger.dateOfBirthRaw),
    passportExpiry: toDateInput(passenger.passportExpiryRaw),
    }
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const save = async () => {
    if (!form.firstName.trim() || !form.lastName.trim()) {
      setError("First name and last name are required.")
      return
    }
    // Whitelisted passenger fields only. Dates: a value or null (to clear).
    const patch: Record<string, string | null> = {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      gender: form.gender.trim(),
      nationality: form.nationality.trim(),
      passportNumber: form.passportNumber.trim(),
      emergencyContact: form.emergencyContact.trim(),
      dietaryNotes: form.dietaryNotes.trim(),
      mobilityNotes: form.mobilityNotes.trim(),
      remarks: form.remarks.trim(),
      dateOfBirth: form.dateOfBirth ? form.dateOfBirth : null,
      passportExpiry: form.passportExpiry ? form.passportExpiry : null,
    }
    setSaving(true)
    setError(null)
    try {
      await onSave(patch)
      // Parent refreshes on success; leave saving true until unmount/re-render.
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save passenger details.")
      setSaving(false)
    }
  }

  const inputCls =
    "w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

  return (
    <div className="rounded-md border border-border bg-card px-3 py-3">
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {TEXT_FIELDS.filter((f) => !f.multiline).map((f) => (
          <label key={f.key as string} className="block">
            <span className="mb-1 block text-xs font-medium text-foreground">
              {f.label}
              {f.required ? " *" : ""}
            </span>
            <input
              type="text"
              className={inputCls}
              value={form[f.key as string] ?? ""}
              disabled={saving}
              onChange={(e) => set(f.key as string, e.target.value)}
            />
          </label>
        ))}
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-foreground">Date of birth</span>
          <input
            type="date"
            className={inputCls}
            value={form.dateOfBirth}
            disabled={saving}
            onChange={(e) => set("dateOfBirth", e.target.value)}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-foreground">Passport expiry</span>
          <input
            type="date"
            className={inputCls}
            value={form.passportExpiry}
            disabled={saving}
            onChange={(e) => set("passportExpiry", e.target.value)}
          />
        </label>
      </div>
      <div className="mt-2.5 grid grid-cols-1 gap-2.5">
        {TEXT_FIELDS.filter((f) => f.multiline).map((f) => (
          <label key={f.key as string} className="block">
            <span className="mb-1 block text-xs font-medium text-foreground">{f.label}</span>
            <textarea
              className={inputCls + " resize-y"}
              rows={2}
              value={form[f.key as string] ?? ""}
              disabled={saving}
              onChange={(e) => set(f.key as string, e.target.value)}
            />
          </label>
        ))}
      </div>
      {error ? (
        <p className="mt-2 text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <div className="mt-3 flex items-center justify-end gap-2">
        <Button variant="outline" size="sm" className="h-7 px-2.5 text-xs" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button size="sm" className="h-7 gap-1.5 px-2.5 text-xs" onClick={save} disabled={saving}>
          {saving ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : null}
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  )
}

function PassengerRow({
  p,
  onUpdatePassenger,
}: {
  p: Passenger
  onUpdatePassenger?: UpdatePassenger
}) {
  const [editing, setEditing] = useState(false)
  const canEdit = Boolean(onUpdatePassenger)

  const facts = [
    p.gender,
    p.dateOfBirth ? `DOB ${p.dateOfBirth}` : null,
    p.nationality,
    p.passportNumber ? `Passport ${p.passportNumber}` : null,
    p.passportExpiry ? `exp ${p.passportExpiry}` : null,
  ].filter(Boolean) as string[]
  const notes = [
    p.dietaryNotes ? `Dietary: ${p.dietaryNotes}` : null,
    p.mobilityNotes ? `Mobility: ${p.mobilityNotes}` : null,
    p.emergencyContact ? `Emergency: ${p.emergencyContact}` : null,
    p.remarks ? `Remarks: ${p.remarks}` : null,
  ].filter(Boolean) as string[]

  if (editing && onUpdatePassenger) {
    return (
      <div className="px-4 py-3">
        <PassengerEditForm
          passenger={p}
          onCancel={() => setEditing(false)}
          onSave={(patch) => onUpdatePassenger(p.id, patch)}
        />
      </div>
    )
  }

  return (
    <div className="px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="text-sm font-medium text-foreground">{p.fullName}</span>
          {facts.length > 0 ? (
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {facts.map((f, i) => (
                <span key={i}>{f}</span>
              ))}
            </div>
          ) : null}
          {notes.length > 0 ? (
            <div className="mt-1 space-y-0.5">
              {notes.map((n, i) => (
                <div key={i} className="text-xs text-muted-foreground">
                  {n}
                </div>
              ))}
            </div>
          ) : null}
        </div>
        {canEdit ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 shrink-0 gap-1 px-2 text-xs"
            onClick={() => setEditing(true)}
          >
            <Pencil className="h-3 w-3" aria-hidden="true" />
            Edit
          </Button>
        ) : null}
      </div>
    </div>
  )
}

function RoomingCard({ g }: { g: RoomingGroupSummary }) {
  const facts = [g.roomType, g.occupancyType].filter(Boolean) as string[]
  return (
    <div className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-foreground">{g.label}</span>
        {g.guideRoom ? (
          <Badge variant="outline" className="font-normal text-muted-foreground">
            Guide
          </Badge>
        ) : null}
        {g.leaderRoom ? (
          <Badge variant="outline" className="font-normal text-muted-foreground">
            Leader
          </Badge>
        ) : null}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {g.hotel ? <span>{g.hotel}</span> : null}
        {g.day ? <span>{g.day}</span> : null}
        {facts.map((f, i) => (
          <span key={i}>{f}</span>
        ))}
      </div>
      <div className="mt-1.5 text-xs text-foreground">
        {g.passengers.length > 0 ? (
          g.passengers.join(", ")
        ) : (
          <span className="italic text-muted-foreground">No passengers assigned.</span>
        )}
      </div>
      {g.notes ? <div className="mt-1 text-xs text-muted-foreground">Notes: {g.notes}</div> : null}
    </div>
  )
}

export interface PassengersStepProps {
  passengers: Passenger[]
  roomingGroups: RoomingGroupSummary[]
  /** True when the passengers GET failed — show a warning, not the empty state. */
  passengersError?: boolean
  /** True when the rooming GET failed — show a warning, not the empty state. */
  roomingError?: boolean
  /**
   * Edit an EXISTING passenger's PII (pricing-inert). When provided, each
   * passenger row shows an Edit affordance. Rooming stays read-only regardless.
   */
  onUpdatePassenger?: UpdatePassenger
  /** Link to the classic builder where passengers/rooming are managed. */
  classicHref?: string
}

export function PassengersStep({
  passengers,
  roomingGroups,
  passengersError = false,
  roomingError = false,
  onUpdatePassenger,
  classicHref,
}: PassengersStepProps) {
  const passengersEditable = Boolean(onUpdatePassenger)
  return (
    <div className="space-y-6">
      <StepHeader
        title="Passengers & Rooming"
        description="Traveller details and the rooming list for this quote."
        statusLabel={passengersEditable ? "Limited editing" : "Read only"}
        statusTone="view"
        helper="Passenger details only. Pax counts and rooming are managed in Classic Builder."
      />

      {classicHref ? (
        <a
          href={classicHref}
          className="inline-flex h-8 items-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          title="Manage passengers & rooming in the full classic workspace"
        >
          <ExternalLink className="size-4" aria-hidden="true" />
          Edit in Classic Builder
        </a>
      ) : null}

      {/* Passengers */}
      <section>
        <div className="mb-2 flex items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground">Passengers</h3>
          <Badge variant="outline" className="font-normal text-muted-foreground">
            {passengersEditable ? "Limited editing" : "Read only"}
          </Badge>
        </div>
        {passengersError ? (
          <LoadWarning label="passengers" />
        ) : passengers.length === 0 ? (
          <StepEmptyState
            icon={Users}
            title="No passengers added yet."
            description="Traveller names and details appear here once added in the classic builder."
          />
        ) : (
          <Card className="overflow-hidden p-0">
            <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-4 py-2.5">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {passengers.length} passenger{passengers.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="divide-y divide-border">
              {passengers.map((p) => (
                <PassengerRow key={p.id} p={p} onUpdatePassenger={onUpdatePassenger} />
              ))}
            </div>
          </Card>
        )}
      </section>

      {/* Rooming — READ ONLY (room assignment / occupancy managed in classic) */}
      <section>
        <div className="mb-2 flex items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground">Rooming</h3>
          <Badge variant="outline" className="font-normal text-muted-foreground">
            Read only
          </Badge>
        </div>
        {roomingError ? (
          <LoadWarning label="the rooming list" />
        ) : roomingGroups.length === 0 ? (
          <StepEmptyState
            icon={BedDouble}
            title="No rooming list created yet."
            description="Room groups and passenger assignments appear here once created in the classic builder."
          />
        ) : (
          <Card className="overflow-hidden p-0">
            <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-4 py-2.5">
              <BedDouble className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {roomingGroups.length} room{roomingGroups.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="divide-y divide-border">
              {roomingGroups.map((g) => (
                <RoomingCard key={g.id} g={g} />
              ))}
            </div>
          </Card>
        )}
      </section>
    </div>
  )
}
