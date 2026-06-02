'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { buildAuthHeaders } from '../lib/auth-client';
import { getErrorMessage } from '../lib/api';

type PackageComponentMoveControlsProps = {
  apiBaseUrl: string;
  packageTemplateId: string;
  componentId: string;
  currentDayNumber: number;
  durationDays: number;
};

export function PackageComponentMoveControls({
  apiBaseUrl,
  packageTemplateId,
  componentId,
  currentDayNumber,
  durationDays,
}: PackageComponentMoveControlsProps) {
  const router = useRouter();
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const dayNumbers = Array.from({ length: Math.max(durationDays, 1) }, (_, index) => index + 1);

  if (dayNumbers.length <= 1) {
    return null;
  }

  async function move(targetDayNumber: number) {
    if (targetDayNumber === currentDayNumber) {
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const response = await fetch(`${apiBaseUrl}/package-templates/${packageTemplateId}/components/${componentId}/move`, {
        method: 'PATCH',
        headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ dayNumber: targetDayNumber }),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not move package component.'));
      }

      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not move package component.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <span className="table-action-group" onClick={(event) => event.stopPropagation()}>
      {error ? <span className="form-error">{error}</span> : null}
      <label className="compact-field">
        <span className="sr-only">Move to day</span>
        <select
          value={currentDayNumber}
          disabled={isSubmitting}
          onChange={(event) => move(Number(event.target.value))}
          aria-label="Move component to day"
        >
          {dayNumbers.map((dayNumber) => (
            <option key={dayNumber} value={dayNumber}>
              {dayNumber === currentDayNumber ? `Day ${dayNumber} (current)` : `Move to day ${dayNumber}`}
            </option>
          ))}
        </select>
      </label>
    </span>
  );
}
