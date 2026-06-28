// Pure, dependency-free helpers for resolving a Quote Builder V2 itinerary day's
// transport indicator and visits list. Extracted from quote-v2-adapter.ts so the
// logic is unit-testable in node:test (the adapter pulls in next/headers via
// admin-server and cannot be imported there).
//
// Display-only: these functions never touch pricing, never assign vehicle rates,
// and never mutate quote data — they only decide what the day card shows.

// Minimal structural shape of a day-linked quoteService (a subset of the
// /itinerary endpoint payload). Kept local so this module has no app imports.
export interface DayLinkedService {
  activityName?: string | null
  service?: { name?: string | null; serviceType?: { code?: string | null } | null } | null
  hotel?: { name?: string | null } | null
  appliedVehicleRate?: { routeName?: string | null; vehicle?: { name?: string | null } | null } | null
}

// A day-linked service counts as transport when it either carries an applied
// vehicle rate OR its service taxonomy is TRANSPORT. The /itinerary endpoint omits
// routeId/transportServiceTypeId on day items, so service.serviceType.code is the
// reliable signal for transport legs not priced via a vehicle rate (e.g. airport
// transfers) — these previously showed "No transport assigned" and leaked into the
// day's visits list.
export function isTransportDayItem(s: DayLinkedService | null | undefined): boolean {
  if (!s) return false
  return Boolean(s.appliedVehicleRate) || s.service?.serviceType?.code === "TRANSPORT"
}

// Label preference: applied vehicle-rate route name → vehicle name → service/item
// name (e.g. "Airport Transfer"). Route place endpoints are not part of the
// itinerary day payload, so a place-to-place label is not derivable here.
export function transportDayLabel(s: DayLinkedService): string | null {
  return (
    s.appliedVehicleRate?.routeName ??
    s.appliedVehicleRate?.vehicle?.name ??
    s.service?.name ??
    "Transport"
  )
}

// Resolve a day's transport indicator + visits from its linked services.
// - transportAssigned: the first transport leg's label (null when none).
// - visits: every non-hotel, non-transport item's display label.
export function resolveDayTransportAndVisits(
  dayServices: Array<DayLinkedService | null | undefined>,
): { transportAssigned: string | null; visits: string[] } {
  const transportItem = dayServices.find((s) => isTransportDayItem(s)) ?? null
  const visits: string[] = []
  for (const s of dayServices) {
    if (!s || s.hotel || isTransportDayItem(s)) continue
    const label = s.activityName ?? s.service?.name ?? ""
    if (label) visits.push(label)
  }
  return {
    transportAssigned: transportItem ? transportDayLabel(transportItem) : null,
    visits,
  }
}
