import type { Metadata } from "next"
import { cookies } from "next/headers"
import { BuilderV2Client } from "./builder-v2-client"
import { loadQuoteV2 } from "../../../../lib/quote-v2-adapter"
import { readSessionActor, hasRequiredRole } from "../../../lib/auth-session"

export const metadata: Metadata = {
  title: "Quote Builder V2 — Aventus DMC",
}

/**
 * Route-ready entry point for the redesigned Quote Builder.
 *
 * Data loading + ERP→UI normalisation now lives in `loadQuoteV2` (see
 * `@/lib/quote-v2-adapter`). The actual ERP fetch is the Phase B integration
 * point inside that file; this page stays a thin server shell that forwards
 * the normalised quote (or error) to the client wrapper.
 */
export default async function QuoteBuilderV2Page({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { quote, error } = await loadQuoteV2(id)

  // Frontend permission guard for the passenger Edit affordance — reuses the
  // existing session-role signal (same as app/template.tsx). Mirrors the backend
  // PATCH /quotes/:id/passengers/:passengerId @Roles('admin','operations','viewer')
  // (hasRequiredRole also grants super_admin always + agent_admin when 'admin' is
  // allowed). Users who can open V2 but cannot update passengers (e.g. finance,
  // agent) see the passengers read-only — no misleading Edit button. The backend
  // remains the source of truth; this only avoids a button that would 403.
  const sessionToken = (await cookies()).get("dmc_session")?.value || ""
  const role = readSessionActor(sessionToken)?.role ?? null
  const canEditPassengers = hasRequiredRole(role, ["admin", "operations", "viewer"])
  // Rooming assignment endpoints share the same backend @Roles set as passengers.
  const canEditRooming = hasRequiredRole(role, ["admin", "operations", "viewer"])
  // Passenger DELETE is destructive — intentionally STRICTER than the backend
  // (admin/operations only; backend still allows viewer, pre-existing/unchanged).
  const canDeletePassenger = hasRequiredRole(role, ["admin", "operations"])

  // Read-only pricing preview affordance — admin/operations only (mirrors the
  // backend POST /quotes/:id/items/:itemId/preview @Roles). Additionally gated by
  // an editable-status allowlist so the affordance is hidden on finalized/unknown
  // statuses (default-safe). The backend independently enforces flag + role +
  // status and returns a blocked/feature_disabled response regardless.
  const PREVIEW_EDITABLE_STATUSES = new Set(["DRAFT", "READY", "REVISION_REQUESTED"])
  const quoteStatusCode = (quote?.meta?.statusCode ?? "").toUpperCase()
  const canPreviewPricing =
    hasRequiredRole(role, ["admin", "operations"]) && PREVIEW_EDITABLE_STATUSES.has(quoteStatusCode)

  // Read-only pricing-apply AUDIT viewing is intentionally NOT tied to editability.
  // Audit history must stay visible after a quote is SENT/CONFIRMED/finalized so
  // management can review what was applied — gating it on canPreviewPricing would
  // hide it exactly when review matters. Mirrors the backend GET
  // /quotes/:id/pricing-apply-audit @Roles('admin','operations'); the backend also
  // enforces quote read access and returns only sanitized fields. No status gate.
  const canViewPricingApplyAudit = hasRequiredRole(role, ["admin", "operations"])

  // Entrance / Jordan-Pass apply scope (PR #561) — a separate, build-time public
  // flag, default OFF. When not 'true', entrance rows stay read-only even for
  // apply-capable staff. The backend independently enforces its own entrance
  // flags + role + status, so this only controls the UI affordance.
  const entrancePricingEnabled = process.env.NEXT_PUBLIC_QUOTE_BUILDER_V2_ENTRANCE_PRICING === 'true'

  // Transport pricing PREVIEW scope — a separate, build-time public flag, default
  // OFF. When not 'true', transport rows stay fully Classic/read-only (no preview
  // affordance). This is preview-ONLY (no apply). The backend independently enforces
  // its own QUOTE_PRICING_TRANSPORT_PREVIEW flag + role + status and blocks transport
  // preview as out-of-scope when its flag is OFF, so this only controls the UI.
  const transportPreviewEnabled = process.env.NEXT_PUBLIC_QUOTE_BUILDER_V2_TRANSPORT_PREVIEW === 'true'

  // Transport pricing APPLY scope — Phase T-A (standalone single-leg transfers), a
  // separate, build-time public flag, default OFF. When not 'true', transport rows
  // stay preview-only (no apply control). Apply also requires the transport PREVIEW
  // flag. The backend independently enforces QUOTE_PRICING_TRANSPORT_APPLY (+ preview
  // flag) + role + status + per-item single-leg eligibility and rejects everything
  // else out-of-scope, so this only controls the UI affordance.
  const transportApplyEnabled = process.env.NEXT_PUBLIC_QUOTE_BUILDER_V2_TRANSPORT_APPLY === 'true'

  // Hotel pricing PREVIEW scope — a separate, build-time public flag, default OFF.
  // When not 'true', hotel rows stay diagnostics/read-only (no preview affordance).
  // Preview-ONLY (no apply). The backend independently enforces its own
  // QUOTE_PRICING_HOTEL_PREVIEW flag + role + status and blocks hotel preview as
  // out-of-scope when its flag is OFF, so this only controls the UI affordance.
  const hotelPreviewEnabled = process.env.NEXT_PUBLIC_QUOTE_BUILDER_V2_HOTEL_PREVIEW === 'true'

  // Hotel pricing APPLY scope — a separate, build-time public flag, default OFF.
  // When not 'true', hotel rows stay preview-only (no apply control). Apply also
  // requires the hotel PREVIEW flag (the apply UI needs a preview token). The
  // backend independently enforces its own QUOTE_PRICING_HOTEL_APPLY flag (in
  // addition to the hotel preview flag) + role + status and rejects hotel apply
  // as out-of-scope when its flag is OFF, so this only controls the UI affordance.
  const hotelApplyEnabled = process.env.NEXT_PUBLIC_QUOTE_BUILDER_V2_HOTEL_APPLY === 'true'

  // External-package read-only pricing preview scope — a separate, build-time public
  // flag, default OFF. When not 'true', external-package rows stay Classic/read-only.
  // Preview-ONLY (no apply). The backend independently enforces its own
  // QUOTE_PRICING_EXTERNAL_PACKAGE_PREVIEW flag + role + status.
  const externalPackagePreviewEnabled = process.env.NEXT_PUBLIC_QUOTE_BUILDER_V2_EXTERNAL_PACKAGE_PREVIEW === 'true'

  // External-package pricing APPLY scope — a separate, build-time public flag,
  // default OFF. When not 'true', external-package rows stay preview-only (no apply
  // control). Apply also requires the external-package PREVIEW flag (the apply UI
  // needs a preview token). The backend independently enforces its own
  // QUOTE_PRICING_EXTERNAL_PACKAGE_APPLY flag (in addition to the preview flag) +
  // role + status and rejects external apply as out-of-scope when its flag is OFF,
  // so this only controls the UI affordance.
  const externalPackageApplyEnabled = process.env.NEXT_PUBLIC_QUOTE_BUILDER_V2_EXTERNAL_PACKAGE_APPLY === 'true'

  // Proposal email-send affordance — a separate, build-time public flag, default
  // OFF. When not 'true', the "Send to client" button is hidden. The backend
  // independently enforces QUOTE_PROPOSAL_EMAIL_SEND + role + status and returns a
  // blocked response otherwise, so this only controls the UI affordance.
  const proposalEmailSendEnabled = process.env.NEXT_PUBLIC_QUOTE_PROPOSAL_EMAIL_SEND === 'true'

  // Itinerary day management (Phase B, Slice 1) — a separate, build-time public
  // flag, default OFF. When not 'true', the itinerary step behaves exactly as
  // before (inline title/notes text edit via the shared route; no Add/Delete day).
  // When 'true' AND the role/status is eligible, the step exposes Add day, edit day
  // meta, and delete-empty via the NEW V2-scoped routes. The backend independently
  // enforces QUOTE_ITINERARY_EDIT + role + company + the delete-empty guard, so this
  // only controls the UI affordance — structural edits are never frontend-trusted.
  const itineraryEditFlag = process.env.NEXT_PUBLIC_QUOTE_BUILDER_V2_ITINERARY_EDIT === 'true'
  // The V2 itinerary-edit surface is admin/operations only (mirrors the backend V2
  // routes' @Roles), gated to editable statuses (default-safe: finalized/unknown
  // statuses hide it). A viewer/finance keeps the existing text edit via the shared
  // route (unchanged) but gets no Add/Delete.
  const canEditItinerary =
    hasRequiredRole(role, ["admin", "operations"]) && PREVIEW_EDITABLE_STATUSES.has(quoteStatusCode)

  // Add Activity item (Phase B, Slice 2) — a separate, build-time public flag,
  // default OFF. Activity ONLY in this slice. When not 'true', the Experiences step
  // is unchanged (no Add affordance). When 'true' AND the role/status is eligible,
  // the step exposes "Add activity" via the NEW V2-scoped route
  // (POST /quotes/:id/v2/experiences/item). The backend independently enforces
  // QUOTE_ITEM_CREATE + role + company + editable status + activity-only, so this
  // only controls the UI affordance — creation is never frontend-trusted.
  const itemCreateFlag = process.env.NEXT_PUBLIC_QUOTE_BUILDER_V2_ITEM_CREATE === 'true'
  // Same admin/operations + editable-status gate as the other V2 edit surfaces.
  const canAddItem =
    hasRequiredRole(role, ["admin", "operations"]) && PREVIEW_EDITABLE_STATUSES.has(quoteStatusCode)

  // Booking Creation V2 (Slice 1D). Show the "Create booking" card only when the flag
  // is ON (default OFF), the user is admin/operations, and the quote is convertible
  // (Accepted/Confirmed). The backend route POST /quotes/:id/v2/booking re-enforces the
  // flag, role, status, accepted version, and duplicate protection — this is a UI
  // affordance gate only.
  const CONVERTIBLE_STATUSES = new Set(["ACCEPTED", "CONFIRMED"])
  const bookingCreateFlag = process.env.NEXT_PUBLIC_QUOTE_BOOKING_CREATE === 'true'
  const canCreateBooking =
    bookingCreateFlag &&
    hasRequiredRole(role, ["admin", "operations"]) &&
    CONVERTIBLE_STATUSES.has(quoteStatusCode)

  return (
    <BuilderV2Client
      quote={quote}
      error={error}
      canEditPassengers={canEditPassengers}
      canEditRooming={canEditRooming}
      canDeletePassenger={canDeletePassenger}
      canPreviewPricing={canPreviewPricing}
      canViewPricingApplyAudit={canViewPricingApplyAudit}
      entrancePricingEnabled={entrancePricingEnabled}
      transportPreviewEnabled={transportPreviewEnabled}
      transportApplyEnabled={transportApplyEnabled}
      hotelPreviewEnabled={hotelPreviewEnabled}
      hotelApplyEnabled={hotelApplyEnabled}
      externalPackagePreviewEnabled={externalPackagePreviewEnabled}
      externalPackageApplyEnabled={externalPackageApplyEnabled}
      proposalEmailSendEnabled={proposalEmailSendEnabled}
      itineraryEditEnabled={itineraryEditFlag}
      canEditItinerary={canEditItinerary}
      itemCreateEnabled={itemCreateFlag}
      canAddItem={canAddItem}
      canCreateBooking={canCreateBooking}
    />
  )
}
