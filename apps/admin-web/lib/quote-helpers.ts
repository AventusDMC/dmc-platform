// Pure, display-only derivations for the Quote Builder V2.
//
// IMPORTANT: nothing here computes or alters prices. Pricing figures come
// pre-calculated on `quote.pricing`. These helpers only summarise existing
// statuses/flags so the UI can render readiness, blocking items and gating.

import type {
  Quote,
  BlockingItem,
  ComponentStatus,
  NextAction,
} from "./quote-types"

/** Format a number as currency for display only. */
export function formatCurrency(amount: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount)
}

/**
 * Format a date for display, matching the classic /quotes/[id] page exactly
 * (Intl 'en-US', medium date style, runtime timezone — NOT forced UTC) so the
 * builder shows the same business travel/service dates as the old page in any
 * environment. Returns "—" for missing/invalid input (never raw ISO).
 */
export function formatQuoteDate(value: string | null | undefined): string {
  if (!value) return "—"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return "—"
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(d)
}

/** Readiness percentage (0–100) from the proposal checklist. */
export function getReadiness(quote: Quote): number {
  if (quote.readiness.length === 0) return 0
  const done = quote.readiness.filter((c) => c.done).length
  return Math.round((done / quote.readiness.length) * 100)
}

/** The checklist items that are not yet done. */
export function getOutstandingItems(quote: Quote) {
  return quote.readiness.filter((c) => !c.done)
}

/**
 * Quote can be sent only when every readiness item is satisfied.
 * This is the single source of truth for the Send Quote gate.
 */
export function canSendQuote(quote: Quote): boolean {
  return quote.readiness.length > 0 && quote.readiness.every((c) => c.done)
}

/** Per-component status pulled from the workflow steps. */
export function getComponentStatuses(quote: Quote): ComponentStatus[] {
  const labels: { step: ComponentStatus["step"]; label: string }[] = [
    { step: "hotels", label: "Hotels" },
    { step: "transport", label: "Transport" },
    { step: "experiences", label: "Experiences" },
  ]
  return labels.map(({ step, label }) => ({
    label,
    step,
    status: quote.steps.find((s) => s.id === step)?.status ?? "missing",
  }))
}

/**
 * Collect concrete blocking items the operator must resolve, derived from
 * itinerary warnings, unpriced/flagged transport and non-contracted hotels.
 * Each item links back to the step where it is fixed.
 */
export function getBlockingItems(quote: Quote): BlockingItem[] {
  const items: BlockingItem[] = []

  for (const day of quote.itinerary) {
    for (const w of day.warnings) {
      items.push({ id: `itin-${day.id}-${w}`, label: w, step: "itinerary" })
    }
  }

  for (const block of quote.hotelCities) {
    const selected = block.options.find((o) => o.selected)
    if (!selected) {
      items.push({
        id: `hotel-${block.city}`,
        label: `${block.city}: no hotel selected`,
        step: "hotels",
      })
    } else if (selected.contractStatus !== "contracted") {
      items.push({
        id: `hotel-${block.city}-contract`,
        label: `${selected.name} is ${selected.contractStatus === "on-request" ? "on request" : "not contracted"}`,
        step: "hotels",
      })
    }
  }

  for (const svc of quote.transport) {
    if (svc.priceStatus !== "complete") {
      items.push({
        id: `transport-${svc.id}`,
        label: svc.warning ?? `${svc.route} needs pricing`,
        step: "transport",
      })
    }
  }

  for (const exp of quote.experiences) {
    if (exp.status === "missing") {
      items.push({
        id: `exp-${exp.id}`,
        label: `${exp.name} not confirmed`,
        step: "experiences",
      })
    }
  }

  return items
}

/** The first outstanding checklist item becomes the suggested next action. */
export function getNextAction(quote: Quote): NextAction | null {
  const outstanding = getOutstandingItems(quote)
  if (outstanding.length === 0) return null
  const first = outstanding[0]
  return { label: first.label, step: first.step }
}

/** Sum of priced transport services (display rollup only). */
export function getPricedTransportTotal(quote: Quote): number {
  return quote.transport
    .filter((s) => s.amount != null)
    .reduce((sum, s) => sum + (s.amount ?? 0), 0)
}
