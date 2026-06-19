"use client"

import { Card } from "../../../ui/card"
import { Badge } from "../../../ui/badge"
import { Button } from "../../../ui/button"
import { StepHeader } from "../step-header"
import { StepEmptyState } from "../states"
import { StatusBadge } from "../status-badges"
import { formatCurrency } from "../../../../lib/quote-helpers"
import type { Experience } from "../../../../lib/quote-types"
import { Ticket, Plus } from "lucide-react"

function ExperienceRow({ exp, currency }: { exp: Experience; currency: string }) {
  return (
    <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-foreground">{exp.name}</span>
          {exp.included ? (
            <Badge variant="secondary" className="font-normal">
              Included
            </Badge>
          ) : (
            <Badge variant="outline" className="font-normal text-muted-foreground">
              Optional
            </Badge>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>{exp.city}</span>
          <span>·</span>
          <span>{exp.type}</span>
          <span>·</span>
          <span>{exp.day}</span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 sm:justify-end">
        <StatusBadge status={exp.status} />
        <span className="w-20 text-right text-sm font-semibold text-foreground">
          {exp.amount > 0 ? formatCurrency(exp.amount, currency) : "Incl."}
        </span>
      </div>
    </div>
  )
}

export interface ExperiencesStepProps {
  experiences: Experience[]
  currency: string
  onAdd?: () => void
}

export function ExperiencesStep({ experiences, currency, onAdd }: ExperiencesStepProps) {
  return (
    <div>
      <StepHeader
        title="Experiences & Entrances"
        description="Sightseeing visits, entrance fees and optional activities tied to the itinerary days."
        action={
          <Button size="sm" variant="outline" onClick={onAdd}>
            <Plus className="h-4 w-4" />
            Add experience
          </Button>
        }
      />
      {experiences.length === 0 ? (
        <StepEmptyState
          icon={Ticket}
          title="No experiences added"
          description="Add entrance fees, guided visits and optional activities for this program."
          action={
            <Button size="sm" onClick={onAdd}>
              <Plus className="h-4 w-4" />
              Add experience
            </Button>
          }
        />
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-4 py-2.5">
            <Ticket className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {experiences.length} experiences across the program
            </span>
          </div>
          <div className="divide-y divide-border">
            {experiences.map((exp) => (
              <ExperienceRow key={exp.id} exp={exp} currency={currency} />
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
