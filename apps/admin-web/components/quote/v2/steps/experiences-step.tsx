"use client"

import { Card } from "../../../ui/card"
import { Badge } from "../../../ui/badge"
import { StepHeader } from "../step-header"
import { StepEmptyState } from "../states"
import { StatusBadge } from "../status-badges"
import { DisplayTextEditor, type DisplayTextField } from "./display-text-editor"
import { ClassicGuidance } from "./classic-guidance"
import { EditInClassicLink, buildClassicItemHref } from "./edit-in-classic-link"
import { formatCurrency } from "../../../../lib/quote-helpers"
import type { Experience } from "../../../../lib/quote-types"
import { Ticket } from "lucide-react"

export type UpdateDisplayText = (
  quoteItemId: string,
  patch: Record<string, string | null>,
) => void | Promise<void>

function externalPackageFields(exp: Experience): DisplayTextField[] {
  return [
    { key: "externalClientDescription", label: "Description", value: exp.externalClientDescription ?? "", multiline: true },
    { key: "externalIncludes", label: "Includes", value: exp.externalIncludes ?? "", multiline: true },
    { key: "externalExcludes", label: "Excludes", value: exp.externalExcludes ?? "", multiline: true },
    { key: "externalHotelsOrSimilar", label: "Hotels or similar", value: exp.externalHotelsOrSimilar ?? "" },
  ]
}

function ExperienceRow({
  exp,
  currency,
  onUpdateDisplayText,
  classicHref,
}: {
  exp: Experience
  currency: string
  onUpdateDisplayText?: UpdateDisplayText
  classicHref?: string
}) {
  // Only external-package items expose editable client text; everything else is
  // read-only (its client copy is catalog- or narrative-driven).
  const canEdit = Boolean(onUpdateDisplayText && exp.editableText && exp.quoteItemId)
  // Adding/removing/pricing services stays in Classic; offer a contextual deep
  // link to the same item there. Pure navigation — no V2 mutation.
  const classicItemHref = buildClassicItemHref(classicHref, "services", exp.quoteItemId)
  return (
    <div className="px-4 py-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
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
          {classicItemHref ? <EditInClassicLink href={classicItemHref} /> : null}
        </div>
      </div>
      {canEdit ? (
        <DisplayTextEditor
          fields={externalPackageFields(exp)}
          onSave={(patch) => onUpdateDisplayText!(exp.quoteItemId!, patch)}
        />
      ) : null}
    </div>
  )
}

export interface ExperiencesStepProps {
  experiences: Experience[]
  currency: string
  /** When provided, external-package items expose an inline "Client text" editor. */
  onUpdateDisplayText?: UpdateDisplayText
  /** Link to the classic builder for the Classic-only experience edits. */
  classicHref?: string
}

export function ExperiencesStep({ experiences, currency, onUpdateDisplayText, classicHref }: ExperiencesStepProps) {
  const anyEditable = Boolean(
    onUpdateDisplayText && experiences.some((e) => e.editableText && e.quoteItemId),
  )
  return (
    <div>
      <StepHeader
        title="Experiences & Entrances"
        description="Sightseeing visits, entrance fees and optional activities tied to the itinerary days."
        statusLabel={anyEditable ? "Limited editing" : "View only"}
        statusTone="view"
        helper={
          anyEditable
            ? "Experiences are shown for review. Client text for external packages can be edited; pricing is unchanged."
            : "Experiences and entrances are shown for review. Editing will come later."
        }
      />

      <ClassicGuidance
        message="Adding, removing, and pricing services, activities, entrance fees, meals, guides, and external packages are managed in Classic Builder. V2 currently supports limited client text editing only where available."
        classicHref={classicHref}
      />

      {experiences.length === 0 ? (
        <StepEmptyState
          icon={Ticket}
          title="No experiences added"
          description="Entrance fees, guided visits and optional activities will appear here once added to the program."
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
              <ExperienceRow
                key={exp.id}
                exp={exp}
                currency={currency}
                onUpdateDisplayText={onUpdateDisplayText}
                classicHref={classicHref}
              />
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
