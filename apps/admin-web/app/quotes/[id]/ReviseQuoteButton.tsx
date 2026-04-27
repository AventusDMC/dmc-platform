'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { getErrorMessage, readJsonResponse } from '../../lib/api';

type RevisedQuote = {
  id: string;
};

export function ReviseQuoteButton({ quoteId, disabled = false }: { quoteId: string; disabled?: boolean }) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleClick() {
    if (!window.confirm('Create a new revision from this quote? The current quote will remain unchanged.')) {
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const response = await fetch(`/api/quotes/${quoteId}/requote`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not revise quote.'));
      }

      const quote = await readJsonResponse<RevisedQuote>(response, 'Could not revise quote.');
      router.push(`/quotes/${quote.id}?revised=1`);
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not revise quote.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div>
      <button type="button" className="secondary-button" onClick={handleClick} disabled={disabled || isSubmitting}>
        {isSubmitting ? 'Revising...' : 'Revise Quote'}
      </button>
      {error ? <p className="form-error">{error}</p> : null}
    </div>
  );
}
