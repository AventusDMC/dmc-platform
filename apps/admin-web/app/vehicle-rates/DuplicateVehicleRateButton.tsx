'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { buildAuthHeaders } from '../lib/auth-client';
import { getErrorMessage } from '../lib/api';

type DuplicateVehicleRateButtonProps = {
  apiBaseUrl: string;
  rateId: string;
};

export function DuplicateVehicleRateButton({ apiBaseUrl, rateId }: DuplicateVehicleRateButtonProps) {
  const router = useRouter();
  const [isDuplicating, setIsDuplicating] = useState(false);
  const [error, setError] = useState('');

  async function handleDuplicate() {
    setIsDuplicating(true);
    setError('');

    try {
      const response = await fetch(`${apiBaseUrl}/vehicle-rates/${rateId}/duplicate`, {
        method: 'POST',
        headers: buildAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not duplicate vehicle rate.'));
      }

      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not duplicate vehicle rate.');
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
