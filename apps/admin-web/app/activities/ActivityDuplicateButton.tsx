'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getApiError } from '../lib/api';

type ActivityDuplicateButtonProps = {
  activityId: string;
};

export function ActivityDuplicateButton({ activityId }: ActivityDuplicateButtonProps) {
  const router = useRouter();
  const [isDuplicating, setIsDuplicating] = useState(false);
  const [error, setError] = useState('');

  async function handleDuplicate() {
    setError('');
    setIsDuplicating(true);

    try {
      const response = await fetch(`/api/activities/${activityId}/duplicate`, {
        method: 'POST',
      });

      if (!response.ok) {
        const apiError = await getApiError(response, 'Could not duplicate activity.');
        throw new Error(apiError.message);
      }

      const duplicatedActivity = await response.json();
      router.push(`/activities/${duplicatedActivity.id}`);
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not duplicate activity.');
    } finally {
      setIsDuplicating(false);
    }
  }

  return (
    <span className="inline-action-stack">
      <button type="button" className="secondary-button" onClick={handleDuplicate} disabled={isDuplicating}>
        {isDuplicating ? 'Duplicating...' : 'Duplicate'}
      </button>
      {error ? <span className="form-error">{error}</span> : null}
    </span>
  );
}
