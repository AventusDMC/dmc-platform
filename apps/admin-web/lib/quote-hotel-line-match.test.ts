import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { matchPricedHotelLine, type PricedHotelLine } from "./quote-hotel-line-match"

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
