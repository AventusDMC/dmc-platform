import type { Metadata } from "next"
import { cookies } from "next/headers"
import { BuilderV2Client } from "./builder-v2-client"
import { loadQuoteV2 } from "../../../../lib/quote-v2-adapter"
import { redactQuoteV2CostMargin } from "../../../../lib/quote-v2-cost-redaction"
import { readSessionActor, hasRequiredRole, canAccessFinance, canViewFullPassengerPii } from "../../../lib/auth-session"

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

  // CP-N3b2b: the server-trusted session role is read BEFORE the quote load so the
  // per-request-class selectors inside loadQuoteV2 can route each fetch (main /
  // itinerary by the cost axis; passengers by the PII axis; rooming always
  // operational). Role comes only from the dmc_session cookie — never client input.
  const sessionToken = (await cookies()).get("dmc_session")?.value || ""
  const role = readSessionActor(sessionToken)?.role ?? null
  const { quote, error } = await loadQuoteV2(id, role)

  // CP-N3b2b: passenger PII display + mutation affordances are gated by the
  // full-PII predicate (canViewFullPassengerPii = admin/super_admin/operations),
  // INDEPENDENTLY of cost visibility. viewer/finance receive name-only passenger
  // data and no passenger mutation controls; operations retains its full-PII
  // passenger workflow. The backend remains the source of truth.
  const canEditPassengers = canViewFullPassengerPii(role)
  // Rooming assignment authority is unchanged (operational, names-only) — same
  // backend @Roles set; not a passenger-PII control.
  const canEditRooming = hasRequiredRole(role, ["admin", "operations", "viewer"])
  // Passenger DELETE is a full-PII control (admin/super_admin/operations).
  const canDeletePassenger = canViewFullPassengerPii(role)

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

  // Sensitive cost/margin visibility in the internal V2 builder UI (net cost,
  // markup, margin, per-line cost amounts). Reuses the Finance V2 predicate
  // canAccessFinance (admin / super_admin / finance) — deliberately NARROWER than
  // the edit predicates: operations can preview/apply pricing but does NOT see
  // net cost / margin here, and agent / viewer / agent_admin never see it. Note
  // canAccessFinance does NOT auto-grant agent_admin (unlike hasRequiredRole with
  // 'admin'), which is the intended stricter behavior. Client-facing sell/
  // per-person figures stay visible to everyone; the proposal/PDF mapper redaction
  // is unchanged and remains the client-facing source of truth.
  const canViewCostMargin = canAccessFinance(role)

  // Slice 2A-2: redact the sensitive cost/margin figures from the payload that
  // hydrates the client component, so restricted roles never RECEIVE them (the
  // Slice 2A UI gating hides them, but the raw values still travelled in props).
  // Narrow + pure: only the pricing breakdown's internal cost figures are zeroed;
  // client-facing sell/per-person and all itinerary/item data are preserved.
  const safeQuote = redactQuoteV2CostMargin(quote, canViewCostMargin)

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

  // E-b: guarded External Package COMMERCIAL edit affordance (net cost + pricing basis
  // only) — a separate, build-time public flag, default OFF. When not 'true', external
  // packages have no edit affordance. When 'true' AND the user is finance-authorized
  // (canAccessFinance = admin/super_admin/finance — deliberately NOT operations/
  // agent_admin/viewer/agent, since net cost is cost data) AND the quote status is exactly
  // DRAFT (the backend requires strict DRAFT + acceptedVersionId null + latest revision),
  // eligible external-package rows expose an "Edit commercial terms" panel via the NEW
  // V2-scoped routes (POST /quotes/:id/v2/experiences/item/:itemId/edit[/preview]). The
  // backend independently enforces QUOTE_EXTERNAL_PACKAGE_EDIT + finance + strict DRAFT +
  // external/matrix-less/override-free eligibility, so this only controls the UI affordance
  // — editing is never frontend-trusted.
  const externalPackageEditFlag = process.env.NEXT_PUBLIC_QUOTE_EXTERNAL_PACKAGE_EDIT === 'true'
  const canEditExternalPackage =
    externalPackageEditFlag && canAccessFinance(role) && quoteStatusCode === "DRAFT"

  // VV-1: Save-proposal-version affordance. Mirrors the createVersion route's
  // @Roles('admin','viewer','finance'); gated to editable statuses (save a version
  // while building / before Mark-as-Sent). No flag — versioning is a shipped Classic
  // capability; the backend route re-enforces role + company scope. Snapshot only —
  // no status change, no invoice, no booking.
  const canSaveVersion =
    hasRequiredRole(role, ["admin", "viewer", "finance"]) && PREVIEW_EDITABLE_STATUSES.has(quoteStatusCode)

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
      quote={safeQuote}
      error={error}
      canEditPassengers={canEditPassengers}
      canEditRooming={canEditRooming}
      canDeletePassenger={canDeletePassenger}
      canPreviewPricing={canPreviewPricing}
      canViewPricingApplyAudit={canViewPricingApplyAudit}
      canViewCostMargin={canViewCostMargin}
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
      canEditExternalPackage={canEditExternalPackage}
      canCreateBooking={canCreateBooking}
      canSaveVersion={canSaveVersion}
    />
  )
}
