'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { buildAuthHeaders } from '../../lib/auth-client';
import { getErrorMessage } from '../../lib/api';
import type { RouteOption } from '../../lib/routes';
import {
  resolveTransportPlan,
  computeTransportSell,
  classifyPackageTransportPolicy,
  TRANSPORT_DEFAULT_MARKUP,
  type TransportServiceTypeOption,
  type TransportPricingBasis,
} from './tailor-made-transport-resolve';

// T.5D-2 — operator-safe pricing-basis labels for the transport price preview.
// Never expose raw internal tokens (POINT_TO_POINT / FULL_DAY / DAILY_FULL_DAY /
// capacity_unit / service-type or mode internals) — only these clean phrases.
const PRICING_BASIS_LABELS: Record<TransportPricingBasis, string> = {
  PACKAGE_FULL_DAY: 'Package full-day vehicle rate',
  ROUTE_RATE: 'Regular route rate',
  ARRIVAL_TRANSFER: 'Arrival transfer',
  DEPARTURE_TRANSFER: 'Departure transfer',
  NO_TRANSPORT: 'No transport / leisure day',
};

// Phase R.1c — UI for the Phase R.1/R.1b tailor-made draft endpoints. This panel
// only PREVIEWS and APPLIES editable itinerary days. It never creates priced
// QuoteItems, hotels, transport, tickets, guides, or pricing — those are later
// steps. It calls the existing /api proxies (preview = read-only, apply = day
// rows only with 409 conflict protection).

type DraftDay = {
  dayNumber: number;
  title: string;
  narrative: string;
  overnightCity: string | null;
  places: string[];
};

type Draft = {
  durationDays: number;
  nightCount: number;
  overnightCount: number;
  days: DraftDay[];
  unplacedRequiredPlaces: string[];
};

type HotelCandidate = {
  hotelId: string;
  hotelName: string;
  city: string;
  category: string | null;
  hasActiveContract: boolean;
  verified: boolean;
  reason: string;
  contractId: string | null;
};

// Phase R.6A-0 — read-only hotel-stay configure / price-preview state.
// Phase R.6A-1 — pricePreview also echoes the matched rate's identifiers so the
// canonical hotel apply (POST /quotes/:id/items) can reuse them verbatim.
type HotelStayPreview = {
  availableRoomCategories: Array<{ id: string; name: string }>;
  availableMealPlans: string[];
  availableOccupancyTypes: string[];
  serviceDate: string | null;
  defaults: { roomCount: number; paxCount: number; occupancyType: string | null; mealPlan: string | null; markupPercent: number };
  pricePreview: {
    totalCost: number;
    totalSell: number;
    currency: string | null;
    markupPercent: number;
    roomCategoryId?: string;
    occupancyType?: string;
    mealPlan?: string;
    seasonName?: string | null;
  } | null;
  rateStatus: string;
  message: string;
};

type HotelStay = {
  city: string;
  nights: number;
  startDay: number;
  endDay: number;
  hotelCategory: string | null;
  candidateHotels: HotelCandidate[];
  notes: string;
  // Phase R.6A-1 — id of the stay's first itinerary day (apply attaches here).
  firstItineraryDayId?: string | null;
};

type TransportSuggestion = {
  dayNumber: number;
  title: string;
  routeLabel: string | null;
  origin: string | null;
  destination: string | null;
  stops?: string[];
  suggestedTransportType: 'ARRIVAL_TRANSFER' | 'DEPARTURE_TRANSFER' | 'TOURING_FULL_DAY' | 'NONE';
  pricingModeSuggestion: 'POINT_TO_POINT' | 'FULL_DAY' | null;
  reason: string;
  confidence: string;
  // Phase R.6B-1 — id of this day's itinerary row (apply attaches the transport item here).
  itineraryDayId?: string | null;
};

// Phase R.6B-0 — read-only transport price-preview state for one day. Admin-only
// planning fields (vehicle/service-type/pricing-mode) — never client proposal text.
type TransportPreview = {
  status: 'OK' | 'NO_ROUTE' | 'NO_RATE';
  routeLabel: string | null;
  // T.5D-2 — operator-safe pricing basis from the resolver (drives the clean
  // label shown in the preview; raw internal tokens are never displayed).
  pricingBasis: TransportPricingBasis;
  serviceTypeName: string | null;
  pricingModeHint: 'POINT_TO_POINT' | 'FULL_DAY' | null;
  vehicleName: string | null;
  cost: number | null;
  sell: number | null;
  currency: string | null;
  markupPercent: number;
  // Phase R.6B-1 — resolved apply identifiers (for the canonical createItem path).
  routeId?: string | null;
  normalizedKey?: string | null;
  serviceTypeId?: string | null;
  // T.5D-3a — the exact VehicleRate row the preview priced against, when the
  // engine returned one (package full-day disposal rate). Passed back on apply so
  // createItem pins this rate instead of re-resolving — preview and apply cannot
  // diverge. Null for rate-rule (per-leg) legs, which apply unchanged.
  vehicleRateId?: string | null;
  reason: string;
};

type ExperienceSuggestion = {
  dayNumber: number;
  place: string;
  suggestedItemType: string;
  displayName: string;
  reason: string;
  confidence: string;
  matchedName: string | null;
  // Phase R.6C-0 — readiness + read-only estimate (apply lands in R.6C-1). The
  // matched ids are kept for the future apply; the estimate is a gross unit cost.
  itineraryDayId?: string | null;
  matchedServiceId?: string | null;
  matchedActivityId?: string | null;
  matchedActivityRateVariantId?: string | null;
  readiness?: 'MATCHED' | 'NO_MATCH' | 'NEEDS_VARIANT';
  estimatedCost?: number | null;
  estimatedSell?: number | null;
  currency?: string | null;
  markupPercent?: number;
  jordanPassEligible?: boolean;
};

type GuideSuggestion = {
  dayNumber: number;
  title: string;
  guideTypeSuggestion: string;
  displayName: string;
  reason: string;
  confidence: string;
  placesCovered: string[];
  // Phase R.6D-0 — readiness + read-only estimate (apply lands in R.6D-1).
  itineraryDayId?: string | null;
  readiness?: 'MATCHED' | 'NONE' | 'ESCORT_OPTION';
  guideType?: 'local' | null;
  guideDuration?: 'full_day' | null;
  estimatedCost?: number | null;
  estimatedSell?: number | null;
  currency?: string | null;
  markupPercent?: number | null;
};

type TailorMadeDraftPanelProps = {
  apiBaseUrl: string;
  quoteId: string;
  quoteCurrency?: string | null;
  // Phase R.6A-1/R.6A-2 — the HOTEL-type QuoteService id (apply uses the canonical
  // createItem hotel branch via POST /quotes/:id/items) and the itinerary-day ids
  // that ALREADY have a hotel item. Phase R.6A-2 made the conflict guard
  // stay-level: a stay is blocked only when its first itinerary day already has a
  // hotel item; other stays remain applyable.
  hotelServiceId?: string | null;
  appliedHotelDayIds?: string[];
  // Phase R.6B-0 — route + transport-service-type catalogs used to resolve a
  // transport suggestion to a concrete route/service-type for the read-only
  // price preview (via the canonical /transport-pricing/calculate endpoint).
  routes?: RouteOption[];
  transportServiceTypes?: TransportServiceTypeOption[];
  // Phase R.6B-1 — the TRANSPORT-type QuoteService id (apply uses the canonical
  // createItem transport branch via POST /quotes/:id/items), the itinerary-day
  // ids that ALREADY have a transport item (per-day conflict guard), and the
  // quote pax count passed on apply.
  transportServiceId?: string | null;
  appliedTransportDayIds?: string[];
  defaultPax?: number;
  // Phase R.6C-1 — per-(day, record) experience guard keys already applied on the
  // server (`${dayId}:act:${activityId}` / `${dayId}:svc:${serviceId}`). The panel
  // blocks re-applying the SAME matched record to the SAME day; other experiences
  // and other days stay applyable.
  appliedExperienceKeys?: string[];
  // Phase R.6D-1 — the GUIDE-type QuoteService id (apply uses the canonical
  // createItem guide branch via POST /quotes/:id/items) and the itinerary-day ids
  // that ALREADY have a guide item (per-day conflict guard — one guide per day).
  guideServiceId?: string | null;
  appliedGuideDayIds?: string[];
};

// Phase S.2C — grouped controlled place selector (UI/config only). The backend
// preview/apply contract is unchanged: buildInput still emits
// requiredPlaces:string[] + optionalPlaces:string[].
//
// "Included in this route" places are FIXED for the 8-day classic route — Amman
// is the arrival base and Petra / Wadi Rum / Dead Sea are hardcoded route stops,
// so the generator always weaves them. They render as read-only chips and are
// always emitted into requiredPlaces; they are NOT removable in this phase
// (route-level editing is a later phase).
//
// "Optional add-ons" are the only places the 8-day generator actually toggles
// from the place inputs (Jerash / Madaba / Mount Nebo / Bethany), each backed by
// a matcher rule + a live catalog record. They are emitted into optionalPlaces.
//
// Deferred places (Ajloun, Kerak, Little Petra, Aqaba-as-sightseeing, Umm Qais,
// Pella, Salt, Blessed Tree, Jordan Valley Islamic Sites, Mu'ta) are NOT exposed
// here — they are not woven by the generator and/or have no service match yet.
// No comma free-text and no Custom place input in this phase.
const INCLUDED_PLACES = ['Amman', 'Petra', 'Wadi Rum', 'Dead Sea'];
const OPTIONAL_ADDON_PLACES = ['Jerash', 'Madaba', 'Mount Nebo', 'Bethany'];
// Phase S.2A — controlled single-select option catalogs. UI/config only: every
// dropdown still emits the SAME plain string the free-text input did, so the
// backend preview/apply contract is unchanged. "Custom…" reveals a free-text
// input for edge values that aren't in the catalog.
const HOTEL_CATEGORY_OPTIONS = ['3-star', '4-star', '5-star', 'Mixed'];
const ARRIVAL_POINT_OPTIONS = ['QAIA', 'Amman', 'Aqaba', 'Allenby', 'Sheikh Hussein', 'Wadi Araba'];
const ITINERARY_CITY_OPTIONS = ['Amman', 'Dead Sea', 'Petra', 'Wadi Rum', 'Aqaba', 'Ajloun'];
const GUIDE_TYPE_OPTIONS = ['local', 'escort', 'none'];
const CURRENCY_OPTIONS = ['USD', 'JOD', 'EUR'];
// Trip style stays backend-safe: friendly LABELS mapped to the EXISTING enum
// VALUES the generator understands (classic / religious / adventure / luxury).
// Islamic Heritage / Family are intentionally NOT exposed in S.2A.
const TRIP_STYLE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'classic', label: 'Classic Jordan' },
  { value: 'religious', label: 'Christian / Biblical' },
  { value: 'adventure', label: 'Adventure' },
  { value: 'luxury', label: 'Luxury' },
];
const CUSTOM_OPTION_VALUE = '__custom__';

// Phase S.2B-1 — Overnight Sequence editor (UI PREVIEW ONLY). The operator can
// see/edit where clients sleep, but this is NOT submitted to the backend in this
// phase: buildInput() is unchanged and no overnightSequence field is sent. The
// generator continues to derive overnights heuristically until a later backend
// phase. Overnight cities (where clients sleep) are deliberately SEPARATE from
// the sightseeing places selector (which drives entrance/activity/guide
// suggestions) — e.g. Aqaba/Ajloun are valid overnights but not sightseeing
// services here.
const OVERNIGHT_CITY_OPTIONS = ['Amman', 'Dead Sea', 'Petra', 'Wadi Rum', 'Aqaba', 'Ajloun'];
// Default sequence for the 8-day classic route — matches today's generated
// overnights exactly (Amman×2 → Petra×1 → Wadi Rum×1 → Dead Sea×3 = 7 nights).
const DEFAULT_OVERNIGHT_SEQUENCE: Array<{ city: string; nights: number }> = [
  { city: 'Amman', nights: 2 },
  { city: 'Petra', nights: 1 },
  { city: 'Wadi Rum', nights: 1 },
  { city: 'Dead Sea', nights: 3 },
];

// Phase S.2A — a single-select with a "Custom…" escape hatch. Owns only its
// custom-mode flag; the chosen/typed value is always a plain string lifted to the
// parent via onChange, so the submit payload type is identical to the prior
// free-text input. Custom is secondary (last option), never the default.
function SelectWithCustom({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (next: string) => void;
  options: string[];
}) {
  const [custom, setCustom] = useState(value !== '' && !options.includes(value));
  if (custom) {
    return (
      <>
        <select
          value={CUSTOM_OPTION_VALUE}
          onChange={(e) => {
            if (e.target.value !== CUSTOM_OPTION_VALUE) {
              setCustom(false);
              onChange(e.target.value);
            }
          }}
        >
          {options.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
          <option value={CUSTOM_OPTION_VALUE}>Custom…</option>
        </select>
        <input
          className="select-with-custom-input"
          value={value}
          placeholder="Custom value"
          onChange={(e) => onChange(e.target.value)}
        />
      </>
    );
  }
  return (
    <select
      value={options.includes(value) ? value : ''}
      onChange={(e) => {
        if (e.target.value === CUSTOM_OPTION_VALUE) {
          setCustom(true);
        } else {
          onChange(e.target.value);
        }
      }}
    >
      {options.map((opt) => (
        <option key={opt} value={opt}>{opt}</option>
      ))}
      <option value={CUSTOM_OPTION_VALUE}>Custom…</option>
    </select>
  );
}
// Standard hotel markup applied to every applied hotel stay. Mirrors the API's
// HOTEL_DEFAULT_MARKUP (apps/api/src/common/pricing-constants.ts); kept as one
// named constant here rather than a scattered literal.
const HOTEL_DEFAULT_MARKUP = 15;
// Phase R.6A-2 — stay-level conflict message (one hotel per stay/day).
const HOTEL_STAY_CONFLICT_MESSAGE =
  'This stay already has a hotel item. Remove the existing hotel item before applying another hotel to this stay.';
// Phase R.6B-1 — per-day transport conflict message (one transport per day).
const TRANSPORT_DAY_CONFLICT_MESSAGE =
  'This day already has transport. Remove the existing transport item before applying another to this day.';
// Phase R.6C-1 — standard experience markup applied to every applied
// entrance/activity. Mirrors the API's EXPERIENCE_DEFAULT_MARKUP
// (apps/api/src/common/pricing-constants.ts); one named constant, no scattered literal.
const EXPERIENCE_DEFAULT_MARKUP = 20;
// Phase R.6C-1 — per-(day, record) experience conflict message.
const EXPERIENCE_CONFLICT_MESSAGE = 'This experience is already applied to this day.';
// Phase R.6D-1 — standard guide markup (== API GUIDE_DEFAULT_MARKUP) + the per-day
// guide conflict message (one guide per day).
const GUIDE_DEFAULT_MARKUP = 20;
const GUIDE_DAY_CONFLICT_MESSAGE = 'This day already has a guide item.';

export function TailorMadeDraftPanel({ apiBaseUrl, quoteId, quoteCurrency, hotelServiceId, appliedHotelDayIds, routes, transportServiceTypes, transportServiceId, appliedTransportDayIds, defaultPax, appliedExperienceKeys, guideServiceId, appliedGuideDayIds }: TailorMadeDraftPanelProps) {
  const router = useRouter();

  const [durationDays, setDurationDays] = useState('8');
  const [arrivalCity, setArrivalCity] = useState('Amman');
  const [arrivalAirport, setArrivalAirport] = useState('QAIA');
  const [departureCity, setDepartureCity] = useState('Dead Sea');
  const [departureAirport, setDepartureAirport] = useState('QAIA');
  const [hotelCategory, setHotelCategory] = useState('4-star');
  const [travelStyle, setTravelStyle] = useState('classic');
  // Phase S.2C — fixed included places (always emitted into requiredPlaces, see
  // buildInput) plus toggleable optional add-ons. Defaults preserve today's
  // behavior EXACTLY: Jerash / Madaba / Mount Nebo / Bethany were all woven by
  // default before (Jerash sat in the required comma string; the other three
  // were checkbox-on), so all four start selected.
  const [optionalSelected, setOptionalSelected] = useState<Record<string, boolean>>({
    Jerash: true,
    Madaba: true,
    'Mount Nebo': true,
    Bethany: true,
  });
  const [guideType, setGuideType] = useState('local');
  const [currency, setCurrency] = useState((quoteCurrency || 'USD').toUpperCase());
  // Phase S.2B-3 — overnight sequence rows. Now SUBMITTED via buildInput() when
  // valid (see overnightSequenceValid below); the backend (S.2B-2) applies it to
  // the generated overnight cities + narratives, which hotel suggestions re-parse.
  const [overnightSequence, setOvernightSequence] = useState<Array<{ city: string; nights: number }>>(
    DEFAULT_OVERNIGHT_SEQUENCE.map((row) => ({ ...row })),
  );
  const [replaceExisting, setReplaceExisting] = useState(false);
  // Hotfix — non-8-day durations fall back to a basic day shell (the structured
  // route weaving is 8-day-only). The operator must explicitly confirm basic-shell
  // mode before Apply when the duration isn't 8. 8-day behavior is unchanged.
  const [basicShellConfirmed, setBasicShellConfirmed] = useState(false);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [success, setSuccess] = useState('');

  // Phase R.2 — read-only hotel-stay suggestions (grouping only; no apply).
  const [hotelStays, setHotelStays] = useState<HotelStay[] | null>(null);
  const [stayMessage, setStayMessage] = useState('');
  const [suggesting, setSuggesting] = useState(false);

  // Phase R.6A-0 — read-only hotel-stay configure / price preview (no apply).
  // One active candidate at a time, keyed by `${stayStartDay}:${hotelId}`.
  const [hotelConfigKey, setHotelConfigKey] = useState<string | null>(null);
  const [hotelConfig, setHotelConfig] = useState<HotelStayPreview | null>(null);
  const [hotelConfigRoom, setHotelConfigRoom] = useState('');
  const [hotelConfigOccupancy, setHotelConfigOccupancy] = useState('');
  const [hotelConfigMeal, setHotelConfigMeal] = useState('');
  const [hotelConfigLoading, setHotelConfigLoading] = useState(false);

  // Phase R.6A-1/R.6A-2 — apply one configured hotel stay as a single HOTEL
  // QuoteItem via the canonical createItem path. The guard is STAY-LEVEL: a stay
  // is blocked only when its first itinerary day already has a hotel item — from
  // the server (appliedHotelDayIds) or applied in this session. Other stays stay
  // applyable.
  const [hotelApplying, setHotelApplying] = useState(false);
  const [sessionAppliedDayIds, setSessionAppliedDayIds] = useState<string[]>([]);
  // Server-known days with a hotel item + days applied this session.
  const stayHasHotelApplied = (dayId: string | null | undefined): boolean =>
    Boolean(dayId) && ((appliedHotelDayIds ?? []).includes(dayId as string) || sessionAppliedDayIds.includes(dayId as string));
  const stayAppliedThisSession = (dayId: string | null | undefined): boolean =>
    Boolean(dayId) && sessionAppliedDayIds.includes(dayId as string);

  // Phase R.3 — read-only transport suggestions (no apply, no pricing).
  const [transport, setTransport] = useState<TransportSuggestion[] | null>(null);
  const [transportMessage, setTransportMessage] = useState('');
  const [suggestingTransport, setSuggestingTransport] = useState(false);

  // Phase R.6B-0 — read-only transport price preview, one active day at a time.
  const [transportPreviewDay, setTransportPreviewDay] = useState<number | null>(null);
  const [transportPreview, setTransportPreview] = useState<TransportPreview | null>(null);
  const [transportPreviewLoading, setTransportPreviewLoading] = useState(false);

  // Phase R.6B-1 — apply one OK-priced transport day as a single TRANSPORT
  // QuoteItem. Per-DAY conflict guard: a day is blocked only when it already has
  // a transport item (server-known appliedTransportDayIds, or applied this
  // session). Other days remain applyable.
  const [transportApplying, setTransportApplying] = useState(false);
  const [sessionAppliedTransportDayIds, setSessionAppliedTransportDayIds] = useState<string[]>([]);
  const dayHasTransport = (dayId: string | null | undefined): boolean =>
    Boolean(dayId) && ((appliedTransportDayIds ?? []).includes(dayId as string) || sessionAppliedTransportDayIds.includes(dayId as string));
  const dayTransportAppliedThisSession = (dayId: string | null | undefined): boolean =>
    Boolean(dayId) && sessionAppliedTransportDayIds.includes(dayId as string);

  // Phase R.4 — read-only entrance/ticket/activity suggestions (no apply, no pricing).
  const [experiences, setExperiences] = useState<ExperienceSuggestion[] | null>(null);
  const [experienceMessage, setExperienceMessage] = useState('');
  const [suggestingExperiences, setSuggestingExperiences] = useState(false);
  // Phase R.6C-1 — apply state. One Experience QuoteItem at a time via the
  // canonical POST /quotes/:id/items path. The per-(day, record) guard combines
  // server-known keys (appliedExperienceKeys) with those applied this session.
  const [experienceApplying, setExperienceApplying] = useState<string | null>(null);
  const [sessionAppliedExperienceKeys, setSessionAppliedExperienceKeys] = useState<string[]>([]);
  // The stable key for a suggestion: activity matches by activityId, an
  // entrance/ticket by its matched service id. Mirrors the workspace derivation.
  const experienceKey = (e: ExperienceSuggestion): string | null => {
    if (!e.itineraryDayId) return null;
    if (e.matchedActivityId) return `${e.itineraryDayId}:act:${e.matchedActivityId}`;
    if (e.matchedServiceId) return `${e.itineraryDayId}:svc:${e.matchedServiceId}`;
    return null;
  };
  const experienceApplied = (e: ExperienceSuggestion): boolean => {
    const key = experienceKey(e);
    return Boolean(key) && ((appliedExperienceKeys ?? []).includes(key as string) || sessionAppliedExperienceKeys.includes(key as string));
  };

  // Phase R.5 — read-only guide suggestions (no apply, no pricing).
  const [guides, setGuides] = useState<GuideSuggestion[] | null>(null);
  const [guideMessage, setGuideMessage] = useState('');
  const [guideEscortNote, setGuideEscortNote] = useState('');
  const [suggestingGuides, setSuggestingGuides] = useState(false);
  // Phase R.6D-1 — guide apply state. One GUIDE QuoteItem at a time via the
  // canonical POST /quotes/:id/items path. Per-day guard combines server-known
  // appliedGuideDayIds with days applied this session.
  const [guideApplying, setGuideApplying] = useState<string | null>(null);
  const [sessionAppliedGuideDayIds, setSessionAppliedGuideDayIds] = useState<string[]>([]);
  const dayHasGuide = (dayId: string | null | undefined): boolean =>
    Boolean(dayId) && ((appliedGuideDayIds ?? []).includes(dayId as string) || sessionAppliedGuideDayIds.includes(dayId as string));
  const dayGuideAppliedThisSession = (dayId: string | null | undefined): boolean =>
    Boolean(dayId) && sessionAppliedGuideDayIds.includes(dayId as string);

  // Phase S.2B-3 — overnight-sequence validity. Drives BOTH whether buildInput
  // submits the sequence AND the Apply gate. Valid = non-empty, every city
  // non-blank, every nights an integer >= 1, and total nights == durationDays - 1.
  const expectedOvernightNights = (Number(durationDays) || 8) - 1;
  const overnightTotalNights = overnightSequence.reduce((sum, row) => sum + (Number(row.nights) || 0), 0);
  const overnightSequenceValid =
    overnightSequence.length > 0 &&
    overnightSequence.every(
      (row) => String(row.city || '').trim() !== '' && Number.isInteger(Number(row.nights)) && Number(row.nights) >= 1,
    ) &&
    overnightTotalNights === expectedOvernightNights;

  // Hotfix — the structured route weaving (fixed Amman/Petra/Wadi Rum/Dead Sea
  // placement) is 8-day-only; other durations fall back to a basic day shell.
  const isClassicDuration = (Number(durationDays) || 8) === 8;
  // Apply requires a balanced overnight sequence AND, for non-8-day drafts,
  // explicit basic-shell confirmation. 8-day is unaffected (always confirmed).
  const applyBlocked = !overnightSequenceValid || (!isClassicDuration && !basicShellConfirmed);

  function buildInput() {
    const input: Record<string, unknown> = {
      durationDays: Number(durationDays) || 8,
      arrivalCity,
      arrivalAirport,
      departureCity,
      departureAirport,
      hotelCategory,
      travelStyle,
      // S.2C — fixed included places preserve the route's required content; the
      // selected add-ons go to optionalPlaces. Both stay string[] (contract unchanged).
      requiredPlaces: [...INCLUDED_PLACES],
      optionalPlaces: OPTIONAL_ADDON_PLACES.filter((p) => optionalSelected[p]),
      guideType,
      currency,
    };
    // S.2B-3 — submit the operator overnight plan ONLY when it is valid. An
    // invalid/unbalanced sequence is never sent, so the generator keeps its
    // heuristic overnights (Apply is additionally blocked while invalid).
    if (overnightSequenceValid) {
      input.overnightSequence = overnightSequence.map((row) => ({ city: row.city, nights: row.nights }));
    }
    return input;
  }

  async function handlePreview() {
    setPreviewing(true);
    setError('');
    setConflict(false);
    setSuccess('');
    try {
      const response = await fetch(`${apiBaseUrl}/quotes/${quoteId}/tailor-made-draft/preview`, {
        method: 'POST',
        headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(buildInput()),
      });
      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not generate the tailor-made draft.'));
      }
      setDraft((await response.json()) as Draft);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not generate the tailor-made draft.');
    } finally {
      setPreviewing(false);
    }
  }

  async function handleApply() {
    // S.2B-3 — block Apply while the overnight sequence is unbalanced/invalid.
    if (!overnightSequenceValid) {
      setError(
        `Overnight sequence is not balanced — total nights (${overnightTotalNights}) must equal ${expectedOvernightNights} (number of nights in the trip), and every row needs a city and at least 1 night. Fix it before applying.`,
      );
      return;
    }
    // Hotfix — non-8-day drafts are a basic day shell; require explicit confirmation.
    if (!isClassicDuration && !basicShellConfirmed) {
      setError('This is not the 8-day classic program, so the draft is a basic day shell only. Confirm basic-shell mode before applying.');
      return;
    }
    setApplying(true);
    setError('');
    setConflict(false);
    setSuccess('');
    try {
      const response = await fetch(`${apiBaseUrl}/quotes/${quoteId}/tailor-made-draft/apply`, {
        method: 'POST',
        headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ ...buildInput(), replaceExisting }),
      });
      if (response.status === 409) {
        setConflict(true);
        return;
      }
      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not apply the tailor-made draft.'));
      }
      const result = await response.json();
      const dayCount = Array.isArray(result?.days) ? result.days.length : 0;
      setSuccess(`Applied ${dayCount} editable itinerary days to this quote. No hotels, transport, tickets, guides, or pricing were added.`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not apply the tailor-made draft.');
    } finally {
      setApplying(false);
    }
  }

  // Phase R.2 — read-only hotel-stay suggestions (no apply, no pricing).
  async function handleSuggestHotels() {
    setSuggesting(true);
    setError('');
    setStayMessage('');
    try {
      const response = await fetch(`${apiBaseUrl}/quotes/${quoteId}/tailor-made-draft/hotel-suggestions`, {
        method: 'POST',
        headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ hotelCategory, currency }),
      });
      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not generate hotel suggestions.'));
      }
      const result = await response.json();
      setHotelStays(Array.isArray(result?.stays) ? result.stays : []);
      setStayMessage(typeof result?.message === 'string' ? result.message : '');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not generate hotel suggestions.');
    } finally {
      setSuggesting(false);
    }
  }

  // Phase R.6A-0 — read-only hotel-stay configure / price preview. POSTs the
  // stay + chosen hotel/contract (+ optional room/meal/occupancy) and renders
  // the returned options + estimated price. Creates NO QuoteItem, no pricing.
  async function loadHotelStayOptions(
    stay: HotelStay,
    candidate: HotelCandidate,
    selections?: { roomCategoryId?: string; occupancyType?: string; mealPlan?: string },
  ) {
    const key = `${stay.startDay}:${candidate.hotelId}`;
    setHotelConfigKey(key);
    setHotelConfigLoading(true);
    setError('');
    try {
      const response = await fetch(`${apiBaseUrl}/quotes/${quoteId}/tailor-made-draft/hotel-stay-options`, {
        method: 'POST',
        headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          hotelId: candidate.hotelId,
          contractId: candidate.contractId,
          stay: { city: stay.city, startDay: stay.startDay, endDay: stay.endDay, nights: stay.nights },
          roomCategoryId: selections?.roomCategoryId,
          occupancyType: selections?.occupancyType,
          mealPlan: selections?.mealPlan,
        }),
      });
      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not load hotel stay options.'));
      }
      const result = (await response.json()) as HotelStayPreview;
      setHotelConfig(result);
      if (!selections) {
        // Seed the selectors from the returned defaults.
        setHotelConfigRoom(result.availableRoomCategories?.[0]?.id || '');
        setHotelConfigOccupancy(result.defaults?.occupancyType || '');
        setHotelConfigMeal(result.defaults?.mealPlan || '');
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load hotel stay options.');
    } finally {
      setHotelConfigLoading(false);
    }
  }

  // Phase R.6A-1/R.6A-2 — apply ONE configured hotel stay as a single HOTEL
  // QuoteItem through the canonical path (POST /quotes/:id/items →
  // QuotesService.createItem hotel branch). No parallel pricing system:
  // createItem auto-prices via the existing HotelPricingResolver at the standard
  // markup. Hotels only, one stay at a time. The conflict guard is STAY-LEVEL:
  // blocked only when this stay's first itinerary day already has a hotel item;
  // other stays remain applyable.
  async function applySelectedHotel(stay: HotelStay, candidate: HotelCandidate) {
    setError('');
    if (stayHasHotelApplied(stay.firstItineraryDayId)) {
      setError(HOTEL_STAY_CONFLICT_MESSAGE);
      return;
    }
    const preview = hotelConfig?.pricePreview;
    if (!hotelConfig || hotelConfig.rateStatus !== 'OK' || !preview) {
      setError('Preview a price (status OK) before applying this hotel.');
      return;
    }
    if (!hotelServiceId) {
      setError('No hotel service is configured for this quote, so the hotel cannot be applied.');
      return;
    }
    if (!stay.firstItineraryDayId) {
      setError('This stay has no itinerary day to attach the hotel to. Apply the draft days first.');
      return;
    }
    setHotelApplying(true);
    try {
      const response = await fetch(`${apiBaseUrl}/quotes/${quoteId}/items`, {
        method: 'POST',
        headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          serviceId: hotelServiceId,
          itineraryId: stay.firstItineraryDayId,
          quantity: hotelConfig.defaults.roomCount,
          paxCount: hotelConfig.defaults.paxCount,
          roomCount: hotelConfig.defaults.roomCount,
          nightCount: stay.nights,
          markupPercent: HOTEL_DEFAULT_MARKUP,
          hotelId: candidate.hotelId,
          contractId: candidate.contractId,
          seasonName: preview.seasonName ?? undefined,
          roomCategoryId: preview.roomCategoryId,
          occupancyType: preview.occupancyType,
          mealPlan: preview.mealPlan,
          serviceDate: hotelConfig.serviceDate ?? undefined,
        }),
      });
      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not apply the selected hotel.'));
      }
      // Mark THIS stay applied (per-stay, keyed on its first itinerary day) so it
      // shows "Hotel applied to this stay." and blocks a duplicate — while every
      // other stay stays applyable. router.refresh() re-reads server state.
      const dayId = stay.firstItineraryDayId;
      if (dayId) {
        setSessionAppliedDayIds((prev) => (prev.includes(dayId) ? prev : [...prev, dayId]));
      }
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not apply the selected hotel.');
    } finally {
      setHotelApplying(false);
    }
  }

  // Phase R.3 — read-only transport suggestions (no apply, no pricing).
  async function handleSuggestTransport() {
    setSuggestingTransport(true);
    setError('');
    setTransportMessage('');
    try {
      const response = await fetch(`${apiBaseUrl}/quotes/${quoteId}/tailor-made-draft/transport-suggestions`, {
        method: 'POST',
        headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({}),
      });
      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not generate transport suggestions.'));
      }
      const result = await response.json();
      setTransport(Array.isArray(result?.suggestions) ? result.suggestions : []);
      setTransportMessage(typeof result?.message === 'string' ? result.message : '');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not generate transport suggestions.');
    } finally {
      setSuggestingTransport(false);
    }
  }

  // Phase R.6B-0 — READ-ONLY transport price preview for one day. Resolves the
  // suggestion to a route + service type (pure resolver), then prices via the
  // canonical POST /transport-pricing/calculate (the same endpoint the Auto
  // Builder uses). Creates NO QuoteItem, runs NO pricing write, changes NO quote
  // total. Returns OK / NO_ROUTE / NO_RATE. Vehicle/service-type are admin
  // planning fields only — never client proposal text.
  async function loadTransportOptions(t: TransportSuggestion) {
    setTransportPreviewDay(t.dayNumber);
    setTransportPreviewLoading(true);
    setTransportPreview(null);
    setError('');
    try {
      // T.5D-2 — feed the package transport policy into the resolver for the
      // PRICE PREVIEW only. When the package has 3+ full touring days
      // (usePackageFullDay), each TOURING_FULL_DAY prices against the canonical
      // Amman-disposal DAILY_FULL_DAY rate while keeping its real route label;
      // otherwise touring days keep regular route rates. Apply is NOT wired to
      // this yet — that's T.5D-3 (so preview and apply may differ until then).
      const policy = classifyPackageTransportPolicy(transport ?? []);
      const plan = resolveTransportPlan(t, routes ?? [], transportServiceTypes ?? [], {
        usePackageFullDay: policy.usePackageFullDay,
      });
      if (plan.status === 'NO_ROUTE' || !plan.routeId || !plan.serviceTypeId) {
        setTransportPreview({
          status: 'NO_ROUTE',
          routeLabel: plan.routeLabel,
          pricingBasis: plan.pricingBasis,
          serviceTypeName: plan.serviceTypeName,
          pricingModeHint: plan.pricingModeHint,
          vehicleName: null,
          cost: null,
          sell: null,
          currency: null,
          markupPercent: TRANSPORT_DEFAULT_MARKUP,
          reason: plan.reason,
        });
        return;
      }
      // T.2 — price a leg under a single service type. Returns the priced result
      // (cost non-null) or null when the engine has no usable rate (404 / no
      // price). No writes; same canonical calculate endpoint as before.
      const priceWith = async (serviceTypeId: string) => {
        const response = await fetch(`${apiBaseUrl}/transport-pricing/calculate`, {
          method: 'POST',
          headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            serviceTypeId,
            routeId: plan.routeId,
            normalizedKey: plan.normalizedKey,
            routeName: '',
            paxCount: defaultPax ?? 2,
          }),
        });
        if (!response.ok) return null;
        const result = await response.json();
        const cost = typeof result?.price === 'number' ? result.price : null;
        return cost === null ? null : { result, cost };
      };

      // Try the resolved PRIMARY service type first (unchanged behaviour). Only if
      // it yields no usable rate, retry once with the resolver's fallback service
      // type (airport/departure legs → POINT_TO_POINT, where some legs' rates live,
      // e.g. Dead Sea → QAIA). Legs already priced under the primary are untouched.
      let effectiveServiceTypeId = plan.serviceTypeId;
      let priced = await priceWith(plan.serviceTypeId);
      if (!priced && plan.fallbackServiceTypeId && plan.fallbackServiceTypeId !== plan.serviceTypeId) {
        const fallback = await priceWith(plan.fallbackServiceTypeId);
        if (fallback) {
          priced = fallback;
          effectiveServiceTypeId = plan.fallbackServiceTypeId;
        }
      }

      if (!priced) {
        // No rate under the primary (or fallback) → a clean NO_RATE status.
        setTransportPreview({
          status: 'NO_RATE',
          routeLabel: plan.routeLabel,
          pricingBasis: plan.pricingBasis,
          serviceTypeName: plan.serviceTypeName,
          pricingModeHint: plan.pricingModeHint,
          vehicleName: null,
          cost: null,
          sell: null,
          currency: null,
          markupPercent: TRANSPORT_DEFAULT_MARKUP,
          reason: 'No contracted transport rate is configured for this route/vehicle yet.',
          routeId: plan.routeId,
          normalizedKey: plan.normalizedKey,
          serviceTypeId: plan.serviceTypeId,
        });
        return;
      }

      const { result, cost } = priced;
      setTransportPreview({
        status: 'OK',
        routeLabel: plan.routeLabel,
        pricingBasis: plan.pricingBasis,
        serviceTypeName: result?.serviceType?.name ?? plan.serviceTypeName,
        pricingModeHint: plan.pricingModeHint,
        vehicleName: result?.vehicle?.name ?? null,
        cost,
        sell: computeTransportSell(cost),
        currency: result?.currency ?? null,
        markupPercent: TRANSPORT_DEFAULT_MARKUP,
        reason: 'Estimated from the contracted transport rate.',
        // Resolved identifiers for the canonical createItem transport apply (R.6B-1).
        // serviceTypeId is the EFFECTIVE type that priced, so apply re-prices the
        // same way the preview showed (fallback type when the fallback was used).
        routeId: plan.routeId,
        normalizedKey: plan.normalizedKey,
        serviceTypeId: effectiveServiceTypeId,
        // T.5D-3a — the exact VehicleRate the engine priced (present for the
        // package full-day disposal rate; absent for rate-rule per-leg legs).
        vehicleRateId: result?.vehicleRateId ?? null,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not preview transport price.');
    } finally {
      setTransportPreviewLoading(false);
    }
  }

  // Phase R.6B-1 — apply ONE OK-priced transport day as a single TRANSPORT
  // QuoteItem through the canonical path (POST /quotes/:id/items →
  // QuotesService.createItem transport branch). No parallel pricing system:
  // createItem auto-prices via the existing TransportPricingService at the
  // standard transport markup. Transport only, one day at a time. Per-day guard:
  // blocked only when this day already has a transport item; other days remain
  // applyable.
  async function applySelectedTransport(t: TransportSuggestion) {
    setError('');
    if (dayHasTransport(t.itineraryDayId)) {
      setError(TRANSPORT_DAY_CONFLICT_MESSAGE);
      return;
    }
    const p = transportPreview;
    if (!p || p.status !== 'OK' || !p.routeId || !p.serviceTypeId) {
      setError('Preview a transport price (status OK) before applying.');
      return;
    }
    if (!transportServiceId) {
      setError('No transport service is configured for this quote, so transport cannot be applied.');
      return;
    }
    if (!t.itineraryDayId) {
      setError('This day has no itinerary row to attach transport to. Apply the draft days first.');
      return;
    }
    setTransportApplying(true);
    try {
      // T.5D-3a — for a PACKAGE_FULL_DAY day, pin the exact VehicleRate the
      // preview priced (vehicleRateId) so createItem applies the same package
      // full-day rate it previewed (no re-resolution → preview and apply cannot
      // diverge), and carry the REAL day route as transportLabel for operator
      // display (the pricing route stays the canonical disposal route, whose rate
      // name is client-safe). Non-package days are unchanged: no vehicleRateId,
      // no transportLabel — regular route-rate apply as before.
      const isPackageFullDay = p.pricingBasis === 'PACKAGE_FULL_DAY' && Boolean(p.vehicleRateId);
      const body: Record<string, unknown> = {
        serviceId: transportServiceId,
        itineraryId: t.itineraryDayId,
        quantity: 1,
        paxCount: defaultPax ?? 2,
        markupPercent: TRANSPORT_DEFAULT_MARKUP,
        transportServiceTypeId: p.serviceTypeId,
        routeId: p.routeId,
        normalizedKey: p.normalizedKey ?? undefined,
        routeName: '',
      };
      if (isPackageFullDay) {
        body.vehicleRateId = p.vehicleRateId;
        body.transportLabel = p.routeLabel ?? undefined;
      }
      const response = await fetch(`${apiBaseUrl}/quotes/${quoteId}/items`, {
        method: 'POST',
        headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not apply the selected transport.'));
      }
      const dayId = t.itineraryDayId;
      setSessionAppliedTransportDayIds((prev) => (prev.includes(dayId) ? prev : [...prev, dayId]));
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not apply the selected transport.');
    } finally {
      setTransportApplying(false);
    }
  }

  // Human-friendly admin label for a transport type (never client proposal text).
  const transportTypeLabel = (t: string): string =>
    ({
      ARRIVAL_TRANSFER: 'Arrival transfer',
      DEPARTURE_TRANSFER: 'Departure transfer',
      TOURING_FULL_DAY: 'Touring (full day)',
      NONE: 'No transfer needed',
    } as Record<string, string>)[t] || t;

  // Phase R.4 — read-only entrance/ticket/activity suggestions (no apply, no pricing).
  async function handleSuggestExperiences() {
    setSuggestingExperiences(true);
    setError('');
    setExperienceMessage('');
    try {
      const response = await fetch(`${apiBaseUrl}/quotes/${quoteId}/tailor-made-draft/experience-suggestions`, {
        method: 'POST',
        headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({}),
      });
      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not generate entrance/activity suggestions.'));
      }
      const result = await response.json();
      setExperiences(Array.isArray(result?.suggestions) ? result.suggestions : []);
      setExperienceMessage(typeof result?.message === 'string' ? result.message : '');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not generate entrance/activity suggestions.');
    } finally {
      setSuggestingExperiences(false);
    }
  }

  // Phase R.6C-1 — apply ONE matched entrance/activity as a real Experience
  // QuoteItem through the canonical path (POST /quotes/:id/items →
  // QuotesService.createItem activity / entrance branch). No parallel pricing
  // system: createItem auto-prices via the existing engine at the standard
  // experience markup, and (for activities) honours the pricing basis + per-jeep
  // group capacity so a per-group rate bills ceil(pax / capacity) units. One at a time.
  // Per-(day, record) guard: blocked only when this same matched record is
  // already on this day; other experiences and other days remain applyable.
  async function applySelectedExperience(e: ExperienceSuggestion) {
    setError('');
    const readiness = e.readiness || (e.matchedServiceId || e.matchedActivityId ? 'MATCHED' : 'NO_MATCH');
    if (readiness === 'NO_MATCH' || (!e.matchedActivityId && !e.matchedServiceId)) {
      setError('This suggestion has no matched catalog record, so it cannot be applied.');
      return;
    }
    if (!e.itineraryDayId) {
      setError('This day has no itinerary row to attach the experience to. Apply the draft days first.');
      return;
    }
    if (experienceApplied(e)) {
      setError(EXPERIENCE_CONFLICT_MESSAGE);
      return;
    }
    const key = experienceKey(e) as string;
    setExperienceApplying(key);
    try {
      // Activity branch uses activityId (+ optional variant); entrance/ticket
      // branch uses serviceId (+ optional ticketRateVariantId). createItem keys
      // on which identifier is present; pax + markup drive the engine.
      const pax = defaultPax ?? 2;
      const payload: Record<string, unknown> = {
        itineraryId: e.itineraryDayId,
        paxCount: pax,
        participantCount: pax,
        markupPercent: EXPERIENCE_DEFAULT_MARKUP,
      };
      if (e.matchedActivityId) {
        payload.activityId = e.matchedActivityId;
        if (e.matchedActivityRateVariantId) payload.activityRateVariantId = e.matchedActivityRateVariantId;
      } else {
        // Entrance/ticket: createItem auto-selects the active ticket rate variant.
        payload.serviceId = e.matchedServiceId;
      }
      const response = await fetch(`${apiBaseUrl}/quotes/${quoteId}/items`, {
        method: 'POST',
        headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not apply the selected experience.'));
      }
      setSessionAppliedExperienceKeys((prev) => (prev.includes(key) ? prev : [...prev, key]));
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not apply the selected experience.');
    } finally {
      setExperienceApplying(null);
    }
  }

  // Human-friendly admin label for a suggested experience type (never client text).
  const experienceTypeLabel = (t: string): string =>
    ({ ENTRANCE: 'Entrance', TICKET: 'Ticket', ACTIVITY: 'Activity' } as Record<string, string>)[t] || t;

  // Phase R.6D-1 — apply ONE matched LOCAL guide as a real GUIDE QuoteItem through
  // the canonical path (POST /quotes/:id/items → QuotesService.createItem guide
  // branch). No parallel pricing: createItem prices via GUIDE_RATES (local/full_day
  // = 120) flat per engagement (not × pax) at the standard guide markup. One guide
  // per day; escort + overnight stay out of scope. Per-day guard: blocked only when
  // this day already has a guide; other days remain applyable.
  async function applySelectedGuide(g: GuideSuggestion) {
    setError('');
    const readiness = g.readiness || (g.guideTypeSuggestion === 'LOCAL' ? 'MATCHED' : 'NONE');
    if (readiness !== 'MATCHED' || g.guideTypeSuggestion !== 'LOCAL') {
      setError('Only matched local guide suggestions can be applied.');
      return;
    }
    if (!g.itineraryDayId) {
      setError('This day has no itinerary row to attach the guide to. Apply the draft days first.');
      return;
    }
    if (!guideServiceId) {
      setError('No guide service is configured for this quote, so a guide cannot be applied.');
      return;
    }
    if (dayHasGuide(g.itineraryDayId)) {
      setError(GUIDE_DAY_CONFLICT_MESSAGE);
      return;
    }
    const dayId = g.itineraryDayId;
    setGuideApplying(dayId);
    try {
      const pax = defaultPax ?? 2;
      const response = await fetch(`${apiBaseUrl}/quotes/${quoteId}/items`, {
        method: 'POST',
        headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          serviceId: guideServiceId,
          itineraryId: dayId,
          guideType: 'local',
          guideDuration: 'full_day',
          overnight: false,
          paxCount: pax,
          markupPercent: GUIDE_DEFAULT_MARKUP,
        }),
      });
      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not apply the selected guide.'));
      }
      setSessionAppliedGuideDayIds((prev) => (prev.includes(dayId) ? prev : [...prev, dayId]));
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not apply the selected guide.');
    } finally {
      setGuideApplying(null);
    }
  }

  // Phase R.5 — read-only guide suggestions (no apply, no pricing).
  async function handleSuggestGuides() {
    setSuggestingGuides(true);
    setError('');
    setGuideMessage('');
    setGuideEscortNote('');
    try {
      const response = await fetch(`${apiBaseUrl}/quotes/${quoteId}/tailor-made-draft/guide-suggestions`, {
        method: 'POST',
        headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({}),
      });
      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not generate guide suggestions.'));
      }
      const result = await response.json();
      // Surface only the guided days (LOCAL / ESCORT_OPTION); NONE days are hidden.
      const all = Array.isArray(result?.suggestions) ? (result.suggestions as GuideSuggestion[]) : [];
      setGuides(all.filter((g) => g.guideTypeSuggestion && g.guideTypeSuggestion !== 'NONE'));
      setGuideMessage(typeof result?.message === 'string' ? result.message : '');
      setGuideEscortNote(typeof result?.escortNote === 'string' ? result.escortNote : '');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not generate guide suggestions.');
    } finally {
      setSuggestingGuides(false);
    }
  }

  return (
    <section className="tailor-made-draft-panel entity-form" aria-label="Tailor-Made Draft Builder">
      <header>
        <h3>Tailor-Made Draft Builder</h3>
        <p className="form-help">
          This creates editable itinerary days only. Hotels, transport, entrances, guides, activities, and pricing will be added in later steps.
        </p>
      </header>

      <div className="form-row form-row-3">
        <label>
          Duration (days)
          <input value={durationDays} onChange={(e) => setDurationDays(e.target.value)} type="number" min="1" />
        </label>
        <label>
          Hotel category
          <SelectWithCustom value={hotelCategory} onChange={setHotelCategory} options={HOTEL_CATEGORY_OPTIONS} />
        </label>
        <label>
          Trip style
          <select value={travelStyle} onChange={(e) => setTravelStyle(e.target.value)}>
            {TRIP_STYLE_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="form-row form-row-2">
        <label>
          Arrival city
          <SelectWithCustom value={arrivalCity} onChange={setArrivalCity} options={ITINERARY_CITY_OPTIONS} />
        </label>
        <label>
          Arrival point
          <SelectWithCustom value={arrivalAirport} onChange={setArrivalAirport} options={ARRIVAL_POINT_OPTIONS} />
        </label>
      </div>

      <div className="form-row form-row-2">
        <label>
          Departure city
          <SelectWithCustom value={departureCity} onChange={setDepartureCity} options={ITINERARY_CITY_OPTIONS} />
        </label>
        <label>
          Departure point
          <SelectWithCustom value={departureAirport} onChange={setDepartureAirport} options={ARRIVAL_POINT_OPTIONS} />
        </label>
      </div>

      <div className="form-row form-row-3">
        <label>
          Guide type
          <SelectWithCustom value={guideType} onChange={setGuideType} options={GUIDE_TYPE_OPTIONS} />
        </label>
        <label>
          Currency
          <SelectWithCustom value={currency} onChange={setCurrency} options={CURRENCY_OPTIONS} />
        </label>
      </div>

      {/* Phase S.2C — grouped place selector. "Included in this route" places are
          fixed/read-only chips for the 8-day classic route; "Optional add-ons"
          are the toggleable, service-matched places. No comma free-text, no
          Custom place input, no narrative-only/deferred places in this phase. */}
      <fieldset className={`places-selector places-included${isClassicDuration ? '' : ' places-included-inactive'}`}>
        <legend>Included in this route{isClassicDuration ? '' : ' (8-day classic route only)'}</legend>
        <p className="form-help">
          {isClassicDuration
            ? 'These places are part of the current 8-day classic route. Route-level editing will come in a later phase.'
            : 'These places are only placed automatically in the 8-day classic route. For other durations the draft is a basic day shell, so these are NOT guaranteed to be placed.'}
        </p>
        <div className="places-chip-row">
          {INCLUDED_PLACES.map((place) => (
            <span
              key={place}
              className="place-chip place-chip-fixed"
              aria-disabled="true"
              title={
                isClassicDuration
                  ? 'Included in the current 8-day classic route — not editable in this phase'
                  : 'Only placed automatically in the 8-day classic route; not guaranteed in this duration'
              }
            >
              {place}
            </span>
          ))}
        </div>
      </fieldset>

      <fieldset className="places-selector places-optional">
        <legend>Optional add-ons</legend>
        <p className="form-help">Select optional places to weave into the draft itinerary and service suggestions.</p>
        {OPTIONAL_ADDON_PLACES.map((place) => (
          <label key={place} className="checkbox-inline">
            <input
              type="checkbox"
              checked={Boolean(optionalSelected[place])}
              onChange={(e) => setOptionalSelected((prev) => ({ ...prev, [place]: e.target.checked }))}
            />
            {place}
          </label>
        ))}
      </fieldset>

      {/* Phase S.2B-3 — Overnight Sequence editor. Submitted via buildInput() when
          valid; the backend applies it to the generated overnight cities + narratives. */}
      <fieldset className="overnight-sequence">
        <legend>Overnight Sequence</legend>
        <p className="form-help">
          This sequence controls where the clients overnight and is used to generate hotel stay suggestions.
        </p>
        <p className="form-help">
          Overnight Sequence is where clients sleep. Sightseeing places are controlled separately above and selecting an overnight city does not create entrance/activity/guide services.
        </p>
        {(() => {
          const expectedNights = expectedOvernightNights;
          const totalNights = overnightTotalNights;
          const balanced = overnightSequenceValid;
          let startDay = 1;
          return (
            <>
              <div className="overnight-rows">
                {overnightSequence.map((row, index) => {
                  const nights = Math.max(1, Number(row.nights) || 1);
                  const from = startDay;
                  const to = startDay + nights - 1;
                  startDay = to + 1;
                  const dayRange = nights === 1 ? `Day ${from}` : `Days ${from}–${to}`;
                  const cityMissing = !String(row.city || '').trim();
                  return (
                    <div key={index} className="overnight-row">
                      <SelectWithCustom
                        value={row.city}
                        onChange={(next) =>
                          setOvernightSequence((prev) => prev.map((r, i) => (i === index ? { ...r, city: next } : r)))
                        }
                        options={OVERNIGHT_CITY_OPTIONS}
                      />
                      <input
                        type="number"
                        min={1}
                        className="overnight-nights"
                        value={row.nights}
                        onChange={(e) =>
                          setOvernightSequence((prev) =>
                            prev.map((r, i) => (i === index ? { ...r, nights: Math.max(1, Number(e.target.value) || 1) } : r)),
                          )
                        }
                      />
                      <span className="overnight-day-range">{dayRange}</span>
                      {cityMissing ? <span className="overnight-warning">City required</span> : null}
                      <button
                        type="button"
                        className="overnight-remove"
                        aria-label="Remove overnight row"
                        onClick={() => setOvernightSequence((prev) => prev.filter((_, i) => i !== index))}
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
              <div className="overnight-footer">
                <button
                  type="button"
                  className="overnight-add"
                  onClick={() => setOvernightSequence((prev) => [...prev, { city: 'Amman', nights: 1 }])}
                >
                  + Add overnight
                </button>
                <span className={balanced ? 'overnight-total overnight-total-ok' : 'overnight-total overnight-total-warn'}>
                  Total nights: {totalNights} / {expectedNights}
                </span>
                {!balanced ? (
                  <span className="overnight-warning">
                    Overnight sequence is not balanced ({totalNights} / {expectedNights} nights), so it will not be applied to the generated draft. Apply to Quote is disabled until it balances.
                  </span>
                ) : null}
              </div>
            </>
          );
        })()}
      </fieldset>

      {/* Hotfix — non-8-day durations only produce a basic day shell. Warn before
          preview/apply and require explicit basic-shell confirmation to Apply. */}
      {!isClassicDuration ? (
        <div
          className="tm-duration-warning"
          role="alert"
          style={{ background: '#fff4e5', border: '1px solid #e0b070', borderRadius: 8, padding: '0.6rem 0.8rem', margin: '0.5rem 0' }}
        >
          <p style={{ margin: 0 }}>
            The structured route builder is currently optimized for the 8-day classic Jordan program. Other durations will create a basic day shell only. Route-level editing will come in the next phase.
          </p>
          <label className="checkbox-inline" style={{ display: 'block', marginTop: '0.45rem' }}>
            <input type="checkbox" checked={basicShellConfirmed} onChange={(e) => setBasicShellConfirmed(e.target.checked)} />
            I understand this {Number(durationDays) || 0}-day draft is a basic day shell only.
          </label>
        </div>
      ) : null}

      <div className="form-actions">
        <button type="button" onClick={handlePreview} disabled={previewing}>
          {previewing ? 'Generating…' : 'Preview Draft'}
        </button>
        <button
          type="button"
          onClick={handleApply}
          disabled={applying || applyBlocked}
          className="secondary"
          title={
            applyBlocked
              ? !overnightSequenceValid
                ? 'Balance the overnight sequence before applying.'
                : 'Confirm basic-shell mode for non-8-day drafts before applying.'
              : undefined
          }
        >
          {applying ? 'Applying…' : 'Apply to Quote'}
        </button>
        <button type="button" onClick={handleSuggestHotels} disabled={suggesting} className="secondary">
          {suggesting ? 'Loading…' : 'Preview Hotel Suggestions'}
        </button>
        <button type="button" onClick={handleSuggestTransport} disabled={suggestingTransport} className="secondary">
          {suggestingTransport ? 'Loading…' : 'Preview Transport Suggestions'}
        </button>
        <button type="button" onClick={handleSuggestExperiences} disabled={suggestingExperiences} className="secondary">
          {suggestingExperiences ? 'Loading…' : 'Preview Entrances & Activities'}
        </button>
        <button type="button" onClick={handleSuggestGuides} disabled={suggestingGuides} className="secondary">
          {suggestingGuides ? 'Loading…' : 'Preview Guide Suggestions'}
        </button>
        <label className="checkbox-inline">
          <input type="checkbox" checked={replaceExisting} onChange={(e) => setReplaceExisting(e.target.checked)} />
          Replace existing itinerary days
        </label>
      </div>

      {conflict ? (
        <p className="form-error" role="alert">
          This quote already has itinerary days. Use “Replace existing itinerary days” if you want to overwrite the draft days.
        </p>
      ) : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {success ? <p className="form-success" role="status">{success}</p> : null}

      {draft ? (
        <div className="tailor-made-draft-preview">
          <h4>
            Draft preview — {draft.days.length} days / {draft.overnightCount} overnight stays
          </h4>
          {draft.unplacedRequiredPlaces && draft.unplacedRequiredPlaces.length > 0 ? (
            <p className="form-help">Not placed on a day: {draft.unplacedRequiredPlaces.join(', ')}</p>
          ) : null}
          <ol className="tailor-made-draft-days">
            {draft.days.map((day) => (
              <li key={day.dayNumber} className="tailor-made-draft-day">
                <strong>Day {day.dayNumber} — {day.title}</strong>
                <p>{day.narrative}</p>
                <p className="form-help">
                  {day.overnightCity ? `Overnight: ${day.overnightCity}` : 'No overnight (departure)'}
                  {day.places && day.places.length ? ` • ${day.places.join(', ')}` : ''}
                </p>
              </li>
            ))}
          </ol>
          <p className="form-help">
            Preview only — no itinerary days, hotels, transport, tickets, guides, or pricing have been created yet.
          </p>
        </div>
      ) : null}

      {hotelStays ? (
        <div className="tailor-made-hotel-suggestions">
          <h4>Suggested Hotel Stays</h4>
          {hotelStays.length === 0 ? (
            <p className="form-help">{stayMessage || 'No itinerary days yet — apply a tailor-made draft first.'}</p>
          ) : (
            <>
              <ol className="tailor-made-hotel-stays">
                {hotelStays.map((stay) => (
                  <li key={`${stay.city}-${stay.startDay}`} className="tailor-made-hotel-stay">
                    <strong>{stay.city}</strong> — {stay.nights} night{stay.nights === 1 ? '' : 's'} —{' '}
                    {stay.startDay === stay.endDay ? `Day ${stay.startDay}` : `Days ${stay.startDay}–${stay.endDay}`}
                    {stay.hotelCategory ? ` • ${stay.hotelCategory}` : ''}
                    {/* Phase R.6A-2 — per-stay applied/blocked status (independent of other stays). */}
                    {stayAppliedThisSession(stay.firstItineraryDayId) ? (
                      <p className="form-success" role="status">Hotel applied to this stay.</p>
                    ) : stayHasHotelApplied(stay.firstItineraryDayId) ? (
                      <p className="form-help" role="status">{HOTEL_STAY_CONFLICT_MESSAGE}</p>
                    ) : null}
                    {stay.candidateHotels && stay.candidateHotels.length ? (
                      <ul className="tailor-made-hotel-candidates">
                        {stay.candidateHotels.map((c) => {
                          const key = `${stay.startDay}:${c.hotelId}`;
                          const active = hotelConfigKey === key;
                          return (
                            <li key={c.hotelId}>
                              {c.hotelName}
                              <span className="form-help"> — {c.reason}</span>
                              {c.contractId ? (
                                <button
                                  type="button"
                                  className="compact-button"
                                  onClick={() => loadHotelStayOptions(stay, c)}
                                  disabled={hotelConfigLoading && active}
                                >
                                  {active ? 'Reload options' : 'Configure & Preview Price'}
                                </button>
                              ) : null}
                              {active && hotelConfig ? (
                                <div className="tailor-made-hotel-config">
                                  <label>
                                    Room category
                                    <select value={hotelConfigRoom} onChange={(e) => setHotelConfigRoom(e.target.value)}>
                                      <option value="">Select…</option>
                                      {hotelConfig.availableRoomCategories.map((rc) => (
                                        <option key={rc.id} value={rc.id}>{rc.name}</option>
                                      ))}
                                    </select>
                                  </label>
                                  <label>
                                    Occupancy
                                    <select value={hotelConfigOccupancy} onChange={(e) => setHotelConfigOccupancy(e.target.value)}>
                                      <option value="">Select…</option>
                                      {hotelConfig.availableOccupancyTypes.map((o) => (
                                        <option key={o} value={o}>{o}</option>
                                      ))}
                                    </select>
                                  </label>
                                  <label>
                                    Meal plan
                                    <select value={hotelConfigMeal} onChange={(e) => setHotelConfigMeal(e.target.value)}>
                                      <option value="">Select…</option>
                                      {hotelConfig.availableMealPlans.map((m) => (
                                        <option key={m} value={m}>{m}</option>
                                      ))}
                                    </select>
                                  </label>
                                  <button
                                    type="button"
                                    className="compact-button"
                                    disabled={hotelConfigLoading || !hotelConfigRoom || !hotelConfigOccupancy || !hotelConfigMeal}
                                    onClick={() =>
                                      loadHotelStayOptions(stay, c, {
                                        roomCategoryId: hotelConfigRoom,
                                        occupancyType: hotelConfigOccupancy,
                                        mealPlan: hotelConfigMeal,
                                      })
                                    }
                                  >
                                    {hotelConfigLoading ? 'Loading…' : 'Preview Price'}
                                  </button>
                                  {hotelConfig.pricePreview ? (
                                    <p className="form-help">
                                      Estimated cost {hotelConfig.pricePreview.totalCost} / sell {hotelConfig.pricePreview.totalSell}{' '}
                                      {hotelConfig.pricePreview.currency || ''} (markup {hotelConfig.pricePreview.markupPercent}%)
                                    </p>
                                  ) : (
                                    <p className="form-help">{hotelConfig.message}</p>
                                  )}
                                  {/* Phase R.6A-2 — Apply enabled after an OK price preview, and only
                                      for a stay that has no hotel item yet. One stay, one HOTEL QuoteItem;
                                      other stays stay applyable. */}
                                  <button
                                    type="button"
                                    className="compact-button"
                                    disabled={
                                      hotelApplying ||
                                      stayHasHotelApplied(stay.firstItineraryDayId) ||
                                      hotelConfig.rateStatus !== 'OK' ||
                                      !hotelConfig.pricePreview
                                    }
                                    onClick={() => applySelectedHotel(stay, c)}
                                  >
                                    {hotelApplying ? 'Applying…' : 'Apply Selected Hotel'}
                                  </button>
                                  {stayAppliedThisSession(stay.firstItineraryDayId) ? (
                                    <p className="form-success" role="status">Hotel applied to this stay.</p>
                                  ) : stayHasHotelApplied(stay.firstItineraryDayId) ? (
                                    <p className="form-help" role="status">{HOTEL_STAY_CONFLICT_MESSAGE}</p>
                                  ) : null}
                                </div>
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <span className="form-help"> • No candidate hotels found for this city.</span>
                    )}
                  </li>
                ))}
              </ol>
              <p className="form-help">
                Read-only suggestions grouped by overnight city. No hotels have been applied and no pricing has run.
              </p>
            </>
          )}
        </div>
      ) : null}

      {transport ? (
        <div className="tailor-made-transport-suggestions">
          <h4>Suggested Transport</h4>
          {transport.length === 0 ? (
            <p className="form-help">{transportMessage || 'No itinerary days yet — apply a tailor-made draft first.'}</p>
          ) : (
            <>
              {/* T.5C/T.5D-2 — package transport policy summary. The pure classifier
                  tells the operator whether touring days price at regular route rates
                  or the package full-day rate. As of T.5D-2 the PRICE PREVIEW below
                  follows this policy; the transport APPLY path does not yet (T.5D-3). */}
              {(() => {
                const policy = classifyPackageTransportPolicy(transport);
                return (
                  <div className="tailor-made-transport-policy" aria-label="Package transport policy">
                    <p>
                      <strong>Touring days:</strong> {policy.touringFullDayCount}
                    </p>
                    <p>
                      <strong>Pricing rule:</strong>{' '}
                      {policy.usePackageFullDay ? 'Package full-day vehicle rate' : 'Regular route rate'}
                    </p>
                    <p className="form-help">
                      {policy.usePackageFullDay
                        ? 'This package has 3 or more full touring days, so touring days preview at the package full-day vehicle rate.'
                        : 'This package has fewer than 3 full touring days, so touring days preview at regular route rates.'}
                    </p>
                    <p className="form-help tailor-made-transport-policy-note">
                      Preview and apply use the same package full-day vehicle rate.
                    </p>
                    <p className="form-help tailor-made-transport-policy-note">
                      Driver overnight / stationary add-ons are not included yet and will be handled in a later phase.
                    </p>
                  </div>
                );
              })()}
              <ol className="tailor-made-transport-days">
                {transport.map((t) => {
                  const activeDay = transportPreviewDay === t.dayNumber;
                  return (
                    <li key={t.dayNumber} className="tailor-made-transport-day">
                      <strong>Day {t.dayNumber}</strong>
                      {t.routeLabel ? ` — ${t.routeLabel}` : ` — ${t.title}`}
                      {' • '}
                      {transportTypeLabel(t.suggestedTransportType)}
                      <span className="form-help"> — {t.reason}</span>
                      {t.suggestedTransportType !== 'NONE' ? (
                        <>
                          {/* Phase R.6B-1 — per-day applied/blocked status (independent of other days). */}
                          {dayTransportAppliedThisSession(t.itineraryDayId) ? (
                            <p className="form-success" role="status">Transport applied to this day.</p>
                          ) : dayHasTransport(t.itineraryDayId) ? (
                            <p className="form-help" role="status">{TRANSPORT_DAY_CONFLICT_MESSAGE}</p>
                          ) : null}
                          <button
                            type="button"
                            className="compact-button"
                            onClick={() => loadTransportOptions(t)}
                            disabled={transportPreviewLoading && activeDay}
                          >
                            {transportPreviewLoading && activeDay
                              ? 'Loading…'
                              : activeDay
                                ? 'Reload Price'
                                : 'Configure & Preview Price'}
                          </button>
                          {activeDay && transportPreview ? (
                            <div className="tailor-made-transport-preview">
                              {transportPreview.status === 'OK' ? (
                                <>
                                  {/* T.5D-2 — clean, operator-safe pricing basis. Never the raw
                                      service-type / pricing-mode tokens (POINT_TO_POINT / FULL_DAY /
                                      DAILY_FULL_DAY / capacity_unit). */}
                                  <p className="form-help">
                                    <strong>Pricing basis:</strong> {PRICING_BASIS_LABELS[transportPreview.pricingBasis]}
                                  </p>
                                  <p className="form-help">
                                    Estimated cost {transportPreview.cost} / sell {transportPreview.sell}{' '}
                                    {transportPreview.currency || ''} (markup {transportPreview.markupPercent}%)
                                    {/* Vehicle class is an admin planning detail — never the client proposal. */}
                                    {transportPreview.vehicleName ? ` • vehicle (internal): ${transportPreview.vehicleName}` : ''}
                                  </p>
                                </>
                              ) : (
                                <p className="form-help">
                                  <strong>Pricing basis:</strong> {PRICING_BASIS_LABELS[transportPreview.pricingBasis]}
                                  {' — '}
                                  {transportPreview.status === 'NO_ROUTE' ? 'no route resolved' : 'no contracted rate'} ({transportPreview.reason})
                                </p>
                              )}
                              {/* Phase R.6B-1 — Apply enabled only after an OK preview AND only for a
                                  day with no transport item yet. One day, one TRANSPORT QuoteItem;
                                  other days stay applyable. */}
                              <button
                                type="button"
                                className="compact-button"
                                disabled={
                                  transportApplying ||
                                  dayHasTransport(t.itineraryDayId) ||
                                  transportPreview.status !== 'OK'
                                }
                                onClick={() => applySelectedTransport(t)}
                              >
                                {transportApplying ? 'Applying…' : 'Apply Selected Transport'}
                              </button>
                              {dayTransportAppliedThisSession(t.itineraryDayId) ? (
                                <p className="form-success" role="status">Transport applied to this day.</p>
                              ) : dayHasTransport(t.itineraryDayId) ? (
                                <p className="form-help" role="status">{TRANSPORT_DAY_CONFLICT_MESSAGE}</p>
                              ) : null}
                            </div>
                          ) : null}
                        </>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
              <p className="form-help">
                Preview a price per day, then apply OK days one by one. Each applied day adds one transport service; NO_ROUTE / NO_RATE days stay disabled.
              </p>
            </>
          )}
        </div>
      ) : null}

      {experiences ? (
        <div className="tailor-made-experience-suggestions">
          <h4>Suggested Entrances &amp; Activities</h4>
          {experiences.length === 0 ? (
            <p className="form-help">{experienceMessage || 'No entrance/activity suggestions — apply a tailor-made draft first.'}</p>
          ) : (
            <>
              <ol className="tailor-made-experience-days">
                {experiences.map((e, i) => {
                  const readiness = e.readiness || (e.matchedServiceId || e.matchedActivityId ? 'MATCHED' : 'NO_MATCH');
                  const hasEstimate = typeof e.estimatedCost === 'number' && typeof e.estimatedSell === 'number';
                  return (
                    <li key={`${e.dayNumber}-${e.place}-${i}`} className="tailor-made-experience-day">
                      <strong>Day {e.dayNumber}</strong>
                      {' — '}
                      {e.displayName}
                      {' • '}
                      {experienceTypeLabel(e.suggestedItemType)}
                      {/* Phase R.6C-0 — readiness status (MATCHED / NEEDS_VARIANT / NO_MATCH). */}
                      {' • '}
                      <span className="form-help">{readiness}</span>
                      {e.matchedName ? <span className="form-help"> — matched: {e.matchedName}</span> : null}
                      {/* Read-only gross estimate; createItem is authoritative on apply. */}
                      {hasEstimate ? (
                        <span className="form-help">
                          {' '}— est. cost {e.estimatedCost} / sell {e.estimatedSell} {e.currency || ''} (markup {e.markupPercent}%)
                        </span>
                      ) : readiness !== 'NO_MATCH' ? (
                        <span className="form-help"> — estimate unavailable</span>
                      ) : null}
                      {/* Phase R.6C-1 — the estimate is a single-unit gross figure;
                          the canonical createItem applies pax / pricing basis /
                          per-jeep group capacity on apply (e.g. an activity priced
                          per group bills ceil(pax / capacity) units). */}
                      {hasEstimate ? (
                        <span className="form-help"> — single-unit estimate; final total calculated on apply based on pax</span>
                      ) : null}
                      {e.jordanPassEligible ? (
                        <span className="form-help"> — Jordan Pass may cover this entrance (final price set on apply)</span>
                      ) : null}
                      <span className="form-help"> — {e.reason}</span>
                      {/* Phase R.6C-1 — apply one matched experience via the canonical
                          /items path. MATCHED → enabled; NO_MATCH → disabled; already
                          applied to this day → disabled with the conflict label. */}
                      {readiness === 'NO_MATCH' ? (
                        <button type="button" className="compact-button" disabled title="No catalog match — cannot apply">
                          Apply experience
                        </button>
                      ) : experienceApplied(e) ? (
                        <button type="button" className="compact-button" disabled title={EXPERIENCE_CONFLICT_MESSAGE}>
                          Applied to this day
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="compact-button"
                          onClick={() => applySelectedExperience(e)}
                          disabled={experienceApplying !== null}
                        >
                          {experienceApplying === experienceKey(e) ? 'Applying…' : 'Apply experience'}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ol>
              <p className="form-help">
                Estimates are single-unit gross figures (unit cost × markup {/* 20 */}20%). Applying creates one Experience item via the standard path; the final total (pax, pricing basis, Jordan Pass, currency) is calculated on apply.
              </p>
            </>
          )}
        </div>
      ) : null}

      {guides ? (
        <div className="tailor-made-guide-suggestions">
          <h4>Suggested Guides</h4>
          {guides.length === 0 ? (
            <p className="form-help">{guideMessage || 'No guide suggestions for the current itinerary days.'}</p>
          ) : (
            <>
              <ol className="tailor-made-guide-days">
                {guides.map((g, i) => {
                  const readiness = g.readiness || (g.guideTypeSuggestion === 'LOCAL' ? 'MATCHED' : 'NONE');
                  const hasEstimate = typeof g.estimatedCost === 'number' && typeof g.estimatedSell === 'number';
                  return (
                    <li key={`${g.dayNumber}-${i}`} className="tailor-made-guide-day">
                      <strong>Day {g.dayNumber}</strong>
                      {' — '}
                      {g.displayName}
                      {/* Phase R.6D-0 — readiness status (MATCHED for local guides). */}
                      {' • '}
                      <span className="form-help">{readiness}</span>
                      {g.placesCovered && g.placesCovered.length > 0 ? (
                        <span className="form-help"> — covers: {g.placesCovered.join(', ')}</span>
                      ) : null}
                      {/* Read-only gross estimate; createItem is authoritative on apply. */}
                      {hasEstimate ? (
                        <span className="form-help">
                          {' '}— est. cost {g.estimatedCost} / sell {g.estimatedSell} {g.currency || ''} (markup {g.markupPercent}%)
                        </span>
                      ) : null}
                      <span className="form-help"> — {g.reason}</span>
                      {/* Phase R.6D-1 — apply one matched LOCAL guide via the canonical
                          /items path. MATCHED → enabled; already applied to this day →
                          disabled with the conflict label. Escort (ESCORT_OPTION) is a
                          planning note only and never an apply target. */}
                      {readiness === 'MATCHED' ? (
                        dayHasGuide(g.itineraryDayId) ? (
                          <button type="button" className="compact-button" disabled title={GUIDE_DAY_CONFLICT_MESSAGE}>
                            Guide applied to this day
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="compact-button"
                            onClick={() => applySelectedGuide(g)}
                            disabled={guideApplying !== null}
                          >
                            {guideApplying === g.itineraryDayId ? 'Applying…' : 'Apply guide'}
                          </button>
                        )
                      ) : null}
                      {dayGuideAppliedThisSession(g.itineraryDayId) ? (
                        <span className="form-success" role="status"> Guide applied to this day.</span>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
              {guideEscortNote ? <p className="form-help">{guideEscortNote}</p> : null}
              <p className="form-help">
                Estimates are single-unit gross figures (local full-day guide cost × markup 20%). Applying a matched local guide creates one Guide item via the standard path; the final total is calculated on apply.
              </p>
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}
