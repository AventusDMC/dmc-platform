"use client"

import { Pencil, UserRound, Plane, SlidersHorizontal, Settings2 } from "lucide-react"
import { Card } from "../../../ui/card"
import { Button } from "../../../ui/button"
import { StepHeader } from "../step-header"
import { StepEmptyState } from "../states"
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
  onEdit?: () => void
}

export function SetupStep({ fields, onEdit }: SetupStepProps) {
  return (
    <div>
      <StepHeader
        title="Quote setup"
        description="Core details that flow into the itinerary, pricing and the final proposal."
        action={
          <Button variant="outline" size="sm" className="gap-2" onClick={onEdit}>
            <Pencil className="size-4" aria-hidden="true" />
            Edit details
          </Button>
        }
      />

      {fields.length === 0 ? (
        <StepEmptyState
          icon={Settings2}
          title="No setup details yet"
          description="Add the client, trip basics and configuration to start building this quote."
          action={
            <Button size="sm" onClick={onEdit}>
              Add details
            </Button>
          }
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
