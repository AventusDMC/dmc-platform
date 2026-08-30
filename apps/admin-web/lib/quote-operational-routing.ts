// CP-N3b2b — server-trusted, per-request-class endpoint selectors.
//
// Cost visibility (canAccessFinance = admin/super_admin/finance) and passenger-PII
// visibility (canViewFullPassengerPii = admin/super_admin/operations) are INDEPENDENT
// axes; each request class is routed by its own predicate. The `role` MUST come from
// the authenticated server-side session (readSessionActor over the dmc_session
// cookie) — never from client input, query params, local storage, or a client body.
//
// Fail-closed: a raw internal endpoint is selected ONLY when the trusted role is
// explicitly authorized for that endpoint's data class. Every other role — including
// agent / agent_admin / missing / unknown / future — selects the operational (or
// safe-summary) endpoint, whose backend gate returns 403 for unauthorized roles.
// Callers must NEVER fall back to a raw endpoint when an operational request fails.

import { canAccessFinance, canViewFullPassengerPii } from '../app/lib/auth-session';
import type { SessionRole } from '../app/lib/auth-session';

export type CostRoutedEndpoint = 'raw' | 'operational';
export type PiiRoutedEndpoint = 'raw' | 'operational';
export type VersionRoutedEndpoint = 'raw' | 'summary';

/** Main quote detail — cost axis. Cost-visible → raw; everyone else → operational. */
export function quoteDetailEndpoint(role?: SessionRole | null): CostRoutedEndpoint {
  return canAccessFinance(role) ? 'raw' : 'operational';
}

/** Day-by-day itinerary — cost axis (carries pricingDescription/contract provenance). */
export function quoteItineraryEndpoint(role?: SessionRole | null): CostRoutedEndpoint {
  return canAccessFinance(role) ? 'raw' : 'operational';
}

/** Passengers — PII axis. Full-PII → raw; everyone else → operational name-only. */
export function quotePassengersEndpoint(role?: SessionRole | null): PiiRoutedEndpoint {
  return canViewFullPassengerPii(role) ? 'raw' : 'operational';
}

/**
 * Rooming — ALWAYS operational. Raw rooming embeds pricingDescription (cost
 * provenance) AND passenger PII, and every current consumer reads only the
 * operational companion's retained fields (names + room facts), so no authorized
 * role fetches raw rooming.
 */
export function quoteRoomingEndpoint(_role?: SessionRole | null): 'operational' {
  return 'operational';
}

/** Version detail — cost axis. Cost-visible → raw snapshot detail; else → safe summary. */
export function quoteVersionEndpoint(role?: SessionRole | null): VersionRoutedEndpoint {
  return canAccessFinance(role) ? 'raw' : 'summary';
}

// ---------------------------------------------------------------------------
// Path builders (same-origin /api URLs). Each derives its endpoint from the
// selector above, so the raw-vs-operational choice is centralized and testable.
// ---------------------------------------------------------------------------

export function quoteDetailPath(id: string, role?: SessionRole | null): string {
  return quoteDetailEndpoint(role) === 'raw'
    ? `/api/quotes/${id}`
    : `/api/quotes/${id}/operational`;
}

export function quoteItineraryPath(id: string, role?: SessionRole | null): string {
  return quoteItineraryEndpoint(role) === 'raw'
    ? `/api/quotes/${id}/itinerary`
    : `/api/quotes/${id}/operational/itinerary`;
}

export function quotePassengersPath(id: string, role?: SessionRole | null): string {
  return quotePassengersEndpoint(role) === 'raw'
    ? `/api/quotes/${id}/passengers`
    : `/api/quotes/${id}/operational/passengers`;
}

export function quoteRoomingPath(id: string, _role?: SessionRole | null): string {
  return `/api/quotes/${id}/operational/rooming`;
}

export function quoteVersionPath(id: string, versionId: string, role?: SessionRole | null): string {
  return quoteVersionEndpoint(role) === 'raw'
    ? `/api/quotes/${id}/versions/${versionId}`
    : `/api/quotes/${id}/versions/${versionId}/summary`;
}
