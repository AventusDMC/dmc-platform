'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getApiError } from '../lib/api';

type CreatePetraHikingButtonProps = {
  exists: boolean;
};

export function CreatePetraHikingButton({ exists }: CreatePetraHikingButtonProps) {
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');

  async function handleEnsurePetraHiking() {
    setError('');
    setIsCreating(true);

    try {
      const response = await fetch('/api/activities/petra-hiking/ensure', {
        method: 'POST',
      });

      if (!response.ok) {
        const apiError = await getApiError(response, 'Could not create Petra Hiking Experiences.');
        throw new Error(apiError.message);
      }

      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not create Petra Hiking Experiences.');
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <span className="inline-action-stack">
      <button type="button" className="primary-button" onClick={handleEnsurePetraHiking} disabled={isCreating}>
        {isCreating ? 'Creating...' : exists ? 'Refresh Petra Hiking Experiences' : 'Create Petra Hiking Experiences'}
      </button>
      {error ? <span className="form-error">{error}</span> : null}
    </span>
  );
}
