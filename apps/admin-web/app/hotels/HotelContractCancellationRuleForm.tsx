'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { buildAuthHeaders } from '../lib/auth-client';
import { getErrorMessage } from '../lib/api';

type CancellationPenaltyType = 'PERCENT' | 'NIGHTS' | 'FULL_STAY' | 'FIXED';
type CancellationDeadlineUnit = 'DAYS' | 'HOURS';

type CancellationRuleFormValues = {
  windowFromValue: string;
  windowToValue: string;
  deadlineUnit: CancellationDeadlineUnit;
  penaltyType: CancellationPenaltyType;
  penaltyValue: string;
  isActive: boolean;
  notes: string;
};

type HotelContractCancellationRuleFormProps = {
  apiBaseUrl: string;
  contractId: string;
  ruleId?: string;
  submitLabel?: string;
  initialValues?: CancellationRuleFormValues;
};

function createDefaultValues(): CancellationRuleFormValues {
  return {
    windowFromValue: '0',
    windowToValue: '7',
    deadlineUnit: 'DAYS',
    penaltyType: 'PERCENT',
    penaltyValue: '100',
    isActive: true,
    notes: '',
  };
}

export function HotelContractCancellationRuleForm({
  apiBaseUrl,
  contractId,
  ruleId,
  submitLabel,
  initialValues,
}: HotelContractCancellationRuleFormProps) {
  const router = useRouter();
  const initialState = initialValues || createDefaultValues();
  const [windowFromValue, setWindowFromValue] = useState(initialState.windowFromValue);
  const [windowToValue, setWindowToValue] = useState(initialState.windowToValue);
  const [deadlineUnit, setDeadlineUnit] = useState<CancellationDeadlineUnit>(initialState.deadlineUnit);
  const [penaltyType, setPenaltyType] = useState<CancellationPenaltyType>(initialState.penaltyType);
  const [penaltyValue, setPenaltyValue] = useState(initialState.penaltyValue);
  const [isActive, setIsActive] = useState(initialState.isActive);
  const [notes, setNotes] = useState(initialState.notes);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const isEditing = Boolean(ruleId);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      const response = await fetch(`${apiBaseUrl}/contracts/${contractId}/cancellation-policy/rules${ruleId ? `/${ruleId}` : ''}`, {
        method: ruleId ? 'PATCH' : 'POST',
        headers: buildAuthHeaders({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          windowFromValue,
          windowToValue,
          deadlineUnit,
          penaltyType,
          penaltyValue: penaltyType === 'FULL_STAY' ? null : penaltyValue,
          isActive,
          notes,
        }),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, `Could not ${isEditing ? 'update' : 'create'} cancellation rule.`));
      }

      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : `Could not ${isEditing ? 'update' : 'create'} cancellation rule.`);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="entity-form" onSubmit={handleSubmit}>
      <div className="form-row form-row-4">
        <label>
          Window from
          <input value={windowFromValue} onChange={(event) => setWindowFromValue(event.target.value)} type="number" min="0" step="1" required />
        </label>

        <label>
          Window to
          <input value={windowToValue} onChange={(event) => setWindowToValue(event.target.value)} type="number" min="0" step="1" required />
        </label>

        <label>
          Unit
          <select value={deadlineUnit} onChange={(event) => setDeadlineUnit(event.target.value as CancellationDeadlineUnit)}>
            <option value="DAYS">Days</option>
            <option value="HOURS">Hours</option>
          </select>
        </label>

        <label>
          Penalty
          <select value={penaltyType} onChange={(event) => setPenaltyType(event.target.value as CancellationPenaltyType)}>
            <option value="PERCENT">Percent</option>
            <option value="NIGHTS">Nights</option>
            <option value="FULL_STAY">Full stay</option>
            <option value="FIXED">Fixed</option>
          </select>
        </label>
      </div>

      <div className="form-row form-row-3">
        {penaltyType !== 'FULL_STAY' ? (
          <label>
            Penalty value
            <input
              value={penaltyValue}
              onChange={(event) => setPenaltyValue(event.target.value)}
              type="number"
              min="0"
              step={penaltyType === 'NIGHTS' ? '1' : '0.01'}
              required
            />
          </label>
        ) : null}

        <label className="checkbox-field">
          <input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} />
          Active rule
        </label>

        <label>
          Notes
          <input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional penalty note" />
        </label>
      </div>

      {error ? <p className="form-error">{error}</p> : null}

      <div className="table-action-row">
        <button type="submit" className="primary-button" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : submitLabel || (isEditing ? 'Save rule' : 'Add rule')}
        </button>
      </div>
    </form>
  );
}
