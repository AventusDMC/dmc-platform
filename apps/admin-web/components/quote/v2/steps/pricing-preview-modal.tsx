"use client"

import { useEffect, useState } from "react"
import { X, Info, AlertTriangle, Loader2, CheckCircle2 } from "lucide-react"
import { Button } from "../../../ui/button"
import { formatCurrency } from "../../../../lib/quote-helpers"
import type {
  ApplyItemPricingHandler,
  PreviewItemHandler,
  PricingPreviewResult,
  PricingPreviewTotals,
} from "../../../../lib/quote-types"

// Map a backend machine-code (from the apply throw) to a human message. Mirrors
// the codes the apply endpoint returns; forceRePreview re-runs the read-only
// preview so a fresh token is minted before the user can retry apply.
function applyMessageForCode(code: string): { text: string; forceRePreview: boolean } {
  switch (code) {
    case "feature_disabled":
      return { text: "Pricing apply is not enabled.", forceRePreview: false }
    case "stale_preview":
      return { text: "The quote or rates changed. Preview again before applying.", forceRePreview: true }
    case "confirmation_required":
      return { text: "Please confirm this will update the quote totals.", forceRePreview: false }
    case "payload_mismatch":
    case "invalid_preview_token":
      return { text: "The preview expired. Preview again before applying.", forceRePreview: true }
    case "token_secret_not_configured":
      return { text: "Pricing apply is not configured.", forceRePreview: false }
    default:
      return { text: code || "Could not apply the change.", forceRePreview: false }
  }
}

function Row({
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
  const deltaText = (v: number) => (v > 0 ? `+${fmt(v)}` : fmt(v))
  const deltaTone = (v: number) =>
    v === 0 ? "text-muted-foreground" : v > 0 ? "text-destructive" : "text-success"
  return (
    <div className="rounded-md border border-border">
      <div className="border-b border-border bg-muted/40 px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
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
          <div className={`font-semibold ${delta ? deltaTone(delta.totalCost) : "text-muted-foreground"}`}>
            Cost {delta ? deltaText(delta.totalCost) : "—"}
          </div>
          <div className={`font-semibold ${delta ? deltaTone(delta.totalSell) : "text-muted-foreground"}`}>
            Sell {delta ? deltaText(delta.totalSell) : "—"}
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Dry-run pricing preview modal. Calls the preview endpoint on open and renders
 * current/projected/delta for the quote and the item.
 *
 * By default this is READ-ONLY — there is no apply/save control and nothing is
 * ever mutated. When `applyEnabled` is true AND an `onApply` handler is provided
 * (hotel apply, behind its own flag), an "Apply hotel price" action is offered:
 * it re-prices the already-selected hotel in place using the empty preview payload
 * and the signed preview token returned by the preview. It never changes the hotel
 * selection, primary, rooming, or itinerary — only the target item/option pricing.
 */
export function PricingPreviewModal({
  open,
  onClose,
  title,
  currency,
  quoteItemId,
  onPreview,
  onApply,
  applyEnabled = false,
  applyLabel = "Apply hotel price",
  applyDescription = "Nothing is saved until you apply. Apply re-prices the selected hotel in place — it does not change the hotel, primary, rooming, or itinerary.",
}: {
  open: boolean
  onClose: () => void
  title: string
  currency: string
  quoteItemId: string
  onPreview: PreviewItemHandler
  /** Apply handler (hotel/external-package apply). Optional — when absent the modal is preview-only. */
  onApply?: ApplyItemPricingHandler
  /** Apply scope (separate flag, default OFF). Apply UI shows only when true. */
  applyEnabled?: boolean
  /** Copy for the apply button. */
  applyLabel?: string
  /** Info-banner copy shown when apply is enabled (per item type). Defaults to hotel copy. */
  applyDescription?: string
}) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<PricingPreviewResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [applying, setApplying] = useState(false)
  const [ack, setAck] = useState(false)
  const [applyError, setApplyError] = useState<string | null>(null)
  const [applySuccess, setApplySuccess] = useState<null | { item: PricingPreviewTotals; quote: PricingPreviewTotals }>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setResult(null)
    setError(null)
    setApplying(false)
    setAck(false)
    setApplyError(null)
    setApplySuccess(null)
    // Read-only re-resolve of the existing item (empty payload = no field change).
    onPreview(quoteItemId, {})
      .then((r) => {
        if (!cancelled) setResult(r)
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load the pricing preview.")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, quoteItemId, onPreview])

  if (!open) return null

  const unavailable = result && result.available === false
  const blocked = result && result.blocked === true && result.available !== false

  const previewToken = result?.previewToken ?? null
  const notResolvable = result?.pricingResolvable === false
  const deltaNonZero = Boolean(
    result &&
      ((result.item?.delta && (result.item.delta.totalCost !== 0 || result.item.delta.totalSell !== 0)) ||
        (result.quote?.delta && (result.quote.delta.totalCost !== 0 || result.quote.delta.totalSell !== 0))),
  )
  // Apply is offered ONLY when: the apply flag is on, an apply handler exists, the
  // preview succeeded (resolvable, unblocked, available) AND minted a token, and
  // it has not already been applied this open. The empty payload re-prices the
  // already-selected hotel in place — no selection/primary/rooming/itinerary change.
  const canApply = Boolean(
    applyEnabled &&
      onApply &&
      previewToken &&
      !loading &&
      !error &&
      !unavailable &&
      !blocked &&
      !notResolvable &&
      !applySuccess,
  )

  const runApply = async () => {
    if (!onApply || !previewToken) return
    setApplying(true)
    setApplyError(null)
    try {
      // Re-price in place: same empty payload used for the preview + the signed
      // token; acknowledge only when the projected delta is non-zero.
      const res = await onApply(quoteItemId, {}, previewToken, deltaNonZero ? ack : false)
      if (res?.applied) {
        setApplySuccess({
          item: res.item?.after ?? { totalCost: 0, totalSell: 0 },
          quote: res.quote?.after ?? { totalCost: 0, totalSell: 0 },
        })
        // Close the modal on success so the persistent, dismiss-only client-level
        // success toast is clearly visible (unobstructed). The apply already ran +
        // refreshed the quote data; the toast is the confirmation (works on Δ0).
        onClose()
      } else if (res?.available === false || res?.blockedReason === "feature_disabled") {
        setApplyError("Pricing apply is not enabled.")
      } else {
        setApplyError("Could not apply the change.")
      }
    } catch (e) {
      const mapped = applyMessageForCode(e instanceof Error ? e.message : "")
      setApplyError(mapped.text)
      if (mapped.forceRePreview) {
        // Re-run the preview so a fresh token is minted before retry.
        setResult(null)
        setAck(false)
        setLoading(true)
        onPreview(quoteItemId, {})
          .then((r) => setResult(r))
          .catch((err: unknown) =>
            setError(err instanceof Error ? err.message : "Could not load the pricing preview."),
          )
          .finally(() => setLoading(false))
      }
    } finally {
      setApplying(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Pricing preview"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-lg border border-border bg-background shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-foreground">Pricing preview</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-3 px-4 py-3">
          <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <span>
              {applyEnabled && onApply
                ? applyDescription
                : "Preview only — no changes will be saved."}{" "}
              {title}
            </span>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Calculating projected pricing…
            </div>
          ) : error ? (
            <div className="flex items-start gap-2 rounded-md border border-border px-3 py-3 text-sm text-warning-foreground">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
              <span>{error}</span>
            </div>
          ) : unavailable ? (
            <div className="rounded-md border border-border px-3 py-3 text-sm text-muted-foreground">
              Pricing preview is not enabled.
            </div>
          ) : blocked ? (
            <div className="rounded-md border border-border px-3 py-3 text-sm text-muted-foreground">
              Preview unavailable for this quote
              {result?.statusCode ? ` (status: ${result.statusCode})` : ""}.
            </div>
          ) : result ? (
            <>
              {result.pricingResolvable === false ? (
                <div className="flex items-start gap-2 rounded-md border border-border px-3 py-2 text-xs text-warning-foreground">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden="true" />
                  <span>Pricing could not be fully resolved for this item.</span>
                </div>
              ) : null}
              {result.item ? (
                <Row label="This item" current={result.item.current} projected={result.item.projected} delta={result.item.delta} currency={currency} />
              ) : null}
              {result.quote ? (
                <Row label="Quote totals" current={result.quote.current} projected={result.quote.projected} delta={result.quote.delta} currency={currency} />
              ) : null}
              {result.pricingBasis ? (
                <div className="rounded-md border border-border">
                  <div className="border-b border-border bg-muted/40 px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Pricing basis
                  </div>
                  <div className="px-3 py-2 text-xs text-foreground break-words">{result.pricingBasis}</div>
                </div>
              ) : null}
              {typeof result.affectedItemCount === "number" ? (
                <div className="text-xs text-muted-foreground">
                  Affected items: {result.affectedItemCount}
                  {result.reResolved ? ` · rates re-resolved: ${result.reResolved.rates ? "yes" : "no"}` : ""}
                </div>
              ) : null}
              {result.warnings && result.warnings.length > 0 ? (
                <ul className="space-y-1 rounded-md border border-border px-3 py-2 text-xs text-muted-foreground">
                  {result.warnings.map((w, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <AlertTriangle className="mt-0.5 size-3 shrink-0 text-warning" aria-hidden="true" />
                      <span>{w}</span>
                    </li>
                  ))}
                </ul>
              ) : null}

              {/* Apply affordances — only when the hotel apply flag is on and a
                  resolvable, token-bearing preview is in hand. */}
              {applyEnabled && onApply ? (
                <>
                  {applySuccess ? (
                    <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-foreground">
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
                      <span>
                        Applied. Quote total is now {formatCurrency(applySuccess.quote.totalCost, currency)} cost /{" "}
                        {formatCurrency(applySuccess.quote.totalSell, currency)} sell.
                      </span>
                    </div>
                  ) : null}
                  {applyError ? (
                    <div className="flex items-start gap-2 rounded-md border border-border px-3 py-2 text-sm text-warning-foreground">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
                      <span>{applyError}</span>
                    </div>
                  ) : null}
                  {!applySuccess && previewToken && !notResolvable && deltaNonZero ? (
                    <label className="flex items-start gap-2 text-xs text-foreground">
                      <input type="checkbox" className="mt-0.5" checked={ack} onChange={(e) => setAck(e.target.checked)} />
                      <span>I understand this will update the quote totals.</span>
                    </label>
                  ) : null}
                </>
              ) : null}
            </>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
          {canApply ? (
            <Button size="sm" className="gap-2" onClick={runApply} disabled={applying || (deltaNonZero && !ack)}>
              {applying ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
              {applyLabel}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
