'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { getErrorMessage } from '../../lib/api';

type CancelQuoteButtonProps = {
  quoteId: string;
  disabled?: boolean;
};

export function CancelQuoteButton({ quoteId, disabled = false }: CancelQuoteButtonProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleClick() {
    if (!window.confirm('Cancel this quote? The quote will remain visible and no records will be deleted.')) {
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const response = await fetch(`/api/quotes/${quoteId}/cancel`, {
        method: 'PATCH',
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not cancel quote.'));
      }

      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not cancel quote.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div>
      <button type="button" className="secondary-button" onClick={handleClick} disabled={disabled || isSubmitting}>
        {isSubmitting ? 'Cancelling...' : 'Cancel quote'}
      </button>
      {error ? <p className="form-error">{error}</p> : null}
    </div>
  );
}
