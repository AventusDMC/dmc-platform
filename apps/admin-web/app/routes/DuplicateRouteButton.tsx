'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getErrorMessage } from '../lib/api';

type DuplicateRouteButtonProps = {
  apiBaseUrl: string;
  routeId: string;
};

export function DuplicateRouteButton({ apiBaseUrl, routeId }: DuplicateRouteButtonProps) {
  const router = useRouter();
  const [isDuplicating, setIsDuplicating] = useState(false);
  const [error, setError] = useState('');

  async function handleDuplicate() {
    setIsDuplicating(true);
    setError('');

    try {
      const response = await fetch(`${apiBaseUrl}/routes/${routeId}/duplicate`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not duplicate route.'));
      }

      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not duplicate route.');
    } finally {
      setIsDuplicating(false);
    }
  }

  return (
    <div>
      <button type="button" className="compact-button" onClick={handleDuplicate} disabled={isDuplicating}>
        {isDuplicating ? 'Duplicating...' : 'Duplicate'}
      </button>
      {error ? <p className="form-error">{error}</p> : null}
    </div>
  );
}
