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
// Slice 2B-2 step 2 — guarded create; replays the previewToken + acknowledgedDelta.
export type AddItemHandler = (
  payload: Record<string, unknown>,
  previewToken?: string,
  acknowledgedDelta?: boolean,
) => void | Promise<unknown>
// Slice 2B-2 step 1 — read-only create-preview; returns the projected client-safe
// selling price + the signed previewToken.
export type PreviewAddHandler = (
  payload: Record<string, unknown>,
) => Promise<{ projected?: { sell?: number; currency?: string | null }; previewToken?: string }>

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

// Phase B, Slice 2: inline "Add activity" form. Activity ONLY. Explicit day +
// activity + rate variant + service date. Submits to the V2 route via onAddItem
// (which reuses the existing createItem + recalculation). The persistent success
// toast + refresh are handled by the client handler; this form just resets/closes.
const FIELD_CLASS =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

function AddActivityPanel({
  onAddItem,
  onPreviewAddItem,
  itineraryDays,
}: {
  onAddItem: AddItemHandler
  onPreviewAddItem: PreviewAddHandler
  itineraryDays: ItineraryDay[]
}) {
  const [open, setOpen] = useState(false)
  const [loadingCatalog, setLoadingCatalog] = useState(false)
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [activities, setActivities] = useState<Array<{ id: string; name: string; rateVariants?: Array<{ id: string; name: string; currency?: string; costPrice?: number; active?: boolean }> }>>([])
  const [dayId, setDayId] = useState("")
  const [activityId, setActivityId] = useState("")
  const [variantId, setVariantId] = useState("")
  const [serviceDate, setServiceDate] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Slice 2B-2: preview-then-confirm. `preview` holds the projected CLIENT-SAFE
  // selling price + the signed token replayed on confirm (cost/margin never shown).
  const [preview, setPreview] = useState<{ sell: number | null; currency: string | null; previewToken: string } | null>(null)

  const openForm = async () => {
    setOpen(true)
    setError(null)
    if (activities.length > 0 || loadingCatalog) return
    setLoadingCatalog(true)
    setCatalogError(null)
    try {
      // Reuse the existing catalog proxy — read-only, no quote mutation.
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

  const reset = () => {
    setDayId("")
    setActivityId("")
    setVariantId("")
    setServiceDate("")
    setError(null)
    setPreview(null)
  }
  const cancel = () => {
    setOpen(false)
    reset()
  }

  const selectedActivity = activities.find((a) => a.id === activityId)
  const variants = (selectedActivity?.rateVariants ?? []).filter((v) => v.active !== false)

  const onDayChange = (id: string) => {
    setDayId(id)
    setPreview(null)
    // Default the service date to the selected day's ISO date when available.
    const day = itineraryDays.find((d) => d.id === id)
    if (day?.date && !serviceDate) {
      const match = /^\d{4}-\d{2}-\d{2}/.exec(day.date)
      if (match) setServiceDate(match[0])
    }
  }

  const canSubmit = Boolean(dayId && activityId && variantId && serviceDate) && !submitting
  const currentPayload = () => ({ itemType: "activity", dayId, activityId, activityRateVariantId: variantId, serviceDate })

  // Step 1 — preview: project the price (no write) and hold the token for confirm.
  const doPreview = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await onPreviewAddItem(currentPayload())
      const token = res?.previewToken
      if (!token) throw new Error("Could not preview the activity price. Please try again.")
      setPreview({
        sell: typeof res?.projected?.sell === "number" ? res.projected.sell : null,
        currency: res?.projected?.currency ?? null,
        previewToken: token,
      })
    } catch (e) {
      setPreview(null)
      setError(e instanceof Error ? e.message : "Could not preview the activity.")
    } finally {
      setSubmitting(false)
    }
  }

  // Step 2 — confirm: create with the previewed token + acknowledgedDelta. On a
  // stale/rate drift the backend fails closed; we clear the preview so the user
  // re-previews.
  const doConfirm = async () => {
    if (!preview || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      await onAddItem(currentPayload(), preview.previewToken, true)
      setOpen(false)
      reset()
    } catch (e) {
      setPreview(null)
      setError(e instanceof Error ? e.message : "Could not add the activity. Please preview again.")
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) {
    return (
      <div className="mb-3">
        <Button size="sm" className="gap-1.5" onClick={openForm}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add activity
        </Button>
      </div>
    )
  }

  return (
    <Card className="mb-3 space-y-2 p-3">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Add activity</div>
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
          <input type="date" value={serviceDate} onChange={(e) => { setServiceDate(e.target.value); setPreview(null) }} disabled={submitting} className={FIELD_CLASS} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-muted-foreground">Activity</span>
          <select
            value={activityId}
            onChange={(e) => {
              setActivityId(e.target.value)
              setVariantId("")
              setPreview(null)
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
          <select value={variantId} onChange={(e) => { setVariantId(e.target.value); setPreview(null) }} disabled={submitting || !activityId} className={FIELD_CLASS}>
            <option value="">Select a rate…</option>
            {variants.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
                {typeof v.costPrice === "number" ? ` — ${v.currency ?? ""} ${v.costPrice}`.trimEnd() : ""}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error ? (
        <p className="flex items-center gap-1.5 text-xs text-destructive" role="alert">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}
      {preview ? (
        <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs">
          <span className="text-muted-foreground">Projected selling price: </span>
          <span className="font-semibold text-foreground">
            {preview.sell != null ? `${preview.currency ?? ""} ${Math.round(preview.sell)}`.trim() : "—"}
          </span>
          <span className="text-muted-foreground"> — confirm to add.</span>
        </div>
      ) : null}
      <div className="flex items-center gap-2">
        {preview ? (
          <Button size="sm" className="gap-1.5" onClick={doConfirm} disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
            {submitting ? "Adding…" : "Confirm & add"}
          </Button>
        ) : (
          <Button size="sm" className="gap-1.5" onClick={doPreview} disabled={!canSubmit}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
            {submitting ? "Previewing…" : "Preview price"}
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={cancel} disabled={submitting}>
          Cancel
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Adds one activity to the selected day at the standard experience markup. Meals, guides, entrance, external
        packages, and editing/removing/reordering stay in Classic.
      </p>
    </Card>
  )
}

// Phase B, Slice 3: inline "Add guide" form. GUIDE ONLY. Explicit day + guide
// SERVICE + guideType + guideDuration (+ overnight for escort) + service date.
// Reuses the SAME guarded onPreviewAddItem/onAddItem handlers as activity (they
// POST the payload verbatim to the V2 route, which now handles itemType='guide')
// and the SAME preview→confirm pattern showing the CLIENT-SAFE selling price only.
const GUIDE_TYPES: Array<{ value: string; label: string }> = [
  { value: "local", label: "Local guide" },
  { value: "escort", label: "Escort / tour leader" },
]
const GUIDE_DURATIONS: Array<{ value: string; label: string }> = [
  { value: "half_day", label: "Half day" },
  { value: "full_day", label: "Full day" },
]

function isGuideService(s: { category?: string | null; serviceType?: { name?: string | null; code?: string | null } | null }): boolean {
  const hay = `${s.serviceType?.code ?? ""} ${s.serviceType?.name ?? ""} ${s.category ?? ""}`.toLowerCase()
  return hay.includes("guide")
}

function AddGuidePanel({
  onAddItem,
  onPreviewAddItem,
  itineraryDays,
}: {
  onAddItem: AddItemHandler
  onPreviewAddItem: PreviewAddHandler
  itineraryDays: ItineraryDay[]
}) {
  const [open, setOpen] = useState(false)
  const [loadingCatalog, setLoadingCatalog] = useState(false)
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [services, setServices] = useState<Array<{ id: string; name: string; category?: string | null; serviceType?: { name?: string | null; code?: string | null } | null }>>([])
  const [dayId, setDayId] = useState("")
  const [serviceId, setServiceId] = useState("")
  const [guideType, setGuideType] = useState("")
  const [guideDuration, setGuideDuration] = useState("")
  const [guideOvernight, setGuideOvernight] = useState(false)
  const [serviceDate, setServiceDate] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Slice 2B-2 pattern: preview-then-confirm. `preview` holds the projected
  // CLIENT-SAFE selling price + the signed token (cost/margin never shown).
  const [preview, setPreview] = useState<{ sell: number | null; currency: string | null; previewToken: string } | null>(null)

  const openForm = async () => {
    setOpen(true)
    setError(null)
    if (services.length > 0 || loadingCatalog) return
    setLoadingCatalog(true)
    setCatalogError(null)
    try {
      // Reuse the existing services proxy — read-only. Guide-type SERVICES only
      // (NOT /api/guides, which are people). Filtered client-side; the backend is
      // the source of truth (rejects non-guide with not_guide_service).
      const res = await fetch("/api/services", { cache: "no-store" })
      if (!res.ok) throw new Error(`Could not load guide services (${res.status}).`)
      const data = await res.json()
      const list = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : []
      setServices(list.filter(isGuideService))
    } catch (e) {
      setCatalogError(e instanceof Error ? e.message : "Could not load guide services.")
    } finally {
      setLoadingCatalog(false)
    }
  }

  const reset = () => {
    setDayId("")
    setServiceId("")
    setGuideType("")
    setGuideDuration("")
    setGuideOvernight(false)
    setServiceDate("")
    setError(null)
    setPreview(null)
  }
  const cancel = () => {
    setOpen(false)
    reset()
  }

  const onDayChange = (id: string) => {
    setDayId(id)
    setPreview(null)
    const day = itineraryDays.find((d) => d.id === id)
    if (day?.date && !serviceDate) {
      const match = /^\d{4}-\d{2}-\d{2}/.exec(day.date)
      if (match) setServiceDate(match[0])
    }
  }

  const isEscort = guideType === "escort"
  const canSubmit = Boolean(dayId && serviceId && guideType && guideDuration && serviceDate) && !submitting
  const currentPayload = () => ({
    itemType: "guide",
    dayId,
    serviceId,
    guideType,
    guideDuration,
    // overnight is only meaningful for escort; always send an explicit boolean.
    guideOvernight: isEscort ? guideOvernight : false,
    serviceDate,
  })

  // Step 1 — preview: project the price (no write) and hold the token for confirm.
  const doPreview = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await onPreviewAddItem(currentPayload())
      const token = res?.previewToken
      if (!token) throw new Error("Could not preview the guide price. Please try again.")
      setPreview({
        sell: typeof res?.projected?.sell === "number" ? res.projected.sell : null,
        currency: res?.projected?.currency ?? null,
        previewToken: token,
      })
    } catch (e) {
      setPreview(null)
      setError(e instanceof Error ? e.message : "Could not preview the guide.")
    } finally {
      setSubmitting(false)
    }
  }

  // Step 2 — confirm: create with the previewed token + acknowledgedDelta.
  const doConfirm = async () => {
    if (!preview || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      await onAddItem(currentPayload(), preview.previewToken, true)
      setOpen(false)
      reset()
    } catch (e) {
      setPreview(null)
      setError(e instanceof Error ? e.message : "Could not add the guide. Please preview again.")
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) {
    return (
      <div className="mb-3">
        <Button size="sm" className="gap-1.5" onClick={openForm}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add guide
        </Button>
      </div>
    )
  }

  return (
    <Card className="mb-3 space-y-2 p-3">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Add guide</div>
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
          <input type="date" value={serviceDate} onChange={(e) => { setServiceDate(e.target.value); setPreview(null) }} disabled={submitting} className={FIELD_CLASS} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-muted-foreground">Guide service</span>
          <select value={serviceId} onChange={(e) => { setServiceId(e.target.value); setPreview(null) }} disabled={submitting || loadingCatalog} className={FIELD_CLASS}>
            <option value="">{loadingCatalog ? "Loading…" : "Select a guide service…"}</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-muted-foreground">Guide type</span>
          <select value={guideType} onChange={(e) => { setGuideType(e.target.value); setGuideOvernight(false); setPreview(null) }} disabled={submitting} className={FIELD_CLASS}>
            <option value="">Select a guide type…</option>
            {GUIDE_TYPES.map((g) => (
              <option key={g.value} value={g.value}>
                {g.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-muted-foreground">Duration</span>
          <select value={guideDuration} onChange={(e) => { setGuideDuration(e.target.value); setPreview(null) }} disabled={submitting} className={FIELD_CLASS}>
            <option value="">Select a duration…</option>
            {GUIDE_DURATIONS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
        {isEscort ? (
          <label className="flex items-center gap-2 self-end pb-2 text-sm text-foreground">
            <input type="checkbox" checked={guideOvernight} onChange={(e) => { setGuideOvernight(e.target.checked); setPreview(null) }} disabled={submitting} />
            <span>Overnight (escort supplement)</span>
          </label>
        ) : null}
      </div>
      {error ? (
        <p className="flex items-center gap-1.5 text-xs text-destructive" role="alert">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}
      {preview ? (
        <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs">
          <span className="text-muted-foreground">Projected selling price: </span>
          <span className="font-semibold text-foreground">
            {preview.sell != null ? `${preview.currency ?? ""} ${Math.round(preview.sell)}`.trim() : "—"}
          </span>
          <span className="text-muted-foreground"> — confirm to add.</span>
        </div>
      ) : null}
      <div className="flex items-center gap-2">
        {preview ? (
          <Button size="sm" className="gap-1.5" onClick={doConfirm} disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
            {submitting ? "Adding…" : "Confirm & add"}
          </Button>
        ) : (
          <Button size="sm" className="gap-1.5" onClick={doPreview} disabled={!canSubmit}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
            {submitting ? "Previewing…" : "Preview price"}
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={cancel} disabled={submitting}>
          Cancel
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Adds one guide to the selected day at the standard guide markup. Meals, entrance, external packages, and
        editing/removing/reordering stay in Classic.
      </p>
    </Card>
  )
}

// M-1b: inline "Add meal" form. MEAL ONLY. Explicit day + meal SERVICE + meal name
// (customServiceName) + service date. Reuses the SAME guarded onPreviewAddItem/onAddItem
// handlers as activity/guide (they POST the payload verbatim to the V2 route, which now
// handles itemType='meal') and the SAME preview→confirm pattern showing the CLIENT-SAFE
// selling price only. The unit-cost/currency override is FINANCE-GATED (canEnterCostOverride):
// operations create at the service base cost and never see or send a cost — the backend
// independently rejects a non-finance override with cost_override_forbidden.
function isMealService(s: { category?: string | null; serviceType?: { name?: string | null; code?: string | null } | null }): boolean {
  const hay = `${s.serviceType?.code ?? ""} ${s.serviceType?.name ?? ""} ${s.category ?? ""}`.toLowerCase()
  return /meal|dining|breakfast|lunch|dinner|restaurant|food/.test(hay)
}

function AddMealPanel({
  onAddItem,
  onPreviewAddItem,
  itineraryDays,
  canEnterCostOverride,
}: {
  onAddItem: AddItemHandler
  onPreviewAddItem: PreviewAddHandler
  itineraryDays: ItineraryDay[]
  canEnterCostOverride: boolean
}) {
  const [open, setOpen] = useState(false)
  const [loadingCatalog, setLoadingCatalog] = useState(false)
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [services, setServices] = useState<Array<{ id: string; name: string; category?: string | null; serviceType?: { name?: string | null; code?: string | null } | null }>>([])
  const [dayId, setDayId] = useState("")
  const [serviceId, setServiceId] = useState("")
  const [mealName, setMealName] = useState("")
  // Finance-only cost override (rendered only when canEnterCostOverride).
  const [unitCost, setUnitCost] = useState("")
  const [currency, setCurrency] = useState("")
  const [serviceDate, setServiceDate] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ sell: number | null; currency: string | null; previewToken: string } | null>(null)

  const openForm = async () => {
    setOpen(true)
    setError(null)
    if (services.length > 0 || loadingCatalog) return
    setLoadingCatalog(true)
    setCatalogError(null)
    try {
      // Reuse the existing services proxy — read-only. MEAL-taxonomy services only,
      // filtered client-side; the backend is the source of truth (rejects non-meal
      // with not_meal_service).
      const res = await fetch("/api/services", { cache: "no-store" })
      if (!res.ok) throw new Error(`Could not load meal services (${res.status}).`)
      const data = await res.json()
      const list = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : []
      setServices(list.filter(isMealService))
    } catch (e) {
      setCatalogError(e instanceof Error ? e.message : "Could not load meal services.")
    } finally {
      setLoadingCatalog(false)
    }
  }

  const reset = () => {
    setDayId("")
    setServiceId("")
    setMealName("")
    setUnitCost("")
    setCurrency("")
    setServiceDate("")
    setError(null)
    setPreview(null)
  }
  const cancel = () => {
    setOpen(false)
    reset()
  }

  const onDayChange = (id: string) => {
    setDayId(id)
    setPreview(null)
    const day = itineraryDays.find((d) => d.id === id)
    if (day?.date && !serviceDate) {
      const match = /^\d{4}-\d{2}-\d{2}/.exec(day.date)
      if (match) setServiceDate(match[0])
    }
  }

  const canSubmit = Boolean(dayId && serviceId && mealName.trim() && serviceDate) && !submitting
  const currentPayload = () => ({
    itemType: "meal",
    dayId,
    serviceId,
    customServiceName: mealName.trim(),
    serviceDate,
    // Cost override is FINANCE-ONLY and only sent when actually entered. Operations
    // never include unitCost/currency (the fields are not rendered for them).
    ...(canEnterCostOverride && unitCost.trim() !== "" ? { unitCost: Number(unitCost) } : {}),
    ...(canEnterCostOverride && currency.trim() !== "" ? { currency: currency.trim() } : {}),
  })

  // Step 1 — preview: project the price (no write) and hold the token for confirm.
  const doPreview = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await onPreviewAddItem(currentPayload())
      const token = res?.previewToken
      if (!token) throw new Error("Could not preview the meal price. Please try again.")
      setPreview({
        sell: typeof res?.projected?.sell === "number" ? res.projected.sell : null,
        currency: res?.projected?.currency ?? null,
        previewToken: token,
      })
    } catch (e) {
      setPreview(null)
      setError(e instanceof Error ? e.message : "Could not preview the meal.")
    } finally {
      setSubmitting(false)
    }
  }

  // Step 2 — confirm: create with the previewed token + acknowledgedDelta.
  const doConfirm = async () => {
    if (!preview || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      await onAddItem(currentPayload(), preview.previewToken, true)
      setOpen(false)
      reset()
    } catch (e) {
      setPreview(null)
      setError(e instanceof Error ? e.message : "Could not add the meal. Please preview again.")
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) {
    return (
      <div className="mb-3">
        <Button size="sm" className="gap-1.5" onClick={openForm}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add meal
        </Button>
      </div>
    )
  }

  return (
    <Card className="mb-3 space-y-2 p-3">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Add meal</div>
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
          <input type="date" value={serviceDate} onChange={(e) => { setServiceDate(e.target.value); setPreview(null) }} disabled={submitting} className={FIELD_CLASS} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-muted-foreground">Meal service</span>
          <select value={serviceId} onChange={(e) => { setServiceId(e.target.value); setPreview(null) }} disabled={submitting || loadingCatalog} className={FIELD_CLASS}>
            <option value="">{loadingCatalog ? "Loading…" : "Select a meal service…"}</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-muted-foreground">Meal name</span>
          <input type="text" value={mealName} onChange={(e) => { setMealName(e.target.value); setPreview(null) }} disabled={submitting} className={FIELD_CLASS} placeholder="e.g. Welcome dinner" />
        </label>
      </div>
      {canEnterCostOverride ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs text-muted-foreground">Unit cost override (finance)</span>
            <input type="number" min="0" step="0.01" value={unitCost} onChange={(e) => { setUnitCost(e.target.value); setPreview(null) }} disabled={submitting} className={FIELD_CLASS} placeholder="Defaults to the service base cost" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted-foreground">Currency override (finance)</span>
            <input type="text" value={currency} onChange={(e) => { setCurrency(e.target.value); setPreview(null) }} disabled={submitting} className={FIELD_CLASS} placeholder="Defaults to the service currency" />
          </label>
        </div>
      ) : null}
      {error ? (
        <p className="flex items-center gap-1.5 text-xs text-destructive" role="alert">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}
      {preview ? (
        <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs">
          <span className="text-muted-foreground">Projected selling price: </span>
          <span className="font-semibold text-foreground">
            {preview.sell != null ? `${preview.currency ?? ""} ${Math.round(preview.sell)}`.trim() : "—"}
          </span>
          <span className="text-muted-foreground"> — confirm to add.</span>
        </div>
      ) : null}
      <div className="flex items-center gap-2">
        {preview ? (
          <Button size="sm" className="gap-1.5" onClick={doConfirm} disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
            {submitting ? "Adding…" : "Confirm & add"}
          </Button>
        ) : (
          <Button size="sm" className="gap-1.5" onClick={doPreview} disabled={!canSubmit}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
            {submitting ? "Previewing…" : "Preview price"}
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={cancel} disabled={submitting}>
          Cancel
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Adds one meal to the selected day at the standard markup. Operations add at the service base cost; finance can
        override the unit cost. Editing/removing/reordering stay in Classic.
      </p>
    </Card>
  )
}

// M-2b: inline "Add entrance/ticket" form. ENTRANCE ONLY. Explicit day + entrance
// SERVICE (a SupplierService with a linked EntranceFee) + OPTIONAL ticket rate variant
// + service date. Reuses the SAME guarded onPreviewAddItem/onAddItem handlers and the
// SAME preview→confirm pattern showing the CLIENT-SAFE selling price only. There is NO
// user-entered cost, markup, currency, or Jordan Pass input — the shared resolver
// derives cost (ticket variant / base EntranceFee.foreignerFeeJod), Jordan Pass
// coverage, and entranceFeeId server-side. ticketRateVariantId is OPTIONAL (base-fee
// fallback when omitted — mandatory since staging catalogs may have zero variants).
type EntranceTicketVariant = { id: string; label?: string | null; active?: boolean | null }
function isEntranceService(s: {
  category?: string | null
  serviceType?: { name?: string | null; code?: string | null } | null
  ticketRateVariants?: EntranceTicketVariant[] | null
}): boolean {
  const hay = `${s.serviceType?.code ?? ""} ${s.serviceType?.name ?? ""} ${s.category ?? ""}`.toLowerCase()
  if (/entrance|entry|ticket|museum|park_entry|site_entry|site_access|resort_access/.test(hay)) return true
  // Fallback: services that carry ticket rate variants are ticketing/entrance catalog
  // rows. The backend stays source of truth (rejects non-entrance with not_entrance_service).
  return Array.isArray(s.ticketRateVariants) && s.ticketRateVariants.length > 0
}

function AddEntrancePanel({
  onAddItem,
  onPreviewAddItem,
  itineraryDays,
}: {
  onAddItem: AddItemHandler
  onPreviewAddItem: PreviewAddHandler
  itineraryDays: ItineraryDay[]
}) {
  const [open, setOpen] = useState(false)
  const [loadingCatalog, setLoadingCatalog] = useState(false)
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [services, setServices] = useState<Array<{ id: string; name: string; category?: string | null; serviceType?: { name?: string | null; code?: string | null } | null; ticketRateVariants?: EntranceTicketVariant[] | null }>>([])
  const [dayId, setDayId] = useState("")
  const [serviceId, setServiceId] = useState("")
  const [variantId, setVariantId] = useState("")
  const [serviceDate, setServiceDate] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ sell: number | null; currency: string | null; previewToken: string } | null>(null)

  const openForm = async () => {
    setOpen(true)
    setError(null)
    if (services.length > 0 || loadingCatalog) return
    setLoadingCatalog(true)
    setCatalogError(null)
    try {
      // Reuse the existing services proxy — read-only. ENTRANCE/TICKET services only,
      // filtered client-side; the backend is the source of truth (rejects non-entrance
      // with not_entrance_service).
      const res = await fetch("/api/services", { cache: "no-store" })
      if (!res.ok) throw new Error(`Could not load entrance services (${res.status}).`)
      const data = await res.json()
      const list = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : []
      setServices(list.filter(isEntranceService))
    } catch (e) {
      setCatalogError(e instanceof Error ? e.message : "Could not load entrance services.")
    } finally {
      setLoadingCatalog(false)
    }
  }

  const reset = () => {
    setDayId("")
    setServiceId("")
    setVariantId("")
    setServiceDate("")
    setError(null)
    setPreview(null)
  }
  const cancel = () => {
    setOpen(false)
    reset()
  }

  const onDayChange = (id: string) => {
    setDayId(id)
    setPreview(null)
    const day = itineraryDays.find((d) => d.id === id)
    if (day?.date && !serviceDate) {
      const match = /^\d{4}-\d{2}-\d{2}/.exec(day.date)
      if (match) setServiceDate(match[0])
    }
  }

  const selectedService = services.find((s) => s.id === serviceId)
  // Active variants only. When a service has none, the create uses the base entrance
  // fee (ticketRateVariantId omitted) — variant selection is NEVER required.
  const variants = (selectedService?.ticketRateVariants ?? []).filter((v) => v.active !== false)

  const canSubmit = Boolean(dayId && serviceId && serviceDate) && !submitting
  const currentPayload = () => ({
    itemType: "entrance",
    dayId,
    serviceId,
    serviceDate,
    // Optional — sent ONLY when a variant is chosen; omitted → base-fee fallback.
    ...(variantId ? { ticketRateVariantId: variantId } : {}),
  })

  // Step 1 — preview: project the price (no write) and hold the token for confirm.
  const doPreview = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await onPreviewAddItem(currentPayload())
      const token = res?.previewToken
      if (!token) throw new Error("Could not preview the entrance price. Please try again.")
      setPreview({
        sell: typeof res?.projected?.sell === "number" ? res.projected.sell : null,
        currency: res?.projected?.currency ?? null,
        previewToken: token,
      })
    } catch (e) {
      setPreview(null)
      setError(e instanceof Error ? e.message : "Could not preview the entrance.")
    } finally {
      setSubmitting(false)
    }
  }

  // Step 2 — confirm: create with the previewed token + acknowledgedDelta.
  const doConfirm = async () => {
    if (!preview || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      await onAddItem(currentPayload(), preview.previewToken, true)
      setOpen(false)
      reset()
    } catch (e) {
      setPreview(null)
      setError(e instanceof Error ? e.message : "Could not add the entrance. Please preview again.")
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) {
    return (
      <div className="mb-3">
        <Button size="sm" className="gap-1.5" onClick={openForm}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add entrance
        </Button>
      </div>
    )
  }

  return (
    <Card className="mb-3 space-y-2 p-3">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Add entrance / ticket</div>
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
          <input type="date" value={serviceDate} onChange={(e) => { setServiceDate(e.target.value); setPreview(null) }} disabled={submitting} className={FIELD_CLASS} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-muted-foreground">Entrance / ticket service</span>
          <select value={serviceId} onChange={(e) => { setServiceId(e.target.value); setVariantId(""); setPreview(null) }} disabled={submitting || loadingCatalog} className={FIELD_CLASS}>
            <option value="">{loadingCatalog ? "Loading…" : "Select an entrance service…"}</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-muted-foreground">Ticket rate (optional)</span>
          {serviceId && variants.length === 0 ? (
            <p className="px-1 py-2 text-xs text-muted-foreground">Uses the base entrance fee.</p>
          ) : (
            <select value={variantId} onChange={(e) => { setVariantId(e.target.value); setPreview(null) }} disabled={submitting || !serviceId} className={FIELD_CLASS}>
              <option value="">Base entrance fee</option>
              {variants.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label ?? "Ticket rate"}
                </option>
              ))}
            </select>
          )}
        </label>
      </div>
      {error ? (
        <p className="flex items-center gap-1.5 text-xs text-destructive" role="alert">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}
      {preview ? (
        <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs">
          <span className="text-muted-foreground">Projected selling price: </span>
          <span className="font-semibold text-foreground">
            {preview.sell != null ? `${preview.currency ?? ""} ${Math.round(preview.sell)}`.trim() : "—"}
          </span>
          <span className="text-muted-foreground"> — confirm to add.</span>
        </div>
      ) : null}
      <div className="flex items-center gap-2">
        {preview ? (
          <Button size="sm" className="gap-1.5" onClick={doConfirm} disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
            {submitting ? "Adding…" : "Confirm & add"}
          </Button>
        ) : (
          <Button size="sm" className="gap-1.5" onClick={doPreview} disabled={!canSubmit}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
            {submitting ? "Previewing…" : "Preview price"}
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={cancel} disabled={submitting}>
          Cancel
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Adds one entrance/ticket to the selected day at cost (Jordan Pass coverage is applied automatically). No cost
        entry — the fee and any Jordan Pass discount are computed. Editing/removing/reordering stay in Classic.
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
  /** Add ONE Activity item (V2 route, guarded create). Omitted → no Add affordance. */
  onAddItem?: AddItemHandler
  /** Read-only create-preview (Slice 2B-2 step 1). Omitted → no Add affordance. */
  onPreviewAddItem?: PreviewAddHandler
  /** Itinerary days for the day-select dropdown in the Add-activity form. */
  itineraryDays?: ItineraryDay[]
  /**
   * M-1b: finance-visibility gate for the Add-meal unit-cost/currency override
   * (canAccessFinance = admin/super_admin/finance). When false, operations still add
   * meals but never see or send a cost override (backend also rejects it). UI gate
   * only — the backend independently enforces cost_override_forbidden.
   */
  mealCostOverrideEnabled?: boolean
}

export function ExperiencesStep({ experiences, currency, onUpdateDisplayText, classicHref, onPreviewItem, onApplyItemPricing, onLoadApplyAudit, entrancePricingEnabled, externalPackagePreviewEnabled, externalPackageApplyEnabled, addItemEnabled, onAddItem, onPreviewAddItem, itineraryDays, mealCostOverrideEnabled }: ExperiencesStepProps) {
  // Add-activity affordance is active only when the flag is on AND a handler +
  // itinerary days are provided (role/status-gated by the caller). Otherwise the
  // Experiences step is unchanged.
  const canAddActivity = Boolean(addItemEnabled && onAddItem && onPreviewAddItem && itineraryDays && itineraryDays.length > 0)
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

      {/* Phase B, Slice 2/3: add ONE activity OR guide from V2 (flag + role/status
          gated; same guarded handlers, same item-create flag). */}
      {canAddActivity && onAddItem && onPreviewAddItem && itineraryDays ? (
        <>
          <AddActivityPanel onAddItem={onAddItem} onPreviewAddItem={onPreviewAddItem} itineraryDays={itineraryDays} />
          <AddGuidePanel onAddItem={onAddItem} onPreviewAddItem={onPreviewAddItem} itineraryDays={itineraryDays} />
          <AddMealPanel onAddItem={onAddItem} onPreviewAddItem={onPreviewAddItem} itineraryDays={itineraryDays} canEnterCostOverride={Boolean(mealCostOverrideEnabled)} />
          <AddEntrancePanel onAddItem={onAddItem} onPreviewAddItem={onPreviewAddItem} itineraryDays={itineraryDays} />
        </>
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
