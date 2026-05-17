'use client';

import { FormEvent, useState } from 'react';
import { getErrorMessage, readJsonResponse } from '../../lib/api';

type AgentDepartureRequestFormProps = {
  departureId: string;
  endpoint: string;
  disabled?: boolean;
  hotelCategories: string[];
  branchExtensions: string[];
};

export function AgentDepartureRequestForm({ departureId, endpoint, disabled, hotelCategories, branchExtensions }: AgentDepartureRequestFormProps) {
  const [passengerCount, setPassengerCount] = useState('1');
  const [hotelCategory, setHotelCategory] = useState(hotelCategories[0] || '');
  const [extension, setExtension] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setStatus('');

    try {
      const response = await fetch(endpoint || `/api/agent/departures/${departureId}/booking-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          passengerCount,
          hotelCategory,
          extension,
          notes,
        }),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Booking request could not be submitted.'));
      }

      const request = await readJsonResponse(response, 'Booking request could not be submitted.') as { status?: string };
      setStatus(request.status === 'waitlisted' ? 'Request waitlisted for admin review.' : 'Request submitted for admin approval.');
      setNotes('');
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Booking request could not be submitted.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="entity-form" onSubmit={submitRequest}>
      <div className="form-row">
        <label>
          Pax
          <input type="number" min="1" step="1" value={passengerCount} onChange={(event) => setPassengerCount(event.target.value)} required />
        </label>
        <label>
          Hotel category
          <select value={hotelCategory} onChange={(event) => setHotelCategory(event.target.value)}>
            <option value="">On request</option>
            {hotelCategories.map((category) => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
        </label>
        <label>
          Extension
          <select value={extension} onChange={(event) => setExtension(event.target.value)}>
            <option value="">Core program</option>
            {branchExtensions.map((branch) => (
              <option key={branch} value={branch}>{branch}</option>
            ))}
          </select>
        </label>
      </div>
      <label>
        Notes
        <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} />
      </label>
      <button type="submit" className="primary-button" disabled={disabled || submitting}>
        {submitting ? 'Submitting...' : disabled ? 'Unavailable' : 'Request Seats'}
      </button>
      {status ? <p className="form-success">{status}</p> : null}
      {error ? <p className="form-error">{error}</p> : null}
    </form>
  );
}
