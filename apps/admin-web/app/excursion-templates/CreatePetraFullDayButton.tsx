'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getApiError } from '../lib/api';

type CreatePetraFullDayButtonProps = {
  exists: boolean;
  label?: string;
  endpoint?: string;
};

export function CreatePetraFullDayButton({
  exists,
  label = 'Petra Full Day Template',
  endpoint = '/api/excursion-templates/petra-full-day/ensure',
}: CreatePetraFullDayButtonProps) {
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');

  async function handleEnsureTemplate() {
    setError('');
    setIsCreating(true);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
      });

      if (!response.ok) {
        const apiError = await getApiError(response, `Could not create ${label}.`);
        throw new Error(apiError.message);
      }

      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : `Could not create ${label}.`);
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <span className="inline-action-stack">
      <button type="button" className="primary-button" onClick={handleEnsureTemplate} disabled={isCreating}>
        {isCreating ? 'Creating...' : exists ? `Refresh ${label}` : `Create ${label}`}
      </button>
      {error ? <span className="form-error">{error}</span> : null}
    </span>
  );
}
