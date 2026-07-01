// Pure, dependency-free matcher: map a Hotels-step row (a QuoteHotelOption or an
// itinerary-fallback hotel) to the authoritative priced hotel QuoteItem.
//
// WHY: the Hotels-step rows do not themselves carry the linked contract / rate —
// they must be matched to a priced hotel QuoteItem to know the preview/apply
// target (`pricedQuoteItemId`) and the contract diagnostics. The original matcher
// keyed ONLY on hotel name, so when a quote had two hotel items with the same
// name (e.g. a fully-priced line + an unconfigured one) it could point the row at
// the WRONG item — previewing/applying the wrong hotel.
//
// This matcher prefers STABLE identifiers (hotelId, then hotelId+roomCategoryId)
// and only falls back to name when it is unambiguous. When it cannot determine a
// single target it returns `ambiguous` so the UI can HIDE apply + show safe
// helper text instead of guessing. Pure + unit-tested (quote-hotel-line-match.test.ts).

export interface PricedHotelLine {
  /** The priced hotel QuoteItem id (the preview/apply target). */
  quoteItemId: string
  hotelId: string | null
  roomCategoryId: string | null
  /** Hotel name (used only as a last-resort, uniqueness-checked fallback key). */
  name: string | null
  contractLinked: boolean
  contractName: string | null
  roomCategory: string | null
  hasRate: boolean
  pricingSummary: string | null
}

/** The stable-ish identifiers a Hotels-step row can offer for matching. */
export interface HotelRowKey {
  hotelId?: string | null
  roomCategoryId?: string | null
  name?: string | null
}

export type HotelLineMatch =
  | { status: "matched"; line: PricedHotelLine }
  | { status: "ambiguous"; candidates: number }
  | { status: "none" }

const norm = (s?: string | null): string => (s || "").trim().toLowerCase()

/**
 * Resolve a hotel row to a single priced hotel line, preferring stable ids.
 *
 * Priority:
 *  1. hotelId — if exactly one priced line shares it → match.
 *     - if several share it, narrow by roomCategoryId (when the row has one);
 *       exactly one → match, otherwise → ambiguous (never guess).
 *     - hotelId given but matched none → fall through to name (the row's hotelId
 *       may be a snapshot not present on any priced line).
 *  2. name — only when EXACTLY one priced line has that name → match; if several
 *     share the name → ambiguous.
 *  3. otherwise → none.
 */
export function matchPricedHotelLine(row: HotelRowKey, lines: PricedHotelLine[]): HotelLineMatch {
  if (row.hotelId) {
    const byHotel = lines.filter((l) => l.hotelId && l.hotelId === row.hotelId)
    if (byHotel.length === 1) return { status: "matched", line: byHotel[0] }
    if (byHotel.length > 1) {
      if (row.roomCategoryId) {
        const byRoom = byHotel.filter((l) => l.roomCategoryId && l.roomCategoryId === row.roomCategoryId)
        if (byRoom.length === 1) return { status: "matched", line: byRoom[0] }
        // roomCategoryId present but 0 or >1 matches within the hotel → cannot
        // disambiguate safely.
        return { status: "ambiguous", candidates: byRoom.length > 1 ? byRoom.length : byHotel.length }
      }
      // same hotel, no room-category discriminator → ambiguous (do NOT guess).
      return { status: "ambiguous", candidates: byHotel.length }
    }
    // byHotel.length === 0 → no priced line carries this hotelId; try name below.
  }

  const nm = norm(row.name)
  if (nm) {
    const byName = lines.filter((l) => norm(l.name) === nm)
    if (byName.length === 1) return { status: "matched", line: byName[0] }
    if (byName.length > 1) return { status: "ambiguous", candidates: byName.length }
  }

  return { status: "none" }
}
