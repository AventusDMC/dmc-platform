"use client"

import { useState } from "react"
import { Card } from "../../../ui/card"
import { Badge } from "../../../ui/badge"
import { Button } from "../../../ui/button"
import { StepHeader } from "../step-header"
import { StepEmptyState } from "../states"
import { StatusBadge } from "../status-badges"
import { DisplayTextEditor, type DisplayTextField } from "./display-text-editor"
import { ClassicGuidance } from "./classic-guidance"
import { EditInClassicLink, buildClassicItemHref } from "./edit-in-classic-link"
import { PricingPreviewModal } from "./pricing-preview-modal"
import { ItemPricingApplyModal } from "./item-pricing-apply-modal"
import { PricingApplyAuditPanel } from "./pricing-apply-audit-panel"
import { formatCurrency } from "../../../../lib/quote-helpers"
import type { ApplyItemPricingHandler, Experience, LoadApplyAuditHandler, PreviewItemHandler } from "../../../../lib/quote-types"
import { Ticket, Calculator } from "lucide-react"

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
  onPreviewItem,
  onApplyItemPricing,
  entrancePricingEnabled,
}: {
  exp: Experience
  currency: string
  onUpdateDisplayText?: UpdateDisplayText
  classicHref?: string
  onPreviewItem?: PreviewItemHandler
  onApplyItemPricing?: ApplyItemPricingHandler
  /** Entrance/Jordan-Pass apply is behind a separate flag (PR #561); off by default. */
  entrancePricingEnabled?: boolean
}) {
  const [previewOpen, setPreviewOpen] = useState(false)
  const [applyOpen, setApplyOpen] = useState(false)
  // Only external-package items expose editable client text; everything else is
  // read-only (its client copy is catalog- or narrative-driven).
  const canEdit = Boolean(onUpdateDisplayText && exp.editableText && exp.quoteItemId)
  // Adding/removing/pricing services stays in Classic; offer a contextual deep
  // link to the same item there. Pure navigation — no V2 mutation.
  const classicItemHref = buildClassicItemHref(classicHref, "services", exp.quoteItemId)
  // Pricing APPLY is supported for real MEAL, ACTIVITY or GUIDE items (role/status-gated handlers).
  const canApplyMeal = Boolean(onApplyItemPricing && onPreviewItem && exp.isMeal && exp.quoteItemId)
  const canApplyActivity = Boolean(onApplyItemPricing && onPreviewItem && exp.isActivity && exp.quoteItemId)
  const canApplyGuide = Boolean(onApplyItemPricing && onPreviewItem && exp.isGuide && exp.quoteItemId)
  // Entrance/Jordan-Pass apply additionally requires the separate entrance flag (PR #561).
  const canApplyEntrance = Boolean(
    onApplyItemPricing && onPreviewItem && exp.isEntrance && exp.quoteItemId && entrancePricingEnabled,
  )
  const canApply = canApplyMeal || canApplyActivity || canApplyGuide || canApplyEntrance
  const applyKind: "meal" | "activity" | "guide" | "entrance" = canApplyEntrance
    ? "entrance"
    : canApplyGuide
      ? "guide"
      : canApplyActivity
        ? "activity"
        : "meal"
  // Read-only pricing preview for other real items (PR3). Meal/activity/guide rows
  // use the apply modal instead. Entrance rows never show the read-only preview:
  // when the entrance flag is ON they use the apply modal, and when OFF they stay
  // fully read-only (entrance preview is gated behind the same flag, server-side).
  const canPreview = Boolean(onPreviewItem && exp.quoteItemId) && !canApply && !exp.isEntrance
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
          {canApply ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              onClick={() => setApplyOpen(true)}
              title="Preview and apply pricing — nothing is saved until you apply"
            >
              <Calculator className="size-3.5" aria-hidden="true" />
              {applyKind === "entrance"
                ? "Preview & apply entrance pricing"
                : applyKind === "guide"
                  ? "Preview & apply guide pricing"
                  : applyKind === "activity"
                    ? "Preview & apply activity pricing"
                    : "Preview & apply meal pricing"}
            </Button>
          ) : canPreview ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              onClick={() => setPreviewOpen(true)}
              title="Preview projected pricing — no changes will be saved"
            >
              <Calculator className="size-3.5" aria-hidden="true" />
              Preview pricing
            </Button>
          ) : null}
          {classicItemHref ? <EditInClassicLink href={classicItemHref} /> : null}
        </div>
      </div>
      {canEdit ? (
        <DisplayTextEditor
          fields={externalPackageFields(exp)}
          onSave={(patch) => onUpdateDisplayText!(exp.quoteItemId!, patch)}
        />
      ) : null}
      {canPreview ? (
        <PricingPreviewModal
          open={previewOpen}
          onClose={() => setPreviewOpen(false)}
          title={`${exp.name} — ${exp.city}`}
          currency={currency}
          quoteItemId={exp.quoteItemId!}
          onPreview={onPreviewItem!}
        />
      ) : null}
      {canApply ? (
        <ItemPricingApplyModal
          open={applyOpen}
          onClose={() => setApplyOpen(false)}
          kind={applyKind}
          exp={exp}
          currency={currency}
          onPreview={onPreviewItem!}
          onApply={onApplyItemPricing!}
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
  /** When provided (role/status-gated), rows expose a read-only pricing preview. */
  onPreviewItem?: PreviewItemHandler
  /** When provided (role/status-gated), MEAL rows expose preview + apply. */
  onApplyItemPricing?: ApplyItemPricingHandler
  /** When provided (role/status-gated), shows the read-only "Pricing Apply Audit" panel. */
  onLoadApplyAudit?: LoadApplyAuditHandler
  /**
   * Entrance/Jordan-Pass apply scope (PR #561), behind a separate frontend flag —
   * default OFF. When false, entrance rows stay read-only even if apply is enabled.
   */
  entrancePricingEnabled?: boolean
}

export function ExperiencesStep({ experiences, currency, onUpdateDisplayText, classicHref, onPreviewItem, onApplyItemPricing, onLoadApplyAudit, entrancePricingEnabled }: ExperiencesStepProps) {
  const anyEditable = Boolean(
    onUpdateDisplayText && experiences.some((e) => e.editableText && e.quoteItemId),
  )
  // V2 now supports limited pricing APPLY (Meals/Activities/Guides, and
  // Entrance/Jordan Pass when its flag is on). When the apply handler is present
  // the step is no longer view-only, so surface "Limited apply" instead of
  // "View only" — staff need to know some rows are actionable.
  const applyEnabled = Boolean(onApplyItemPricing)
  return (
    <div>
      <StepHeader
        title="Experiences & Entrances"
        description="Sightseeing visits, entrance fees and optional activities tied to the itinerary days."
        statusLabel={applyEnabled ? "Limited apply" : anyEditable ? "Limited editing" : "View only"}
        statusTone={applyEnabled ? "preview" : "view"}
        helper={
          applyEnabled
            ? "Pricing apply is available for selected services (Meals, Activities, Guides, Entrance/Jordan Pass). Other rows remain view-only or Classic."
            : anyEditable
              ? "Experiences are shown for review. Client text for external packages can be edited; pricing is unchanged."
              : "Experiences and entrances are shown for review. Editing will come later."
        }
      />

      <ClassicGuidance
        message="Adding, removing, and pricing services, activities, entrance fees, meals, guides, and external packages are managed in Classic Builder. V2 currently supports limited client text editing only where available."
        classicHref={classicHref}
      />

      {/* Staff guidance for the in-scope V2 pricing apply. Shown only when apply is
          enabled (role/status-gated handler present). */}
      {onApplyItemPricing ? (
        <div className="mb-3 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <div className="flex items-start gap-2">
            <Calculator className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <div className="space-y-0.5">
              <p>
                V2 pricing apply is supported for Meals, Activities, and Guides
                {entrancePricingEnabled ? ", and Entrance / Jordan Pass" : ""} only.
              </p>
              <p>
                {entrancePricingEnabled
                  ? "Hotels, transport, and external packages remain Classic/read-only."
                  : "Hotels, transport, entrance fees, and external packages remain Classic/read-only."}
              </p>
              <p>Activity pax/quantity changes remain Classic-only.</p>
              {entrancePricingEnabled ? (
                <p>Entrance applies re-sync Jordan Pass coverage; ticket variant + pax stay Classic-only.</p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

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
                onPreviewItem={onPreviewItem}
                onApplyItemPricing={onApplyItemPricing}
                entrancePricingEnabled={entrancePricingEnabled}
              />
            ))}
          </div>
        </Card>
      )}

      {/* Read-only V2 pricing-apply audit history (role/status-gated). */}
      {onLoadApplyAudit ? <PricingApplyAuditPanel currency={currency} onLoad={onLoadApplyAudit} /> : null}
    </div>
  )
}
