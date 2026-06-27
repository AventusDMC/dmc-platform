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
    />
  )
}
