import type { Quote } from "./quote-types"

/**
 * Quote Builder V2 — Slice 2A-2: hydration-payload cost/margin redaction.
 *
 * Pairs with the UI gating from Slice 2A (canViewCostMargin). Slice 2A hides the
 * cost/margin figures in the rendered UI for restricted roles, but the raw values
 * still travelled to the client inside the hydrated `quote` prop. This sanitizes
 * the server-to-client payload so restricted roles never RECEIVE those values.
 *
 * Policy (same predicate as the UI, canAccessFinance — admin / super_admin /
 * finance): privileged viewers get the full payload; everyone else gets a copy
 * with the pricing breakdown's INTERNAL cost figures zeroed:
 *   - pricing.netCost
 *   - pricing.markupPercent
 *   - pricing.margin
 *   - pricing.lines[].amount   (per-component cost)
 *
 * Deliberately NARROW — client-facing figures are preserved for ALL roles:
 *   - pricing.sellingPrice, pricing.perPerson, pricing.pax, pricing.currency
 *   - every itinerary / hotel / experience / transport field, including the
 *     per-item display `amount`s (used to build the quote and drive readiness;
 *     shown to operations today, and consumed by the readiness helpers).
 *
 * Pure: returns a shallow-cloned copy, never mutates the input. No effect on the
 * backend, the pricing engine, the proposal mapper, the public proposal page, or
 * PDF generation — those remain the client-facing source of truth and are
 * unchanged.
 */
export function redactQuoteV2CostMargin(
  quote: Quote | null,
  canViewCostMargin: boolean,
): Quote | null {
  if (!quote || canViewCostMargin) {
    return quote
  }

  return {
    ...quote,
    pricing: {
      ...quote.pricing,
      netCost: 0,
      markupPercent: 0,
      margin: 0,
      lines: quote.pricing.lines.map((line) => ({ ...line, amount: 0 })),
    },
  }
}
