// Read-only hotel diagnostics for Quote Builder V2.
//
// Explains WHY a hotel row reads as on-request / needs review, using data the
// quote GET already returns (the priced hotel line's linked contract, room
// category and rate). PURE + no Next imports so it is unit-testable and shared
// by the ERP→UI adapter. Display-only: it never changes pricing, the row's
// contractStatus, or proposal readiness.

import type { ContractStatus, HotelCategory } from "./quote-types"

/** The priced hotel line (QuoteItem) matched to a hotel row, if any. */
export interface MatchedHotelLine {
  /** True when a supplier Contract is linked to the priced hotel line. */
  contractLinked: boolean
  /** Linked contract display name (when contractLinked). */
  contractName: string | null
  /** Room category name from the priced line (e.g. "Standard Room"). */
  roomCategory: string | null
  /** True when the priced line carries a non-zero cost. */
  hasRate: boolean
  /** The engine's own pricing description for the line (authoritative detail). */
  pricingSummary: string | null
}

export interface HotelDiagnosticsInput {
  selected: boolean
  /** True for real editable QuoteHotelOption rows; false for itinerary-fallback rows. */
  editable: boolean
  /** True when the row belongs to a real option-set (has an optionId). */
  hasOptionSet: boolean
  category: HotelCategory
  roomingSummary: string
  /** Row contract status as currently derived by the adapter (display badge). */
  contractStatus: ContractStatus
  /** Matched priced hotel line, or null when none was found. */
  matchedLine: MatchedHotelLine | null
}

export type HotelContractState = "contracted" | "on-request" | "no-contract" | "unknown"

export interface HotelDiagnostics {
  /** Authoritative contract state derived from the priced line's linked contract. */
  contractState: HotelContractState
  hasRate: boolean
  /** Where the row came from. */
  source: "option-set" | "itinerary"
  /** Human-readable, read-only explanation lines. */
  reasons: string[]
}

function blank(s: string | null | undefined): boolean {
  return !s || !s.trim() || s.trim() === "—"
}

/**
 * Build read-only diagnostics for a single hotel row. Derives the real contract
 * state + rate from the matched priced line (when available) and explains any
 * gap between "selected / Hotels complete" and "on request / needs review".
 */
export function buildHotelDiagnostics(input: HotelDiagnosticsInput): HotelDiagnostics {
  const reasons: string[] = []
  const source: HotelDiagnostics["source"] = input.hasOptionSet && input.editable ? "option-set" : "itinerary"
  const line = input.matchedLine

  // Contract state — authoritative from the priced line's linked contract.
  let contractState: HotelContractState
  if (line) {
    contractState = line.contractLinked ? "contracted" : input.selected ? "on-request" : "no-contract"
  } else {
    contractState = "unknown"
  }

  const hasRate = Boolean(line && line.hasRate)

  if (source === "itinerary") {
    reasons.push(
      "Imported from the itinerary — this quote has no hotel option-set, so V2 shows it read-only. Manage options in Classic Builder.",
    )
  }

  if (!input.selected) {
    reasons.push("Alternative option — not the current primary for this stop.")
  }

  if (line) {
    if (line.contractLinked) {
      reasons.push(
        `Contracted — a supplier contract is linked in Classic${line.contractName ? ` ("${line.contractName}")` : ""}. ` +
          "V2 still labels selected hotels as on request for review until contract status is confirmed inline.",
      )
    } else if (input.selected) {
      reasons.push(
        "On request — selected for the proposal but no supplier contract is linked. Confirm or add a contract in Classic Builder.",
      )
    } else {
      reasons.push("No contract linked for this option.")
    }

    if (hasRate) {
      reasons.push(
        line.pricingSummary
          ? `Rate on file (from Classic): ${line.pricingSummary}`
          : "Rate on file on the priced line in Classic.",
      )
    } else {
      reasons.push("No rate found on the priced hotel line — confirm the rate in Classic Builder.")
    }

    if (blank(line.roomCategory)) {
      reasons.push("Room category not set — confirm in Classic Builder.")
    } else {
      reasons.push(`Room category: ${line.roomCategory}.`)
    }
  } else {
    // No priced line matched this row.
    reasons.push(
      "No priced hotel line matched in V2 — the rate and contract for this selection are managed in Classic Builder.",
    )
    if (input.selected && input.contractStatus !== "contracted") {
      reasons.push("Shown as on request for review until confirmed in Classic.")
    }
  }

  if (input.category === "Unknown") {
    reasons.push("Star category not set on the option.")
  }
  if (blank(input.roomingSummary)) {
    reasons.push("Rooming not specified.")
  }

  return { contractState, hasRate, source, reasons }
}
