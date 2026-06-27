"use client"

import { useEffect, useState } from "react"
import { X, Info, AlertTriangle, Loader2 } from "lucide-react"
import { Button } from "../../../ui/button"
import { formatCurrency } from "../../../../lib/quote-helpers"
import type { PreviewItemHandler, PricingPreviewResult, PricingPreviewTotals } from "../../../../lib/quote-types"

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
 * Read-only dry-run pricing preview modal. Calls the preview endpoint on open
 * and renders current/projected/delta for the quote and the item. There is NO
 * apply/save control — this never mutates anything.
 */
export function PricingPreviewModal({
  open,
  onClose,
  title,
  currency,
  quoteItemId,
  onPreview,
}: {
  open: boolean
  onClose: () => void
  title: string
  currency: string
  quoteItemId: string
  onPreview: PreviewItemHandler
}) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<PricingPreviewResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setResult(null)
    setError(null)
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
              Preview only — no changes will be saved. {title}
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
            </>
          ) : null}
        </div>

        <div className="flex justify-end border-t border-border px-4 py-3">
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  )
}
