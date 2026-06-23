"use client"

import { useState } from "react"
import { Card } from "../../../ui/card"
import { Badge } from "../../../ui/badge"
import { Button } from "../../../ui/button"
import { StepHeader } from "../step-header"
import { StepEmptyState } from "../states"
import type { Passenger, RoomingGroupSummary } from "../../../../lib/quote-types"
import { Users, BedDouble, ExternalLink, AlertTriangle, Pencil, Loader2, X, Plus, Trash2 } from "lucide-react"

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
      // Success: close the form. The parent has refreshed V2 data, so the
      // read view (or new passenger row) reflects the change.
      onCancel()
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
  onDeletePassenger,
  roomLabels,
}: {
  p: Passenger
  onUpdatePassenger?: UpdatePassenger
  /** Delete this passenger (pricing-inert). Only set when role+status+load allow. */
  onDeletePassenger?: (passengerId: string) => void | Promise<void>
  /** Rooms this passenger is assigned to (for the delete confirmation warning). */
  roomLabels?: string[]
}) {
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const canEdit = Boolean(onUpdatePassenger)
  const canDelete = Boolean(onDeletePassenger)

  const doDelete = async () => {
    if (!onDeletePassenger) return
    let message = `Delete passenger ${p.fullName}? This permanently removes the passenger from this quote.`
    if (roomLabels && roomLabels.length > 0) {
      message += `\n\nThis will also remove the passenger from rooming: ${roomLabels.join(", ")}.`
    }
    if (typeof window !== "undefined" && !window.confirm(message)) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await onDeletePassenger(p.id)
      // Parent refreshes V2 data on success; this row unmounts.
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Could not delete passenger.")
      setDeleting(false)
    }
  }

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
        <div className="flex shrink-0 items-center gap-1">
          {canEdit ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              onClick={() => setEditing(true)}
              disabled={deleting}
            >
              <Pencil className="h-3 w-3" aria-hidden="true" />
              Edit
            </Button>
          ) : null}
          {canDelete ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs text-destructive hover:text-destructive"
              onClick={doDelete}
              disabled={deleting}
            >
              {deleting ? (
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
              ) : (
                <Trash2 className="h-3 w-3" aria-hidden="true" />
              )}
              Delete
            </Button>
          ) : null}
        </div>
      </div>
      {deleteError ? (
        <p className="mt-1.5 text-xs text-destructive" role="alert">
          {deleteError}
        </p>
      ) : null}
    </div>
  )
}

function RoomingCard({
  g,
  allPassengers,
  unavailableIds,
  onAssign,
  onUnassign,
}: {
  g: RoomingGroupSummary
  allPassengers: { id: string; name: string }[]
  /** Passenger ids already assigned to this room OR another room in the same stay. */
  unavailableIds: Set<string>
  onAssign?: (roomingGroupId: string, passengerId: string) => void | Promise<void>
  onUnassign?: (roomingGroupId: string, passengerId: string) => void | Promise<void>
}) {
  const editable = Boolean(onAssign && onUnassign)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState("")

  const facts = [g.roomType, g.occupancyType].filter(Boolean) as string[]
  // Available = quote passengers not already assigned to this room OR another
  // room in the same stay (the backend enforces one room per stay; this avoids a
  // predictable error). The backend remains the source of truth.
  const available = allPassengers.filter((p) => p.id && !unavailableIds.has(p.id))

  const run = async (fn?: (gid: string, pid: string) => void | Promise<void>, pid?: string) => {
    if (!fn || !pid) return
    setSaving(true)
    setError(null)
    try {
      await fn(g.id, pid)
      setSelected("")
      // Parent refreshes V2 data on success; card re-renders with new state.
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update rooming assignment.")
    } finally {
      setSaving(false)
    }
  }

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

      {/* Assigned passengers */}
      {editable ? (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {g.assignedPassengers.length > 0 ? (
            g.assignedPassengers.map((p) => (
              <span
                key={p.id}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-xs text-foreground"
              >
                {p.name}
                <button
                  type="button"
                  aria-label={`Remove ${p.name}`}
                  className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                  disabled={saving}
                  onClick={() => run(onUnassign, p.id)}
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              </span>
            ))
          ) : (
            <span className="text-xs italic text-muted-foreground">No passengers assigned.</span>
          )}
        </div>
      ) : (
        <div className="mt-1.5 text-xs text-foreground">
          {g.passengers.length > 0 ? (
            g.passengers.join(", ")
          ) : (
            <span className="italic text-muted-foreground">No passengers assigned.</span>
          )}
        </div>
      )}

      {/* Add passenger (assign one at a time) */}
      {editable ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select
            className="h-7 rounded-md border border-input bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            value={selected}
            disabled={saving || available.length === 0}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="">{available.length === 0 ? "All passengers assigned" : "Add passenger…"}</option>
            {available.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1 px-2 text-xs"
            disabled={saving || !selected}
            onClick={() => run(onAssign, selected)}
          >
            {saving ? (
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
            ) : (
              <Plus className="h-3 w-3" aria-hidden="true" />
            )}
            Add
          </Button>
        </div>
      ) : null}

      {error ? (
        <p className="mt-1.5 text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
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
  /**
   * Add a NEW passenger (pricing-inert; existing POST endpoint). When provided,
   * the Passengers section shows an "Add passenger" affordance. Adding a
   * passenger does NOT change the priced pax count.
   */
  onAddPassenger?: (patch: Record<string, string | null>) => void | Promise<void>
  /**
   * Delete an EXISTING passenger (pricing-inert; existing DELETE endpoint).
   * Only wired for admin/operations roles. Shown per-row only when status allows
   * and both passengers + rooming loaded (rooming impact must be known).
   */
  onDeletePassenger?: (passengerId: string) => void | Promise<void>
  /**
   * Whether the quote status permits passenger deletion (non-finalized). Computed
   * upstream from the raw status; when false the Delete control is hidden.
   */
  statusDeletable?: boolean
  /**
   * Assign an EXISTING passenger to an EXISTING rooming group (pricing-inert).
   * When both assign + unassign are provided, the Rooming section exposes
   * assignment editing only (no room create/edit/type/occupancy).
   */
  onAssignRoom?: (roomingGroupId: string, passengerId: string) => void | Promise<void>
  onUnassignRoom?: (roomingGroupId: string, passengerId: string) => void | Promise<void>
  /** Priced pax count (adults + children) — for the count-mismatch advisory only. */
  pricedPax?: number
  /** Link to the classic builder where passengers/rooming are managed. */
  classicHref?: string
}

const BLANK_PASSENGER: Passenger = { id: "", fullName: "" }

export function PassengersStep({
  passengers,
  roomingGroups,
  passengersError = false,
  roomingError = false,
  onUpdatePassenger,
  onAddPassenger,
  onDeletePassenger,
  statusDeletable = false,
  onAssignRoom,
  onUnassignRoom,
  pricedPax = 0,
  classicHref,
}: PassengersStepProps) {
  const [adding, setAdding] = useState(false)
  const passengersEditable = Boolean(onUpdatePassenger)
  const canAddPassenger = Boolean(onAddPassenger)
  // Suppress the Add UI when the passengers GET failed — we can't show the
  // current list, so adding could create a misleading/duplicate state. Only the
  // load warning is shown until the list loads.
  const showAdd = canAddPassenger && !passengersError
  // Delete is destructive: only when role allows (onDeletePassenger provided),
  // status permits, AND both passengers + rooming loaded (so the rooming-impact
  // warning can be shown reliably).
  const canDeletePassenger =
    Boolean(onDeletePassenger) && statusDeletable && !passengersError && !roomingError
  const countMismatch = pricedPax > 0 && passengers.length > pricedPax
  const roomingEditable = Boolean(onAssignRoom && onUnassignRoom)
  const allPassengers = passengers.map((p) => ({ id: p.id, name: p.fullName }))
  // Map each passenger id → the room label(s) they're assigned to, for the
  // delete confirmation's rooming-impact warning.
  const roomsByPassenger = new Map<string, string[]>()
  for (const g of roomingGroups) {
    for (const ap of g.assignedPassengers) {
      const arr = roomsByPassenger.get(ap.id) ?? []
      arr.push(g.label)
      roomsByPassenger.set(ap.id, arr)
    }
  }
  // Passengers already assigned within a stay (hotel + day) can't be added to
  // another room of that same stay — mirror the backend's one-room-per-stay rule
  // in the "Add passenger" list so we don't offer an assignment that would fail.
  const stayKey = (g: RoomingGroupSummary) => `${g.hotel ?? ""}||${g.day ?? ""}`
  const stayAssigned = new Map<string, Set<string>>()
  for (const g of roomingGroups) {
    const k = stayKey(g)
    const set = stayAssigned.get(k) ?? new Set<string>()
    g.assignedPassengers.forEach((p) => set.add(p.id))
    stayAssigned.set(k, set)
  }
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
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">Passengers</h3>
            <Badge variant="outline" className="font-normal text-muted-foreground">
              {passengersEditable || canAddPassenger ? "Limited editing" : "Read only"}
            </Badge>
          </div>
          {showAdd && !adding ? (
            <Button size="sm" variant="outline" className="h-7 gap-1 px-2.5 text-xs" onClick={() => setAdding(true)}>
              <Plus className="h-3 w-3" aria-hidden="true" />
              Add passenger
            </Button>
          ) : null}
        </div>

        {showAdd ? (
          <p className="mb-2 text-xs text-muted-foreground">
            Adding passenger details does not change priced pax count. Pax counts are managed in Classic
            Builder.
          </p>
        ) : null}

        {countMismatch ? (
          <div
            role="status"
            className="mb-2 flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 px-4 py-2.5 text-xs text-warning-foreground"
          >
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" aria-hidden="true" />
            <span>
              Passenger list count ({passengers.length}) may differ from priced pax count ({pricedPax}).
              Adjust pax count in Classic Builder if needed.
            </span>
          </div>
        ) : null}

        {showAdd && adding && onAddPassenger ? (
          <div className="mb-3">
            <PassengerEditForm
              passenger={BLANK_PASSENGER}
              onCancel={() => setAdding(false)}
              onSave={(patch) => onAddPassenger(patch)}
            />
          </div>
        ) : null}

        {passengersError ? (
          <LoadWarning label="passengers" />
        ) : passengers.length === 0 ? (
          <StepEmptyState
            icon={Users}
            title="No passengers added yet."
            description={
              canAddPassenger
                ? 'Use "Add passenger" above, or manage the full list in the classic builder.'
                : "Traveller names and details appear here once added in the classic builder."
            }
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
                <PassengerRow
                  key={p.id}
                  p={p}
                  onUpdatePassenger={onUpdatePassenger}
                  onDeletePassenger={canDeletePassenger ? onDeletePassenger : undefined}
                  roomLabels={roomsByPassenger.get(p.id) ?? []}
                />
              ))}
            </div>
          </Card>
        )}
      </section>

      {/* Rooming — assignment editing only (room counts/types/occupancy stay in classic) */}
      <section>
        <div className="mb-2 flex items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground">Rooming</h3>
          <Badge variant="outline" className="font-normal text-muted-foreground">
            {roomingEditable ? "Limited editing" : "Read only"}
          </Badge>
        </div>
        <p className="mb-2 text-xs text-muted-foreground">
          Rooming assignment only. Room counts, room types, occupancy, and pricing are managed in Classic
          Builder.
        </p>
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
                <RoomingCard
                  key={g.id}
                  g={g}
                  allPassengers={allPassengers}
                  unavailableIds={stayAssigned.get(stayKey(g)) ?? new Set<string>()}
                  onAssign={onAssignRoom}
                  onUnassign={onUnassignRoom}
                />
              ))}
            </div>
          </Card>
        )}
      </section>
    </div>
  )
}
