'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { buildAuthHeaders } from '../../lib/auth-client';
import { getErrorMessage } from '../../lib/api';

type QuoteItineraryDayFormProps = {
  apiBaseUrl: string;
  quoteId: string;
  dayId?: string;
  submitLabel?: string;
  initialValues?: {
    dayNumber: string;
    title: string;
    notes: string;
    sortOrder: string;
    isActive: boolean;
    transportDayType?: string | null;
    vehicleRetained?: boolean | null;
    vehicleReleased?: boolean | null;
    inRetainedBlock?: boolean | null;
  };
};

// Transport day-type options (mirror the OperationalTransportType const). '' = Auto/Unset → NULL.
const TRANSPORT_DAY_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Auto / Unset' },
  { value: 'AIRPORT_TRANSFER', label: 'Airport transfer' },
  { value: 'POINT_TO_POINT', label: 'Point-to-point' },
  { value: 'TOURING_ROUTE', label: 'Touring route' },
  { value: 'FULL_DAY_SERVICE', label: 'Full-day service / disposal' },
  { value: 'HALF_DAY_SERVICE', label: 'Half-day service' },
  { value: 'STATIONARY_FULL_DAY', label: 'Stationary full day' },
  { value: 'STATIONARY_HALF_DAY', label: 'Stationary half day' },
  { value: 'STANDBY_WAITING', label: 'Standby / waiting' },
  { value: 'FREE_DAY_NO_VEHICLE', label: 'Free day / no vehicle' },
];

// Single retention select — makes retained+released contradiction impossible to create.
type RetentionChoice = 'auto' | 'retained' | 'released' | 'block' | 'conflict';
function deriveRetention(v?: { vehicleRetained?: boolean | null; vehicleReleased?: boolean | null; inRetainedBlock?: boolean | null }): RetentionChoice {
  if (!v) return 'auto';
  if (v.vehicleRetained === true && v.vehicleReleased === true) return 'conflict';
  if (v.vehicleRetained === true) return 'retained';
  if (v.vehicleReleased === true) return 'released';
  if (v.inRetainedBlock === true) return 'block';
  return 'auto';
}

export function QuoteItineraryDayForm({
  apiBaseUrl,
  quoteId,
  dayId,
  submitLabel,
  initialValues,
}: QuoteItineraryDayFormProps) {
  const router = useRouter();
  const [dayNumber, setDayNumber] = useState(initialValues?.dayNumber || '1');
  const [title, setTitle] = useState(initialValues?.title || '');
  const [notes, setNotes] = useState(initialValues?.notes || '');
  const [sortOrder, setSortOrder] = useState(initialValues?.sortOrder || '0');
  const [isActive, setIsActive] = useState(initialValues?.isActive ?? true);
  const [transportDayType, setTransportDayType] = useState(initialValues?.transportDayType || '');
  const [retention, setRetention] = useState<RetentionChoice>(deriveRetention(initialValues));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const isEditing = Boolean(dayId);
  const initialRetention = deriveRetention(initialValues);

  useEffect(() => {
    setDayNumber(initialValues?.dayNumber || '1');
    setTitle(initialValues?.title || '');
    setNotes(initialValues?.notes || '');
    setSortOrder(initialValues?.sortOrder || '0');
    setIsActive(initialValues?.isActive ?? true);
    setTransportDayType(initialValues?.transportDayType || '');
    setRetention(deriveRetention(initialValues));
  }, [initialValues?.dayNumber, initialValues?.title, initialValues?.notes, initialValues?.sortOrder, initialValues?.isActive, initialValues?.transportDayType, initialValues?.vehicleRetained, initialValues?.vehicleReleased, initialValues?.inRetainedBlock]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      const payload: Record<string, unknown> = {
        dayNumber: Number(dayNumber),
        title,
        notes,
        sortOrder: Number(sortOrder),
        isActive,
      };
      // Transport day-classification metadata (PR7) — only persisted on edit (PATCH).
      if (isEditing) {
        payload.transportDayType = transportDayType || null;
        // Single retention select → writes exactly one boolean, clears the others.
        // 'conflict' (pre-existing contradictory data) is left untouched so the rest of
        // the day can still be saved; the planner must pick a real value to resolve it.
        if (retention !== 'conflict') {
          payload.vehicleRetained = retention === 'retained' ? true : null;
          payload.vehicleReleased = retention === 'released' ? true : null;
          payload.inRetainedBlock = retention === 'block' ? true : null;
        }
      }
      const response = await fetch(`${apiBaseUrl}${dayId ? `/itinerary/day/${dayId}` : `/quotes/${quoteId}/itinerary/day`}`, {
        method: dayId ? 'PATCH' : 'POST',
        headers: buildAuthHeaders({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, `Could not ${isEditing ? 'update' : 'create'} itinerary day.`));
      }

      if (!isEditing) {
        setDayNumber('1');
        setTitle('');
        setNotes('');
        setSortOrder('0');
        setIsActive(true);
      }

      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : `Could not ${isEditing ? 'update' : 'create'} itinerary day.`);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="entity-form quote-itinerary-day-edit-form" onSubmit={handleSubmit}>
      <div className="workspace-section-head">
        <div>
          <p className="eyebrow">{isEditing ? 'Edit day' : 'New day'}</p>
          <h4>{isEditing ? 'Edit day title & narrative' : 'Add itinerary day'}</h4>
        </div>
      </div>

      <label>
        Day title
        <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Day 03 — Amman / Madaba / Mount Nebo / Petra" required />
      </label>

      <label>
        Day narrative / notes
        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          rows={5}
          placeholder="Describe the day's plan as it should read for the client."
        />
      </label>

      <div className="form-row form-row-3">
        <label>
          Day number
          <input value={dayNumber} onChange={(event) => setDayNumber(event.target.value)} type="number" min="1" required />
        </label>

        <label>
          Sort order
          <input value={sortOrder} onChange={(event) => setSortOrder(event.target.value)} type="number" min="0" required />
        </label>

        <label>
          Status
          <select value={isActive ? 'active' : 'inactive'} onChange={(event) => setIsActive(event.target.value === 'active')}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </label>
      </div>

      {isEditing ? (
        <details className="quote-itinerary-day-transport-advanced">
          <summary>Transport day (advanced)</summary>
          <p className="form-hint">
            Optional metadata used by transport package-eligibility diagnostics. Leave on Auto / Unset to keep
            the current conservative behavior — this never changes quote pricing.
          </p>
          <div className="form-row form-row-2">
            <label>
              Transport day type
              <select value={transportDayType} onChange={(event) => setTransportDayType(event.target.value)}>
                {TRANSPORT_DAY_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value || 'auto'} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </label>

            <label>
              Vehicle retention
              <select value={retention} onChange={(event) => setRetention(event.target.value as RetentionChoice)}>
                <option value="auto">Auto / Unset</option>
                <option value="retained">Vehicle retained</option>
                <option value="released">Vehicle released</option>
                <option value="block">Part of retained block</option>
                {initialRetention === 'conflict' ? (
                  <option value="conflict" disabled>
                    Manual review required / conflict
                  </option>
                ) : null}
              </select>
            </label>
          </div>
          {retention === 'conflict' ? (
            <p className="form-error">This day has conflicting retained + released metadata. Choose a value to resolve it.</p>
          ) : null}
        </details>
      ) : null}

      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Saving...' : submitLabel || (isEditing ? 'Save title & narrative' : 'Create day')}
      </button>

      {error ? <p className="form-error">{error}</p> : null}
    </form>
  );
}
