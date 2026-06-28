"use client"

import { ExternalLink, UserRound, Plane, SlidersHorizontal, Settings2 } from "lucide-react"
import { Card } from "../../../ui/card"
import { StepHeader } from "../step-header"
import { StepEmptyState } from "../states"
import { ClassicGuidance } from "./classic-guidance"
import type { SetupField } from "../../../../lib/quote-types"

const groups: {
  id: SetupField["group"]
  title: string
  icon: typeof UserRound
}[] = [
  { id: "client", title: "Client & market", icon: UserRound },
  { id: "trip", title: "Trip basics", icon: Plane },
  { id: "config", title: "Configuration", icon: SlidersHorizontal },
]

export interface SetupStepProps {
  fields: SetupField[]
  /** Link to the classic builder — setup edits are Classic-only. */
  classicHref?: string
}

export function SetupStep({ fields, classicHref }: SetupStepProps) {
  // Setup is read-only in V2; the only affordance is a link to Classic (where all
  // setup edits live). Render it as a link rather than a dead button.
  const editInClassic = classicHref ? (
    <a
      href={classicHref}
      className="inline-flex h-8 shrink-0 items-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      title="Edit quote setup in Classic Builder"
    >
      <ExternalLink className="size-4" aria-hidden="true" />
      Edit in Classic
    </a>
  ) : undefined

  return (
    <div>
      <StepHeader
        title="Quote setup"
        description="Core details that flow into the itinerary, pricing and the final proposal."
        action={editInClassic}
      />

      <ClassicGuidance
        message="Quote setup, client details, travel dates, currency, pax counts, room counts, FOC, and single supplement are managed in Classic Builder."
        classicHref={classicHref}
      />

      {fields.length === 0 ? (
        <StepEmptyState
          icon={Settings2}
          title="No setup details yet"
          description="Add the client, trip basics and configuration in Classic Builder to start building this quote."
          action={editInClassic}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {groups.map((group) => {
            const groupFields = fields.filter((f) => f.group === group.id)
            if (groupFields.length === 0) return null
            return (
              <Card key={group.id} className="p-5">
                <div className="flex items-center gap-2 border-b border-border pb-3">
                  <span className="flex size-7 items-center justify-center rounded-md bg-accent text-accent-foreground">
                    <group.icon className="size-4" aria-hidden="true" />
                  </span>
                  <h3 className="font-heading text-sm font-semibold text-foreground">
                    {group.title}
                  </h3>
                </div>
                <dl className="mt-3 space-y-3">
                  {groupFields.map((f) => (
                    <div key={f.label} className="space-y-0.5">
                      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {f.label}
                      </dt>
                      <dd className="text-sm font-medium text-foreground">{f.value}</dd>
                    </div>
                  ))}
                </dl>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
