"use client"

import { Card } from "../../../ui/card"
import { Badge } from "../../../ui/badge"
import { Button } from "../../../ui/button"
import { StepHeader } from "../step-header"
import { StepEmptyState } from "../states"
import { StatusBadge, ContractBadge } from "../status-badges"
import { cn } from "../../../../lib/utils"
import { formatCurrency } from "../../../../lib/quote-helpers"
import type { TransportService } from "../../../../lib/quote-types"
import { Bus, AlertTriangle } from "lucide-react"

function ServiceRow({ svc, currency }: { svc: TransportService; currency: string }) {
  const unassigned = svc.supplier.toLowerCase() === "unassigned"
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
        </div>
      </div>
      {svc.warning && (
        <div className="mt-2 flex items-center gap-2 text-xs text-warning-foreground">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning" />
          <span>{svc.warning}</span>
        </div>
      )}
    </div>
  )
}

export interface TransportStepProps {
  services: TransportService[]
  currency: string
  onAdd?: () => void
}

export function TransportStep({ services, currency, onAdd }: TransportStepProps) {
  const priced = services
    .filter((s) => s.amount != null)
    .reduce((sum, s) => sum + (s.amount ?? 0), 0)

  return (
    <div>
      <StepHeader
        title="Transport & Transfers"
        description="Vehicles, transfers and touring days with assigned ground suppliers and rates."
        statusLabel="View only"
        statusTone="view"
        helper="Transport services are shown for review. Editing will come later."
        action={
          <Button size="sm" variant="outline" onClick={onAdd}>
            <Bus className="h-4 w-4" />
            Add service
          </Button>
        }
      />
      {services.length === 0 ? (
        <StepEmptyState
          icon={Bus}
          title="No transport services"
          description="Add transfers and touring services with their suppliers and rates."
          action={
            <Button size="sm" onClick={onAdd}>
              <Bus className="h-4 w-4" />
              Add service
            </Button>
          }
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
              <ServiceRow key={svc.id} svc={svc} currency={currency} />
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
