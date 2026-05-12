'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { buildAuthHeaders } from '../lib/auth-client';
import { getErrorMessage } from '../lib/api';

type PackageComponentReorderControlsProps = {
  apiBaseUrl: string;
  packageTemplateId: string;
  dayId: string;
  componentId: string;
  orderedComponentIds: string[];
};

function moveId(items: string[], id: string, direction: -1 | 1) {
  const index = items.indexOf(id);
  const targetIndex = index + direction;
  if (index < 0 || targetIndex < 0 || targetIndex >= items.length) {
    return items;
  }

  const next = [...items];
  [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
  return next;
}

export function PackageComponentReorderControls({
  apiBaseUrl,
  packageTemplateId,
  dayId,
  componentId,
  orderedComponentIds,
}: PackageComponentReorderControlsProps) {
  const router = useRouter();
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isFirst = orderedComponentIds[0] === componentId;
  const isLast = orderedComponentIds[orderedComponentIds.length - 1] === componentId;

  async function reorder(direction: -1 | 1) {
    setIsSubmitting(true);
    setError('');

    try {
      const response = await fetch(`${apiBaseUrl}/package-templates/${packageTemplateId}/days/${dayId}/components/reorder`, {
        method: 'PATCH',
        headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ orderedComponentIds: moveId(orderedComponentIds, componentId, direction) }),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not reorder package components.'));
      }

      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not reorder package components.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <span className="table-action-group" onClick={(event) => event.stopPropagation()}>
      {error ? <span className="form-error">{error}</span> : null}
      <button type="button" className="compact-button" onClick={() => reorder(-1)} disabled={isSubmitting || isFirst}>
        Up
      </button>
      <button type="button" className="compact-button" onClick={() => reorder(1)} disabled={isSubmitting || isLast}>
        Down
      </button>
    </span>
  );
}
