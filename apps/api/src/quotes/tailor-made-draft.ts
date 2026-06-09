// Phase R.1 — Tailor-Made Itinerary Draft Builder (generation engine).
//
// Pure, dependency-free generator that produces a day-by-day DRAFT itinerary
// structure for a tailor-made Jordan program from basic inputs. It returns
// editable day shells (dayNumber + title + narrative + overnight city); it does
// NOT touch pricing, create QuoteItems, or write to the database. A draft is
// meant to be persisted later as editable QuoteItineraryDay rows (title/notes)
// via the existing itinerary endpoints, and only then optionally priced (R.2+).
//
// Scope guard: this file is self-contained. It does not import or modify
// HotelPricingResolver / QuotePricingService / PackageTemplate apply logic /
// transport-guide-activity pricing, and changes no existing behavior.

export type TravelStyle = 'classic' | 'religious' | 'adventure' | 'luxury';

export interface TailorMadeDraftInput {
  durationDays?: number; // default 8
  arrivalCity?: string; // default 'Amman'
  arrivalAirport?: string; // default 'QAIA'
  departureCity?: string; // default 'Amman'
  departureAirport?: string; // default 'QAIA'
  pax?: number;
  hotelCategory?: string; // e.g. '4-star' | '5-star'
  travelStyle?: TravelStyle; // default 'classic'
  requiredPlaces?: string[]; // e.g. ['Petra','Wadi Rum','Dead Sea','Jerash']
  optionalPlaces?: string[]; // e.g. ['Bethany','Madaba','Mount Nebo','Ajloun','Aqaba']
  guideType?: string;
  currency?: string; // default 'USD'
}

export interface DraftItineraryDay {
  dayNumber: number;
  /** Route/heading for the day, e.g. "Amman / Jerash / Amman". */
  title: string;
  /** Editable client-facing narrative for the day. */
  narrative: string;
  /** Overnight city for the day; null on the final departure day. */
  overnightCity: string | null;
  /** Places featured on the day (metadata; drives later suggestions). */
  places: string[];
}

export interface TailorMadeDraft {
  destination: 'Jordan';
  durationDays: number;
  nightCount: number;
  travelStyle: TravelStyle;
  days: DraftItineraryDay[];
  /** Number of days that carry an overnight placement. */
  overnightCount: number;
  /** Echo of the resolved inputs (for review / future apply). */
  input: Required<Pick<TailorMadeDraftInput, 'arrivalCity' | 'departureCity' | 'arrivalAirport' | 'departureAirport' | 'currency' | 'travelStyle'>> & {
    pax: number | null;
    hotelCategory: string | null;
    guideType: string | null;
    requiredPlaces: string[];
    optionalPlaces: string[];
  };
  /** Places requested but not placed on any day (so the operator can see gaps). */
  unplacedRequiredPlaces: string[];
}

const clean = (v: unknown): string => String(v ?? '').trim();
const has = (list: string[] | undefined, name: string): boolean =>
  (list || []).some((p) => clean(p).toLowerCase() === name.toLowerCase());

/**
 * Build an 8-day / 7-night Jordan classic tailor-made draft itinerary.
 *
 * The default plan mirrors the standard Jordan touring sequence:
 *   D1 Arrival → D2 Jerash day-trip → D3 Madaba/Mt Nebo → Petra →
 *   D4 Petra → Wadi Rum → D5 Wadi Rum jeep → Dead Sea → D6 Dead Sea →
 *   D7 Bethany/leisure → D8 Departure.
 *
 * Optional places (Jerash, Madaba, Mount Nebo, Bethany) are woven in when
 * requested; required places are tracked and any that could not be placed are
 * reported in `unplacedRequiredPlaces` (R.1 supports the canonical 8-day route;
 * non-standard durations fall back to a generic shell — see below).
 */
export function buildTailorMadeJordanDraft(input: TailorMadeDraftInput = {}): TailorMadeDraft {
  const travelStyle: TravelStyle = input.travelStyle || 'classic';
  const arrivalCity = clean(input.arrivalCity) || 'Amman';
  // Phase R.3b — only treat the departure city as EXPLICIT when the caller
  // actually provided one. When it is left unset, the safe default is the
  // program's last overnight city (resolved below), NOT a hardcoded 'Amman' —
  // so the standard route departs from the Dead Sea, not back through Amman.
  const departureCityProvided = clean(input.departureCity);
  const arrivalAirport = clean(input.arrivalAirport) || 'QAIA';
  const departureAirport = clean(input.departureAirport) || 'QAIA';
  const currency = (clean(input.currency) || 'USD').toUpperCase();
  const durationDays = Number.isInteger(input.durationDays) && (input.durationDays as number) > 0 ? (input.durationDays as number) : 8;

  const required = (input.requiredPlaces || []).map(clean).filter(Boolean);
  const optional = (input.optionalPlaces || []).map(clean).filter(Boolean);

  // Optional stops fold in when they appear in EITHER list (operators often put
  // "nice to have" cities under either heading).
  const wantJerash = has(required, 'Jerash') || has(optional, 'Jerash');
  const wantMadaba = has(required, 'Madaba') || has(optional, 'Madaba');
  const wantNebo = has(required, 'Mount Nebo') || has(optional, 'Mount Nebo');
  const wantBethany = has(required, 'Bethany') || has(optional, 'Bethany');

  const days: DraftItineraryDay[] = [];
  const placed = new Set<string>();
  const place = (...names: string[]) => names.forEach((n) => placed.add(n.toLowerCase()));

  // The previous overnight city — the safe default departure origin when the
  // caller didn't pin one explicitly. Read off the already-built days, so it
  // tracks whatever route was generated.
  const lastOvernight = (): string =>
    [...days].reverse().find((d) => d.overnightCity)?.overnightCity || arrivalCity;
  // Resolved at the departure day; explicit caller value wins, else last overnight.
  let resolvedDepartureCity = departureCityProvided || arrivalCity;

  if (durationDays === 8) {
    // ---- Day 1: Arrival ----
    days.push({
      dayNumber: 1,
      title: `Arrival ${arrivalCity}`,
      narrative: `Meet & assist at ${arrivalAirport}, transfer to ${arrivalCity}, overnight ${arrivalCity}.`,
      overnightCity: arrivalCity,
      places: [arrivalCity],
    });

    // ---- Day 2: Amman highlights + Jerash day-trip ----
    {
      const stops = ['Amman', ...(wantJerash ? ['Jerash'] : [])];
      const title = wantJerash ? `${arrivalCity} / Jerash / ${arrivalCity}` : `${arrivalCity} City Tour`;
      const narrative = wantJerash
        ? `Visit ${arrivalCity} highlights and Jerash, overnight ${arrivalCity}.`
        : `Visit ${arrivalCity} highlights, overnight ${arrivalCity}.`;
      place(...stops);
      days.push({ dayNumber: 2, title, narrative, overnightCity: arrivalCity, places: stops });
    }

    // ---- Day 3: Madaba / Mount Nebo → Petra ----
    {
      const enRoute = [...(wantMadaba ? ['Madaba'] : []), ...(wantNebo ? ['Mount Nebo'] : [])];
      const stops = [arrivalCity, ...enRoute, 'Petra'];
      const title = stops.join(' / ');
      const visitPhrase = enRoute.length ? `Visit ${enRoute.join(' and ')}, continue to Petra` : 'Travel south to Petra';
      place(...enRoute, 'Petra');
      days.push({ dayNumber: 3, title, narrative: `${visitPhrase}, overnight Petra.`, overnightCity: 'Petra', places: stops });
    }

    // ---- Day 4: Petra visit → Wadi Rum ----
    place('Petra', 'Wadi Rum');
    days.push({
      dayNumber: 4,
      title: 'Petra Visit / Wadi Rum',
      narrative: 'Visit Petra, continue to Wadi Rum, overnight Wadi Rum.',
      overnightCity: 'Wadi Rum',
      places: ['Petra', 'Wadi Rum'],
    });

    // ---- Day 5: Wadi Rum jeep → Dead Sea ----
    place('Wadi Rum', 'Dead Sea');
    days.push({
      dayNumber: 5,
      title: 'Wadi Rum / Dead Sea',
      narrative: 'Wadi Rum jeep tour, continue to Dead Sea, overnight Dead Sea.',
      overnightCity: 'Dead Sea',
      places: ['Wadi Rum', 'Dead Sea'],
    });

    // ---- Day 6: Dead Sea leisure ----
    place('Dead Sea');
    days.push({
      dayNumber: 6,
      title: 'Dead Sea',
      narrative: 'Free day at the Dead Sea, overnight Dead Sea.',
      overnightCity: 'Dead Sea',
      places: ['Dead Sea'],
    });

    // ---- Day 7: Bethany / Dead Sea ----
    {
      const stops = [...(wantBethany ? ['Bethany'] : []), 'Dead Sea'];
      place(...stops);
      days.push({
        dayNumber: 7,
        title: wantBethany ? 'Bethany / Dead Sea' : 'Dead Sea',
        narrative: wantBethany
          ? 'Optional Bethany-beyond-the-Jordan visit or leisure day, overnight Dead Sea.'
          : 'Leisure day at the Dead Sea, overnight Dead Sea.',
        overnightCity: 'Dead Sea',
        places: stops,
      });
    }

    // ---- Day 8: Departure ----
    resolvedDepartureCity = departureCityProvided || lastOvernight();
    days.push({
      dayNumber: 8,
      title: 'Departure',
      narrative: `Transfer from ${resolvedDepartureCity} to ${departureAirport} for your departure flight.`,
      overnightCity: null,
      places: [resolvedDepartureCity],
    });
  } else {
    // Non-standard durations: a generic editable shell (arrival → leisure → departure).
    // R.1 supports the canonical 8-day route; other lengths get a safe skeleton the
    // operator edits. (Multi-length routing is a later phase.)
    for (let d = 1; d <= durationDays; d++) {
      if (d === 1) {
        days.push({ dayNumber: 1, title: `Arrival ${arrivalCity}`, narrative: `Meet & assist at ${arrivalAirport}, transfer to ${arrivalCity}, overnight ${arrivalCity}.`, overnightCity: arrivalCity, places: [arrivalCity] });
      } else if (d === durationDays) {
        resolvedDepartureCity = departureCityProvided || lastOvernight();
        days.push({ dayNumber: d, title: 'Departure', narrative: `Transfer from ${resolvedDepartureCity} to ${departureAirport} for your departure flight.`, overnightCity: null, places: [resolvedDepartureCity] });
      } else {
        days.push({ dayNumber: d, title: `Day ${d}`, narrative: 'To be planned.', overnightCity: arrivalCity, places: [] });
      }
    }
  }

  const overnightCount = days.filter((d) => d.overnightCity).length;
  const unplacedRequiredPlaces = required.filter((p) => !placed.has(p.toLowerCase()));

  return {
    destination: 'Jordan',
    durationDays,
    nightCount: durationDays - 1,
    travelStyle,
    days,
    overnightCount,
    input: {
      arrivalCity,
      // Echo the departure city actually used (explicit value, or the resolved
      // last-overnight default), so downstream consumers see the real origin.
      departureCity: resolvedDepartureCity,
      arrivalAirport,
      departureAirport,
      currency,
      travelStyle,
      pax: Number.isFinite(Number(input.pax)) && Number(input.pax) > 0 ? Number(input.pax) : null,
      hotelCategory: clean(input.hotelCategory) || null,
      guideType: clean(input.guideType) || null,
      requiredPlaces: required,
      optionalPlaces: optional,
    },
    unplacedRequiredPlaces,
  };
}

// ---------------------------------------------------------------------------
// Phase R.2 — read-only hotel-stay SUGGESTIONS derived from existing itinerary
// days. This is pure grouping logic only: it reads day shells (dayNumber +
// title + notes/narrative), derives the overnight city per day, and groups
// consecutive same-city nights into stays. It performs NO hotel-candidate
// lookup, NO pricing, and NO writes — those are explicitly out of scope.
// ---------------------------------------------------------------------------

export interface DraftDayShell {
  dayNumber: number;
  title?: string | null;
  notes?: string | null;
  isActive?: boolean | null;
  /** Phase R.6A-1 — the QuoteItineraryDay row id, when known. Used to attach an
   *  applied hotel item to the stay's first itinerary day. Optional: grouping
   *  logic never depends on it. */
  id?: string | null;
}

// Phase R.2b — read-only candidate hotel for an overnight stay. Operational
// planning data only: NO contract NAME is exposed (contractId is internal),
// and NO pricing is included.
export interface HotelCandidate {
  hotelId: string;
  hotelName: string;
  city: string;
  category: string | null;
  hasActiveContract: boolean;
  verified: boolean;
  /** Internal reference only — never used as a display label. */
  contractId: string | null;
  reason: string;
}

export interface SuggestedHotelStay {
  city: string;
  nights: number;
  startDay: number;
  endDay: number;
  hotelCategory: string | null;
  /** Candidate hotels — empty until enriched by the service (R.2b). */
  candidateHotels: HotelCandidate[];
  notes: string;
  /** Phase R.6A-1 — id of the stay's FIRST itinerary day, when the source day
   *  shells carried ids. The hotel apply attaches the QuoteItem here. Null when
   *  the day id was not provided (grouping still works). */
  firstItineraryDayId: string | null;
}

const tidyCity = (value: string): string =>
  clean(value)
    .replace(/\.+$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

// Activity/route qualifiers that can trail a base city in a day title
// ("Amman City Tour", "Amman Highlights", "Petra Day Tour"). Stripping these
// keeps the title fallback from leaking an activity label as an overnight city.
const TITLE_QUALIFIER_RE = /\s+(?:city\s+tour|day\s+tour|half[-\s]?day\s+tour|highlights?|sightseeing|tour|excursion|leisure)\b/gi;

/**
 * Best-effort overnight city for a single day shell.
 *  1. PREFERRED — the generated narrative's "… overnight <City>." sentence. This
 *     is the stable, structured overnight signal and survives broad/activity
 *     day titles (e.g. "Amman City Tour" still resolves to Amman because the
 *     narrative reads "…, overnight Amman.").
 *  2. Fallback (edited/blank narrative) — the day title's final destination
 *     segment (split on "/"), after stripping arrival/visit/activity qualifiers
 *     so "Amman City Tour" → Amman and "Petra Visit / Wadi Rum" → Wadi Rum.
 * "Departure" days carry no overnight. Returns null when none can be derived.
 */
export function deriveOvernightCityFromDay(day: DraftDayShell): string | null {
  const title = clean(day.title || '');
  if (/^departure\b/i.test(title)) {
    return null;
  }

  // 1. Narrative-first: a genuine "… overnight <City>[.,;]" phrase. The city
  //    must start with a capital letter — generated narratives capitalize place
  //    names ("overnight Amman."), so this ignores incidental lowercase words
  //    after "overnight" in free-form edits (e.g. "no overnight needed").
  const notes = String(day.notes || '');
  const m = notes.match(/\bovernight\s+(?:in\s+|at\s+)?(?:the\s+)?([A-Z][A-Za-z'\- ]*?)\s*(?:[.,;]|$)/);
  if (m && tidyCity(m[1])) {
    return tidyCity(m[1]);
  }

  // 2. Title fallback — strip arrival/visit/activity qualifiers, then take the
  //    final "/"-separated destination segment.
  if (title) {
    const cleaned = title
      .replace(/^arrival\s+/i, '')
      .replace(/\s+visit\b/i, '')
      .replace(TITLE_QUALIFIER_RE, '');
    const segments = cleaned.split('/').map((s) => s.trim()).filter(Boolean);
    const last = segments.length ? segments[segments.length - 1] : cleaned;
    const city = tidyCity(last);
    if (city) {
      return city;
    }
  }
  return null;
}

/**
 * Group a quote's active itinerary days into suggested hotel stays by overnight
 * city. Consecutive days sharing the same overnight city merge into one stay.
 */
export function deriveOvernightStays(days: DraftDayShell[], hotelCategory?: string | null): SuggestedHotelStay[] {
  const category = clean(hotelCategory || '') || null;
  const active = (days || [])
    .filter((d) => d && d.isActive !== false && Number.isInteger(d.dayNumber))
    .slice()
    .sort((a, b) => a.dayNumber - b.dayNumber);

  const stays: SuggestedHotelStay[] = [];
  for (const day of active) {
    const city = deriveOvernightCityFromDay(day);
    if (!city) {
      continue; // departure / no-overnight day → not a stay
    }
    const prev = stays[stays.length - 1];
    if (prev && prev.city.toLowerCase() === city.toLowerCase() && day.dayNumber === prev.endDay + 1) {
      prev.endDay = day.dayNumber;
      prev.nights += 1;
      prev.notes = `${prev.nights} night${prev.nights === 1 ? '' : 's'} in ${prev.city} (Days ${prev.startDay}–${prev.endDay}).`;
    } else {
      stays.push({
        city,
        nights: 1,
        startDay: day.dayNumber,
        endDay: day.dayNumber,
        hotelCategory: category,
        candidateHotels: [],
        notes: `1 night in ${city} (Day ${day.dayNumber}).`,
        // First day of the stay → where an applied hotel item attaches (R.6A-1).
        firstItineraryDayId: day.id ?? null,
      });
    }
  }
  return stays;
}

// Phase R.2b — a normalized hotel-master record (as the service selects it
// from Prisma) for pure, testable candidate matching.
export interface HotelMasterRecord {
  id: string;
  name: string;
  city: string;
  category?: string | null;
  preferenceRank?: number | null;
  /** Currently-active contracts only (filtered by date in the query). */
  activeContracts?: Array<{ id: string; verified: boolean }>;
}

/**
 * Phase R.2b — rank read-only candidate hotels for a stay city. Pure: takes a
 * pre-fetched hotel list (no DB, no pricing). City match is fuzzy (handles
 * "Petra" ↔ "Petra / Wadi Musa"). Sort mirrors the Guided builder convention:
 * operator preferenceRank (lower wins) → VERIFIED contract → any active
 * contract → alphabetical. Never exposes the contract name.
 */
export function matchHotelCandidatesForStay(
  city: string,
  hotels: HotelMasterRecord[],
  options?: { limit?: number },
): HotelCandidate[] {
  const target = clean(city).toLowerCase();
  if (!target) {
    return [];
  }
  const matched = (hotels || []).filter((h) => {
    const hc = clean(h.city).toLowerCase();
    return Boolean(hc) && (hc === target || hc.includes(target) || target.includes(hc));
  });

  const ranked = matched
    .map((h) => {
      const contracts = h.activeContracts || [];
      const hasActiveContract = contracts.length > 0;
      const verified = contracts.some((c) => c.verified);
      const reason = verified
        ? 'Verified contract'
        : h.preferenceRank != null
          ? 'Preferred hotel'
          : hasActiveContract
            ? 'Active contract'
            : 'City match';
      return {
        candidate: {
          hotelId: h.id,
          hotelName: clean(h.name),
          city: clean(h.city),
          category: clean(h.category || '') || null,
          hasActiveContract,
          verified,
          contractId: contracts[0]?.id ?? null,
          reason,
        } as HotelCandidate,
        rank: h.preferenceRank,
        verified,
        hasActiveContract,
      };
    })
    .sort((a, b) => {
      if (a.rank != null || b.rank != null) {
        if (a.rank == null) return 1;
        if (b.rank == null) return -1;
        if (a.rank !== b.rank) return a.rank - b.rank;
      }
      if (a.verified !== b.verified) return a.verified ? -1 : 1;
      if (a.hasActiveContract !== b.hasActiveContract) return a.hasActiveContract ? -1 : 1;
      return a.candidate.hotelName.localeCompare(b.candidate.hotelName);
    });

  return ranked.slice(0, options?.limit ?? 5).map((r) => r.candidate);
}

// ---------------------------------------------------------------------------
// Phase R.3 — read-only TRANSPORT SUGGESTIONS derived from itinerary days.
// Pure classification only: reads day shells (title + notes), works out the
// transport NEED per day (arrival/departure transfer, touring/full-day, or
// none). It performs NO route/contract/rate lookup, NO pricing, and NO writes.
// pricingModeSuggestion is admin planning metadata (a hint), not client text.
// ---------------------------------------------------------------------------

export type SuggestedTransportType =
  | 'ARRIVAL_TRANSFER'
  | 'DEPARTURE_TRANSFER'
  | 'TOURING_FULL_DAY'
  | 'NONE';

export interface SuggestedTransport {
  dayNumber: number;
  title: string;
  routeLabel: string | null;
  origin: string | null;
  destination: string | null;
  stops: string[];
  suggestedTransportType: SuggestedTransportType;
  /** Admin planning hint only (e.g. POINT_TO_POINT / FULL_DAY) — never client text. */
  pricingModeSuggestion: 'POINT_TO_POINT' | 'FULL_DAY' | null;
  reason: string;
  /** R.3 is descriptive-only: no route match, no candidate products. */
  matchedRouteId: string | null;
  confidence: 'high' | 'medium' | 'low';
  candidateTransport: string[];
  /** Phase R.6B-1 — the QuoteItineraryDay row id, when known. An applied
   *  transport item attaches here. Null when the day id was not provided. */
  itineraryDayId: string | null;
}

const AIRPORT_RE = /\b([A-Z]{3,4})\b/; // e.g. QAIA

function transportForDay(day: DraftDayShell): SuggestedTransport {
  const dayNumber = day.dayNumber;
  const title = clean(day.title || '');
  const notes = String(day.notes || '');
  const base = (extra: Partial<SuggestedTransport>): SuggestedTransport => ({
    dayNumber,
    title,
    routeLabel: null,
    origin: null,
    destination: null,
    stops: [],
    suggestedTransportType: 'NONE',
    pricingModeSuggestion: null,
    reason: '',
    matchedRouteId: null,
    confidence: 'medium',
    candidateTransport: [],
    // R.6B-1 — where an applied transport item attaches (null if no id provided).
    itineraryDayId: day.id ?? null,
    ...extra,
  });

  // Arrival day → airport → city transfer.
  if (/^arrival\b/i.test(title)) {
    const city = tidyCity(title.replace(/^arrival\s+/i, '')) || tidyCity(title);
    const airportMatch = notes.match(/\bat\s+([A-Z]{3,4})\b/) || notes.match(AIRPORT_RE);
    const airport = airportMatch ? airportMatch[1] : 'Airport';
    return base({
      origin: airport,
      destination: city,
      routeLabel: `${airport} → ${city}`,
      suggestedTransportType: 'ARRIVAL_TRANSFER',
      pricingModeSuggestion: 'POINT_TO_POINT',
      reason: 'Airport arrival transfer.',
      confidence: 'high',
    });
  }

  // Departure day → city → airport transfer (narrative: "Transfer from X to Y").
  if (/^departure\b/i.test(title)) {
    const m = notes.match(/from\s+(.+?)\s+to\s+([A-Za-z][A-Za-z'\- /]*?)(?:\s+for\b|\.|$)/i);
    const origin = m ? tidyCity(m[1]) : null;
    const destination = m ? tidyCity(m[2]) : 'Airport';
    return base({
      origin,
      destination,
      routeLabel: origin ? `${origin} → ${destination}` : null,
      suggestedTransportType: 'DEPARTURE_TRANSFER',
      pricingModeSuggestion: 'POINT_TO_POINT',
      reason: 'Airport departure transfer.',
      confidence: 'high',
    });
  }

  // Otherwise infer from the route title. Multi-stop (or a City Tour) → a
  // private vehicle for the day; a bare single overnight city → leisure/no move.
  const cleanedTitle = title.replace(/\s+visit\b/i, '');
  const segments = cleanedTitle.split('/').map((s) => tidyCity(s)).filter(Boolean);
  const distinct = segments.filter((s, i) => segments.findIndex((x) => x.toLowerCase() === s.toLowerCase()) === i);

  if (segments.length >= 2 || /\btour\b/i.test(title)) {
    const origin = segments[0] || null;
    const destination = segments.length >= 2 ? segments[segments.length - 1] : origin;
    const stops = segments.slice(1, Math.max(segments.length - 1, 1));
    return base({
      origin,
      destination,
      stops,
      routeLabel: cleanedTitle || (origin ? `${origin}${destination && destination !== origin ? ` → ${destination}` : ''}` : null),
      suggestedTransportType: 'TOURING_FULL_DAY',
      pricingModeSuggestion: 'FULL_DAY',
      reason:
        distinct.length >= 2 && destination && origin && destination.toLowerCase() !== origin.toLowerCase()
          ? 'Touring day with an intercity move — private vehicle for the day.'
          : 'Touring day — private vehicle for the day.',
      confidence: 'medium',
    });
  }

  // Single overnight city, no tour/visit → leisure day, no transfer needed.
  return base({
    destination: segments[0] || null,
    suggestedTransportType: 'NONE',
    reason: 'Leisure day — no transfer required.',
    confidence: 'medium',
  });
}

/**
 * Phase R.3 — classify the transport need for each active itinerary day.
 * Read-only and descriptive; days needing no transport are returned with
 * type NONE (the caller may surface or hide them).
 */
export function deriveTransportSuggestions(days: DraftDayShell[]): SuggestedTransport[] {
  const active = (days || [])
    .filter((d) => d && d.isActive !== false && Number.isInteger(d.dayNumber))
    .slice()
    .sort((a, b) => a.dayNumber - b.dayNumber);

  const suggestions = active.map((d) => transportForDay(d));

  // Departure-origin safety net: if a departure day's notes don't yield an
  // origin city, fall back to the previous day's overnight city (the program's
  // last stay) rather than leaving it blank. The generator already writes the
  // correct origin into the narrative, so this only fills gaps for edited or
  // sparse departure days — it never overrides an origin the notes provided.
  suggestions.forEach((s, i) => {
    if (s.suggestedTransportType !== 'DEPARTURE_TRANSFER' || s.origin) {
      return;
    }
    for (let j = i - 1; j >= 0; j--) {
      const prevOvernight = deriveOvernightCityFromDay(active[j]);
      if (prevOvernight) {
        s.origin = prevOvernight;
        s.routeLabel = `${prevOvernight} → ${s.destination || 'Airport'}`;
        break;
      }
    }
  });

  return suggestions;
}

// ---------------------------------------------------------------------------
// Phase R.4 — read-only ENTRANCE / TICKET / ACTIVITY SUGGESTIONS derived from
// itinerary days. Pure place-recognition only: reads day shells (title +
// notes), recognizes known Jordan sightseeing places, and proposes the
// entrance/ticket/activity that day "probably needs". It performs NO pricing,
// NO QuoteItem creation, NO writes. The optional matched* fields are populated
// later by the SERVICE via a best-effort, read-only master lookup; the pure
// engine leaves them null. matchTerms / matchKind are admin lookup hints only
// (never client text).
// ---------------------------------------------------------------------------

export type SuggestedExperienceType = 'ENTRANCE' | 'TICKET' | 'ACTIVITY';

export interface SuggestedExperience {
  dayNumber: number;
  /** Phase R.6C-0 — the QuoteItineraryDay row id, when known. A future apply
   *  (R.6C-1) attaches the experience item here. Null when the day id was not
   *  provided. */
  itineraryDayId: string | null;
  place: string;
  suggestedItemType: SuggestedExperienceType;
  displayName: string;
  reason: string;
  confidence: 'high' | 'medium' | 'low';
  notes: string;
  /** Populated by the service's best-effort master match; null when unmatched. */
  matchedServiceId: string | null;
  matchedActivityId: string | null;
  matchedActivityRateVariantId: string | null;
  /** Human name of the matched master record (admin display), null when unmatched. */
  matchedName: string | null;
  /** Admin-only lookup hints for the service enrichment (never client text). */
  matchKind: 'SERVICE' | 'ACTIVITY';
  matchTerms: string[];
  variantTerms: string[];
  /** Specific (non-place) terms that should strongly prefer a precise record —
   *  e.g. "st. george"/"mosaic" for the Madaba suggestion (R.4d.2). */
  specificTerms: string[];
}

interface ExperienceRule {
  /** Recognize this place on a day from its normalized (lowercased) title+notes. */
  test: (text: string) => boolean;
  place: string;
  displayName: string;
  suggestedItemType: SuggestedExperienceType;
  reason: string;
  confidence: 'high' | 'medium' | 'low';
  matchKind: 'SERVICE' | 'ACTIVITY';
  matchTerms: string[];
  variantTerms?: string[];
  /** R.4d.2 — distinctive terms that pin the intended record over a broad
   *  place-only match. */
  specificTerms?: string[];
}

// Known Jordan sightseeing places and the experience each implies. Ordered so a
// day's suggestions read north→south / arrival→activity. Recognition is
// deliberately conservative: a place that is only an overnight/transit mention
// (e.g. "continue to Petra, overnight Petra") is NOT proposed — only an actual
// "Visit …"/tour/activity signal triggers it.
const EXPERIENCE_RULES: ExperienceRule[] = [
  {
    test: (t) => /\bjerash\b/.test(t),
    place: 'Jerash',
    displayName: 'Jerash Archaeological Site — entrance',
    suggestedItemType: 'ENTRANCE',
    reason: 'Jerash is visited on this day.',
    confidence: 'high',
    matchKind: 'SERVICE',
    matchTerms: ['jerash'],
  },
  {
    test: (t) => /\bamman\b/.test(t) && (/amman highlights/.test(t) || /city tour/.test(t)),
    place: 'Amman Citadel',
    displayName: 'Amman Citadel — entrance',
    suggestedItemType: 'ENTRANCE',
    reason: 'Amman city sightseeing is included on this day.',
    confidence: 'medium',
    matchKind: 'SERVICE',
    matchTerms: ['citadel'],
    specificTerms: ['citadel'],
  },
  {
    test: (t) => /\bamman\b/.test(t) && (/amman highlights/.test(t) || /city tour/.test(t)),
    place: 'Roman Theatre',
    displayName: 'Roman Theatre (Amman) — entrance',
    suggestedItemType: 'ENTRANCE',
    reason: 'Amman city sightseeing is included on this day.',
    confidence: 'medium',
    matchKind: 'SERVICE',
    matchTerms: ['roman theat'],
    specificTerms: ['roman theat'],
  },
  {
    test: (t) => /\bmadaba\b/.test(t),
    place: 'Madaba',
    displayName: 'Madaba — St. George Church (Mosaic Map) entrance',
    suggestedItemType: 'TICKET',
    reason: 'Madaba is visited en route on this day.',
    confidence: 'high',
    matchKind: 'SERVICE',
    matchTerms: ['madaba', 'st. george', 'st george', 'mosaic'],
    // The suggestion is specifically St. George / Mosaic Map — pin it over a
    // generic "Madaba Archaeological Park" record (R.4d.2).
    specificTerms: ['st. george', 'st george', 'george', 'mosaic', 'mosaic map', 'map'],
  },
  {
    test: (t) => /mount nebo|mt\.? nebo/.test(t),
    place: 'Mount Nebo',
    displayName: 'Mount Nebo — entrance',
    suggestedItemType: 'ENTRANCE',
    reason: 'Mount Nebo is visited en route on this day.',
    confidence: 'high',
    matchKind: 'SERVICE',
    matchTerms: ['nebo'],
    specificTerms: ['nebo', 'mount nebo'],
  },
  {
    test: (t) => /visit petra|petra visit/.test(t),
    place: 'Petra',
    displayName: 'Petra — entrance',
    suggestedItemType: 'ENTRANCE',
    reason: 'Petra is visited on this day.',
    confidence: 'high',
    matchKind: 'SERVICE',
    matchTerms: ['petra'],
  },
  {
    test: (t) => /jeep tour|jeep/.test(t),
    place: 'Wadi Rum',
    displayName: 'Wadi Rum Jeep Tour — 2 Hours – Rum Area',
    suggestedItemType: 'ACTIVITY',
    reason: 'A Wadi Rum jeep tour is featured on this day.',
    confidence: 'high',
    matchKind: 'ACTIVITY',
    matchTerms: ['wadi rum'],
    // R.6C-Fix — target the priced "2 Hours – Rum Area" jeep variant (the catalog
    // has a separate all-zero "Wadi Rum Jeep Experiences" placeholder activity whose
    // "2h Jeep Tour" variant costs 0). Region + duration terms select the real
    // "2 Hours – Rum Area" variant (and the activity that carries it) over the
    // placeholder; "rum area" also disambiguates from the Disi-area variants.
    variantTerms: ['rum area', '2 hour'],
  },
  {
    test: (t) => /bethany/.test(t),
    place: 'Bethany Beyond the Jordan',
    displayName: 'Bethany Beyond the Jordan — entrance',
    suggestedItemType: 'ENTRANCE',
    reason: 'Bethany Beyond the Jordan is included on this day.',
    confidence: 'high',
    matchKind: 'SERVICE',
    matchTerms: ['bethany', 'baptism'],
    specificTerms: ['bethany', 'baptism', 'baptism site'],
  },
  {
    test: (t) => /shoubak|shobak|montreal castle/.test(t),
    place: 'Shoubak',
    displayName: 'Shoubak Castle — entrance',
    suggestedItemType: 'ENTRANCE',
    reason: 'Shoubak Castle is included on this day.',
    confidence: 'medium',
    matchKind: 'SERVICE',
    matchTerms: ['shoubak', 'shobak', 'montreal'],
    specificTerms: ['shoubak', 'shobak', 'montreal'],
  },
];

function experiencesForDay(day: DraftDayShell): SuggestedExperience[] {
  const title = clean(day.title || '');
  // Arrival / departure days carry no sightseeing entrance.
  if (/^arrival\b/i.test(title) || /^departure\b/i.test(title)) {
    return [];
  }
  // Join with a separator so cross-boundary phrases can't form — e.g. a day
  // whose title ends "… / Petra" followed by notes starting "Visit Madaba …"
  // must NOT read as "Petra Visit". Each rule matches within title or notes,
  // never spanning the two.
  const text = `${title} | ${String(day.notes || '')}`.toLowerCase();
  return EXPERIENCE_RULES.filter((rule) => rule.test(text)).map((rule) => ({
    dayNumber: day.dayNumber,
    // R.6C-0 — where a future applied experience item attaches (null if no id).
    itineraryDayId: day.id ?? null,
    place: rule.place,
    suggestedItemType: rule.suggestedItemType,
    displayName: rule.displayName,
    reason: rule.reason,
    confidence: rule.confidence,
    notes: 'Read-only planning hint derived from the day route/narrative. Not applied, not priced.',
    matchedServiceId: null,
    matchedActivityId: null,
    matchedActivityRateVariantId: null,
    matchedName: null,
    matchKind: rule.matchKind,
    matchTerms: rule.matchTerms,
    variantTerms: rule.variantTerms || [],
    specificTerms: rule.specificTerms || [],
  }));
}

/**
 * Phase R.4 — propose the entrances/tickets/activities each active itinerary
 * day probably needs. Pure and descriptive: matched* fields start null and are
 * filled in (best-effort) by the service from existing master records.
 */
export function deriveExperienceSuggestions(days: DraftDayShell[]): SuggestedExperience[] {
  return (days || [])
    .filter((d) => d && d.isActive !== false && Number.isInteger(d.dayNumber))
    .slice()
    .sort((a, b) => a.dayNumber - b.dayNumber)
    .flatMap((d) => experiencesForDay(d));
}

// Phase R.4 — normalized master records the service pre-fetches for the
// best-effort (read-only) match. No pricing fields are carried.
export interface ServiceMasterRecord {
  serviceId: string;
  name: string;
  siteName: string | null;
}
export interface ActivityMasterRecord {
  id: string;
  name: string;
  city?: string | null;
  rateVariants?: Array<{ id: string; name: string }>;
}

// Phase R.4c — for an ENTRANCE/TICKET suggestion, a daytime site visit must NOT
// match an optional / "by Night" / activity variant. Records whose name reads
// like one of these are excluded; records that read like a main entrance/site/
// ticket are preferred. (The ACTIVITY branch has its own specific matching.)
const ENTRANCE_NEGATIVE_RE = /by night|\bnight\b|\boptional\b|\bactivity\b/i;
// Phase R.4d/R.4d.1 — a main SITE record (incl. "site & museum") must beat a
// museum-only record for the same place (e.g. the Jerash site entrance over
// "Jerash Archaeological Museum Entrance Fee"). "site" is the DOMINANT signal:
// a generic "Entrance Fee" suffix on a museum record (the R.4d failure) no
// longer ties with a real site record. Museum-only is penalized — not excluded —
// so it still wins when it is the only record available.
const SITE_RE = /\bsite\b/i;
const ENTRANCE_RE = /\bentrance\b/i;
const ENTRANCE_POSITIVE_RE = /\barchaeolog|\bticket\b/i;
const MUSEUM_RE = /\bmuseum\b/i;

/**
 * Phase R.4c/R.4d/R.4d.1/R.4d.2 — score a term-matched master record for an
 * ENTRANCE/TICKET suggestion. Higher is better.
 *  - R.4d.2: a record matching the suggestion's SPECIFIC terms (e.g. "st.
 *    george"/"mosaic" for Madaba) gets a dominant bonus so it beats a broad
 *    place-only record ("Madaba Archaeological Park").
 *  - R.4d.1: "site" dominates generic signals; museum-without-site is penalized.
 */
function scoreEntranceRecord(recordText: string, specificTerms: string[] = []): number {
  const text = recordText.toLowerCase();
  const hasSite = SITE_RE.test(text);
  let score = 0;
  if (specificTerms.some((term) => term && text.includes(term.toLowerCase()))) score += 5; // dominant specific-term match
  if (hasSite) score += 3; // main-site signal
  if (ENTRANCE_RE.test(text)) score += 1; // generic entrance signal
  if (ENTRANCE_POSITIVE_RE.test(text)) score += 1; // archaeological / ticket
  if (MUSEUM_RE.test(text) && !hasSite) score -= 2; // museum-only penalty
  return score;
}

/**
 * Phase R.4 — best-effort, read-only enrichment: attach the matched master
 * record id + human name to each suggestion when a confident name match exists.
 * Pure (no DB, no pricing). Never throws on a miss — leaves matched* null.
 *
 * Phase R.4c — ENTRANCE/TICKET matching is ranked, not first-hit: optional/night
 * variants are excluded and main entrance/site records preferred, so the Petra
 * daytime entrance no longer resolves to "Petra by Night". If only excluded
 * variants exist, the suggestion stays descriptive (matched null).
 */
export function enrichExperienceMatches(
  suggestions: SuggestedExperience[],
  masters: { services?: ServiceMasterRecord[]; activities?: ActivityMasterRecord[] },
): SuggestedExperience[] {
  const services = masters.services || [];
  const activities = masters.activities || [];
  const hit = (haystack: string, terms: string[]) => {
    const h = clean(haystack).toLowerCase();
    return Boolean(h) && terms.some((t) => h.includes(t.toLowerCase()));
  };

  return suggestions.map((s) => {
    if (s.matchKind === 'ACTIVITY') {
      // R.6C-Fix — count how many of the rule's variant terms a variant name
      // contains (a ranked match, not first-hit). Used to (a) prefer the activity
      // that actually carries the intended variant, and (b) pick that variant.
      const variantScore = (name: string): number => {
        const n = clean(name).toLowerCase();
        if (!n || !s.variantTerms.length) return 0;
        return s.variantTerms.filter((t) => n.includes(t.toLowerCase())).length;
      };
      const bestVariantScore = (a: ActivityMasterRecord): number =>
        (a.rateVariants || []).reduce((best, v) => Math.max(best, variantScore(v.name)), 0);

      const matched = activities.filter((a) => hit(a.name, s.matchTerms) || hit(a.city || '', s.matchTerms));
      // Prefer the term-matched activity that carries a variant matching the rule's
      // variant terms — so "Wadi Rum Jeep Tour" (with its priced "2 Hours – Rum Area"
      // variant) wins over the all-zero "Wadi Rum Jeep Experiences" placeholder.
      // Stable: keep catalog order among equally-scored activities.
      const activity = matched
        .map((a, index) => ({ a, index, score: bestVariantScore(a) }))
        .sort((x, y) => (y.score - x.score) || (x.index - y.index))[0]?.a || null;
      if (activity) {
        const variants = activity.rateVariants || [];
        const variant =
          (s.variantTerms.length
            ? variants
                .map((v, index) => ({ v, index, score: variantScore(v.name) }))
                .filter((c) => c.score > 0)
                .sort((x, y) => (y.score - x.score) || (x.index - y.index))[0]?.v
            : null) || variants[0] || null;
        return {
          ...s,
          matchedActivityId: activity.id,
          matchedActivityRateVariantId: variant?.id ?? null,
          matchedName: clean(activity.name) || null,
        };
      }
      return s;
    }

    // SERVICE (entrance/ticket): rank the term-matched records.
    //  1. exclude optional / "by Night" / activity variants (a daytime entrance
    //     must not resolve to "… by Night" or an optional add-on);
    //  2. score the rest — a main site/entrance record (incl. "site & museum")
    //     outranks a museum-only record (R.4d); stable on ties;
    //  3. if every candidate is excluded, leave the suggestion descriptive.
    const svc =
      services
        .filter((m) => hit(m.siteName || '', s.matchTerms) || hit(m.name, s.matchTerms))
        .map((m, index) => {
          const recordText = `${clean(m.siteName || '')} ${clean(m.name)}`;
          return { m, index, negative: ENTRANCE_NEGATIVE_RE.test(recordText), score: scoreEntranceRecord(recordText, s.specificTerms) };
        })
        .filter((c) => !c.negative)
        .sort((a, b) => b.score - a.score || a.index - b.index)[0]?.m || null;
    if (svc) {
      return { ...s, matchedServiceId: svc.serviceId, matchedName: clean(svc.siteName || svc.name) || null };
    }
    return s;
  });
}

// ---------------------------------------------------------------------------
// Phase R.5 — read-only GUIDE SUGGESTIONS derived from itinerary days. Pure
// classification only: reads day shells (title + notes) and proposes a LOCAL
// guide for the major guided sites (Jerash, Petra), NONE on arrival/departure/
// leisure days. NO QuoteItem creation, NO pricing, NO writes. Output carries
// only client/admin-friendly fields — never raw guide metadata (minPax/maxPax/
// requiresOperatorConfirmation/overnight flags/internal enums).
// ---------------------------------------------------------------------------

export type SuggestedGuideType = 'LOCAL' | 'ESCORT_OPTION' | 'NONE';

export interface SuggestedGuide {
  dayNumber: number;
  title: string;
  guideTypeSuggestion: SuggestedGuideType;
  displayName: string;
  reason: string;
  confidence: 'high' | 'medium' | 'low';
  placesCovered: string[];
  // Phase R.6D-0 — the QuoteItineraryDay row id, when known. Used to attach an
  // applied guide item to its day in R.6D-1. Optional; classification never
  // depends on it.
  itineraryDayId?: string | null;
  // Phase R.6D-0 — readiness + read-only estimate (apply lands in R.6D-1). Set by
  // the service, never by the pure deriver. LOCAL → MATCHED with a guide-rate
  // estimate; NONE days carry no estimate. Never includes raw guide metadata.
  readiness?: 'MATCHED' | 'NONE' | 'ESCORT_OPTION';
  guideType?: 'local' | null;
  guideDuration?: 'full_day' | null;
  estimatedCost?: number | null;
  estimatedSell?: number | null;
  currency?: string | null;
  markupPercent?: number | null;
}

// Major sites that conventionally take a dedicated local guide.
const GUIDED_SITE_RULES: Array<{ place: string; test: (text: string) => boolean }> = [
  { place: 'Jerash', test: (t) => /\bjerash\b/.test(t) },
  // Petra only counts on the VISIT day, not the arrival/transit/overnight mention.
  { place: 'Petra', test: (t) => /visit petra|petra visit/.test(t) },
];

function guideForDay(day: DraftDayShell): SuggestedGuide {
  const dayNumber = day.dayNumber;
  const title = clean(day.title || '');
  const none = (reason: string, confidence: 'high' | 'medium' | 'low' = 'medium'): SuggestedGuide => ({
    dayNumber,
    title,
    guideTypeSuggestion: 'NONE',
    displayName: 'No guide required',
    reason,
    confidence,
    placesCovered: [],
    itineraryDayId: day.id ?? null,
  });

  // Arrival / departure transfers carry no guide by default.
  if (/^arrival\b/i.test(title) || /^departure\b/i.test(title)) {
    return none('Airport transfer day — no guide required.', 'high');
  }

  const text = `${title} | ${String(day.notes || '')}`.toLowerCase();
  const covered = GUIDED_SITE_RULES.filter((rule) => rule.test(text)).map((rule) => rule.place);

  if (covered.length > 0) {
    return {
      dayNumber,
      title,
      guideTypeSuggestion: 'LOCAL',
      displayName: `Local guide for ${covered.join(' & ')}`,
      reason: `Guided sightseeing at ${covered.join(' & ')} on this day.`,
      confidence: 'high',
      placesCovered: covered,
      itineraryDayId: day.id ?? null,
    };
  }

  return none('No major guided site on this day — no dedicated guide required.');
}

/**
 * Phase R.5 — classify the guide need for each active itinerary day. Read-only
 * and descriptive; days needing no guide are returned with type NONE (the
 * caller may surface or hide them). An ESCORT_OPTION is offered separately as a
 * program-level planning note (see the service), not as per-day clutter.
 */
export function deriveGuideSuggestions(days: DraftDayShell[]): SuggestedGuide[] {
  return (days || [])
    .filter((d) => d && d.isActive !== false && Number.isInteger(d.dayNumber))
    .slice()
    .sort((a, b) => a.dayNumber - b.dayNumber)
    .map((d) => guideForDay(d));
}
