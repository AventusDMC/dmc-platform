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

  return <BuilderV2Client quote={quote} error={error} canEditPassengers={canEditPassengers} />
}
