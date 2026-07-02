"use client"

import { Card } from "../../../ui/card"
import { Badge } from "../../../ui/badge"
import { StepHeader } from "../step-header"
import { StepEmptyState } from "../states"
import { StatusBadge, ContractBadge } from "../status-badges"
import { useState } from "react"
import { Button } from "../../../ui/button"
import { DisplayTextEditor } from "./display-text-editor"
import { ClassicGuidance } from "./classic-guidance"
import { EditInClassicLink, buildClassicItemHref } from "./edit-in-classic-link"
import { PricingPreviewModal } from "./pricing-preview-modal"
import { cn } from "../../../../lib/utils"
import { formatCurrency } from "../../../../lib/quote-helpers"
import type { TransportService, PreviewItemHandler, ApplyItemPricingHandler } from "../../../../lib/quote-types"
import { Bus, AlertTriangle, Calculator } from "lucide-react"

export type UpdateDisplayText = (
  quoteItemId: string,
  patch: Record<string, string | null>,
) => void | Promise<void>

function ServiceRow({
  svc,
  currency,
  onUpdateDisplayText,
  classicHref,
  onPreviewItem,
  onApplyItemPricing,
  transportPreviewEnabled,
  transportApplyEnabled,
}: {
  svc: TransportService
  currency: string
  onUpdateDisplayText?: UpdateDisplayText
  classicHref?: string
  onPreviewItem?: PreviewItemHandler
  onApplyItemPricing?: ApplyItemPricingHandler
  /** Transport pricing preview is behind a separate flag (default OFF). */
  transportPreviewEnabled?: boolean
  /** Transport pricing APPLY (Phase T-A, single-leg transfers) is behind its own flag (default OFF). */
  transportApplyEnabled?: boolean
}) {
  const [previewOpen, setPreviewOpen] = useState(false)
  const unassigned = svc.supplier.toLowerCase() === "unassigned"
  const canEdit = Boolean(onUpdateDisplayText && svc.editableText && svc.quoteItemId)
  // Adding/removing transport, supplier/rate assignment and priced changes stay
  // in Classic; offer a contextual deep link to the same item. Pure navigation.
  const classicItemHref = buildClassicItemHref(classicHref, "transport", svc.quoteItemId)
  // Read-only pricing preview — real items only, role/status-gated handler, AND
  // behind the separate transport-preview flag (default OFF). When the flag is OFF
  // transport rows stay fully Classic/read-only (no preview affordance).
  const canPreview = Boolean(onPreviewItem && svc.quoteItemId && transportPreviewEnabled)
  // Transport APPLY (Phase T-A) — offered ONLY for eligible standalone single-leg
  // transfer rows (svc.transportApplyEligible, computed from the API item) behind the
  // apply flag on top of preview. Everything else (full-day / daily-package /
  // touring / override / missing-date / unpriced) stays preview-only with helper
  // text. The modal further needs a resolvable token, and the backend independently
  // enforces every eligibility rule + rejects ineligible items out of scope.
  const canApplyTransport = Boolean(
    onApplyItemPricing && canPreview && transportApplyEnabled && svc.transportApplyEligible,
  )
  // A transport row that COULD preview-apply (flag on) but is not an eligible
  // single-leg transfer → show a short "single-leg only" helper so staff aren't
  // misled into thinking every transport row is applyable in this phase.
  const showApplyBlockedHelper = Boolean(canPreview && transportApplyEnabled && !svc.transportApplyEligible)
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
          {canPreview ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              onClick={() => setPreviewOpen(true)}
              title={
                canApplyTransport
                  ? "Preview and apply transport pricing — nothing is saved until you apply"
                  : "Preview projected transport pricing — read-only, nothing is saved"
              }
            >
              <Calculator className="size-3.5" aria-hidden="true" />
              {canApplyTransport ? "Apply transport price" : "Preview transport pricing"}
            </Button>
          ) : null}
          {classicItemHref ? <EditInClassicLink href={classicItemHref} /> : null}
        </div>
      </div>
      {showApplyBlockedHelper ? (
        <p className="mt-1 text-xs text-muted-foreground">
          Transport apply is only available for single-leg transfers in this phase. Manage this transport item in Classic.
        </p>
      ) : null}
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
      {canPreview ? (
        <PricingPreviewModal
          open={previewOpen}
          onClose={() => setPreviewOpen(false)}
          title={`${svc.route} — ${svc.day}`}
          currency={currency}
          quoteItemId={svc.quoteItemId!}
          onPreview={onPreviewItem!}
          onApply={canApplyTransport ? onApplyItemPricing : undefined}
          applyEnabled={canApplyTransport}
          applyLabel="Apply transport price"
          applyDescription="Nothing is saved until you apply. Apply updates only this transport line's price — it does not change the route, vehicle, driver, pickup/drop-off, serviceDate, supplier assignment, itinerary, or any other item, and sends nothing to the client."
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
  /** When provided (role/status-gated), rows expose a read-only pricing preview. */
  onPreviewItem?: PreviewItemHandler
  /** When provided (role/status-gated), eligible single-leg transfer rows expose apply. */
  onApplyItemPricing?: ApplyItemPricingHandler
  /**
   * Transport pricing PREVIEW scope (separate flag, default OFF). When false,
   * transport rows stay fully Classic/read-only with no preview affordance.
   */
  transportPreviewEnabled?: boolean
  /**
   * Transport pricing APPLY scope — Phase T-A (separate flag, default OFF). When true
   * (and onApplyItemPricing + transportPreviewEnabled are provided), eligible
   * standalone single-leg transfer rows expose an "Apply transport price" action.
   * When false, transport stays preview-only.
   */
  transportApplyEnabled?: boolean
}

export function TransportStep({ services, currency, onUpdateDisplayText, classicHref, onPreviewItem, onApplyItemPricing, transportPreviewEnabled, transportApplyEnabled }: TransportStepProps) {
  const priced = services
    .filter((s) => s.amount != null)
    .reduce((sum, s) => sum + (s.amount ?? 0), 0)
  const anyEditable = Boolean(
    onUpdateDisplayText && services.some((s) => s.editableText && s.quoteItemId),
  )
  // Read-only preview affordance is active only when the handler is present AND the
  // transport-preview flag is ON. Default OFF → transport stays Classic/read-only.
  const previewActive = Boolean(onPreviewItem && transportPreviewEnabled)
  // Phase T-A apply is active when the apply handler + apply flag are present on top
  // of preview — eligible single-leg transfer rows then expose "Apply transport price".
  const applyActive = Boolean(previewActive && onApplyItemPricing && transportApplyEnabled)

  return (
    <div>
      <StepHeader
        title="Transport & Transfers"
        description="Vehicles, transfers and touring days with assigned ground suppliers and rates."
        statusLabel={applyActive ? "Apply enabled" : previewActive ? "Preview only" : anyEditable ? "Limited editing" : "View only"}
        statusTone={previewActive ? "preview" : "view"}
        helper={
          applyActive
            ? "Transport pricing apply is available for standalone single-leg transfers only (airport / point-to-point). Full-day, daily-package, touring and override rows stay preview-only; adding, removing and other priced transport edits remain in Classic."
            : previewActive
            ? "Transport rows expose a read-only pricing preview (no changes are saved and there is no apply). Adding, removing and priced transport edits remain in Classic."
            : anyEditable
              ? "Transport services are shown for review. Each route's client label can be edited; pricing is unchanged."
              : "Transport services are shown for review. Editing will come later."
        }
      />

      <ClassicGuidance
        message={
          previewActive
            ? "Adding, removing, supplier/rate assignment, touring routes, transfers, and priced transport changes are managed in Classic Builder. V2 transport pricing is preview-only (read-only) — there is no apply."
            : "Adding, removing, supplier/rate assignment, touring routes, transfers, and priced transport changes are managed in Classic Builder. Transport remains Classic/read-only unless the transport pricing-preview flag is enabled."
        }
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
                onPreviewItem={onPreviewItem}
                onApplyItemPricing={onApplyItemPricing}
                transportPreviewEnabled={transportPreviewEnabled}
                transportApplyEnabled={transportApplyEnabled}
              />
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
