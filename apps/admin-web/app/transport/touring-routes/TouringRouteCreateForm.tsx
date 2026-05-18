'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getErrorMessage } from '../../lib/api';

type StopDraft = {
  order: number;
  place: string;
  overnight: boolean;
  notes: string;
};

function optionalNumber(value: string) {
  return value.trim() ? Number(value) : null;
}

function combineHours(hours: string, minutes: string) {
  const hourValue = Number(hours || 0);
  const minuteValue = Number(minutes || 0);
  if (!hourValue && !minuteValue) return null;
  return Number((hourValue + minuteValue / 60).toFixed(2));
}

function stopNotes(stop: StopDraft) {
  return [stop.overnight ? 'Overnight stop' : '', stop.notes.trim()].filter(Boolean).join(' | ') || null;
}

export function TouringRouteCreateForm() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [startPlace, setStartPlace] = useState('');
  const [mainDestination, setMainDestination] = useState('');
  const [durationHours, setDurationHours] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('');
  const [distanceKm, setDistanceKm] = useState('');
  const [pickupRecommendation, setPickupRecommendation] = useState('');
  const [operationalNotes, setOperationalNotes] = useState('');
  const [active, setActive] = useState(true);
  const [stops, setStops] = useState<StopDraft[]>([{ order: 1, place: '', overnight: false, notes: '' }]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  function updateStop(index: number, patch: Partial<StopDraft>) {
    setStops((current) => current.map((stop, stopIndex) => (stopIndex === index ? { ...stop, ...patch } : stop)));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      const duration = combineHours(durationHours, durationMinutes);
      const response = await fetch('/api/touring-routes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          name,
          startCity: startPlace,
          durationDays: 1,
          routeDescription: operationalNotes,
          mainDestinations: mainDestination ? [mainDestination] : [],
          includedKm: optionalNumber(distanceKm),
          includedHours: duration,
          estimatedDistanceKm: optionalNumber(distanceKm),
          estimatedDriveHours: duration,
          reviewNotes: [pickupRecommendation ? `Pickup recommendation: ${pickupRecommendation}` : '', operationalNotes].filter(Boolean).join('\n') || null,
          active,
          stops: stops
            .filter((stop) => stop.place.trim())
            .map((stop, index) => ({
              order: Number(stop.order || index + 1),
              city: stop.place,
              location: stop.place,
              notes: stopNotes(stop),
            })),
        }),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not create touring route.'));
      }

      const created = await response.json();
      router.push(`/transport/touring-routes/${encodeURIComponent(created.id)}?mode=edit#edit`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not create touring route.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="entity-form" onSubmit={handleSubmit}>
      <section className="app-form-section">
        <div className="app-form-section-head">
          <h3>Touring route details</h3>
          <p>Operational touring inventory is created here, not in Transfer Routes.</p>
        </div>
        <div className="form-grid">
          <label>Route code<input value={code} onChange={(event) => setCode(event.target.value)} placeholder="JOR-TR-..." required /></label>
          <label>Route name<input value={name} onChange={(event) => setName(event.target.value)} required /></label>
          <label>Origin / start place<input value={startPlace} onChange={(event) => setStartPlace(event.target.value)} required /></label>
          <label>Main destination<input value={mainDestination} onChange={(event) => setMainDestination(event.target.value)} required /></label>
          <label>Duration hours<input type="number" min="0" value={durationHours} onChange={(event) => setDurationHours(event.target.value)} /></label>
          <label>Duration minutes<input type="number" min="0" max="59" value={durationMinutes} onChange={(event) => setDurationMinutes(event.target.value)} /></label>
          <label>Distance km<input type="number" min="0" step="0.1" value={distanceKm} onChange={(event) => setDistanceKm(event.target.value)} /></label>
          <label>
            Status
            <select value={active ? 'active' : 'inactive'} onChange={(event) => setActive(event.target.value === 'active')}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>
        </div>
        <label>Pickup recommendation<input value={pickupRecommendation} onChange={(event) => setPickupRecommendation(event.target.value)} placeholder="08:00 from Amman hotels" /></label>
        <label>Operational notes<textarea rows={3} value={operationalNotes} onChange={(event) => setOperationalNotes(event.target.value)} /></label>
      </section>

      <section className="app-form-section">
        <div className="app-form-section-head">
          <h3>Ordered stops</h3>
          <button type="button" className="secondary-button" onClick={() => setStops((current) => [...current, { order: current.length + 1, place: '', overnight: false, notes: '' }])}>
            Add stop
          </button>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Stop order</th><th>Place</th><th>Overnight</th><th>Notes</th><th>Actions</th></tr></thead>
            <tbody>
              {stops.map((stop, index) => (
                <tr key={`stop-${index}`}>
                  <td><input type="number" min="1" value={stop.order} onChange={(event) => updateStop(index, { order: Number(event.target.value || index + 1) })} /></td>
                  <td><input value={stop.place} onChange={(event) => updateStop(index, { place: event.target.value })} placeholder="Petra" /></td>
                  <td>
                    <select value={stop.overnight ? 'true' : 'false'} onChange={(event) => updateStop(index, { overnight: event.target.value === 'true' })}>
                      <option value="false">No</option>
                      <option value="true">Yes</option>
                    </select>
                  </td>
                  <td><input value={stop.notes} onChange={(event) => updateStop(index, { notes: event.target.value })} /></td>
                  <td><button type="button" className="secondary-button" onClick={() => setStops((current) => current.filter((_, stopIndex) => stopIndex !== index))}>Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="app-form-section">
        <div className="app-form-section-head">
          <h3>Pricing matrix</h3>
          <p>Pricing matrix setup will be added in the next workflow step. Create the operational route first, then add pricing from the edit page.</p>
        </div>
      </section>

      <button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Creating...' : 'Create touring route'}</button>
      {error ? <p className="form-error">{error}</p> : null}
    </form>
  );
}
