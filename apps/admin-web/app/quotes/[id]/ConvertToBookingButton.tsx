'use client';

import { useState } from 'react';
import { getErrorMessage, readJsonResponse } from '../../lib/api';

type Booking = {
  id: string;
};

type ConversionNotice = {
  tone: 'success' | 'error' | 'info';
  message: string;
};

type ConvertToBookingButtonProps = {
  quoteId: string;
  label?: string;
};

export function ConvertToBookingButton({ quoteId, label = 'Convert to booking' }: ConvertToBookingButtonProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notice, setNotice] = useState<ConversionNotice | null>(null);

  async function handleClick() {
    setIsSubmitting(true);
    setNotice({ tone: 'info', message: 'Converting quote to booking...' });

    try {
      const response = await fetch(`/api/quotes/${quoteId}/convert-to-booking`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          accept: 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not convert quote to booking.'));
      }

      const booking = await readJsonResponse<Booking>(response, 'Could not convert quote to booking.');
      if (!booking.id) {
        throw new Error('Booking conversion succeeded but the response did not include a booking id.');
      }

      setNotice({ tone: 'success', message: 'Booking created. Opening booking detail...' });
      window.location.assign(`/bookings/${booking.id}?created=1`);
    } catch (caughtError) {
      setNotice({
        tone: 'error',
        message: caughtError instanceof Error ? caughtError.message : 'Could not convert quote to booking.',
      });
      setIsSubmitting(false);
    }
  }

  return (
    <div className="section-stack">
      <button type="button" className="secondary-button" onClick={handleClick} disabled={isSubmitting}>
        {isSubmitting ? 'Converting...' : label}
      </button>
      {notice ? (
        <div
          className={notice.tone === 'error' ? 'form-error' : notice.tone === 'success' ? 'form-success' : 'detail-copy'}
          role={notice.tone === 'error' ? 'alert' : 'status'}
          aria-live="polite"
        >
          {notice.message}
        </div>
      ) : null}
    </div>
  );
}
