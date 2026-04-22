'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { getErrorMessage, readJsonResponse } from '../../lib/api';

type Booking = {
  id: string;
};

type ConvertToBookingButtonProps = {
  apiBaseUrl: string;
  quoteId: string;
  label?: string;
};

export function ConvertToBookingButton({ apiBaseUrl, quoteId, label = 'Convert to booking' }: ConvertToBookingButtonProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function handleClick() {
    setIsSubmitting(true);
    setError('');
    setMessage('');

    try {
      const response = await fetch(`${apiBaseUrl}/quotes/${quoteId}/convert-to-booking`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not convert quote to booking.'));
      }

      const booking = await readJsonResponse<Booking>(response, 'Could not convert quote to booking.');
      setMessage('Booking created');
      router.push(`/bookings/${booking.id}?created=1`);
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not convert quote to booking.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div>
      <button type="button" className="secondary-button" onClick={handleClick} disabled={isSubmitting}>
        {isSubmitting ? 'Converting...' : label}
      </button>
      {message ? <p className="detail-copy">{message}</p> : null}
      {error ? <p className="form-error">{error}</p> : null}
    </div>
  );
}
