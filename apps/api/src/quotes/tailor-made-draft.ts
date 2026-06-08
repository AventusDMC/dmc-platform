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
  const departureCity = clean(input.departureCity) || 'Amman';
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
    days.push({
      dayNumber: 8,
      title: 'Departure',
      narrative: `Transfer from ${departureCity} to ${departureAirport} for your departure flight.`,
      overnightCity: null,
      places: [departureCity],
    });
  } else {
    // Non-standard durations: a generic editable shell (arrival → leisure → departure).
    // R.1 supports the canonical 8-day route; other lengths get a safe skeleton the
    // operator edits. (Multi-length routing is a later phase.)
    for (let d = 1; d <= durationDays; d++) {
      if (d === 1) {
        days.push({ dayNumber: 1, title: `Arrival ${arrivalCity}`, narrative: `Meet & assist at ${arrivalAirport}, transfer to ${arrivalCity}, overnight ${arrivalCity}.`, overnightCity: arrivalCity, places: [arrivalCity] });
      } else if (d === durationDays) {
        days.push({ dayNumber: d, title: 'Departure', narrative: `Transfer from ${departureCity} to ${departureAirport} for your departure flight.`, overnightCity: null, places: [departureCity] });
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
      departureCity,
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
}

const tidyCity = (value: string): string =>
  clean(value)
    .replace(/\.+$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

/**
 * Best-effort overnight city for a single day shell.
 *  1. The day title's final destination segment (split on "/") — the reliable
 *     overnight signal for the generated route titles ("Amman / Jerash / Amman"
 *     → Amman; "Petra Visit / Wadi Rum" → Wadi Rum; "Arrival Amman" → Amman).
 *     "Departure" days carry no overnight.
 *  2. Fallback (vague/edited title): a genuine "…, overnight <City>." sentence
 *     in the narrative.
 * Returns null when no overnight can be derived (e.g. the departure day).
 */
export function deriveOvernightCityFromDay(day: DraftDayShell): string | null {
  const title = clean(day.title || '');
  if (/^departure\b/i.test(title)) {
    return null;
  }
  if (title) {
    const cleaned = title.replace(/^arrival\s+/i, '').replace(/\s+visit\b/i, '');
    const segments = cleaned.split('/').map((s) => s.trim()).filter(Boolean);
    const last = segments.length ? segments[segments.length - 1] : cleaned;
    const city = tidyCity(last);
    if (city) {
      return city;
    }
  }
  // Title gave nothing usable — fall back to a real "…, overnight <City>." note.
  const notes = String(day.notes || '');
  const m = notes.match(/,\s*overnight\s+(?:in\s+|at\s+)?(?:the\s+)?([A-Za-z][A-Za-z'\- /]*?)\s*\.?\s*$/i);
  return m && tidyCity(m[1]) ? tidyCity(m[1]) : null;
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
