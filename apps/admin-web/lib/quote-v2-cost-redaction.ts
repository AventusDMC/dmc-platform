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
 * CP-N1b — additional internal-metadata fields that also reached restricted roles
 * unredacted are neutralized here (still the same choke point, still fail-closed):
 *   - transport[].supplier       (supplier IDENTITY — replaced with a
 *     non-identifying, assignment-truthful sentinel: "Unassigned" stays
 *     "Unassigned"; an assigned leg becomes "Assigned" so the transport step's
 *     unassigned-state logic and contract badge keep working. supplierContract is
 *     preserved — it is a low-sensitivity status enum, not identity.)
 *   - pricing.lines[].note       (the engine pricingDescription — MIXED internal
 *     rate/discount text + client routing, not reliably separable, so the whole
 *     note is blanked to "" for restricted roles.)
 *   - hotelCities[].options[].diagnostics.reasons  (free-form "Why?" lines that
 *     embed the contract name + "Rate on file (from Classic)" text — dropped to
 *     [] for restricted roles; the structured contractState / hasRate / source
 *     readiness fields are preserved.)
 * meta.publicToken is deliberately NOT touched here — it is a capability token
 * handled on a separate security track.
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
/**
 * True when a transport supplier value represents "no supplier assigned". Fail
 * closed: a non-string, blank, or malformed value is treated as unassigned so a
 * real name is never leaked and `.trim()`/render never crashes. Only a clearly
 * non-blank string that is not "unassigned" counts as an assigned supplier.
 */
function isUnassignedSupplier(supplier: unknown): boolean {
  if (typeof supplier !== "string") return true
  const normalized = supplier.trim().toLowerCase()
  return normalized === "" || normalized === "unassigned"
}

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
      // Per-component cost zeroed; the internal pricing note (pricingDescription —
      // mixed internal rate/discount + client text, not reliably separable) is
      // blanked to "" for restricted roles. Label / status / selling stay intact.
      lines: quote.pricing.lines.map((line) => ({ ...line, amount: 0, note: "" })),
    },
    // Per-item supplier cost (meal items carry it as unitCost; others are already
    // null). Null it for restricted roles without touching any other Experience
    // field — selling `amount`, itinerary data, and apply metadata are preserved.
    experiences: quote.experiences.map((experience) => ({
      ...experience,
      unitCost: null,
    })),
    // Transport supplier IDENTITY → non-identifying, assignment-truthful sentinel.
    // Keep supplierContract and every other transport field for read/review.
    transport: quote.transport.map((service) => ({
      ...service,
      supplier: isUnassignedSupplier(service.supplier) ? "Unassigned" : "Assigned",
    })),
    // Hotel "Why?" diagnostics free-form reasons embed the contract name + Classic
    // rate text (mixed/inseparable) → drop to [] for restricted roles; keep the
    // structured contractState / hasRate / source readiness fields untouched.
    hotelCities: quote.hotelCities.map((city) => ({
      ...city,
      options: city.options.map((option) =>
        option.diagnostics
          ? { ...option, diagnostics: { ...option.diagnostics, reasons: [] } }
          : option,
      ),
    })),
  }
}
