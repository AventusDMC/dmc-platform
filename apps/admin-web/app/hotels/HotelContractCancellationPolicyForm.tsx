'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { buildAuthHeaders } from '../lib/auth-client';
import { getErrorMessage } from '../lib/api';

type CancellationPenaltyType = 'PERCENT' | 'NIGHTS' | 'FULL_STAY' | 'FIXED';

type HotelContractCancellationPolicyFormProps = {
  apiBaseUrl: string;
  contractId: string;
  submitLabel?: string;
  initialValues?: {
    summary: string;
    notes: string;
    noShowPenaltyType: '' | CancellationPenaltyType;
    noShowPenaltyValue: string;
  };
};

function createDefaultValues() {
  return {
    summary: '',
    notes: '',
    noShowPenaltyType: '' as '' | CancellationPenaltyType,
    noShowPenaltyValue: '',
  };
}

export function HotelContractCancellationPolicyForm({
  apiBaseUrl,
  contractId,
  submitLabel,
  initialValues,
}: HotelContractCancellationPolicyFormProps) {
  const router = useRouter();
  const initialState = initialValues || createDefaultValues();
  const [summary, setSummary] = useState(initialState.summary);
  const [notes, setNotes] = useState(initialState.notes);
  const [noShowPenaltyType, setNoShowPenaltyType] = useState<'' | CancellationPenaltyType>(initialState.noShowPenaltyType);
  const [noShowPenaltyValue, setNoShowPenaltyValue] = useState(initialState.noShowPenaltyValue);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      const response = await fetch(`${apiBaseUrl}/contracts/${contractId}/cancellation-policy`, {
        method: 'PUT',
        headers: buildAuthHeaders({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          summary,
          notes,
          noShowPenaltyType: noShowPenaltyType || null,
          noShowPenaltyValue: noShowPenaltyType && noShowPenaltyType !== 'FULL_STAY' ? noShowPenaltyValue : null,
        }),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not save cancellation policy.'));
      }

      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not save cancellation policy.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="entity-form" onSubmit={handleSubmit}>
      <div className="form-row form-row-2">
        <label>
          Policy summary
          <input value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="Free until 7 days, then sliding penalties" />
        </label>

        <label>
          Notes
          <input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional cancellation note" />
        </label>
      </div>

      <div className="form-row form-row-3">
        <label>
          No-show penalty
          <select value={noShowPenaltyType} onChange={(event) => setNoShowPenaltyType(event.target.value as '' | CancellationPenaltyType)}>
            <option value="">Not configured</option>
            <option value="PERCENT">Percent</option>
            <option value="NIGHTS">Nights</option>
            <option value="FULL_STAY">Full stay</option>
            <option value="FIXED">Fixed</option>
          </select>
        </label>

        {noShowPenaltyType && noShowPenaltyType !== 'FULL_STAY' ? (
          <label>
            No-show value
            <input
              value={noShowPenaltyValue}
              onChange={(event) => setNoShowPenaltyValue(event.target.value)}
              type="number"
              min="0"
              step={noShowPenaltyType === 'NIGHTS' ? '1' : '0.01'}
              required
            />
          </label>
        ) : null}
      </div>

      {error ? <p className="form-error">{error}</p> : null}

      <div className="table-action-row">
        <button type="submit" className="primary-button" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : submitLabel || 'Save cancellation policy'}
        </button>
      </div>
    </form>
  );
}
