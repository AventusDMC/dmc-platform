'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { buildAuthHeaders } from '../lib/auth-client';
import { getErrorMessage } from '../lib/api';

type PackageDayPlannerActionsProps = {
  apiBaseUrl: string;
  packageTemplateId: string;
  dayId: string;
  dayNumber: number;
  orderedDayIds: string[];
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

export function PackageDayPlannerActions({ apiBaseUrl, packageTemplateId, dayId, dayNumber, orderedDayIds }: PackageDayPlannerActionsProps) {
  const router = useRouter();
  const [error, setError] = useState('');
  const [pendingAction, setPendingAction] = useState('');
  const isFirst = orderedDayIds[0] === dayId;
  const isLast = orderedDayIds[orderedDayIds.length - 1] === dayId;

  async function runAction(label: string, request: () => Promise<Response>) {
    setPendingAction(label);
    setError('');

    try {
      const response = await request();
      if (!response.ok) {
        throw new Error(await getErrorMessage(response, `Could not ${label}.`));
      }
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : `Could not ${label}.`);
    } finally {
      setPendingAction('');
    }
  }

  function reorder(direction: -1 | 1) {
    const orderedDayIdsNext = moveId(orderedDayIds, dayId, direction);
    return runAction('reorder days', () =>
      fetch(`${apiBaseUrl}/package-templates/${packageTemplateId}/days/reorder`, {
        method: 'PATCH',
        headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ orderedDayIds: orderedDayIdsNext }),
      }),
    );
  }

  return (
    <span className="table-action-group" onClick={(event) => event.stopPropagation()}>
      {error ? <span className="form-error">{error}</span> : null}
      <button type="button" className="compact-button" onClick={() => reorder(-1)} disabled={Boolean(pendingAction) || isFirst}>
        Up
      </button>
      <button type="button" className="compact-button" onClick={() => reorder(1)} disabled={Boolean(pendingAction) || isLast}>
        Down
      </button>
      <button
        type="button"
        className="compact-button"
        onClick={() =>
          runAction('insert day', () =>
            fetch(`${apiBaseUrl}/package-templates/${packageTemplateId}/days/insert`, {
              method: 'POST',
              headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
              body: JSON.stringify({ afterDayNumber: dayNumber }),
            }),
          )
        }
        disabled={Boolean(pendingAction)}
      >
        Insert after
      </button>
      <button
        type="button"
        className="compact-button"
        onClick={() =>
          runAction('duplicate day', () =>
            fetch(`${apiBaseUrl}/package-templates/${packageTemplateId}/days/${dayId}/duplicate`, {
              method: 'POST',
              headers: buildAuthHeaders(),
            }),
          )
        }
        disabled={Boolean(pendingAction)}
      >
        Duplicate
      </button>
    </span>
  );
}
