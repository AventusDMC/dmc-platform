// Phase 2B — shared route-standard lookup helpers for dispatch/conflict/
// resource engines. Bridges BookingService rows to RouteStandard records
// via two parallel paths:
//   1. Touring-route track: BookingService.touringRoute.code -> standard
//   2. Transfer-route track: BookingService.sourceQuoteItemId -> QuoteItem
//      .routeId -> Route.normalizedKey -> standard
//
// Returns a per-bookingServiceId Map so the caller can attach standards in
// O(1) when iterating dispatch rows / windows / utilization buckets.

import type { PrismaService } from '../prisma/prisma.service';
import {
  RouteTimingConfidence,
  computeRouteTimingConfidence,
} from './route-standards.service';

export type RouteStandardLookupValue = {
  routeCode: string;
  // Cleanup Phase v1 — short FROM_TO operational code (AMM_PET, etc.).
  // Null when the standard hasn't been canonicalized yet. Vouchers /
  // dispatch / quote rendering should prefer this when present for
  // the operationally-readable label.
  canonicalRouteCode: string | null;
  routeName: string;
  standardDistanceKm: number | null;
  standardDurationHours: number | null;
  operationalBufferMinutes: number | null;
  longDistanceFlag: boolean;
  overnightRisk: boolean;
  mountainRoadFlag: boolean;
  borderCrossingFlag: boolean;
  airportRouteFlag: boolean;
  notes: string | null;
  confidenceLabel: RouteTimingConfidence;
};

export type BookingServiceRouteCarrier = {
  id: string;
  touringRoute?: { code?: string | null } | null;
  sourceQuoteItemId?: string | null;
};

/** Mirror of the same normalization used by RouteStandardsService.create. */
function normalizeCode(value: string | null | undefined): string {
  return String(value || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
}

function decorate(standard: any): RouteStandardLookupValue {
  return {
    routeCode: standard.routeCode,
    canonicalRouteCode: standard.canonicalRouteCode ?? null,
    routeName: standard.routeName,
    standardDistanceKm: standard.standardDistanceKm ?? null,
    standardDurationHours: standard.standardDurationHours ?? null,
    operationalBufferMinutes: standard.operationalBufferMinutes ?? null,
    longDistanceFlag: Boolean(standard.longDistanceFlag),
    overnightRisk: Boolean(standard.overnightRisk),
    mountainRoadFlag: Boolean(standard.mountainRoadFlag),
    borderCrossingFlag: Boolean(standard.borderCrossingFlag),
    airportRouteFlag: Boolean(standard.airportRouteFlag),
    notes: standard.notes ?? null,
    confidenceLabel: computeRouteTimingConfidence(standard),
  };
}

/**
 * Load RouteStandard records for a batch of BookingService rows. Two-pass
 * design batches all Prisma round-trips so the dispatch dashboard does not
 * issue N queries per service. Soft-fails to empty map on any DB error so
 * dispatch rendering still works when route-standards table is empty or
 * unreachable.
 */
export async function loadRouteStandardsForBookingServices(
  prisma: PrismaService,
  services: BookingServiceRouteCarrier[],
): Promise<Map<string, RouteStandardLookupValue>> {
  const result = new Map<string, RouteStandardLookupValue>();
  if (!services || services.length === 0) return result;

  try {
    // ---- Pass 1: collect route codes from both tracks ----
    // touring-route track: service.touringRoute.code (already eager-loaded
    // by dispatch dashboard queries).
    const codeByService = new Map<string, string>();
    const sourceQuoteItemIds = new Set<string>();

    for (const service of services) {
      const touringCode = service.touringRoute?.code;
      if (touringCode) {
        codeByService.set(service.id, normalizeCode(touringCode));
        continue;
      }
      if (service.sourceQuoteItemId) {
        sourceQuoteItemIds.add(service.sourceQuoteItemId);
      }
    }

    // Transfer-route track: batch-fetch QuoteItem -> Route.normalizedKey
    // for any service that didn't have a touring code.
    if (sourceQuoteItemIds.size > 0) {
      const quoteItems = await (prisma as any).quoteItem.findMany({
        where: { id: { in: [...sourceQuoteItemIds] } },
        select: { id: true, routeId: true },
      });
      const routeIds = quoteItems.map((q: any) => q.routeId).filter((r: any) => Boolean(r));
      const quoteItemRouteMap = new Map<string, string>();
      if (routeIds.length > 0) {
        const routes = await (prisma as any).route.findMany({
          where: { id: { in: routeIds } },
          // Route table has no `code` column today — use normalizedKey as
          // the bridge. RouteStandard.routeCode should match the same
          // UPPER_SNAKE normalization.
          select: { id: true, normalizedKey: true },
        });
        const codeByRouteId = new Map<string, string>(
          (routes as any[]).map((r) => [r.id, normalizeCode(r.normalizedKey)] as const),
        );
        for (const qi of quoteItems) {
          if (!qi.routeId) continue;
          const code = codeByRouteId.get(qi.routeId);
          if (code) quoteItemRouteMap.set(qi.id, code);
        }
      }
      for (const service of services) {
        if (codeByService.has(service.id)) continue;
        const code = service.sourceQuoteItemId ? quoteItemRouteMap.get(service.sourceQuoteItemId) : undefined;
        if (code) codeByService.set(service.id, code);
      }
    }

    // ---- Pass 2: batch-load RouteStandards for the distinct codes ----
    // Cleanup Phase v1 — try BOTH the legacy routeCode column (the
    // identifier captured on the quote item / touring route when the
    // booking was created) AND canonicalRouteCode (the FROM_TO short
    // form ops moved to in the cleanup). This keeps legacy lookups
    // working: a booking that was created with routeCode='JORDAN_AMMAN_CITY_JORDAN_QAIA_AIRPORT'
    // still resolves to the (now canonicalized) AMM_QAIA standard.
    const distinctCodes = [...new Set(codeByService.values())];
    if (distinctCodes.length === 0) return result;
    const standards = await (prisma as any).routeStandard.findMany({
      where: {
        isActive: true,
        OR: [
          { routeCode: { in: distinctCodes } },
          { canonicalRouteCode: { in: distinctCodes } },
        ],
      },
    });
    // Build a lookup keyed by both routeCode AND canonicalRouteCode so
    // either flavor of identifier resolves to the same standard. When
    // BOTH a legacy and a canonicalized row exist for the same code,
    // the active VERIFIED/CANONICALIZED row wins (mergeDuplicates
    // deactivates losers, so this is implicit via isActive=true).
    const standardByCode = new Map<string, RouteStandardLookupValue>();
    for (const s of standards as any[]) {
      const decorated = decorate(s);
      if (s.routeCode && !standardByCode.has(s.routeCode)) standardByCode.set(s.routeCode, decorated);
      if (s.canonicalRouteCode && !standardByCode.has(s.canonicalRouteCode)) {
        standardByCode.set(s.canonicalRouteCode, decorated);
      }
    }

    for (const [serviceId, code] of codeByService.entries()) {
      const standard = standardByCode.get(code);
      if (standard) result.set(serviceId, standard);
    }
    return result;
  } catch (error) {
    console.error('[route-standard-lookup] failed to load standards', error);
    return result;
  }
}

/**
 * Convenience — returns the operational buffer minutes for a standard,
 * falling back to a sensible default (30 min) when none is set. Used by
 * the resource conflict engine to compare gap-between-services against
 * the route's own buffer instead of the bare 30-min global cutoff.
 */
export function bufferMinutesFor(standard: RouteStandardLookupValue | undefined | null, fallback = 30): number {
  if (standard?.operationalBufferMinutes && standard.operationalBufferMinutes > 0) {
    return standard.operationalBufferMinutes;
  }
  return fallback;
}

/**
 * Convenience — returns the canonical duration in milliseconds for use in
 * end-time calculations. Falls back to a per-operationType default.
 */
export function durationMsFor(standard: RouteStandardLookupValue | undefined | null, fallbackHours: number): number {
  if (standard?.standardDurationHours && standard.standardDurationHours > 0) {
    return standard.standardDurationHours * 60 * 60 * 1000;
  }
  return fallbackHours * 60 * 60 * 1000;
}
