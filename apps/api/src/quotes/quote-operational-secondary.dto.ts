/**
 * CP-N3b2a2 — Secondary operational companion DTOs (READ-ONLY output contracts).
 *
 * The exact, closed allowlists serialized by the three additive companion routes
 *   GET /quotes/:id/operational/itinerary
 *   GET /quotes/:id/operational/passengers
 *   GET /quotes/:id/operational/rooming
 * which let the non-finance (operations / viewer) surfaces read the itinerary,
 * passenger, and rooming data WITHOUT the restricted provenance / PII the raw
 * secondary endpoints ship today. Each body is IDENTICAL for every authorized role
 * (no PII / finance branch).
 *
 * Excluded everywhere below: pricingDescription, overrideReason, real contract
 * name/dates/currency (state carried ONLY by the presence sentinel), rate-variant /
 * appliedVehicleRate / catalog-provenance IDs, supplier identity, cost / margin /
 * rate fields, POI relations, tokens, snapshots, arbitrary JSON, and all passenger
 * PII beyond { id, firstName, lastName }.
 *
 * The sentinels and the name-only passenger type are REUSED from the deployed
 * primary DTO — no divergent copies. Every companion mapper builds these by
 * explicit property assignment (no spreads / Object.assign / JSON clone / recursive
 * sanitizer), so a newly added Prisma column stays invisible until added here.
 */

import type { OperationalContractPresence, OperationalPassenger } from './quote-operational.dto';

export type { OperationalContractPresence, OperationalPassenger };

// ---------------------------------------------------------------------------
// GET /quotes/:id/operational/itinerary  ->  OperationalItineraryResponse
// ---------------------------------------------------------------------------

export interface OperationalItineraryResponse {
  quoteId: string;
  days: OperationalItineraryDayNode[];
}

export interface OperationalItineraryDayNode {
  id: string;
  dayNumber: number;
  title: string;
  notes: string | null;
  sortOrder: number;
  isActive: boolean;
  dayItems: OperationalDayItemNode[];
}

export interface OperationalDayItemNode {
  id: string;
  quoteServiceId: string;
  sortOrder: number;
  notes: string | null;
  isActive: boolean;
  quoteService: OperationalDayServiceSummary | null;
}

export interface OperationalDayServiceSummary {
  id: string;
  optionId: string | null;
  serviceDate: string | null;
  startTime: string | null;
  pickupTime: string | null;
  pickupLocation: string | null;
  meetingPoint: string | null;
  paxCount: number | null;
  participantCount: number | null;
  adultCount: number | null;
  childCount: number | null;
  activityId: string | null;
  activityName: string | null;
  service: OperationalDayService | null;
  hotel: OperationalDayHotel | null;
  contract: OperationalContractPresence | null;
  roomCategory: OperationalDayRoomCategory | null;
  touringRoute: OperationalDayTouringRoute | null;
  appliedVehicleRate: OperationalDayAppliedVehicleRate | null;
}

export interface OperationalDayService {
  id: string;
  name: string;
  category: string | null;
  serviceType: OperationalDayServiceType | null;
}

export interface OperationalDayServiceType {
  name: string;
  code: string | null;
}

export interface OperationalDayHotel {
  name: string;
  city: string | null;
}

export interface OperationalDayRoomCategory {
  name: string;
}

export interface OperationalDayTouringRoute {
  name: string;
  startCity: string | null;
}

export interface OperationalDayAppliedVehicleRate {
  routeName: string | null;
  vehicle: OperationalDayVehicle | null;
  serviceType: OperationalDayTransportServiceType | null;
}

export interface OperationalDayVehicle {
  name: string;
}

export interface OperationalDayTransportServiceType {
  name: string;
}

// ---------------------------------------------------------------------------
// GET /quotes/:id/operational/passengers  ->  OperationalPassenger[]
// (element type reused from quote-operational.dto: { id, firstName, lastName })
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// GET /quotes/:id/operational/rooming  ->  OperationalRoomingGroup[]
// ---------------------------------------------------------------------------

export interface OperationalRoomingGroup {
  id: string;
  itineraryDayId: string;
  hotelQuoteItemId: string;
  roomType: string | null;
  occupancyType: string;
  notes: string | null;
  temporaryRoomLabel: string | null;
  guideRoom: boolean;
  leaderRoom: boolean;
  itineraryDay: OperationalRoomingDayRef | null;
  hotelQuoteItem: OperationalRoomingHotelItem | null;
  assignments: OperationalRoomingAssignment[];
}

export interface OperationalRoomingDayRef {
  dayNumber: number;
  title: string;
}

export interface OperationalRoomingHotelItem {
  hotel: OperationalRoomingHotel | null;
  roomCategory: OperationalRoomingRoomCategory | null;
}

export interface OperationalRoomingHotel {
  name: string;
}

export interface OperationalRoomingRoomCategory {
  name: string;
}

export interface OperationalRoomingAssignment {
  id: string;
  quotePassengerId: string;
  quotePassenger: OperationalPassenger | null;
}
