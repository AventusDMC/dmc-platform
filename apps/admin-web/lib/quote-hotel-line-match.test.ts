import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { matchPricedHotelLine, resolveBackendHotelOptionMatch, type PricedHotelLine } from "./quote-hotel-line-match"

function line(over: Partial<PricedHotelLine>): PricedHotelLine {
  return {
    quoteItemId: "item-x",
    hotelId: null,
    roomCategoryId: null,
    name: null,
    contractLinked: false,
    contractName: null,
    roomCategory: null,
    hasRate: false,
    pricingSummary: null,
    ...over,
  }
}

describe("matchPricedHotelLine — stable-id hotel row mapping (PR #583)", () => {
  it("duplicate hotel NAMES with distinct hotelIds → resolves by hotelId (not name)", () => {
    const lines = [
      line({ quoteItemId: "A", hotelId: "h1", name: "Grand Hotel", hasRate: true }),
      line({ quoteItemId: "B", hotelId: "h2", name: "Grand Hotel", hasRate: true }),
    ]
    const r = matchPricedHotelLine({ hotelId: "h2", name: "Grand Hotel" }, lines)
    assert.equal(r.status, "matched")
    assert.equal(r.status === "matched" && r.line.quoteItemId, "B")
  })

  it("same hotelId, distinct roomCategoryId → resolves by roomCategoryId", () => {
    const lines = [
      line({ quoteItemId: "A", hotelId: "h1", roomCategoryId: "rcDeluxe", name: "Grand Hotel" }),
      line({ quoteItemId: "B", hotelId: "h1", roomCategoryId: "rcStandard", name: "Grand Hotel" }),
    ]
    const r = matchPricedHotelLine({ hotelId: "h1", roomCategoryId: "rcStandard", name: "Grand Hotel" }, lines)
    assert.equal(r.status, "matched")
    assert.equal(r.status === "matched" && r.line.quoteItemId, "B")
  })

  it("same hotelId, NO room discriminator → ambiguous (does not guess)", () => {
    // Mirrors the staging bb07/bb08 case: two items, same hotelId, one priced one
    // unconfigured, and the row carries no roomCategoryId → must NOT pick one.
    const lines = [
      line({ quoteItemId: "priced", hotelId: "h1", roomCategoryId: "rc1", name: "QA Hotel", hasRate: true, contractLinked: true }),
      line({ quoteItemId: "unconfigured", hotelId: "h1", roomCategoryId: null, name: "QA Hotel", hasRate: false }),
    ]
    const r = matchPricedHotelLine({ hotelId: "h1", name: "QA Hotel" }, lines)
    assert.equal(r.status, "ambiguous")
  })

  it("unique name, no hotelId on the row → name fallback matches", () => {
    const lines = [
      line({ quoteItemId: "A", hotelId: "h1", name: "Unique Hotel", hasRate: true }),
      line({ quoteItemId: "B", hotelId: "h2", name: "Other Hotel", hasRate: true }),
    ]
    const r = matchPricedHotelLine({ name: "Unique Hotel" }, lines)
    assert.equal(r.status, "matched")
    assert.equal(r.status === "matched" && r.line.quoteItemId, "A")
  })

  it("duplicate name, no hotelId on the row → ambiguous (no name-only guess)", () => {
    const lines = [
      line({ quoteItemId: "A", hotelId: "h1", name: "Dup Hotel" }),
      line({ quoteItemId: "B", hotelId: "h2", name: "Dup Hotel" }),
    ]
    const r = matchPricedHotelLine({ name: "Dup Hotel" }, lines)
    assert.equal(r.status, "ambiguous")
  })

  it("hotelId present on row but on no priced line → falls back to unique name", () => {
    const lines = [line({ quoteItemId: "A", hotelId: "h1", name: "Snapshot Hotel", hasRate: true })]
    const r = matchPricedHotelLine({ hotelId: "h-snapshot-only", name: "Snapshot Hotel" }, lines)
    assert.equal(r.status, "matched")
    assert.equal(r.status === "matched" && r.line.quoteItemId, "A")
  })

  it("no hotelId and no matching name → none (no preview/apply target)", () => {
    const lines = [line({ quoteItemId: "A", hotelId: "h1", name: "Grand Hotel" })]
    const r = matchPricedHotelLine({ name: "Nonexistent" }, lines)
    assert.equal(r.status, "none")
  })

  it("single unambiguous hotelId match → matched", () => {
    const lines = [line({ quoteItemId: "A", hotelId: "h1", name: "Grand Hotel", hasRate: true })]
    const r = matchPricedHotelLine({ hotelId: "h1", name: "Grand Hotel" }, lines)
    assert.equal(r.status, "matched")
    assert.equal(r.status === "matched" && r.line.quoteItemId, "A")
  })
})

describe("resolveBackendHotelOptionMatch — H-A consume backend match metadata", () => {
  it("backend matched + id → backend source, pricedQuoteItemId set, not ambiguous", () => {
    const r = resolveBackendHotelOptionMatch({ pricingMatchStatus: "matched", matchedPricedQuoteItemId: "item-42" })
    assert.equal(r.source, "backend")
    assert.equal(r.source === "backend" && r.pricedQuoteItemId, "item-42")
    assert.equal(r.source === "backend" && r.pricingMatchAmbiguous, false)
  })

  it("backend ambiguous → backend source, no id, pricingMatchAmbiguous true (resolve in Classic)", () => {
    const r = resolveBackendHotelOptionMatch({ pricingMatchStatus: "ambiguous", matchedPricedQuoteItemId: null })
    assert.equal(r.source, "backend")
    assert.equal(r.source === "backend" && r.pricedQuoteItemId, undefined)
    assert.equal(r.source === "backend" && r.pricingMatchAmbiguous, true)
  })

  it("backend none (e.g. no_contract_linked) → backend source, no id, not flagged ambiguous", () => {
    const r = resolveBackendHotelOptionMatch({ pricingMatchStatus: "none", matchedPricedQuoteItemId: null })
    assert.equal(r.source, "backend")
    assert.equal(r.source === "backend" && r.pricedQuoteItemId, undefined)
    assert.equal(r.source === "backend" && r.pricingMatchAmbiguous, false)
  })

  it("no backend metadata → falls back to the heuristic matcher", () => {
    assert.equal(resolveBackendHotelOptionMatch({}).source, "heuristic")
    assert.equal(resolveBackendHotelOptionMatch({ pricingMatchStatus: null }).source, "heuristic")
  })

  it("defensive: matched status without a usable id → no target, not ambiguous (keeps Classic fallback)", () => {
    const r1 = resolveBackendHotelOptionMatch({ pricingMatchStatus: "matched", matchedPricedQuoteItemId: null })
    assert.equal(r1.source, "backend")
    assert.equal(r1.source === "backend" && r1.pricedQuoteItemId, undefined)
    assert.equal(r1.source === "backend" && r1.pricingMatchAmbiguous, false)
    const r2 = resolveBackendHotelOptionMatch({ pricingMatchStatus: "matched", matchedPricedQuoteItemId: "" })
    assert.equal(r2.source === "backend" && r2.pricedQuoteItemId, undefined)
  })
})
