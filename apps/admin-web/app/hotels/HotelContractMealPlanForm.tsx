'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { buildAuthHeaders } from '../lib/auth-client';
import { getErrorMessage } from '../lib/api';

type MealPlanCode = 'RO' | 'BB' | 'HB' | 'FB' | 'AI';

type MealPlanFormValues = {
  code: MealPlanCode;
  isActive: boolean;
  notes: string;
};

type HotelContractMealPlanFormProps = {
  apiBaseUrl: string;
  contractId: string;
  mealPlanId?: string;
  submitLabel?: string;
  initialValues?: MealPlanFormValues;
};

function createDefaultValues(): MealPlanFormValues {
  return {
    code: 'BB',
    isActive: true,
    notes: '',
  };
}

export function HotelContractMealPlanForm({
  apiBaseUrl,
  contractId,
  mealPlanId,
  submitLabel,
  initialValues,
}: HotelContractMealPlanFormProps) {
  const router = useRouter();
  const initialState = initialValues || createDefaultValues();
  const [code, setCode] = useState<MealPlanCode>(initialState.code);
  const [isActive, setIsActive] = useState(initialState.isActive);
  const [notes, setNotes] = useState(initialState.notes);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const isEditing = Boolean(mealPlanId);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      const response = await fetch(`${apiBaseUrl}/contracts/${contractId}/meal-plans${mealPlanId ? `/${mealPlanId}` : ''}`, {
        method: mealPlanId ? 'PATCH' : 'POST',
        headers: buildAuthHeaders({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          code,
          isActive,
          notes,
        }),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, `Could not ${isEditing ? 'update' : 'create'} meal plan.`));
      }

      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : `Could not ${isEditing ? 'update' : 'create'} meal plan.`);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="entity-form" onSubmit={handleSubmit}>
      <div className="form-row form-row-3">
        <label>
          Meal plan
          <select value={code} onChange={(event) => setCode(event.target.value as MealPlanCode)}>
            <option value="RO">RO</option>
            <option value="BB">BB</option>
            <option value="HB">HB</option>
            <option value="FB">FB</option>
            <option value="AI">AI</option>
          </select>
        </label>

        <label className="checkbox-field">
          <input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} />
          Active meal plan
        </label>

        <label>
          Notes
          <input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional contract note" />
        </label>
      </div>

      {error ? <p className="form-error">{error}</p> : null}

      <div className="table-action-row">
        <button type="submit" className="primary-button" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : submitLabel || (isEditing ? 'Save meal plan' : 'Add meal plan')}
        </button>
      </div>
    </form>
  );
}
