"use client"

import { useState } from "react"
import { ChevronDown, ChevronRight, History, AlertTriangle, Loader2 } from "lucide-react"
import { Card } from "../../../ui/card"
import { formatCurrency } from "../../../../lib/quote-helpers"
import type { LoadApplyAuditHandler, PricingApplyAuditEntry } from "../../../../lib/quote-types"

/**
 * Read-only "Pricing Apply Audit" panel for Quote Builder V2. Collapsible; loads
 * the sanitized `quote.pricing.apply` history for the current quote on first
 * expand via the injected handler (no fetch here). Never blocks the page — a load
 * failure shows a small inline message. Shows only safe fields (no tokens).
 */
export function PricingApplyAuditPanel({
  currency,
  onLoad,
}: {
  currency: string
  onLoad: LoadApplyAuditHandler
}) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [entries, setEntries] = useState<PricingApplyAuditEntry[] | null>(null)

  const toggle = async () => {
    const next = !open
    setOpen(next)
    if (next && entries === null && !loading) {
      setLoading(true)
      setError(null)
      try {
        setEntries(await onLoad())
      } catch {
        setError("Could not load the pricing apply audit. The quote is unaffected.")
      } finally {
        setLoading(false)
      }
    }
  }

  const fmt = (v: number | null) => (v === null || v === undefined ? "—" : formatCurrency(v, currency))
  const delta = (v: number | null) => (v === null || v === undefined ? "—" : v > 0 ? `+${fmt(v)}` : fmt(v))
  const when = (ts: string) => {
    try {
      return new Date(ts).toISOString().replace("T", " ").slice(0, 16)
    } catch {
      return ts
    }
  }

  return (
    <Card className="mt-3 overflow-hidden p-0">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2 border-b border-border bg-muted/40 px-4 py-2.5 text-left"
      >
        {open ? <ChevronDown className="size-4 text-muted-foreground" aria-hidden="true" /> : <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />}
        <History className="size-4 text-muted-foreground" aria-hidden="true" />
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Pricing Apply Audit</span>
      </button>

      {open ? (
        <div className="px-4 py-3 text-sm">
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Loading…
            </div>
          ) : error ? (
            <div className="flex items-start gap-2 rounded-md border border-border px-3 py-2 text-xs text-warning-foreground">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden="true" />
              <span>{error}</span>
            </div>
          ) : !entries || entries.length === 0 ? (
            <p className="text-xs text-muted-foreground">No V2 pricing apply audit entries yet.</p>
          ) : (
            <div className="space-y-2">
              {entries.map((e) => (
                <div key={e.id} className="rounded-md border border-border px-3 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>{when(e.timestamp)}</span>
                    <span>{e.actor?.name || e.actor?.email || "—"}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-foreground">
                    <span className="font-medium">{e.serviceType ?? "—"}</span>
                    {e.itemName ? <span className="text-muted-foreground">· {e.itemName}</span> : null}
                  </div>
                  <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
                    <span className="text-muted-foreground">
                      Item cost: {fmt(e.previousItemTotalCost)} → {fmt(e.newItemTotalCost)}{" "}
                      <span className={e.deltaItemCost && e.deltaItemCost !== 0 ? "text-foreground" : ""}>({delta(e.deltaItemCost)})</span>
                    </span>
                    <span className="text-muted-foreground">
                      Item sell: {fmt(e.previousItemTotalSell)} → {fmt(e.newItemTotalSell)}{" "}
                      <span className={e.deltaItemSell && e.deltaItemSell !== 0 ? "text-foreground" : ""}>({delta(e.deltaItemSell)})</span>
                    </span>
                    <span className="text-muted-foreground">Quote cost Δ: {delta(e.deltaQuoteCost)}</span>
                    <span className="text-muted-foreground">Quote sell Δ: {delta(e.deltaQuoteSell)}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                    {e.acknowledgedDelta ? <span className="rounded bg-muted px-1.5 py-0.5">acknowledged</span> : null}
                    <span className="rounded bg-muted px-1.5 py-0.5">{e.integrityOk === false ? "integrity: check" : "integrity: ok"}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </Card>
  )
}
