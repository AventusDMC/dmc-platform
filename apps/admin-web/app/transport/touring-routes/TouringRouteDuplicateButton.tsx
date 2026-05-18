'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { getErrorMessage } from '../../lib/api';

type TouringRouteDuplicateButtonProps = {
  routeId: string;
  routeName: string;
  navigateToCopy?: boolean;
};

type DuplicateTouringRouteResponse = {
  id: string;
  name: string;
  code: string;
};

export function TouringRouteDuplicateButton({ routeId, routeName, navigateToCopy = true }: TouringRouteDuplicateButtonProps) {
  const router = useRouter();
  const [isDuplicating, setIsDuplicating] = useState(false);
  const [error, setError] = useState('');

  async function duplicateRoute() {
    if (!window.confirm(`Duplicate "${routeName}" as an inactive draft route?`)) {
      return;
    }

    setIsDuplicating(true);
    setError('');

    try {
      const response = await fetch(`/api/touring-routes/${encodeURIComponent(routeId)}/duplicate`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not duplicate touring route.'));
      }

      const copy = (await response.json()) as DuplicateTouringRouteResponse;
      if (navigateToCopy) {
        router.push(`/transport/touring-routes/${encodeURIComponent(copy.id)}?mode=edit#edit`);
        return;
      }

      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not duplicate touring route.');
    } finally {
      setIsDuplicating(false);
    }
  }

  return (
    <>
      <button type="button" className="secondary-button" onClick={duplicateRoute} disabled={isDuplicating}>
        {isDuplicating ? 'Duplicating...' : 'Duplicate'}
      </button>
      {error ? <p className="form-error">{error}</p> : null}
    </>
  );
}
