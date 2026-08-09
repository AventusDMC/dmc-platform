"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2, X } from "lucide-react"
import { QuoteBuilderV2 } from "../../../../components/quote/v2/quote-builder-v2"
import type { PricingApplyAuditEntry, Quote, VersionReadiness, SavedVersionSummary, VersionSummary, HotelContractSummary } from "../../../../lib/quote-types"
import { getDefaultProposalPreviewHref, getDefaultProposalPdfHref } from "../proposal-paths"

/**
 * Thin client wrapper that owns the side-effecting handlers (save / send /
 * PDF). Wire these to your existing server actions or API routes — the
 * presentational components stay backend-agnostic.
 *
 * Phase A is read-only: `quote` arrives already loaded + normalised from the
 * server (`loadQuoteV2`). The mutating handlers below remain intentionally
 * STUBBED until Phase B/C.
 */
export function BuilderV2Client({
  quote,
  error = null,
  canEditPassengers = false,
  canEditRooming = false,
  canDeletePassenger = false,
  canPreviewPricing = false,
  canViewPricingApplyAudit = false,
  canViewCostMargin = false,
  entrancePricingEnabled = false,
  transportPreviewEnabled = false,
  transportApplyEnabled = false,
  hotelPreviewEnabled = false,
  hotelApplyEnabled = false,
  externalPackagePreviewEnabled = false,
  externalPackageApplyEnabled = false,
  proposalEmailSendEnabled = false,
  itineraryEditEnabled = false,
  canEditItinerary = false,
  itemCreateEnabled = false,
  canAddItem = false,
  canCreateBooking = false,
  canSaveVersion = false,
}: {
  quote: Quote | null
  error?: string | null
  /** Whether the current user's role may update passengers (mirrors backend). */
  canEditPassengers?: boolean
  /** Whether the current user's role may edit rooming assignments (mirrors backend). */
  canEditRooming?: boolean
  /**
   * Whether the current user's role may delete passengers. Intentionally
   * STRICTER than the backend (admin/operations only) for this destructive
   * action; the backend still permits viewer (pre-existing, unchanged).
   */
  canDeletePassenger?: boolean
  /**
   * Whether the current user's role may request the read-only pricing preview
   * (admin/operations). The backend remains the source of truth (flag + role +
   * status); this only avoids showing an affordance that would be blocked.
   */
  canPreviewPricing?: boolean
  /**
   * Whether the current user's role may VIEW the read-only pricing-apply audit
   * (admin/operations). Intentionally NOT tied to editable status — audit history
   * stays visible on SENT/CONFIRMED/finalized quotes. Backend enforces role +
   * quote read access and returns only sanitized fields.
   */
  canViewPricingApplyAudit?: boolean
  /**
   * Whether the current user's role may VIEW sensitive cost/margin figures in the
   * internal V2 builder UI (net cost, markup, margin, per-line cost). Finance V2
   * predicate (admin / super_admin / finance) — narrower than the edit predicates
   * (operations is excluded). Client-facing sell/per-person stay visible to all;
   * the proposal/PDF redaction is the separate client-facing control.
   */
  canViewCostMargin?: boolean
  /**
   * Entrance / Jordan-Pass apply scope (PR #561) — a build-time
   * NEXT_PUBLIC_QUOTE_BUILDER_V2_ENTRANCE_PRICING flag, default OFF. Only widens
   * the apply surface to entrance rows; the backend still enforces its own
   * entrance flags + role + status, so this is a UI affordance gate only.
   */
  entrancePricingEnabled?: boolean
  /**
   * Transport pricing PREVIEW scope — a build-time
   * NEXT_PUBLIC_QUOTE_BUILDER_V2_TRANSPORT_PREVIEW flag, default OFF. When false,
   * transport rows stay fully Classic/read-only. Preview-ONLY (no apply). The
   * backend independently enforces QUOTE_PRICING_TRANSPORT_PREVIEW + role + status,
   * so this is a UI affordance gate only.
   */
  transportPreviewEnabled?: boolean
  /**
   * Transport pricing APPLY scope — Phase T-A (single-leg transfers), a build-time
   * NEXT_PUBLIC_QUOTE_BUILDER_V2_TRANSPORT_APPLY flag, default OFF. When false,
   * transport stays preview-only (no apply control). Apply also requires the
   * transport preview flag. The backend independently enforces
   * QUOTE_PRICING_TRANSPORT_APPLY (+ preview flag) + role + status + single-leg
   * eligibility, so this is a UI affordance gate only — apply is never frontend-trusted.
   */
  transportApplyEnabled?: boolean
  /**
   * Hotel pricing PREVIEW scope — a build-time
   * NEXT_PUBLIC_QUOTE_BUILDER_V2_HOTEL_PREVIEW flag, default OFF. When false,
   * hotel rows stay diagnostics/read-only. Preview-ONLY (no apply). The backend
   * independently enforces QUOTE_PRICING_HOTEL_PREVIEW + role + status, so this is
   * a UI affordance gate only.
   */
  hotelPreviewEnabled?: boolean
  /**
   * Hotel pricing APPLY scope — a build-time
   * NEXT_PUBLIC_QUOTE_BUILDER_V2_HOTEL_APPLY flag, default OFF. When false, hotel
   * rows stay preview-only (no apply control). The backend independently enforces
   * QUOTE_PRICING_HOTEL_APPLY (in addition to the hotel preview flag) + role +
   * status, so this is a UI affordance gate only — apply is never frontend-trusted.
   */
  hotelApplyEnabled?: boolean
  /**
   * External-package read-only pricing preview scope — a build-time
   * NEXT_PUBLIC_QUOTE_BUILDER_V2_EXTERNAL_PACKAGE_PREVIEW flag, default OFF. When
   * false, external-package rows stay Classic/read-only. Preview-ONLY (no apply).
   * The backend independently enforces QUOTE_PRICING_EXTERNAL_PACKAGE_PREVIEW +
   * role + status, so this is a UI affordance gate only.
   */
  externalPackagePreviewEnabled?: boolean
  /**
   * External-package pricing APPLY scope — a build-time
   * NEXT_PUBLIC_QUOTE_BUILDER_V2_EXTERNAL_PACKAGE_APPLY flag, default OFF. When
   * false, external-package rows stay preview-only (no apply control). Apply also
   * requires the external-package preview flag. The backend independently enforces
   * QUOTE_PRICING_EXTERNAL_PACKAGE_APPLY (in addition to the preview flag) + role +
   * status, so this is a UI affordance gate only — apply is never frontend-trusted.
   */
  externalPackageApplyEnabled?: boolean
  /**
   * Proposal email-send affordance — a build-time
   * NEXT_PUBLIC_QUOTE_PROPOSAL_EMAIL_SEND flag, default OFF. When false, the
   * "Send to client" button is hidden. The backend independently enforces
   * QUOTE_PROPOSAL_EMAIL_SEND + role + status (and dry-runs when SMTP is unset),
   * so this is a UI affordance gate only.
   */
  proposalEmailSendEnabled?: boolean
  /**
   * Itinerary day management (Phase B, Slice 1) — a build-time
   * NEXT_PUBLIC_QUOTE_BUILDER_V2_ITINERARY_EDIT flag, default OFF. When false, the
   * itinerary step behaves exactly as before (inline text edit via the shared
   * route; no Add/Delete day). The backend independently enforces QUOTE_ITINERARY_EDIT
   * + role + company + the delete-empty guard, so this is a UI affordance gate only.
   */
  itineraryEditEnabled?: boolean
  /**
   * Whether the current user's role/status may use the V2 itinerary edit surface
   * (admin/operations on an editable status). When false, the Add/Delete/V2-edit
   * handlers are withheld and the step falls back to the existing shared-route text
   * edit. Mirrors the backend V2 routes' @Roles; the backend stays source of truth.
   */
  canEditItinerary?: boolean
  /**
   * Add Activity item (Phase B, Slice 2) — a build-time
   * NEXT_PUBLIC_QUOTE_BUILDER_V2_ITEM_CREATE flag, default OFF. Activity ONLY. When
   * false, the Experiences step is unchanged (no Add affordance). The backend
   * independently enforces QUOTE_ITEM_CREATE + role + company + editable status +
   * activity-only, so this is a UI affordance gate only — creation is never
   * frontend-trusted.
   */
  itemCreateEnabled?: boolean
  /**
   * Whether the current user's role/status may use the V2 add-item surface
   * (admin/operations on an editable status). When false, the add handler is
   * withheld. Mirrors the backend V2 route @Roles; the backend stays source of truth.
   */
  canAddItem?: boolean
  /**
   * Booking Creation V2 (Slice 1D). Server-gated: NEXT_PUBLIC_QUOTE_BOOKING_CREATE +
   * admin/operations + convertible status (ACCEPTED/CONFIRMED). Controls whether the
   * "Create booking" card renders. The backend V2 route re-enforces flag/role/status/
   * accepted-version/duplicate — it stays the source of truth.
   */
  canCreateBooking?: boolean
  /**
   * VV-1 Save-proposal-version affordance. Server-gated: role (admin/viewer/finance)
   * + editable status. Reuses the EXISTING createVersion (POST /quotes/:id/versions);
   * snapshot only — no status change, no invoice, no booking, no send. The backend
   * route stays the source of truth (role + company scope).
   */
  canSaveVersion?: boolean
}) {
  const router = useRouter()

  // Pricing-apply success toast. Lives in this client component (NOT the modal),
  // so it SURVIVES the router.refresh() the apply triggers — the modal can close/
  // re-render and the confirmation is still shown. Visible even on a Δ0 apply.
  // Dismiss-only (no auto-timeout): the confirmation stays until the user closes
  // it, so a successful apply is unmistakable — including a Δ0 apply where nothing
  // else on screen changes.
  const [applyToast, setApplyToast] = useState<{ text: string } | null>(null)

  // VV-2 Slice B: read-only version-readiness advisory state. Fetched from the
  // GET /api/quotes/:id/version-readiness proxy (backend PR #795) on load and after
  // a successful Save version. Advisory only — it NEVER blocks Mark-as-Sent and has
  // no lifecycle/financial effect. Only fetched when the Save-version affordance is
  // available (same role/status gate the backend enforces), to avoid noisy 403s.
  const [versionReadiness, setVersionReadiness] = useState<VersionReadiness | null>(null)
  const [versionReadinessLoading, setVersionReadinessLoading] = useState(false)
  const [versionReadinessError, setVersionReadinessError] = useState<string | null>(null)

  const refreshVersionReadiness = useCallback(async () => {
    if (!quote?.id || !canSaveVersion) return
    setVersionReadinessLoading(true)
    setVersionReadinessError(null)
    try {
      const res = await fetch(`/api/quotes/${quote.id}/version-readiness`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
      })
      if (!res.ok) throw new Error(`version_readiness_failed_${res.status}`)
      const data = (await res.json()) as VersionReadiness
      setVersionReadiness(data)
    } catch {
      // Non-blocking: the advisory simply won't render. Mark-as-Sent is unaffected.
      setVersionReadinessError("Could not check version readiness.")
    } finally {
      setVersionReadinessLoading(false)
    }
  }, [quote?.id, canSaveVersion])

  useEffect(() => {
    void refreshVersionReadiness()
  }, [refreshVersionReadiness])

  // VV-3 Slice 1: read-only "Saved versions" metadata list. Uses the hardened
  // GET /api/quotes/:id/versions list route (metadata only — never the raw detail
  // endpoint, never snapshotJson). Fetched on load (only when the Save-version
  // affordance is available, matching the backend role gate) and refreshed after a
  // successful Save version. Read-only; no lifecycle side effects.
  const [savedVersions, setSavedVersions] = useState<SavedVersionSummary[]>([])
  const [savedVersionsLoading, setSavedVersionsLoading] = useState(false)
  const [savedVersionsError, setSavedVersionsError] = useState<string | null>(null)

  const refreshSavedVersions = useCallback(async () => {
    if (!quote?.id || !canSaveVersion) return
    setSavedVersionsLoading(true)
    setSavedVersionsError(null)
    try {
      const res = await fetch(`/api/quotes/${quote.id}/versions`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
      })
      if (!res.ok) throw new Error(`saved_versions_failed_${res.status}`)
      const data = (await res.json()) as unknown
      // Defensive: map to METADATA ONLY (never surface snapshotJson even if present).
      const rows: SavedVersionSummary[] = Array.isArray(data)
        ? data.map((r: any) => ({
            id: String(r?.id ?? ""),
            versionNumber: typeof r?.versionNumber === "number" ? r.versionNumber : 0,
            label: typeof r?.label === "string" ? r.label : null,
            createdAt: typeof r?.createdAt === "string" ? r.createdAt : null,
          }))
        : []
      setSavedVersions(rows)
    } catch {
      setSavedVersionsError("Could not load saved versions.")
    } finally {
      setSavedVersionsLoading(false)
    }
  }, [quote?.id, canSaveVersion])

  useEffect(() => {
    void refreshSavedVersions()
  }, [refreshSavedVersions])

  // PHASE B: replace with your "save draft" server action / API call.
  const handleSave = async (q: Quote) => {
    console.log("[v0] save draft (stub)", q.id)
    await new Promise((r) => setTimeout(r, 600))
  }

  // "Mark as Sent" — reuse the EXISTING status endpoint to move the quote to
  // SENT. This is a status-only change: it does NOT email the client, attach a
  // PDF, or create a public proposal link. The backend sets sentAt + writes an
  // audit log and independently enforces completeness (rejects with 400 if the
  // quote isn't ready). Throws with the backend message so the UI can show it;
  // refreshes V2 data on success. No new endpoint / no backend change.
  const handleSend = async (q: Quote) => {
    const res = await fetch(`/api/quotes/${q.id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "SENT" }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => "")
      let message = body
      try {
        const parsed = JSON.parse(body)
        message = Array.isArray(parsed?.message)
          ? parsed.message.join("; ")
          : parsed?.message || body
      } catch {
        // non-JSON body — use raw text
      }
      throw new Error(message?.slice(0, 300) || `Could not mark the quote as sent (${res.status}).`)
    }
    router.refresh()
  }

  // VV-1: save a proposal VERSION (snapshot) via the existing createVersion proxy
  // (POST /api/quotes/:id/versions → POST /quotes/:id/versions). This is a snapshot
  // ONLY — the backend does NOT change status, create an invoice, mark sent, accept,
  // or convert to booking. Returns the new versionNumber for the success state.
  const handleSaveVersion = async (q: Quote, label?: string): Promise<{ versionNumber?: number | null }> => {
    const res = await fetch(`/api/quotes/${q.id}/versions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(label ? { label } : {}),
    })
    const text = await res.text().catch(() => "")
    let parsed: any = null
    try {
      parsed = text ? JSON.parse(text) : null
    } catch {
      // non-JSON body
    }
    if (!res.ok) {
      const message = Array.isArray(parsed?.message) ? parsed.message.join("; ") : parsed?.message || text
      throw new Error(message?.slice(0, 300) || `Could not save the proposal version (${res.status}).`)
    }
    // VV-2/VV-3: refresh the readiness advisory + the saved-versions list after a
    // successful save (fire-and-forget so the caller still gets the version number
    // promptly). Only runs on success.
    void refreshVersionReadiness()
    void refreshSavedVersions()
    return { versionNumber: typeof parsed?.versionNumber === "number" ? parsed.versionNumber : null }
  }

  // VV-3 Slice 2B: fetch ONE version's SAFE summary via the Slice 2A proxy
  // (GET /api/quotes/:id/versions/:versionId/summary → GET /quotes/:id/versions/:versionId/summary).
  // This is the ONLY version-detail read path used by V2 — the raw detail endpoint
  // (/versions/:versionId, which returns snapshotJson) is never called here. The
  // payload is already whitelist-curated + cost-gated by the backend; the drawer
  // renders it verbatim (never snapshotJson). Read-only.
  const handleViewVersionSummary = async (q: Quote, versionId: string): Promise<VersionSummary> => {
    const res = await fetch(`/api/quotes/${q.id}/versions/${versionId}/summary`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    })
    const text = await res.text().catch(() => "")
    let parsed: any = null
    try {
      parsed = text ? JSON.parse(text) : null
    } catch {
      // non-JSON body
    }
    if (!res.ok) {
      const message = Array.isArray(parsed?.message) ? parsed.message.join("; ") : parsed?.message || text
      throw new Error(message?.slice(0, 300) || `Could not load the version summary (${res.status}).`)
    }
    return parsed as VersionSummary
  }

  // HC-2: fetch ONE priced hotel line's SAFE contract/rate summary via the HC-1/HC-1A
  // proxy (GET /api/quotes/:id/v2/items/:itemId/hotel-contract-summary → GET
  // /quotes/:id/v2/items/:itemId/hotel-contract-summary). This is the ONLY hotel
  // contract read path used by V2 — no raw hotel/contract/rate endpoint is called.
  // The payload is already whitelist-curated + cost-gated by the backend; the drawer
  // renders it verbatim (never raw objects/JSON). Read-only.
  const handleViewHotelContract = async (q: Quote, itemId: string): Promise<HotelContractSummary> => {
    const res = await fetch(`/api/quotes/${q.id}/v2/items/${itemId}/hotel-contract-summary`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    })
    const text = await res.text().catch(() => "")
    let parsed: any = null
    try {
      parsed = text ? JSON.parse(text) : null
    } catch {
      // non-JSON body
    }
    if (!res.ok) {
      const message = Array.isArray(parsed?.message) ? parsed.message.join("; ") : parsed?.message || text
      throw new Error(message?.slice(0, 300) || `Could not load the hotel contract summary (${res.status}).`)
    }
    return parsed as HotelContractSummary
  }

  // Send the proposal email to the client (PR #576 UI → PR #575 backend).
  // POSTs the proxy; returns the backend result verbatim so the modal can show
  // feature_disabled / dry-run / delivered / failure. Status-only "Mark as Sent"
  // is unchanged and separate. The backend enforces flag + role + status and
  // dry-runs when SMTP is unset — nothing here assumes real delivery.
  const handleSendProposalEmail = async (
    q: Quote,
    opts?: { attachPdf?: boolean },
  ): Promise<{
    sent?: boolean
    dryRun?: boolean
    delivered?: boolean
    blocked?: boolean
    blockedReason?: string | null
    recipient?: string | null
    messageId?: string | null
  }> => {
    const res = await fetch(`/api/quotes/${q.id}/send-proposal-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attachPdf: opts?.attachPdf === true }),
    })
    const body = await res.json().catch(() => null)
    if (!res.ok && !body) {
      throw new Error(`Could not send the proposal email (${res.status}).`)
    }
    return body ?? {}
  }

  // Set the primary hotel for an option-set via the EXISTING endpoint:
  // PATCH /api/quotes/:id/options/:optionId/hotel-options/:hotelOptionId { isPrimary: true }
  // (backend transactionally demotes the other same-city options). This is a
  // proposal-display choice — the backend does NOT recalculate pricing here.
  // No new endpoint, no schema/pricing change. Throws on failure so the Hotels
  // step can surface an error; refreshes the route on success.
  const handleSetPrimaryHotel = async (optionId: string, hotelOptionId: string) => {
    if (!quote) return
    const res = await fetch(
      `/api/quotes/${quote.id}/options/${optionId}/hotel-options/${hotelOptionId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPrimary: true }),
      },
    )
    if (!res.ok) {
      const body = await res.text().catch(() => "")
      throw new Error(body?.slice(0, 200) || `Could not set primary hotel (${res.status}).`)
    }
    router.refresh()
  }

  // Update a quote item's CLIENT-FACING display text via the pricing-inert
  // endpoint: PATCH /api/quotes/:id/items/:itemId/display-text. Only whitelisted
  // text fields (external-package text + transport route label) are forwarded;
  // the backend never re-prices. Throws the backend message on failure so the
  // inline editor can surface it; refreshes the route on success.
  const handleUpdateDisplayText = async (quoteItemId: string, patch: Record<string, string | null>) => {
    if (!quote) return
    const res = await fetch(`/api/quotes/${quote.id}/items/${quoteItemId}/display-text`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => "")
      let message = body
      try {
        const parsed = JSON.parse(body)
        message = Array.isArray(parsed?.message)
          ? parsed.message.join("; ")
          : parsed?.message || body
      } catch {
        // non-JSON body — use raw text
      }
      throw new Error(message?.slice(0, 300) || `Could not save client text (${res.status}).`)
    }
    router.refresh()
  }

  // Update an EXISTING passenger's PII via the EXISTING endpoint:
  // PATCH /api/quotes/:id/passengers/:passengerId. Pricing-inert — the backend
  // passenger update does NOT recalculate the quote. Only whitelisted PII fields
  // are sent (no pax/room counts, no rooming, no pricing). Throws the backend
  // message on failure so the inline editor can surface it; refreshes on success.
  const handleUpdatePassenger = async (passengerId: string, patch: Record<string, string | null>) => {
    if (!quote) return
    const res = await fetch(`/api/quotes/${quote.id}/passengers/${passengerId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => "")
      let message = body
      try {
        const parsed = JSON.parse(body)
        message = Array.isArray(parsed?.message) ? parsed.message.join("; ") : parsed?.message || body
      } catch {
        // non-JSON body — use raw text
      }
      throw new Error(message?.slice(0, 300) || `Could not save passenger details (${res.status}).`)
    }
    router.refresh()
  }

  // Add a NEW passenger via the EXISTING endpoint: POST /api/quotes/:id/passengers.
  // Pricing-inert — createPassenger does NOT recalculate, and this never changes
  // the quote's priced pax count (adults/children). Throws on failure; refreshes
  // on success.
  const handleAddPassenger = async (patch: Record<string, string | null>) => {
    if (!quote) return
    const res = await fetch(`/api/quotes/${quote.id}/passengers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => "")
      let message = body
      try {
        const parsed = JSON.parse(body)
        message = Array.isArray(parsed?.message) ? parsed.message.join("; ") : parsed?.message || body
      } catch {
        // non-JSON body
      }
      throw new Error(message?.slice(0, 300) || `Could not add passenger (${res.status}).`)
    }
    router.refresh()
  }

  // Delete an EXISTING passenger via the EXISTING endpoint:
  // DELETE /api/quotes/:id/passengers/:passengerId. Pricing-inert — removePassenger
  // does NOT recalculate and never changes priced pax (adults/children). The
  // backend cascade also removes the passenger's rooming assignment (no separate
  // unassign call). Throws on failure; refreshes on success.
  const handleDeletePassenger = async (passengerId: string) => {
    if (!quote) return
    const res = await fetch(`/api/quotes/${quote.id}/passengers/${passengerId}`, { method: "DELETE" })
    if (!res.ok) {
      const body = await res.text().catch(() => "")
      let message = body
      try {
        const parsed = JSON.parse(body)
        message = Array.isArray(parsed?.message) ? parsed.message.join("; ") : parsed?.message || body
      } catch {
        // non-JSON body
      }
      throw new Error(message?.slice(0, 300) || `Could not delete passenger (${res.status}).`)
    }
    router.refresh()
  }

  // Assign an EXISTING passenger to an EXISTING rooming group via the EXISTING
  // endpoint: POST /api/quotes/:id/rooming/:roomingGroupId/assignments
  // { quotePassengerId }. Pricing-inert — no recalculation. Throws on failure;
  // refreshes on success.
  const handleAssignRoom = async (roomingGroupId: string, passengerId: string) => {
    if (!quote) return
    const res = await fetch(`/api/quotes/${quote.id}/rooming/${roomingGroupId}/assignments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quotePassengerId: passengerId }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => "")
      let message = body
      try {
        const parsed = JSON.parse(body)
        message = Array.isArray(parsed?.message) ? parsed.message.join("; ") : parsed?.message || body
      } catch {
        // non-JSON body
      }
      throw new Error(message?.slice(0, 300) || `Could not assign passenger to room (${res.status}).`)
    }
    router.refresh()
  }

  // Unassign an EXISTING passenger from an EXISTING rooming group via the
  // EXISTING endpoint: DELETE /api/quotes/:id/rooming/:roomingGroupId/assignments/:passengerId.
  // Pricing-inert — no recalculation. Throws on failure; refreshes on success.
  const handleUnassignRoom = async (roomingGroupId: string, passengerId: string) => {
    if (!quote) return
    const res = await fetch(
      `/api/quotes/${quote.id}/rooming/${roomingGroupId}/assignments/${passengerId}`,
      { method: "DELETE" },
    )
    if (!res.ok) {
      const body = await res.text().catch(() => "")
      throw new Error(body?.slice(0, 200) || `Could not remove passenger from room (${res.status}).`)
    }
    router.refresh()
  }

  // ── Itinerary day management (Phase B, Slice 1) — V2-scoped, pricing-inert ────
  // These call the NEW V2 routes under /api/quotes/:id/v2/itinerary/day[...], which
  // the backend gates behind QUOTE_ITINERARY_EDIT (fail-closed) + admin/operations +
  // the delete-empty rule. They NEVER recalculate the quote total and never touch
  // item pricing. Errors are surfaced with a safe message (feature_disabled /
  // day_not_empty are mapped to friendly text); the route is refreshed on success.
  const readEditError = async (res: Response, fallback: string) => {
    const body = await res.text().catch(() => "")
    let code: string | null = null
    let message = body
    try {
      const parsed = JSON.parse(body)
      code = typeof parsed?.code === "string" ? parsed.code : null
      message = Array.isArray(parsed?.message) ? parsed.message.join("; ") : parsed?.message || body
    } catch {
      // non-JSON body — use raw text
    }
    if (code === "day_not_empty") return "Move or remove items before deleting this day."
    if (code === "feature_disabled") return "Itinerary editing is not available."
    return message?.slice(0, 300) || fallback
  }

  const handleAddDay = async (patch: Record<string, string | null>) => {
    if (!quote) return
    const res = await fetch(`/api/quotes/${quote.id}/v2/itinerary/day`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch ?? {}),
    })
    if (!res.ok) throw new Error(await readEditError(res, `Could not add a day (${res.status}).`))
    router.refresh()
  }

  const handleEditDay = async (dayId: string, patch: Record<string, string | null>) => {
    if (!quote) return
    const res = await fetch(`/api/quotes/${quote.id}/v2/itinerary/day/${dayId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    })
    if (!res.ok) throw new Error(await readEditError(res, `Could not save the day (${res.status}).`))
    router.refresh()
  }

  const handleDeleteDay = async (dayId: string) => {
    if (!quote) return
    const res = await fetch(`/api/quotes/${quote.id}/v2/itinerary/day/${dayId}`, { method: "DELETE" })
    if (!res.ok) throw new Error(await readEditError(res, `Could not delete the day (${res.status}).`))
    router.refresh()
  }

  // ── Add Activity item (Phase B, Slice 2) — V2-scoped ─────────────────────────
  // Creates ONE activity item via the NEW V2 route
  // POST /api/quotes/:id/v2/experiences/item, which the backend gates behind
  // QUOTE_ITEM_CREATE (fail-closed) + admin/operations + activity-only + editable
  // status. It reuses the existing createItem + recalculation (pricing is never
  // forked here). On success it shows the persistent toast (with the new quote
  // total, if returned) and refreshes the route. Errors surface a safe message.
  // Maps the guarded add-activity backend codes (Slice 2B-1) to safe, client-facing
  // messages. Never surfaces cost/margin — only role-safe guidance (PR #766/#767).
  const addItemErrorMessage = (code: unknown, parsed: any, text: string, status: number): string => {
    switch (code) {
      case "feature_disabled":
        return "Adding items from V2 is not available."
      case "out_of_scope":
        return "Only activities and guides can be added from V2 in this version."
      case "missing_field":
        return "Please fill in all required fields before previewing."
      case "service_not_found":
        return "The selected service could not be found. Please pick another."
      case "not_guide_service":
        return "The selected service is not a guide service. Please pick a guide service."
      case "invalid_preview_token":
        return "This preview expired. Please preview the item again."
      case "stale_preview":
        return "The quote changed since the preview. Please preview the item again."
      case "not_resolvable":
        return "Pricing isn’t available for this item right now. Try another selection or use Classic."
      case "confirmation_required":
        return "Please confirm the projected price before adding."
      case "rate_changed":
        return "Pricing changed since the preview; nothing was added. Please preview again."
      case "compensation_failed":
        return "Pricing drifted and the automatic rollback failed. Please review this quote in Classic."
      default: {
        const message = Array.isArray(parsed?.message) ? parsed.message.join("; ") : parsed?.message || text
        return message?.slice(0, 300) || `Could not add the item (${status}).`
      }
    }
  }

  // Slice 2B-2 step 1 — READ-ONLY create-preview. Projects the activity's price and
  // returns a signed previewToken the create call must replay. No writes. Returns
  // the projected CLIENT-SAFE selling price only (cost/margin are never shown here).
  const handlePreviewAddItem = async (payload: Record<string, unknown>) => {
    if (!quote) throw new Error("Quote is not loaded.")
    const res = await fetch(`/api/quotes/${quote.id}/v2/experiences/item/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload ?? {}),
    })
    const text = await res.text().catch(() => "")
    let parsed: any = null
    try {
      parsed = text ? JSON.parse(text) : null
    } catch {
      // non-JSON body
    }
    if (!res.ok) {
      throw new Error(addItemErrorMessage(parsed?.code, parsed, text, res.status))
    }
    return parsed as { projected?: { sell?: number; currency?: string | null }; previewToken?: string }
  }

  // Slice 2B-2 step 2 — guarded create. Replays the previewToken + acknowledgedDelta
  // from the confirmed preview. The backend re-verifies the token + snapshot and, on
  // drift, compensates (rate_changed). On success shows a CLIENT-SAFE toast (selling
  // total only) and refreshes.
  const handleAddItem = async (
    payload: Record<string, unknown>,
    previewToken?: string,
    acknowledgedDelta?: boolean,
  ) => {
    if (!quote) return
    const res = await fetch(`/api/quotes/${quote.id}/v2/experiences/item`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...(payload ?? {}), previewToken, acknowledgedDelta: acknowledgedDelta === true }),
    })
    const text = await res.text().catch(() => "")
    let parsed: any = null
    try {
      parsed = text ? JSON.parse(text) : null
    } catch {
      // non-JSON body
    }
    if (!res.ok) {
      throw new Error(addItemErrorMessage(parsed?.code, parsed, text, res.status))
    }
    const after = parsed?.quote
    setApplyToast({
      text:
        after && typeof after.totalSell === "number"
          ? `Activity added successfully. Quote selling total is now ${Math.round(after.totalSell)}.`
          : "Activity added successfully.",
    })
    router.refresh()
    return parsed
  }

  // Share / public proposal link — reuse the EXISTING public-link endpoints.
  // Enable/disable only mutate the quote's public* fields (no status change, no
  // email, no audit). Each returns the new {publicEnabled, publicToken} so the
  // Proposal step can update its Share state immediately (Copy works without a
  // full reload). Throws the backend message on failure.
  const postPublicLink = async (q: Quote, action: "enable" | "disable") => {
    const res = await fetch(`/api/quotes/${q.id}/${action}-public-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    })
    if (!res.ok) {
      const body = await res.text().catch(() => "")
      let message = body
      try {
        const parsed = JSON.parse(body)
        message = Array.isArray(parsed?.message)
          ? parsed.message.join("; ")
          : parsed?.message || body
      } catch {
        // non-JSON body — use raw text
      }
      throw new Error(message?.slice(0, 300) || `Could not ${action} the public link (${res.status}).`)
    }
    const data = await res.json().catch(() => ({}))
    return {
      publicEnabled: Boolean(data?.publicEnabled),
      publicToken: typeof data?.publicToken === "string" ? data.publicToken : null,
    }
  }
  const handleEnablePublicLink = (q: Quote) => postPublicLink(q, "enable")
  const handleDisablePublicLink = (q: Quote) => postPublicLink(q, "disable")

  // READ-ONLY dry-run pricing preview for an existing item edit via the
  // feature-flagged endpoint: POST /api/quotes/:id/items/:itemId/preview. It
  // persists nothing and never recalculates the live quote — the backend
  // returns a structured projection (or a blocked/feature_disabled response).
  // This is NOT an apply: no PATCH/POST/DELETE item mutation is ever called here.
  const handlePreviewItem = async (quoteItemId: string, payload: Record<string, unknown>) => {
    if (!quote) throw new Error("Quote is not loaded.")
    const res = await fetch(`/api/quotes/${quote.id}/items/${quoteItemId}/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload ?? {}),
    })
    const text = await res.text().catch(() => "")
    let parsed: any = null
    try {
      parsed = text ? JSON.parse(text) : null
    } catch {
      // non-JSON body
    }
    if (!res.ok) {
      const message = Array.isArray(parsed?.message)
        ? parsed.message.join("; ")
        : parsed?.message || text
      throw new Error(message?.slice(0, 300) || `Could not preview pricing (${res.status}).`)
    }
    return parsed
  }

  // APPLY a previously-previewed MEAL edit via the dedicated apply-preview proxy.
  // Sends the SAME payload used for the preview + previewToken + acknowledgedDelta.
  // This is the ONLY write path used by the meal UI — no PATCH/DELETE item calls.
  // On a 2xx it returns the apply result (which may be {available:false,...} when
  // the feature is disabled); on a 4xx it throws with the backend machine code
  // (e.g. stale_preview, payload_mismatch, token_secret_not_configured) so the
  // modal can map it to a message. Refreshes V2 data on a successful apply.
  const handleApplyItemPricing = async (
    quoteItemId: string,
    payload: Record<string, unknown>,
    previewToken: string,
    acknowledgedDelta: boolean,
  ) => {
    if (!quote) throw new Error("Quote is not loaded.")
    const res = await fetch(`/api/quotes/${quote.id}/items/${quoteItemId}/apply-preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, previewToken, acknowledgedDelta }),
    })
    const text = await res.text().catch(() => "")
    let parsed: any = null
    try {
      parsed = text ? JSON.parse(text) : null
    } catch {
      // non-JSON body
    }
    if (!res.ok) {
      const code = parsed?.code || (Array.isArray(parsed?.message) ? parsed.message.join("; ") : parsed?.message) || `apply_failed_${res.status}`
      throw new Error(code)
    }
    if (parsed?.applied) {
      // Show a persistent (dismiss-only) success toast BEFORE refreshing. The
      // toast state lives in this client component (survives router.refresh), so
      // it stays visible even when the apply was a no-op (Δ0) and even after the
      // modal closes — making a successful apply unmistakable.
      const after = parsed?.quote?.after
      setApplyToast({
        text:
          after && typeof after.totalCost === "number" && typeof after.totalSell === "number"
            ? `Pricing applied successfully. Quote total is now ${Math.round(after.totalCost)} cost / ${Math.round(after.totalSell)} sell.`
            : "Pricing applied successfully.",
      })
      router.refresh()
    }
    return parsed
  }

  // Load the read-only `quote.pricing.apply` audit history for this quote via the
  // same-origin proxy (cookie auth; backend is admin/operations + quote-scoped and
  // returns sanitized fields only — no tokens/secrets). Throws on a non-2xx so the
  // panel can show its own non-blocking message; never mutates the quote.
  const handleLoadApplyAudit = async (): Promise<PricingApplyAuditEntry[]> => {
    if (!quote) throw new Error("Quote is not loaded.")
    const res = await fetch(`/api/quotes/${quote.id}/pricing-apply-audit`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    })
    if (!res.ok) throw new Error(`apply_audit_failed_${res.status}`)
    return (await res.json()) as PricingApplyAuditEntry[]
  }

  // Preview ONLY: open the existing proposal-v3 HTML preview in a new tab, in the
  // selected language. Reuses the canonical helper + same-origin authenticated
  // proxy (/api/quotes/:id/proposal-v3/html). No PDF generated, nothing sent.
  const handlePreview = (q: Quote, language: string) => {
    const href = getDefaultProposalPreviewHref(q.id, language)
    window.open(href, "_blank", "noopener,noreferrer")
  }

  // Download the existing proposal-v3 PDF in the selected language via the
  // same-origin /api proxy (cookie auth). Read-only render — nothing persisted,
  // no email. Throws on failure so the Proposal step can show an error.
  const handleDownloadPdf = async (q: Quote, language: string) => {
    const res = await fetch(getDefaultProposalPdfHref("/api", q.id, language))
    const contentType = res.headers.get("content-type") || ""
    if (!res.ok || !contentType.toLowerCase().includes("application/pdf")) {
      const body = await res.text().catch(() => "")
      throw new Error(body.slice(0, 200) || `Could not download PDF (${res.status}).`)
    }
    const blob = await res.blob()
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement("a")
    const suffix = language && language !== "en" ? `-${language}` : ""
    link.href = url
    link.download = `quote-${q.id}${suffix}.pdf`
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(url)
  }

  return (
    <>
      {applyToast ? (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-4 right-4 z-[60] flex max-w-sm items-start gap-2 rounded-lg border border-border bg-background px-4 py-3 text-sm text-foreground shadow-lg"
        >
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
          <span className="min-w-0 flex-1">{applyToast.text}</span>
          <button
            type="button"
            onClick={() => setApplyToast(null)}
            aria-label="Dismiss"
            className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="size-3.5" aria-hidden="true" />
          </button>
        </div>
      ) : null}
      <QuoteBuilderV2
      quote={quote}
      error={error}
      onRetry={() => router.refresh()}
      onSave={handleSave}
      onSend={handleSend}
      onSaveVersion={canSaveVersion ? (label?: string) => handleSaveVersion(quote!, label) : undefined}
      canSaveVersion={canSaveVersion}
      versionReadiness={versionReadiness}
      versionReadinessLoading={versionReadinessLoading}
      versionReadinessError={versionReadinessError}
      savedVersions={savedVersions}
      savedVersionsLoading={savedVersionsLoading}
      savedVersionsError={savedVersionsError}
      onViewVersion={canSaveVersion ? (versionId: string) => handleViewVersionSummary(quote!, versionId) : undefined}
      onDownloadPdf={handleDownloadPdf}
      onPreview={handlePreview}
      onSetPrimaryHotel={handleSetPrimaryHotel}
      onUpdateDisplayText={handleUpdateDisplayText}
      onPreviewItem={canPreviewPricing ? handlePreviewItem : undefined}
      onApplyItemPricing={canPreviewPricing ? handleApplyItemPricing : undefined}
      onViewHotelContract={(itemId: string) => handleViewHotelContract(quote!, itemId)}
      transportPreviewEnabled={canPreviewPricing && transportPreviewEnabled}
      transportApplyEnabled={canPreviewPricing && transportPreviewEnabled && transportApplyEnabled}
      hotelPreviewEnabled={canPreviewPricing && hotelPreviewEnabled}
      hotelApplyEnabled={canPreviewPricing && hotelPreviewEnabled && hotelApplyEnabled}
      externalPackagePreviewEnabled={canPreviewPricing && externalPackagePreviewEnabled}
      externalPackageApplyEnabled={canPreviewPricing && externalPackagePreviewEnabled && externalPackageApplyEnabled}
      onLoadApplyAudit={canViewPricingApplyAudit ? handleLoadApplyAudit : undefined}
      canViewCostMargin={canViewCostMargin}
      entrancePricingEnabled={canPreviewPricing && entrancePricingEnabled}
      onUpdatePassenger={canEditPassengers ? handleUpdatePassenger : undefined}
      onAddPassenger={canEditPassengers ? handleAddPassenger : undefined}
      onDeletePassenger={canDeletePassenger ? handleDeletePassenger : undefined}
      onAssignRoom={canEditRooming ? handleAssignRoom : undefined}
      onUnassignRoom={canEditRooming ? handleUnassignRoom : undefined}
      onEnablePublicLink={handleEnablePublicLink}
      onDisablePublicLink={handleDisablePublicLink}
      itineraryEditEnabled={canEditItinerary && itineraryEditEnabled}
      onAddDay={canEditItinerary ? handleAddDay : undefined}
      onEditDay={canEditItinerary ? handleEditDay : undefined}
      onDeleteDay={canEditItinerary ? handleDeleteDay : undefined}
      itemCreateEnabled={canAddItem && itemCreateEnabled}
      onPreviewAddItem={canAddItem ? handlePreviewAddItem : undefined}
      onAddItem={canAddItem ? handleAddItem : undefined}
      canCreateBooking={canCreateBooking}
      proposalEmailSendEnabled={proposalEmailSendEnabled}
      onSendProposalEmail={
        proposalEmailSendEnabled && canViewPricingApplyAudit
          ? (opts?: { attachPdf?: boolean }) => handleSendProposalEmail(quote!, opts)
          : undefined
      }
      initialStep="hotels"
      />
    </>
  )
}
