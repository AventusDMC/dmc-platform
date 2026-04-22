'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getErrorMessage } from '../../lib/api';
import { buildAuthHeaders } from '../../lib/auth-client';

type SaveQuoteVersionButtonProps = {
  apiBaseUrl: string;
  quoteId: string;
};

export function SaveQuoteVersionButton({ apiBaseUrl, quoteId }: SaveQuoteVersionButtonProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function handleSaveVersion() {
    setIsSubmitting(true);
    setError('');
    setMessage('');

    try {
      const response = await fetch(`${apiBaseUrl}/quotes/${quoteId}/versions`, {
        method: 'POST',
        headers: buildAuthHeaders({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not save quote version.'));
      }

      setMessage('Version saved');
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not save quote version.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="quote-version-actions">
      <button type="button" className="secondary-button" onClick={handleSaveVersion} disabled={isSubmitting}>
        {isSubmitting ? 'Saving...' : 'Save version'}
      </button>
      {message ? <p className="detail-copy">{message}</p> : null}
      {error ? <p className="form-error">{error}</p> : null}
    </div>
  );
}
