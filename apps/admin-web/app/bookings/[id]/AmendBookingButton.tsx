'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { getErrorMessage, readJsonResponse } from '../../lib/api';

type AmendedBooking = {
  id: string;
};

export function AmendBookingButton({ bookingId, disabled = false }: { bookingId: string; disabled?: boolean }) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleClick() {
    if (!window.confirm('Create an amendment from this booking? The original booking will remain unchanged.')) {
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const response = await fetch(`/api/bookings/${bookingId}/amend`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not amend booking.'));
      }

      const booking = await readJsonResponse<AmendedBooking>(response, 'Could not amend booking.');
      router.push(`/bookings/${booking.id}?amended=1`);
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not amend booking.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div>
      <button type="button" className="secondary-button" onClick={handleClick} disabled={disabled || isSubmitting}>
        {isSubmitting ? 'Amending...' : 'Amend Booking'}
      </button>
      {error ? <p className="form-error">{error}</p> : null}
    </div>
  );
}
