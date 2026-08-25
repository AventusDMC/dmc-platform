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
 * finance): privileged viewers get the full payload; everyone else (operations,
 * agent_admin, agent, viewer, and any unrecognized role — fail closed) gets a
 * copy with the internal cost figures neutralized:
 *   - pricing.netCost
 *   - pricing.markupPercent
 *   - pricing.margin
 *   - pricing.lines[].amount     (per-component cost)
 *   - experiences[].unitCost     (per-item supplier cost — meal items carry the
 *     real cost here, reconstructed from costBaseAmount; every other kind is
 *     already null. It was the only per-item supplier-cost field still riding the
 *     hydration payload to restricted roles, so it is nulled here at the single
 *     server-to-client choke point.)
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
    // Per-item supplier cost (meal items carry it as unitCost; others are already
    // null). Null it for restricted roles without touching any other Experience
    // field — selling `amount`, itinerary data, and apply metadata are preserved.
    experiences: quote.experiences.map((experience) => ({
      ...experience,
      unitCost: null,
    })),
  }
}
