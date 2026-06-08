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
};

type HotelStay = {
  city: string;
  nights: number;
  startDay: number;
  endDay: number;
  hotelCategory: string | null;
  candidateHotels: HotelCandidate[];
  notes: string;
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

type TailorMadeDraftPanelProps = {
  apiBaseUrl: string;
  quoteId: string;
  quoteCurrency?: string | null;
};

const OPTIONAL_PLACES = ['Madaba', 'Mount Nebo', 'Bethany', 'Ajloun', 'Aqaba'];
const TRAVEL_STYLES = ['classic', 'religious', 'adventure', 'luxury'];

export function TailorMadeDraftPanel({ apiBaseUrl, quoteId, quoteCurrency }: TailorMadeDraftPanelProps) {
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

  // Phase R.3 — read-only transport suggestions (no apply, no pricing).
  const [transport, setTransport] = useState<TransportSuggestion[] | null>(null);
  const [transportMessage, setTransportMessage] = useState('');
  const [suggestingTransport, setSuggestingTransport] = useState(false);

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
                    {stay.candidateHotels && stay.candidateHotels.length ? (
                      <ul className="tailor-made-hotel-candidates">
                        {stay.candidateHotels.map((c) => (
                          <li key={c.hotelId}>
                            {c.hotelName}
                            <span className="form-help"> — {c.reason}</span>
                          </li>
                        ))}
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
    </section>
  );
}
