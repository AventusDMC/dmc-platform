'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { buildAuthHeaders } from '../../lib/auth-client';
import { getErrorMessage } from '../../lib/api';

type QuoteItineraryAssignableService = {
  id: string;
  optionId: string | null;
  serviceDate: string | null;
  service: {
    name: string;
    category: string;
    serviceType?: {
      name: string;
      code: string | null;
    } | null;
  };
  hotel: {
    name: string;
  } | null;
  contract: {
    name: string;
  } | null;
  roomCategory: {
    name: string;
  } | null;
  seasonName: string | null;
  occupancyType: string | null;
  mealPlan: string | null;
};

type QuoteItineraryDayItemFormProps = {
  apiBaseUrl: string;
  dayId: string;
  itemId?: string;
  submitLabel?: string;
  services: QuoteItineraryAssignableService[];
  initialValues?: {
    quoteServiceId: string;
    sortOrder: string;
    notes: string;
  };
};

function buildServiceLabel(service: QuoteItineraryAssignableService) {
  const hotelSummary =
    service.hotel && service.contract && service.seasonName && service.roomCategory && service.occupancyType && service.mealPlan
      ? `${service.hotel.name} | ${service.contract.name} | ${service.seasonName} | ${service.roomCategory.name} | ${service.occupancyType} / ${service.mealPlan}`
      : service.service.name;
  const optionLabel = service.optionId ? 'Option service' : 'Base program';
  const dateLabel = service.serviceDate ? service.serviceDate.slice(0, 10) : 'Date pending';

  return `${hotelSummary} | ${optionLabel} | ${dateLabel}`;
}

export function QuoteItineraryDayItemForm({
  apiBaseUrl,
  dayId,
  itemId,
  submitLabel,
  services,
  initialValues,
}: QuoteItineraryDayItemFormProps) {
  const router = useRouter();
  const sortedServices = useMemo(
    () => [...services].sort((left, right) => buildServiceLabel(left).localeCompare(buildServiceLabel(right))),
    [services],
  );
  const [quoteServiceId, setQuoteServiceId] = useState(initialValues?.quoteServiceId || sortedServices[0]?.id || '');
  const [sortOrder, setSortOrder] = useState(initialValues?.sortOrder || '0');
  const [notes, setNotes] = useState(initialValues?.notes || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      const response = await fetch(`${apiBaseUrl}/itinerary/day/${dayId}${itemId ? `/items/${itemId}` : '/items'}`, {
        method: itemId ? 'PATCH' : 'POST',
        headers: buildAuthHeaders({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          quoteServiceId,
          sortOrder: Number(sortOrder),
          notes,
        }),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, `Could not ${itemId ? 'update' : 'assign'} itinerary service.`));
      }

      if (!itemId) {
        setQuoteServiceId(sortedServices[0]?.id || '');
        setSortOrder('0');
        setNotes('');
      }

      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : `Could not ${itemId ? 'update' : 'assign'} itinerary service.`);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="entity-form" onSubmit={handleSubmit}>
      <label>
        Quote service
        <select value={quoteServiceId} onChange={(event) => setQuoteServiceId(event.target.value)} required disabled={sortedServices.length === 0 || Boolean(itemId)}>
          {sortedServices.length === 0 ? <option value="">No quote services available</option> : null}
          {sortedServices.map((service) => (
            <option key={service.id} value={service.id}>
              {buildServiceLabel(service)}
            </option>
          ))}
        </select>
      </label>

      <div className="form-row form-row-3">
        <label>
          Sort order
          <input value={sortOrder} onChange={(event) => setSortOrder(event.target.value)} type="number" min="0" required />
        </label>
      </div>

      <label>
        Notes
        <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} />
      </label>

      <button type="submit" disabled={isSubmitting || (!itemId && sortedServices.length === 0)}>
        {isSubmitting ? 'Saving...' : submitLabel || (itemId ? 'Save assignment' : 'Assign service')}
      </button>

      {error ? <p className="form-error">{error}</p> : null}
    </form>
  );
}
