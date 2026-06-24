"use client"

import { useMemo, useState } from "react"
import { X, Info, AlertTriangle, Loader2, CheckCircle2, Calculator } from "lucide-react"
import { Button } from "../../../ui/button"
import { formatCurrency } from "../../../../lib/quote-helpers"
import type {
  ApplyItemPricingHandler,
  Experience,
  PreviewItemHandler,
  PricingPreviewResult,
  PricingPreviewTotals,
} from "../../../../lib/quote-types"

type ItemKind = "meal" | "activity"

function TotalsRow({
  label,
  current,
  projected,
  delta,
  currency,
}: {
  label: string
  current: PricingPreviewTotals
  projected: PricingPreviewTotals | null
  delta: PricingPreviewTotals | null
  currency: string
}) {
  const fmt = (v: number) => formatCurrency(v, currency)
  const d = (v: number) => (v > 0 ? `+${fmt(v)}` : fmt(v))
  const tone = (v: number) => (v === 0 ? "text-muted-foreground" : v > 0 ? "text-destructive" : "text-success")
  return (
    <div className="rounded-md border border-border">
      <div className="border-b border-border bg-muted/40 px-3 py-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="grid grid-cols-3 gap-2 px-3 py-2 text-sm">
        <div>
          <div className="text-xs text-muted-foreground">Current</div>
          <div className="font-medium text-foreground">Cost {fmt(current.totalCost)}</div>
          <div className="font-medium text-foreground">Sell {fmt(current.totalSell)}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Projected</div>
          <div className="font-medium text-foreground">Cost {projected ? fmt(projected.totalCost) : "—"}</div>
          <div className="font-medium text-foreground">Sell {projected ? fmt(projected.totalSell) : "—"}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Delta</div>
          <div className={`font-semibold ${delta ? tone(delta.totalCost) : "text-muted-foreground"}`}>Cost {delta ? d(delta.totalCost) : "—"}</div>
          <div className={`font-semibold ${delta ? tone(delta.totalSell) : "text-muted-foreground"}`}>Sell {delta ? d(delta.totalSell) : "—"}</div>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}

const inputCls =
  "h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
const readonlyCls = "h-8 rounded-md border border-input bg-muted/40 px-2 text-sm text-muted-foreground flex items-center"

// Map a backend machine-code (from the apply throw / preview block) to a message.
function messageForCode(code: string): { text: string; forceRePreview: boolean } {
  switch (code) {
    case "feature_disabled":
      return { text: "Pricing apply is not enabled.", forceRePreview: false }
    case "stale_preview":
      return { text: "The quote or rates changed. Preview again before applying.", forceRePreview: true }
    case "confirmation_required":
      return { text: "Please confirm this will update the quote totals.", forceRePreview: false }
    case "payload_mismatch":
    case "invalid_preview_token":
      return { text: "The edit changed. Preview again before applying.", forceRePreview: true }
    case "token_secret_not_configured":
      return { text: "Pricing apply is not configured.", forceRePreview: false }
    default:
      return { text: code || "Could not apply the change.", forceRePreview: false }
  }
}

/**
 * "Preview & apply pricing" modal for an existing MEAL or ACTIVITY item. Preview
 * first (read-only), then apply via the dedicated apply-preview endpoint — nothing
 * is saved until Apply. The payload is built ONLY from raw fields (never from
 * totals / pricingDescription).
 *
 * - meal: name, unit cost, quantity, pax, currency, service date are editable.
 * - activity: quantity, pax, service date are editable; name + rate variant +
 *   currency are read-only (rate selection stays Classic-only). The payload
 *   carries the existing activityId / activityRateVariantId / serviceId so the
 *   backend re-prices at the current rate.
 */
export function ItemPricingApplyModal({
  open,
  onClose,
  kind,
  exp,
  currency,
  onPreview,
  onApply,
}: {
  open: boolean
  onClose: () => void
  kind: ItemKind
  exp: Experience
  currency: string
  onPreview: PreviewItemHandler
  onApply: ApplyItemPricingHandler
}) {
  const [name, setName] = useState(exp.customServiceName ?? exp.name ?? "")
  const [unitCost, setUnitCost] = useState(String(exp.unitCost ?? 0))
  const [quantity, setQuantity] = useState(String(exp.quantity ?? 1))
  const [paxCount, setPaxCount] = useState(String(exp.paxCount ?? 1))
  const [itemCurrency, setItemCurrency] = useState(exp.currency ?? currency ?? "USD")
  const [serviceDate, setServiceDate] = useState((exp.serviceDate ?? "").slice(0, 10))

  const [preview, setPreview] = useState<PricingPreviewResult | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [ack, setAck] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<null | { item: PricingPreviewTotals; quote: PricingPreviewTotals }>(null)

  const isMeal = kind === "meal"
  const isActivity = kind === "activity"

  // The exact payload sent to BOTH preview and apply (so the token's payload hash
  // matches). Built from raw fields — no totals, no pricingDescription parsing.
  // Meal: editable name/unitCost/currency. Activity: re-price at the existing
  // rate variant (ids carried verbatim); currency is rate-derived (not sent).
  const payload = useMemo(() => {
    if (isActivity) {
      return {
        activityId: exp.activityId ?? undefined,
        activityRateVariantId: exp.activityRateVariantId ?? undefined,
        serviceId: exp.serviceId ?? undefined,
        quantity: Number(quantity),
        paxCount: Number(paxCount),
        serviceDate: serviceDate || undefined,
      }
    }
    return {
      customServiceName: name,
      unitCost: Number(unitCost),
      quantity: Number(quantity),
      paxCount: Number(paxCount),
      currency: itemCurrency,
      serviceDate: serviceDate || undefined,
    }
  }, [isActivity, exp.activityId, exp.activityRateVariantId, exp.serviceId, name, unitCost, quantity, paxCount, itemCurrency, serviceDate])

  if (!open) return null

  // Any field edit invalidates a prior preview/token → forces re-preview before apply.
  const invalidatePreview = () => {
    setPreview(null)
    setToken(null)
    setAck(false)
    setError(null)
    setSuccess(null)
  }
  const edit = (setter: (v: string) => void) => (v: string) => {
    setter(v)
    invalidatePreview()
  }

  const runPreview = async () => {
    setLoading(true)
    setError(null)
    setSuccess(null)
    setToken(null)
    try {
      const result = await onPreview(exp.quoteItemId as string, payload)
      setPreview(result)
      setToken((result as any).previewToken ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not preview pricing.")
      setPreview(null)
    } finally {
      setLoading(false)
    }
  }

  const featureDisabled = preview?.available === false
  const blocked = Boolean(preview && preview.blocked && preview.available !== false)
  const notResolvable = preview?.pricingResolvable === false
  const deltaNonZero = Boolean(
    preview &&
      ((preview.item?.delta && (preview.item.delta.totalCost !== 0 || preview.item.delta.totalSell !== 0)) ||
        (preview.quote?.delta && (preview.quote.delta.totalCost !== 0 || preview.quote.delta.totalSell !== 0))),
  )
  const kindMatches = isActivity ? Boolean(exp.isActivity) : Boolean(exp.isMeal)
  // Apply is offered only after a successful, resolvable, unblocked preview WITH a token.
  const canApply = Boolean(kindMatches && exp.quoteItemId && token && !featureDisabled && !blocked && !notResolvable && !success)

  const runApply = async () => {
    if (!token) return
    setApplying(true)
    setError(null)
    try {
      const result = await onApply(exp.quoteItemId as string, payload, token, deltaNonZero ? ack : false)
      if (result?.applied) {
        setSuccess({
          item: result.item?.after ?? { totalCost: 0, totalSell: 0 },
          quote: result.quote?.after ?? { totalCost: 0, totalSell: 0 },
        })
        setToken(null)
      } else if (result?.available === false || result?.blockedReason === "feature_disabled") {
        setError("Pricing apply is not enabled.")
      } else {
        setError("Could not apply the change.")
      }
    } catch (e) {
      const mapped = messageForCode(e instanceof Error ? e.message : "")
      setError(mapped.text)
      if (mapped.forceRePreview) {
        setPreview(null)
        setToken(null)
        setAck(false)
      }
    } finally {
      setApplying(false)
    }
  }

  const heading = isActivity ? "Preview & apply activity pricing" : "Preview & apply meal pricing"

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={heading}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div className="w-full max-w-lg rounded-lg border border-border bg-background shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-foreground">{heading}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        <div className="max-h-[70vh] space-y-3 overflow-y-auto px-4 py-3">
          <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <span>Preview first. No changes are saved until you apply.</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {isActivity ? (
              <>
                <div className="col-span-2">
                  <Field label="Activity (rate variant changes stay in Classic)">
                    <div className={readonlyCls}>{exp.name}</div>
                  </Field>
                </div>
                <Field label="Currency (rate-derived)">
                  <div className={readonlyCls}>{itemCurrency}</div>
                </Field>
                <div />
              </>
            ) : (
              <>
                <div className="col-span-2">
                  <Field label="Meal name">
                    <input className={inputCls} value={name} onChange={(e) => edit(setName)(e.target.value)} />
                  </Field>
                </div>
                <Field label="Unit cost">
                  <input className={inputCls} type="number" min="0" step="0.01" value={unitCost} onChange={(e) => edit(setUnitCost)(e.target.value)} />
                </Field>
                <Field label="Currency">
                  <input className={inputCls} value={itemCurrency} onChange={(e) => edit(setItemCurrency)(e.target.value.toUpperCase())} />
                </Field>
              </>
            )}
            <Field label="Quantity">
              <input className={inputCls} type="number" min="1" step="1" value={quantity} onChange={(e) => edit(setQuantity)(e.target.value)} />
            </Field>
            <Field label="Pax count">
              <input className={inputCls} type="number" min="1" step="1" value={paxCount} onChange={(e) => edit(setPaxCount)(e.target.value)} />
            </Field>
            <div className="col-span-2">
              <Field label="Service date">
                <input className={inputCls} type="date" value={serviceDate} onChange={(e) => edit(setServiceDate)(e.target.value)} />
              </Field>
            </div>
          </div>

          <Button variant="outline" size="sm" className="gap-2" onClick={runPreview} disabled={loading || applying}>
            {loading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Calculator className="size-4" aria-hidden="true" />}
            Preview
          </Button>

          {error ? (
            <div className="flex items-start gap-2 rounded-md border border-border px-3 py-2 text-sm text-warning-foreground">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
              <span>{error}</span>
            </div>
          ) : null}

          {success ? (
            <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-foreground">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
              <span>
                Applied. Quote total is now {formatCurrency(success.quote.totalCost, currency)} cost /{" "}
                {formatCurrency(success.quote.totalSell, currency)} sell.
              </span>
            </div>
          ) : null}

          {preview && !success ? (
            featureDisabled ? (
              <div className="rounded-md border border-border px-3 py-2 text-sm text-muted-foreground">Pricing preview is not enabled.</div>
            ) : blocked ? (
              <div className="rounded-md border border-border px-3 py-2 text-sm text-muted-foreground">
                Preview unavailable for this quote{preview.statusCode ? ` (status: ${preview.statusCode})` : ""}.
              </div>
            ) : notResolvable ? (
              <div className="rounded-md border border-border px-3 py-2 text-sm text-warning-foreground">Pricing could not be resolved for this edit.</div>
            ) : (
              <>
                {preview.item ? <TotalsRow label="This item" current={preview.item.current} projected={preview.item.projected} delta={preview.item.delta} currency={currency} /> : null}
                {preview.quote ? <TotalsRow label="Quote totals" current={preview.quote.current} projected={preview.quote.projected} delta={preview.quote.delta} currency={currency} /> : null}
                {preview.warnings && preview.warnings.length > 0 ? (
                  <ul className="space-y-1 rounded-md border border-border px-3 py-2 text-xs text-muted-foreground">
                    {preview.warnings.map((w, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <AlertTriangle className="mt-0.5 size-3 shrink-0 text-warning" aria-hidden="true" />
                        <span>{w}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {deltaNonZero ? (
                  <label className="flex items-start gap-2 text-xs text-foreground">
                    <input type="checkbox" className="mt-0.5" checked={ack} onChange={(e) => setAck(e.target.checked)} />
                    <span>I understand this will update the quote totals.</span>
                  </label>
                ) : null}
              </>
            )
          ) : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
          {canApply ? (
            <Button size="sm" className="gap-2" onClick={runApply} disabled={applying || (deltaNonZero && !ack)}>
              {applying ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
              Apply
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
