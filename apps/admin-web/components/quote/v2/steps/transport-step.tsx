"use client"

import { Card } from "../../../ui/card"
import { Badge } from "../../../ui/badge"
import { StepHeader } from "../step-header"
import { StepEmptyState } from "../states"
import { StatusBadge, ContractBadge } from "../status-badges"
import { DisplayTextEditor } from "./display-text-editor"
import { ClassicGuidance } from "./classic-guidance"
import { EditInClassicLink, buildClassicItemHref } from "./edit-in-classic-link"
import { cn } from "../../../../lib/utils"
import { formatCurrency } from "../../../../lib/quote-helpers"
import type { TransportService } from "../../../../lib/quote-types"
import { Bus, AlertTriangle } from "lucide-react"

export type UpdateDisplayText = (
  quoteItemId: string,
  patch: Record<string, string | null>,
) => void | Promise<void>

function ServiceRow({
  svc,
  currency,
  onUpdateDisplayText,
  classicHref,
}: {
  svc: TransportService
  currency: string
  onUpdateDisplayText?: UpdateDisplayText
  classicHref?: string
}) {
  const unassigned = svc.supplier.toLowerCase() === "unassigned"
  const canEdit = Boolean(onUpdateDisplayText && svc.editableText && svc.quoteItemId)
  // Adding/removing transport, supplier/rate assignment and priced changes stay
  // in Classic; offer a contextual deep link to the same item. Pure navigation.
  const classicItemHref = buildClassicItemHref(classicHref, "transport", svc.quoteItemId)
  return (
    <div className="px-4 py-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="font-normal text-muted-foreground">
              {svc.day}
            </Badge>
            <span className="text-sm font-medium text-foreground">{svc.route}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>{svc.type}</span>
            <span>·</span>
            <span>{svc.vehicleClass}</span>
            <span>·</span>
            <span className={cn(unassigned && "text-destructive")}>{svc.supplier}</span>
            {!unassigned && <ContractBadge status={svc.supplierContract} />}
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 sm:justify-end">
          <StatusBadge status={svc.priceStatus} />
          <span className="w-20 text-right text-sm font-semibold text-foreground">
            {svc.amount != null ? formatCurrency(svc.amount, currency) : "—"}
          </span>
          {classicItemHref ? <EditInClassicLink href={classicItemHref} /> : null}
        </div>
      </div>
      {svc.warning && (
        <div className="mt-2 flex items-center gap-2 text-xs text-warning-foreground">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning" />
          <span>{svc.warning}</span>
        </div>
      )}
      {canEdit ? (
        <DisplayTextEditor
          fields={[
            { key: "transportLabel", label: "Route label", value: svc.transportLabel ?? "" },
          ]}
          onSave={(patch) => onUpdateDisplayText!(svc.quoteItemId!, patch)}
        />
      ) : null}
    </div>
  )
}

export interface TransportStepProps {
  services: TransportService[]
  currency: string
  /** When provided, each real transport line exposes an inline route-label editor. */
  onUpdateDisplayText?: UpdateDisplayText
  /** Link to the classic builder for the Classic-only transport edits. */
  classicHref?: string
}

export function TransportStep({ services, currency, onUpdateDisplayText, classicHref }: TransportStepProps) {
  const priced = services
    .filter((s) => s.amount != null)
    .reduce((sum, s) => sum + (s.amount ?? 0), 0)
  const anyEditable = Boolean(
    onUpdateDisplayText && services.some((s) => s.editableText && s.quoteItemId),
  )

  return (
    <div>
      <StepHeader
        title="Transport & Transfers"
        description="Vehicles, transfers and touring days with assigned ground suppliers and rates."
        statusLabel={anyEditable ? "Limited editing" : "View only"}
        statusTone="view"
        helper={
          anyEditable
            ? "Transport services are shown for review. Each route's client label can be edited; pricing is unchanged."
            : "Transport services are shown for review. Editing will come later."
        }
      />

      <ClassicGuidance
        message="Adding, removing, supplier/rate assignment, touring routes, transfers, and priced transport changes are managed in Classic Builder. V2 currently supports limited client text editing only where available."
        classicHref={classicHref}
      />

      {services.length === 0 ? (
        <StepEmptyState
          icon={Bus}
          title="No transport services"
          description="Transfers and touring services with their suppliers and rates will appear here once added."
        />
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="flex items-center justify-between border-b border-border bg-muted/40 px-4 py-2.5">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {services.length} transport services
            </span>
            <span className="text-xs text-muted-foreground">
              Priced so far:{" "}
              <span className="font-semibold text-foreground">
                {formatCurrency(priced, currency)}
              </span>
            </span>
          </div>
          <div className="divide-y divide-border">
            {services.map((svc) => (
              <ServiceRow
                key={svc.id}
                svc={svc}
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
