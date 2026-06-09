'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { buildAuthHeaders } from '../../lib/auth-client';
import { getErrorMessage } from '../../lib/api';

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
  suggestedTransportType: string;
  pricingModeSuggestion: string | null;
  reason: string;
  confidence: string;
};

type ExperienceSuggestion = {
  dayNumber: number;
  place: string;
  suggestedItemType: string;
  displayName: string;
  reason: string;
  confidence: string;
  matchedName: string | null;
};

type GuideSuggestion = {
  dayNumber: number;
  title: string;
  guideTypeSuggestion: string;
  displayName: string;
  reason: string;
  confidence: string;
  placesCovered: string[];
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
};

const OPTIONAL_PLACES = ['Madaba', 'Mount Nebo', 'Bethany', 'Ajloun', 'Aqaba'];
const TRAVEL_STYLES = ['classic', 'religious', 'adventure', 'luxury'];
// Standard hotel markup applied to every applied hotel stay. Mirrors the API's
// HOTEL_DEFAULT_MARKUP (apps/api/src/common/pricing-constants.ts); kept as one
// named constant here rather than a scattered literal.
const HOTEL_DEFAULT_MARKUP = 15;
// Phase R.6A-2 — stay-level conflict message (one hotel per stay/day).
const HOTEL_STAY_CONFLICT_MESSAGE =
  'This stay already has a hotel item. Remove the existing hotel item before applying another hotel to this stay.';

export function TailorMadeDraftPanel({ apiBaseUrl, quoteId, quoteCurrency, hotelServiceId, appliedHotelDayIds }: TailorMadeDraftPanelProps) {
  const router = useRouter();

  const [durationDays, setDurationDays] = useState('8');
  const [arrivalCity, setArrivalCity] = useState('Amman');
  const [arrivalAirport, setArrivalAirport] = useState('QAIA');
  const [departureCity, setDepartureCity] = useState('Dead Sea');
  const [departureAirport, setDepartureAirport] = useState('QAIA');
  const [hotelCategory, setHotelCategory] = useState('4-star');
  const [travelStyle, setTravelStyle] = useState('classic');
  const [requiredPlaces, setRequiredPlaces] = useState('Petra, Wadi Rum, Dead Sea, Jerash');
  const [optionalSelected, setOptionalSelected] = useState<Record<string, boolean>>({
    Madaba: true,
    'Mount Nebo': true,
    Bethany: true,
    Ajloun: false,
    Aqaba: false,
  });
  const [guideType, setGuideType] = useState('local');
  const [currency, setCurrency] = useState((quoteCurrency || 'USD').toUpperCase());
  const [replaceExisting, setReplaceExisting] = useState(false);

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

  // Phase R.4 — read-only entrance/ticket/activity suggestions (no apply, no pricing).
  const [experiences, setExperiences] = useState<ExperienceSuggestion[] | null>(null);
  const [experienceMessage, setExperienceMessage] = useState('');
  const [suggestingExperiences, setSuggestingExperiences] = useState(false);

  // Phase R.5 — read-only guide suggestions (no apply, no pricing).
  const [guides, setGuides] = useState<GuideSuggestion[] | null>(null);
  const [guideMessage, setGuideMessage] = useState('');
  const [guideEscortNote, setGuideEscortNote] = useState('');
  const [suggestingGuides, setSuggestingGuides] = useState(false);

  function buildInput() {
    return {
      durationDays: Number(durationDays) || 8,
      arrivalCity,
      arrivalAirport,
      departureCity,
      departureAirport,
      hotelCategory,
      travelStyle,
      requiredPlaces: requiredPlaces.split(',').map((p) => p.trim()).filter(Boolean),
      optionalPlaces: OPTIONAL_PLACES.filter((p) => optionalSelected[p]),
      guideType,
      currency,
    };
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

  // Human-friendly admin label for a suggested experience type (never client text).
  const experienceTypeLabel = (t: string): string =>
    ({ ENTRANCE: 'Entrance', TICKET: 'Ticket', ACTIVITY: 'Activity' } as Record<string, string>)[t] || t;

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
          <input value={hotelCategory} onChange={(e) => setHotelCategory(e.target.value)} />
        </label>
        <label>
          Travel style
          <select value={travelStyle} onChange={(e) => setTravelStyle(e.target.value)}>
            {TRAVEL_STYLES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="form-row form-row-2">
        <label>
          Arrival city
          <input value={arrivalCity} onChange={(e) => setArrivalCity(e.target.value)} />
        </label>
        <label>
          Arrival airport
          <input value={arrivalAirport} onChange={(e) => setArrivalAirport(e.target.value)} />
        </label>
      </div>

      <div className="form-row form-row-2">
        <label>
          Departure city
          <input value={departureCity} onChange={(e) => setDepartureCity(e.target.value)} />
        </label>
        <label>
          Departure airport
          <input value={departureAirport} onChange={(e) => setDepartureAirport(e.target.value)} />
        </label>
      </div>

      <div className="form-row form-row-3">
        <label>
          Guide type
          <input value={guideType} onChange={(e) => setGuideType(e.target.value)} />
        </label>
        <label>
          Currency
          <input value={currency} onChange={(e) => setCurrency(e.target.value)} />
        </label>
        <label>
          Required places (comma-separated)
          <input value={requiredPlaces} onChange={(e) => setRequiredPlaces(e.target.value)} />
        </label>
      </div>

      <fieldset className="optional-places">
        <legend>Optional places</legend>
        {OPTIONAL_PLACES.map((place) => (
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

      <div className="form-actions">
        <button type="button" onClick={handlePreview} disabled={previewing}>
          {previewing ? 'Generating…' : 'Preview Draft'}
        </button>
        <button type="button" onClick={handleApply} disabled={applying} className="secondary">
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
              <ol className="tailor-made-transport-days">
                {transport.map((t) => (
                  <li key={t.dayNumber} className="tailor-made-transport-day">
                    <strong>Day {t.dayNumber}</strong>
                    {t.routeLabel ? ` — ${t.routeLabel}` : ` — ${t.title}`}
                    {' • '}
                    {transportTypeLabel(t.suggestedTransportType)}
                    <span className="form-help"> — {t.reason}</span>
                  </li>
                ))}
              </ol>
              <p className="form-help">
                Read-only planning hints. No transport has been applied and no pricing has run.
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
                {experiences.map((e, i) => (
                  <li key={`${e.dayNumber}-${e.place}-${i}`} className="tailor-made-experience-day">
                    <strong>Day {e.dayNumber}</strong>
                    {' — '}
                    {e.displayName}
                    {' • '}
                    {experienceTypeLabel(e.suggestedItemType)}
                    {e.matchedName ? <span className="form-help"> — matched: {e.matchedName}</span> : null}
                    <span className="form-help"> — {e.reason}</span>
                  </li>
                ))}
              </ol>
              <p className="form-help">
                Read-only planning hints. No tickets, entrances, or activities have been applied and no pricing has run.
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
                {guides.map((g, i) => (
                  <li key={`${g.dayNumber}-${i}`} className="tailor-made-guide-day">
                    <strong>Day {g.dayNumber}</strong>
                    {' — '}
                    {g.displayName}
                    {g.placesCovered && g.placesCovered.length > 0 ? (
                      <span className="form-help"> — covers: {g.placesCovered.join(', ')}</span>
                    ) : null}
                    <span className="form-help"> — {g.reason}</span>
                  </li>
                ))}
              </ol>
              {guideEscortNote ? <p className="form-help">{guideEscortNote}</p> : null}
              <p className="form-help">
                Read-only planning hints. No guides have been applied and no pricing has run.
              </p>
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}
