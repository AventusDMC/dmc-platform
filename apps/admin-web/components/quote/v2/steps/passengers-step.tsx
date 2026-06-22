"use client"

import { Card } from "../../../ui/card"
import { Badge } from "../../../ui/badge"
import { StepHeader } from "../step-header"
import { StepEmptyState } from "../states"
import type { Passenger, RoomingGroupSummary } from "../../../../lib/quote-types"
import { Users, BedDouble, ExternalLink, AlertTriangle } from "lucide-react"

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

// READ-ONLY passengers + rooming summary. This step intentionally exposes NO
// mutation affordances (no add/edit/delete/assign). Full passenger & rooming
// management stays in the classic builder. Internal/admin only — never shown on
// public proposal pages.

function PassengerRow({ p }: { p: Passenger }) {
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

  return (
    <div className="px-4 py-3">
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
  /** Link to the classic builder where passengers/rooming are managed. */
  classicHref?: string
}

export function PassengersStep({
  passengers,
  roomingGroups,
  passengersError = false,
  roomingError = false,
  classicHref,
}: PassengersStepProps) {
  return (
    <div className="space-y-6">
      <StepHeader
        title="Passengers & Rooming"
        description="Traveller details and the rooming list for this quote."
        statusLabel="Read only"
        statusTone="view"
        helper="Passengers and rooming are shown for review. Add, edit and room assignment are managed in the classic builder."
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
        <h3 className="mb-2 text-sm font-semibold text-foreground">Passengers</h3>
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
                <PassengerRow key={p.id} p={p} />
              ))}
            </div>
          </Card>
        )}
      </section>

      {/* Rooming */}
      <section>
        <h3 className="mb-2 text-sm font-semibold text-foreground">Rooming</h3>
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
