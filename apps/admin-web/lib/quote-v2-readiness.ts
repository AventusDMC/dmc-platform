// Read-only "V2 readiness" audit for Quote Builder V2.
//
// Summarises, per quote, what can be handled in V2 today vs what still needs
// Classic. PURE + display-only: it reuses the existing readiness helpers (it does
// NOT recompute or change readiness/send logic) and never writes anything.

import type { Quote } from "./quote-types"
import { getComponentStatuses, getReadiness, canSendQuote } from "./quote-helpers"

/**
 * Capability level for a row:
 * - ready:   fully supported in V2
 * - preview: read-only preview only in V2 (no apply)
 * - classic: still requires Classic Builder
 * - review:  advisory — a quote-specific item to look at (not a hard blocker)
 */
export type V2ReadinessLevel = "ready" | "preview" | "classic" | "review"

export const V2_READINESS_LABEL: Record<V2ReadinessLevel, string> = {
  ready: "Ready in V2",
  preview: "Preview only",
  classic: "Classic required",
  review: "Needs review",
}

export interface V2ReadinessRow {
  key: string
  /** Section heading, e.g. "Hotels", "Transport". */
  section: string
  label: string
  level: V2ReadinessLevel
  detail: string
}

export interface V2ReadinessAudit {
  rows: V2ReadinessRow[]
  counts: Record<V2ReadinessLevel, number>
}

function tally(rows: V2ReadinessRow[]): Record<V2ReadinessLevel, number> {
  const counts: Record<V2ReadinessLevel, number> = { ready: 0, preview: 0, classic: 0, review: 0 }
  for (const r of rows) counts[r.level] += 1
  return counts
}

/**
 * Build the read-only V2 readiness audit from an already-normalised Quote.
 * Reuses getComponentStatuses / getReadiness / canSendQuote verbatim — no
 * readiness/send logic is changed here.
 */
export interface V2ReadinessOptions {
  /** When true, external-package rows expose a read-only pricing preview (PR #571). */
  externalPackagePreviewEnabled?: boolean
}

export function buildV2ReadinessAudit(quote: Quote, opts: V2ReadinessOptions = {}): V2ReadinessAudit {
  const rows: V2ReadinessRow[] = []

  // ---- Setup ----
  // Quote setup is read-only in V2 — all of it is managed in Classic Builder.
  rows.push({
    key: "setup",
    section: "Setup",
    label: "Client · trip basics · configuration",
    level: "classic",
    detail:
      "Quote setup — client, travel dates, currency, pax/room counts, FOC and single supplement — is managed in Classic Builder.",
  })

  // ---- Itinerary ----
  // Day title + narrative text are editable in V2; the day structure and any
  // hotel/transport day-assignment stay in Classic.
  rows.push({
    key: "itinerary",
    section: "Itinerary",
    label: "Day titles & narrative · day structure",
    level: "ready",
    detail:
      "Day titles and narrative text are editable in V2. Adding/removing days and hotel/transport day-assignment are managed in Classic Builder.",
  })

  // ---- Hotels ----
  const selectedHotels = quote.hotelCities
    .map((c) => c.options.find((o) => o.selected))
    .filter((o): o is NonNullable<typeof o> => Boolean(o))
  const contractOnFile = selectedHotels.filter((h) => h.contractStatus === "contracted").length
  const onRequest = selectedHotels.length - contractOnFile
  const stopsWithoutHotel = quote.hotelCities.filter((c) => !c.options.some((o) => o.selected)).length
  rows.push({
    key: "hotels-contracts",
    section: "Hotels",
    label: "Selection & contracts",
    level: stopsWithoutHotel > 0 || onRequest > 0 ? "review" : "ready",
    detail:
      `${selectedHotels.length} selected · ${contractOnFile} contract on file` +
      (onRequest > 0 ? ` · ${onRequest} on request` : "") +
      (stopsWithoutHotel > 0 ? ` · ${stopsWithoutHotel} stop(s) without a hotel` : ""),
  })
  rows.push({
    key: "hotels-editing",
    section: "Hotels",
    label: "Add / remove · room category · rates",
    level: "classic",
    detail: "Adding/removing hotels and room-category/rate edits are managed in Classic Builder.",
  })

  // ---- Transport ----
  const transportCount = quote.transport.length
  const transportUnresolved = quote.transport.filter((t) => t.priceStatus !== "complete" || t.amount == null).length
  rows.push({
    key: "transport-preview",
    section: "Transport",
    label: "Pricing preview",
    level: "preview",
    detail:
      `Preview only in V2 — all transport edits and apply remain in Classic.` +
      (transportCount > 0 ? ` (${transportCount} service${transportCount === 1 ? "" : "s"})` : ""),
  })
  if (transportUnresolved > 0) {
    rows.push({
      key: "transport-rates",
      section: "Transport",
      label: "Unresolved pricing",
      level: "review",
      detail: `${transportUnresolved} transport line(s) have no resolved rate — resolve in Classic.`,
    })
  }

  // ---- Experiences ----
  const exp = quote.experiences
  const supportedExp = exp.filter((e) => e.isMeal || e.isActivity || e.isGuide || e.isEntrance).length
  rows.push({
    key: "experiences-apply",
    section: "Experiences",
    label: "Meal · Activity · Guide · Entrance / Jordan Pass",
    level: "ready",
    detail:
      `Preview + apply supported in V2` +
      (supportedExp > 0 ? ` (${supportedExp} item${supportedExp === 1 ? "" : "s"})` : "") +
      ". Entrance / Jordan Pass apply is behind its own flag.",
  })
  const externalExp = exp.filter((e) => e.quoteItemId && e.isExternal).length
  const otherExp = exp.filter(
    (e) => e.quoteItemId && !(e.isMeal || e.isActivity || e.isGuide || e.isEntrance || e.isExternal),
  ).length
  if (externalExp > 0) {
    // External packages: read-only pricing PREVIEW when the flag is ON (editing/apply
    // always stay Classic); otherwise Classic/read-only.
    rows.push({
      key: "experiences-external",
      section: "Experiences",
      label: "External packages",
      level: opts.externalPackagePreviewEnabled ? "preview" : "classic",
      detail: opts.externalPackagePreviewEnabled
        ? `${externalExp} package(s): read-only pricing preview in V2. Editing/apply remain Classic.`
        : `${externalExp} package(s) are read-only in V2 — manage in Classic Builder.`,
    })
  }
  if (otherExp > 0) {
    rows.push({
      key: "experiences-other",
      section: "Experiences",
      label: "Other services",
      level: "classic",
      detail: `${otherExp} item(s) are read-only in V2 — manage in Classic Builder.`,
    })
  }

  // ---- Passengers & rooming ----
  const loadError = quote.passengersLoadError || quote.roomingLoadError
  rows.push({
    key: "passengers",
    section: "Passengers & rooming",
    label: "Details & rooming assignments",
    level: loadError ? "review" : "ready",
    detail: loadError
      ? "Could not load passengers/rooming — check in Classic Builder."
      : `${quote.passengers.length} passenger(s) · ${quote.roomingGroups.length} room(s). PII and rooming assignments are editable in V2 (pricing-inert); pax counts that affect pricing stay in Classic.`,
  })

  // ---- Pricing ----
  const components = getComponentStatuses(quote)
  const complete = components.filter((c) => c.status === "complete").length
  const incomplete = components.filter((c) => c.status !== "complete").map((c) => c.label)
  rows.push({
    key: "pricing-components",
    section: "Pricing",
    label: "Cost components",
    level: complete === components.length ? "ready" : "review",
    detail:
      `${complete}/${components.length} complete` + (incomplete.length ? ` · review: ${incomplete.join(", ")}` : ""),
  })
  rows.push({
    key: "pricing-adjustments",
    section: "Pricing",
    label: "Markup · slabs · manual pricing",
    level: "classic",
    detail: "Markup, pricing slabs and manual pricing adjustments are managed in Classic Builder.",
  })

  // ---- Proposal ----
  const pct = getReadiness(quote)
  const canSend = canSendQuote(quote)
  rows.push({
    key: "proposal-send",
    section: "Proposal",
    label: "Send readiness",
    level: canSend ? "ready" : "review",
    detail: canSend
      ? `Readiness ${pct}% — Mark as Sent, PDF and public link are available in V2.`
      : `Readiness ${pct}% — outstanding checklist items to finish before sending.`,
  })

  return { rows, counts: tally(rows) }
}
