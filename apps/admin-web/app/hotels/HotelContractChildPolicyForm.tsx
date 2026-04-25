'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { buildAuthHeaders } from '../lib/auth-client';
import { getErrorMessage } from '../lib/api';

type HotelContractChildPolicyFormProps = {
  apiBaseUrl: string;
  contractId: string;
  submitLabel?: string;
  initialValues?: {
    infantMaxAge: string;
    childMaxAge: string;
    notes: string;
  };
};

function createDefaultValues() {
  return {
    infantMaxAge: '1',
    childMaxAge: '11',
    notes: '',
  };
}

export function HotelContractChildPolicyForm({
  apiBaseUrl,
  contractId,
  submitLabel,
  initialValues,
}: HotelContractChildPolicyFormProps) {
  const router = useRouter();
  const initialState = initialValues || createDefaultValues();
  const [infantMaxAge, setInfantMaxAge] = useState(initialState.infantMaxAge);
  const [childMaxAge, setChildMaxAge] = useState(initialState.childMaxAge);
  const [notes, setNotes] = useState(initialState.notes);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      const response = await fetch(`${apiBaseUrl}/contracts/${contractId}/child-policy`, {
        method: 'PUT',
        headers: buildAuthHeaders({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          infantMaxAge,
          childMaxAge,
          notes,
        }),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not save child policy.'));
      }

      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not save child policy.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="entity-form" onSubmit={handleSubmit}>
      <div className="form-row form-row-3">
        <label>
          Infant max age
          <input value={infantMaxAge} onChange={(event) => setInfantMaxAge(event.target.value)} type="number" min="0" step="1" required />
        </label>

        <label>
          Child max age
          <input value={childMaxAge} onChange={(event) => setChildMaxAge(event.target.value)} type="number" min="1" step="1" required />
        </label>

        <label>
          Notes
          <input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional child policy note" />
        </label>
      </div>

      {error ? <p className="form-error">{error}</p> : null}

      <div className="table-action-row">
        <button type="submit" className="primary-button" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : submitLabel || 'Save child policy'}
        </button>
      </div>
    </form>
  );
}
