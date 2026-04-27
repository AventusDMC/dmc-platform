'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { getErrorMessage } from '../../lib/api';

type CancelBookingButtonProps = {
  bookingId: string;
  disabled?: boolean;
};

export function CancelBookingButton({ bookingId, disabled = false }: CancelBookingButtonProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleClick() {
    if (!window.confirm('Cancel this booking? Passengers, services, documents, and operations data will remain in place.')) {
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const response = await fetch(`/api/bookings/${bookingId}/cancel`, {
        method: 'PATCH',
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not cancel booking.'));
      }

      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not cancel booking.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div>
      <button type="button" className="secondary-button" onClick={handleClick} disabled={disabled || isSubmitting}>
        {isSubmitting ? 'Cancelling...' : 'Cancel booking'}
      </button>
      {error ? <p className="form-error">{error}</p> : null}
    </div>
  );
}
