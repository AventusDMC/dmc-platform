'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { buildAuthHeaders } from '../../lib/auth-client';
import { getErrorMessage, logFetchUrl } from '../../lib/api';

type QuoteItineraryMoveButtonProps = {
  apiBaseUrl: string;
  path: string;
  payload: Record<string, unknown>;
  label: string;
  disabled?: boolean;
};

export function QuoteItineraryMoveButton({
  apiBaseUrl,
  path,
  payload,
  label,
  disabled = false,
}: QuoteItineraryMoveButtonProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleClick() {
    setIsSubmitting(true);
    setError('');

    try {
      const response = await fetch(logFetchUrl(`${apiBaseUrl}${path}`), {
        method: 'PATCH',
        headers: buildAuthHeaders({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not update sort order.'));
      }

      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not update sort order.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <button type="button" className="compact-button" onClick={handleClick} disabled={disabled || isSubmitting}>
        {isSubmitting ? 'Saving...' : label}
      </button>
      {error ? <p className="form-error">{error}</p> : null}
    </>
  );
}
