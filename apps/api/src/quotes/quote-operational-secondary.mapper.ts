/**
 * CP-N3b2a2 — Secondary operational companion mappers (READ-ONLY, additive, PURE).
 *
 * Project the EXISTING serialized outputs of QuoteItineraryService.findByQuoteId,
 * QuotesService.findPassengers, and QuotesService.findRoomingGroups into the closed
 * companion allowlists in {@link quote-operational-secondary.dto}. No new DB query,
 * no service mutation, no DI.
 *
 * EXPLICIT PROPERTY ASSIGNMENT ONLY. No `...spread`, no `Object.assign`, no JSON
 * clone, no generic recursive sanitizer. Restricted provenance / PII is never read
 * into the output — contract state is carried ONLY by the presence sentinel
 * (`{}` | null); passengers (top-level and inside rooming assignments) are reduced
 * to exactly { id, firstName, lastName }. A newly added Prisma column stays invisible
 * until it is explicitly added here.
 */

import type {
  OperationalContractPresence,
  OperationalDayAppliedVehicleRate,
  OperationalDayHotel,
  OperationalDayItemNode,
  OperationalDayRoomCategory,
  OperationalDayService,
  OperationalDayServiceSummary,
  OperationalDayServiceType,
  OperationalDayTouringRoute,
  OperationalDayTransportServiceType,
  OperationalDayVehicle,
  OperationalItineraryDayNode,
  OperationalItineraryResponse,
  OperationalPassenger,
  OperationalRoomingAssignment,
  OperationalRoomingGroup,
  OperationalRoomingHotel,
  OperationalRoomingHotelItem,
  OperationalRoomingRoomCategory,
} from './quote-operational-secondary.dto';

// ---------------------------------------------------------------------------
// Raw input structural types — ONLY the fields the mappers read. Restricted
// fields (pricingDescription, overrideReason, contract name/dates/currency,
// rate-variant / appliedVehicleRate ids, supplier identity, passenger PII) are
// intentionally NOT declared here, so they cannot be read into the output.
// ---------------------------------------------------------------------------

type RawDateish = Date | string | null | undefined;

interface RawContractLike {
  id?: string | null;
}
interface RawItinServiceType {
  name?: string | null;
  code?: string | null;
}
interface RawItinServiceRel {
  id?: string | null;
  name?: string | null;
  category?: string | null;
  serviceType?: RawItinServiceType | null;
}
interface RawItinHotel {
  name?: string | null;
  city?: string | null;
}
interface RawItinRoomCategory {
  name?: string | null;
}
interface RawItinTouringRoute {
  name?: string | null;
  startCity?: string | null;
}
interface RawItinVehicle {
  name?: string | null;
}
interface RawItinTransportServiceType {
  name?: string | null;
}
interface RawItinAppliedVehicleRate {
  routeName?: string | null;
  vehicle?: RawItinVehicle | null;
  serviceType?: RawItinTransportServiceType | null;
}
interface RawItinService {
  id?: string | null;
  optionId?: string | null;
  serviceDate?: RawDateish;
  startTime?: string | null;
  pickupTime?: string | null;
  pickupLocation?: string | null;
  meetingPoint?: string | null;
  paxCount?: number | null;
  participantCount?: number | null;
  adultCount?: number | null;
  childCount?: number | null;
  activityId?: string | null;
  activityName?: string | null;
  service?: RawItinServiceRel | null;
  hotel?: RawItinHotel | null;
  contract?: RawContractLike | null;
  roomCategory?: RawItinRoomCategory | null;
  touringRoute?: RawItinTouringRoute | null;
  appliedVehicleRate?: RawItinAppliedVehicleRate | null;
}
interface RawItinDayItem {
  id?: string | null;
  quoteServiceId?: string | null;
  sortOrder?: number | null;
  notes?: string | null;
  isActive?: boolean | null;
  quoteService?: RawItinService | null;
}
interface RawItinDay {
  id?: string | null;
  dayNumber?: number | null;
  title?: string | null;
  notes?: string | null;
  sortOrder?: number | null;
  isActive?: boolean | null;
  dayItems?: RawItinDayItem[] | null;
}
export interface RawItineraryResult {
  quoteId?: string | null;
  days?: RawItinDay[] | null;
}

export interface RawPassenger {
  id?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}

interface RawRoomingDay {
  dayNumber?: number | null;
  title?: string | null;
}
interface RawRoomingHotel {
  name?: string | null;
}
interface RawRoomingRoomCategory {
  name?: string | null;
}
interface RawRoomingHotelItem {
  hotel?: RawRoomingHotel | null;
  roomCategory?: RawRoomingRoomCategory | null;
}
interface RawRoomingAssignment {
  id?: string | null;
  quotePassengerId?: string | null;
  quotePassenger?: RawPassenger | null;
}
export interface RawRoomingGroup {
  id?: string | null;
  itineraryDayId?: string | null;
  hotelQuoteItemId?: string | null;
  roomType?: string | null;
  occupancyType?: string | null;
  notes?: string | null;
  temporaryRoomLabel?: string | null;
  guideRoom?: boolean | null;
  leaderRoom?: boolean | null;
  itineraryDay?: RawRoomingDay | null;
  hotelQuoteItem?: RawRoomingHotelItem | null;
  assignments?: RawRoomingAssignment[] | null;
}

// ---------------------------------------------------------------------------
// Coercers + presence sentinel
// ---------------------------------------------------------------------------

function isoOrNull(v: RawDateish): string | null {
  if (v == null) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString();
  return typeof v === 'string' ? v : null;
}
function numOrNull(v: number | null | undefined): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
function numOr(v: number | null | undefined, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}
function strOrNull(v: string | null | undefined): string | null {
  return typeof v === 'string' ? v : null;
}
function strOr(v: string | null | undefined, fallback: string): string {
  return typeof v === 'string' ? v : fallback;
}
function boolOf(v: boolean | null | undefined): boolean {
  return v === true;
}

/** A linked contract exists -> {} (truthy) else null. Never a name / id / dates. */
function contractPresence(hasContract: boolean): OperationalContractPresence | null {
  return hasContract ? {} : null;
}

/** Name-only passenger — EXACTLY id / firstName / lastName. */
function toOperationalPassenger(p: RawPassenger | null | undefined): OperationalPassenger | null {
  if (!p) return null;
  return { id: strOr(p.id, ''), firstName: strOr(p.firstName, ''), lastName: strOr(p.lastName, '') };
}

// ---------------------------------------------------------------------------
// Itinerary companion
// ---------------------------------------------------------------------------

function toOperationalDayServiceType(t: RawItinServiceType | null | undefined): OperationalDayServiceType | null {
  if (!t) return null;
  return { name: strOr(t.name, ''), code: strOrNull(t.code) };
}
function toOperationalDayService(s: RawItinServiceRel | null | undefined): OperationalDayService | null {
  if (!s) return null;
  return {
    id: strOr(s.id, ''),
    name: strOr(s.name, ''),
    category: strOrNull(s.category),
    serviceType: toOperationalDayServiceType(s.serviceType),
  };
}
function toOperationalDayHotel(h: RawItinHotel | null | undefined): OperationalDayHotel | null {
  if (!h) return null;
  return { name: strOr(h.name, ''), city: strOrNull(h.city) };
}
function toOperationalDayRoomCategory(r: RawItinRoomCategory | null | undefined): OperationalDayRoomCategory | null {
  if (!r) return null;
  return { name: strOr(r.name, '') };
}
function toOperationalDayTouringRoute(t: RawItinTouringRoute | null | undefined): OperationalDayTouringRoute | null {
  if (!t) return null;
  return { name: strOr(t.name, ''), startCity: strOrNull(t.startCity) };
}
function toOperationalDayVehicle(v: RawItinVehicle | null | undefined): OperationalDayVehicle | null {
  if (!v) return null;
  return { name: strOr(v.name, '') };
}
function toOperationalDayTransportServiceType(
  t: RawItinTransportServiceType | null | undefined,
): OperationalDayTransportServiceType | null {
  if (!t) return null;
  return { name: strOr(t.name, '') };
}
function toOperationalDayAppliedVehicleRate(
  r: RawItinAppliedVehicleRate | null | undefined,
): OperationalDayAppliedVehicleRate | null {
  if (!r) return null;
  return {
    routeName: strOrNull(r.routeName),
    vehicle: toOperationalDayVehicle(r.vehicle),
    serviceType: toOperationalDayTransportServiceType(r.serviceType),
  };
}
function toOperationalDayServiceSummary(qs: RawItinService | null | undefined): OperationalDayServiceSummary | null {
  if (!qs) return null;
  return {
    id: strOr(qs.id, ''),
    optionId: strOrNull(qs.optionId),
    serviceDate: isoOrNull(qs.serviceDate),
    startTime: strOrNull(qs.startTime),
    pickupTime: strOrNull(qs.pickupTime),
    pickupLocation: strOrNull(qs.pickupLocation),
    meetingPoint: strOrNull(qs.meetingPoint),
    paxCount: numOrNull(qs.paxCount),
    participantCount: numOrNull(qs.participantCount),
    adultCount: numOrNull(qs.adultCount),
    childCount: numOrNull(qs.childCount),
    activityId: strOrNull(qs.activityId),
    activityName: strOrNull(qs.activityName),
    service: toOperationalDayService(qs.service),
    hotel: toOperationalDayHotel(qs.hotel),
    contract: contractPresence(qs.contract != null),
    roomCategory: toOperationalDayRoomCategory(qs.roomCategory),
    touringRoute: toOperationalDayTouringRoute(qs.touringRoute),
    appliedVehicleRate: toOperationalDayAppliedVehicleRate(qs.appliedVehicleRate),
  };
}
function toOperationalDayItem(di: RawItinDayItem): OperationalDayItemNode {
  return {
    id: strOr(di.id, ''),
    quoteServiceId: strOr(di.quoteServiceId, ''),
    sortOrder: numOr(di.sortOrder, 0),
    notes: strOrNull(di.notes),
    isActive: boolOf(di.isActive),
    quoteService: toOperationalDayServiceSummary(di.quoteService),
  };
}
function toOperationalDay(d: RawItinDay): OperationalItineraryDayNode {
  return {
    id: strOr(d.id, ''),
    dayNumber: numOr(d.dayNumber, 0),
    title: strOr(d.title, ''),
    notes: strOrNull(d.notes),
    sortOrder: numOr(d.sortOrder, 0),
    isActive: boolOf(d.isActive),
    dayItems: (d.dayItems ?? []).map(toOperationalDayItem),
  };
}
export function mapItineraryToOperational(res: RawItineraryResult | null | undefined): OperationalItineraryResponse {
  return {
    quoteId: strOr(res?.quoteId, ''),
    days: (res?.days ?? []).map(toOperationalDay),
  };
}

// ---------------------------------------------------------------------------
// Passengers companion — name-only
// ---------------------------------------------------------------------------

export function mapPassengersToOperational(rows: RawPassenger[] | null | undefined): OperationalPassenger[] {
  return (rows ?? []).map((p) => ({
    id: strOr(p.id, ''),
    firstName: strOr(p.firstName, ''),
    lastName: strOr(p.lastName, ''),
  }));
}

// ---------------------------------------------------------------------------
// Rooming companion
// ---------------------------------------------------------------------------

function toOperationalRoomingHotel(h: RawRoomingHotel | null | undefined): OperationalRoomingHotel | null {
  if (!h) return null;
  return { name: strOr(h.name, '') };
}
function toOperationalRoomingRoomCategory(
  r: RawRoomingRoomCategory | null | undefined,
): OperationalRoomingRoomCategory | null {
  if (!r) return null;
  return { name: strOr(r.name, '') };
}
function toOperationalRoomingHotelItem(h: RawRoomingHotelItem | null | undefined): OperationalRoomingHotelItem | null {
  if (!h) return null;
  return {
    hotel: toOperationalRoomingHotel(h.hotel),
    roomCategory: toOperationalRoomingRoomCategory(h.roomCategory),
  };
}
function toOperationalRoomingAssignment(a: RawRoomingAssignment): OperationalRoomingAssignment {
  return {
    id: strOr(a.id, ''),
    quotePassengerId: strOr(a.quotePassengerId, ''),
    quotePassenger: toOperationalPassenger(a.quotePassenger),
  };
}
function toOperationalRoomingGroup(g: RawRoomingGroup): OperationalRoomingGroup {
  return {
    id: strOr(g.id, ''),
    itineraryDayId: strOr(g.itineraryDayId, ''),
    hotelQuoteItemId: strOr(g.hotelQuoteItemId, ''),
    roomType: strOrNull(g.roomType),
    occupancyType: strOr(g.occupancyType, 'unknown'),
    notes: strOrNull(g.notes),
    temporaryRoomLabel: strOrNull(g.temporaryRoomLabel),
    guideRoom: boolOf(g.guideRoom),
    leaderRoom: boolOf(g.leaderRoom),
    itineraryDay: g.itineraryDay
      ? { dayNumber: numOr(g.itineraryDay.dayNumber, 0), title: strOr(g.itineraryDay.title, '') }
      : null,
    hotelQuoteItem: toOperationalRoomingHotelItem(g.hotelQuoteItem),
    assignments: (g.assignments ?? []).map(toOperationalRoomingAssignment),
  };
}
export function mapRoomingToOperational(rows: RawRoomingGroup[] | null | undefined): OperationalRoomingGroup[] {
  return (rows ?? []).map(toOperationalRoomingGroup);
}
