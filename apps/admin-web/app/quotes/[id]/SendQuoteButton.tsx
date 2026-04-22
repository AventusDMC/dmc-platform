'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getErrorMessage } from '../../lib/api';
import { buildAuthHeaders } from '../../lib/auth-client';

type QuoteStatus = 'DRAFT' | 'READY' | 'SENT' | 'ACCEPTED' | 'CONFIRMED' | 'REVISION_REQUESTED' | 'EXPIRED' | 'CANCELLED';

type SendQuoteButtonProps = {
  apiBaseUrl: string;
  quoteId: string;
  currentStatus: QuoteStatus;
};

export function SendQuoteButton({ apiBaseUrl, quoteId, currentStatus }: SendQuoteButtonProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const isAlreadySent = currentStatus === 'SENT';
  const isLocked = currentStatus === 'ACCEPTED' || currentStatus === 'CONFIRMED' || currentStatus === 'CANCELLED';
  const isDisabled = isSubmitting || isAlreadySent || isLocked;

  async function handleSendQuote() {
    setIsSubmitting(true);
    setMessage('');
    setError('');

    try {
      const response = await fetch(`${apiBaseUrl}/quotes/${quoteId}/status`, {
        method: 'PATCH',
        headers: buildAuthHeaders({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          status: 'SENT',
          acceptedVersionId: null,
        }),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not mark quote as sent.'));
      }

      setMessage('Quote marked as sent');
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not mark quote as sent.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="quote-send-actions">
      <button type="button" className="secondary-button" onClick={handleSendQuote} disabled={isDisabled}>
        {isSubmitting ? 'Sending...' : isAlreadySent ? 'Sent to client' : 'Send to client'}
      </button>
      {message ? <p className="detail-copy">{message}</p> : null}
      {error ? <p className="form-error">{error}</p> : null}
    </div>
  );
}
