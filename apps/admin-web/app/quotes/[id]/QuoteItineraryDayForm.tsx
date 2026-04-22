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
  };
};

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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const isEditing = Boolean(dayId);

  useEffect(() => {
    setDayNumber(initialValues?.dayNumber || '1');
    setTitle(initialValues?.title || '');
    setNotes(initialValues?.notes || '');
    setSortOrder(initialValues?.sortOrder || '0');
    setIsActive(initialValues?.isActive ?? true);
  }, [initialValues?.dayNumber, initialValues?.title, initialValues?.notes, initialValues?.sortOrder, initialValues?.isActive]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      const response = await fetch(`${apiBaseUrl}${dayId ? `/itinerary/day/${dayId}` : `/quotes/${quoteId}/itinerary/day`}`, {
        method: dayId ? 'PATCH' : 'POST',
        headers: buildAuthHeaders({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          dayNumber: Number(dayNumber),
          title,
          notes,
          sortOrder: Number(sortOrder),
          isActive,
        }),
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
    <form className="entity-form" onSubmit={handleSubmit}>
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

      <label>
        Title
        <input value={title} onChange={(event) => setTitle(event.target.value)} required />
      </label>

      <label>
        Notes
        <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={4} />
      </label>

      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Saving...' : submitLabel || (isEditing ? 'Save day' : 'Create day')}
      </button>

      {error ? <p className="form-error">{error}</p> : null}
    </form>
  );
}
