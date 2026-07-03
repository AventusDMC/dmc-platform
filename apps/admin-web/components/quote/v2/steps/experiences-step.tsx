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
import type { ApplyItemPricingHandler, Experience, ItineraryDay, LoadApplyAuditHandler, PreviewItemHandler } from "../../../../lib/quote-types"
import { Ticket, Calculator, Plus, Loader2, AlertTriangle } from "lucide-react"

/** Add one Activity item (Phase B, Slice 2) via the V2 route. */
export type AddItemHandler = (payload: Record<string, unknown>) => void | Promise<unknown>

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
  externalPackagePreviewEnabled,
  externalPackageApplyEnabled,
}: {
  exp: Experience
  currency: string
  onUpdateDisplayText?: UpdateDisplayText
  classicHref?: string
  onPreviewItem?: PreviewItemHandler
  onApplyItemPricing?: ApplyItemPricingHandler
  /** Entrance/Jordan-Pass apply is behind a separate flag (PR #561); off by default. */
  entrancePricingEnabled?: boolean
  /** External-package read-only pricing preview is behind a separate flag; off by default. */
  externalPackagePreviewEnabled?: boolean
  /** External-package pricing APPLY is behind its own flag (default OFF); requires preview too. */
  externalPackageApplyEnabled?: boolean
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
  // External-package READ-ONLY pricing preview (PR #571), behind its own flag
  // (default OFF). External packages otherwise stay Classic/read-only. Preview-only
  // — never apply; the apply guard rejects external-package items server-side.
  const canPreviewExternal = Boolean(
    onPreviewItem && exp.quoteItemId && exp.isExternal && externalPackagePreviewEnabled,
  )
  // External-package pricing APPLY, behind its OWN flag (default OFF) on top of the
  // preview flag. Eligible only for a real external-package quote item with a stable
  // id AND a concrete, resolvable price. "Quote on request" / "net cost TBC" packages
  // have no priced amount (amount <= 0) and are NOT applyable — offering an apply
  // control on them misleads staff (the modal + backend still reject them since the
  // preview yields no token). Such rows stay preview-only. The modal further requires
  // a resolvable, token-bearing preview before apply, and the backend independently
  // enforces role/status/flags + rejects ineligible items. Apply re-prices the entered
  // package (net cost / matrix / basis / pax) in place — no itinerary text,
  // bundled/included content, or other item is touched.
  const externalHasResolvablePrice = exp.amount > 0
  const canApplyExternal = Boolean(
    onApplyItemPricing && canPreviewExternal && externalPackageApplyEnabled && externalHasResolvablePrice,
  )
  // Read-only pricing preview for other real items (PR3). Meal/activity/guide rows
  // use the apply modal instead. Entrance rows never show the read-only preview
  // (gated behind the entrance flag, server-side). External-package rows use their
  // own flag-gated preview above, so they are excluded here.
  const canPreview =
    Boolean(onPreviewItem && exp.quoteItemId) && !canApply && !exp.isEntrance && !exp.isExternal
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
          ) : canPreviewExternal ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              onClick={() => setPreviewOpen(true)}
              title={
                canApplyExternal
                  ? "Preview and apply external package pricing — nothing is saved until you apply"
                  : "Preview projected external package pricing — read-only, nothing is saved"
              }
            >
              <Calculator className="size-3.5" aria-hidden="true" />
              {canApplyExternal ? "Apply external package price" : "Preview external package pricing"}
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
      {/* Diagnostic for external (multi-country / partner) packages. When apply is
          NOT enabled the pricing is manual/bundled and managed in Classic. When apply
          IS enabled, explain the narrow scope: only this package line's price changes. */}
      {exp.isExternal ? (
        <p className="mt-1 text-xs text-muted-foreground">
          {canApplyExternal
            ? "Applying updates only this external package line's price — it does not change the hotels, transport, or services inside the package, and sends nothing to the client."
            : "External package — pricing is manual/bundled (entered net cost or rate matrix) and is managed in Classic Builder."}
        </p>
      ) : null}
      {canEdit ? (
        <DisplayTextEditor
          fields={externalPackageFields(exp)}
          onSave={(patch) => onUpdateDisplayText!(exp.quoteItemId!, patch)}
        />
      ) : null}
      {canPreview || canPreviewExternal ? (
        <PricingPreviewModal
          open={previewOpen}
          onClose={() => setPreviewOpen(false)}
          title={`${exp.name} — ${exp.city}`}
          currency={currency}
          quoteItemId={exp.quoteItemId!}
          onPreview={onPreviewItem!}
          onApply={canApplyExternal ? onApplyItemPricing : undefined}
          applyEnabled={canApplyExternal}
          applyLabel="Apply external package price"
          applyDescription="Nothing is saved until you apply. Apply updates only this external package line's price — it does not change the hotels, transport, or services inside the package, the itinerary, or any other item, and sends nothing to the client."
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

// Phase B item-create form. Activity (Slice 2) + Guide (Slice 3). Explicit day +
// service date, plus per-type fields. Submits to the V2 route via onAddItem (which
// reuses the existing createItem + recalculation). The persistent success toast +
// refresh are handled by the client handler; this form just resets/closes.
const FIELD_CLASS =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

type AddItemMode = "activity" | "guide"

// A service is guide-compatible when its taxonomy source (serviceType code/name or
// category) contains "guide" — mirrors the backend resolveServiceTaxonomyGroup rule.
// The guide catalog uses the services proxy (never the guide-people endpoint, which
// is for assigning a real guide person and is out of scope).
function isGuideServiceRecord(s: { category?: string | null; serviceType?: { name?: string | null; code?: string | null } | null }) {
  const src = String(s.serviceType?.code || s.serviceType?.name || s.category || "")
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
  return src.includes("guide")
}

function AddItemPanel({
  onAddItem,
  itineraryDays,
}: {
  onAddItem: AddItemHandler
  itineraryDays: ItineraryDay[]
}) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<AddItemMode>("activity")
  const [loadingCatalog, setLoadingCatalog] = useState(false)
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [activities, setActivities] = useState<Array<{ id: string; name: string; rateVariants?: Array<{ id: string; name: string; currency?: string; costPrice?: number; active?: boolean }> }>>([])
  const [guideServices, setGuideServices] = useState<Array<{ id: string; name: string }>>([])
  const [dayId, setDayId] = useState("")
  const [serviceDate, setServiceDate] = useState("")
  // Activity fields
  const [activityId, setActivityId] = useState("")
  const [variantId, setVariantId] = useState("")
  // Guide fields
  const [serviceId, setServiceId] = useState("")
  const [guideType, setGuideType] = useState("")
  const [guideDuration, setGuideDuration] = useState("")
  const [overnight, setOvernight] = useState(false)
  const [guideLanguage, setGuideLanguage] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadActivities = async () => {
    if (activities.length > 0) return
    setLoadingCatalog(true)
    setCatalogError(null)
    try {
      const res = await fetch("/api/activities", { cache: "no-store" })
      if (!res.ok) throw new Error(`Could not load activities (${res.status}).`)
      const data = await res.json()
      setActivities(Array.isArray(data) ? data : [])
    } catch (e) {
      setCatalogError(e instanceof Error ? e.message : "Could not load activities.")
    } finally {
      setLoadingCatalog(false)
    }
  }

  const loadGuideServices = async () => {
    if (guideServices.length > 0) return
    setLoadingCatalog(true)
    setCatalogError(null)
    try {
      // Guide-compatible SERVICES only — /api/services filtered to guide taxonomy.
      const res = await fetch("/api/services", { cache: "no-store" })
      if (!res.ok) throw new Error(`Could not load services (${res.status}).`)
      const data = await res.json()
      const list = Array.isArray(data) ? data : []
      setGuideServices(list.filter(isGuideServiceRecord).map((s: any) => ({ id: s.id, name: s.name })))
    } catch (e) {
      setCatalogError(e instanceof Error ? e.message : "Could not load guide services.")
    } finally {
      setLoadingCatalog(false)
    }
  }

  const openForm = async (nextMode: AddItemMode) => {
    setMode(nextMode)
    setOpen(true)
    setError(null)
    if (nextMode === "activity") await loadActivities()
    else await loadGuideServices()
  }

  const reset = () => {
    setDayId("")
    setServiceDate("")
    setActivityId("")
    setVariantId("")
    setServiceId("")
    setGuideType("")
    setGuideDuration("")
    setOvernight(false)
    setGuideLanguage("")
    setError(null)
  }
  const cancel = () => {
    setOpen(false)
    reset()
  }

  const selectedActivity = activities.find((a) => a.id === activityId)
  const variants = (selectedActivity?.rateVariants ?? []).filter((v) => v.active !== false)

  const onDayChange = (id: string) => {
    setDayId(id)
    const day = itineraryDays.find((d) => d.id === id)
    if (day?.date && !serviceDate) {
      const match = /^\d{4}-\d{2}-\d{2}/.exec(day.date)
      if (match) setServiceDate(match[0])
    }
  }

  const canSubmit =
    Boolean(dayId && serviceDate) &&
    (mode === "activity" ? Boolean(activityId && variantId) : Boolean(serviceId && guideType && guideDuration)) &&
    !submitting

  const submit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      const payload: Record<string, unknown> =
        mode === "activity"
          ? { itemType: "activity", dayId, activityId, activityRateVariantId: variantId, serviceDate }
          : { itemType: "guide", dayId, serviceId, guideType, guideDuration, overnight, guideLanguage: guideLanguage || undefined, serviceDate }
      await onAddItem(payload)
      setOpen(false)
      reset()
    } catch (e) {
      setError(e instanceof Error ? e.message : `Could not add the ${mode}.`)
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) {
    return (
      <div className="mb-3 flex flex-wrap gap-2">
        <Button size="sm" className="gap-1.5" onClick={() => openForm("activity")}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add activity
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => openForm("guide")}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add guide
        </Button>
      </div>
    )
  }

  return (
    <Card className="mb-3 space-y-2 p-3">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {mode === "activity" ? "Add activity" : "Add guide"}
      </div>
      {catalogError ? (
        <p className="flex items-center gap-1.5 text-xs text-destructive" role="alert">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {catalogError}
        </p>
      ) : null}
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs text-muted-foreground">Itinerary day</span>
          <select value={dayId} onChange={(e) => onDayChange(e.target.value)} disabled={submitting} className={FIELD_CLASS}>
            <option value="">Select a day…</option>
            {itineraryDays.map((d) => (
              <option key={d.id} value={d.id}>
                Day {d.day}: {d.title}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-muted-foreground">Service date</span>
          <input type="date" value={serviceDate} onChange={(e) => setServiceDate(e.target.value)} disabled={submitting} className={FIELD_CLASS} />
        </label>

        {mode === "activity" ? (
          <>
            <label className="block">
              <span className="mb-1 block text-xs text-muted-foreground">Activity</span>
              <select
                value={activityId}
                onChange={(e) => {
                  setActivityId(e.target.value)
                  setVariantId("")
                }}
                disabled={submitting || loadingCatalog}
                className={FIELD_CLASS}
              >
                <option value="">{loadingCatalog ? "Loading…" : "Select an activity…"}</option>
                {activities.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-muted-foreground">Rate variant</span>
              <select value={variantId} onChange={(e) => setVariantId(e.target.value)} disabled={submitting || !activityId} className={FIELD_CLASS}>
                <option value="">Select a rate…</option>
                {variants.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                    {typeof v.costPrice === "number" ? ` — ${v.currency ?? ""} ${v.costPrice}`.trimEnd() : ""}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : (
          <>
            <label className="block">
              <span className="mb-1 block text-xs text-muted-foreground">Guide service</span>
              <select value={serviceId} onChange={(e) => setServiceId(e.target.value)} disabled={submitting || loadingCatalog} className={FIELD_CLASS}>
                <option value="">{loadingCatalog ? "Loading…" : "Select a guide service…"}</option>
                {guideServices.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-muted-foreground">Guide type</span>
              <select value={guideType} onChange={(e) => setGuideType(e.target.value)} disabled={submitting} className={FIELD_CLASS}>
                <option value="">Select type…</option>
                <option value="local">Local</option>
                <option value="escort">Escort</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-muted-foreground">Duration</span>
              <select value={guideDuration} onChange={(e) => setGuideDuration(e.target.value)} disabled={submitting} className={FIELD_CLASS}>
                <option value="">Select duration…</option>
                <option value="half_day">Half day</option>
                <option value="full_day">Full day</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-muted-foreground">Language (optional)</span>
              <input type="text" value={guideLanguage} onChange={(e) => setGuideLanguage(e.target.value)} disabled={submitting} className={FIELD_CLASS} placeholder="e.g. English" />
            </label>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input type="checkbox" checked={overnight} onChange={(e) => setOvernight(e.target.checked)} disabled={submitting} />
              Overnight (+ supplement)
            </label>
          </>
        )}
      </div>
      {error ? (
        <p className="flex items-center gap-1.5 text-xs text-destructive" role="alert">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}
      <div className="flex items-center gap-2">
        <Button size="sm" className="gap-1.5" onClick={submit} disabled={!canSubmit}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
          {submitting ? "Adding…" : mode === "activity" ? "Add activity" : "Add guide"}
        </Button>
        <Button variant="outline" size="sm" onClick={cancel} disabled={submitting}>
          Cancel
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Adds one {mode} to the selected day at the standard markup. Guide-person assignment, meals, entrance, external
        packages, and editing/removing/reordering stay in Classic.
      </p>
    </Card>
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
  /**
   * External-package read-only pricing preview scope (PR #571), behind a separate
   * frontend flag — default OFF. When false, external-package rows stay Classic/
   * read-only (no preview affordance). Preview-only — never apply.
   */
  externalPackagePreviewEnabled?: boolean
  /**
   * External-package pricing APPLY scope, behind its own frontend flag — default
   * OFF. When true (and onApplyItemPricing + externalPackagePreviewEnabled are
   * provided), eligible external-package rows expose an "Apply external package
   * price" action that re-prices the entered package in place. When false, external
   * packages stay preview-only.
   */
  externalPackageApplyEnabled?: boolean
  /**
   * Add Activity item (Phase B, Slice 2) flag. When true AND onAddItem +
   * itineraryDays are provided, the step exposes an "Add activity" form. Activity
   * only. The backend enforces QUOTE_ITEM_CREATE + role + activity-only, so this is
   * a UI affordance gate only.
   */
  addItemEnabled?: boolean
  /** Add ONE Activity item (V2 route). Omitted → no Add affordance. */
  onAddItem?: AddItemHandler
  /** Itinerary days for the day-select dropdown in the Add-activity form. */
  itineraryDays?: ItineraryDay[]
}

export function ExperiencesStep({ experiences, currency, onUpdateDisplayText, classicHref, onPreviewItem, onApplyItemPricing, onLoadApplyAudit, entrancePricingEnabled, externalPackagePreviewEnabled, externalPackageApplyEnabled, addItemEnabled, onAddItem, itineraryDays }: ExperiencesStepProps) {
  // Add-activity affordance is active only when the flag is on AND a handler +
  // itinerary days are provided (role/status-gated by the caller). Otherwise the
  // Experiences step is unchanged.
  const canAddActivity = Boolean(addItemEnabled && onAddItem && itineraryDays && itineraryDays.length > 0)
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

      {/* Phase B: add ONE activity (Slice 2) or guide (Slice 3) from V2 (flag + role/status gated). */}
      {canAddActivity && onAddItem && itineraryDays ? (
        <AddItemPanel onAddItem={onAddItem} itineraryDays={itineraryDays} />
      ) : null}

      {/* Staff guidance for the in-scope V2 pricing apply. Shown only when apply is
          enabled (role/status-gated handler present). */}
      {onApplyItemPricing ? (
        <div className="mb-3 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <div className="flex items-start gap-2">
            <Calculator className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <div className="space-y-0.5">
              <p>
                V2 pricing apply is supported for Meals, Activities, and Guides
                {entrancePricingEnabled ? ", Entrance / Jordan Pass" : ""}
                {externalPackageApplyEnabled ? ", and external packages" : ""} only.
              </p>
              <p>
                {externalPackageApplyEnabled
                  ? entrancePricingEnabled
                    ? "Hotels and transport remain Classic/read-only. External-package apply re-prices only the package line."
                    : "Hotels, transport, and entrance fees remain Classic/read-only. External-package apply re-prices only the package line."
                  : entrancePricingEnabled
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
                externalPackagePreviewEnabled={externalPackagePreviewEnabled}
                externalPackageApplyEnabled={externalPackageApplyEnabled}
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
