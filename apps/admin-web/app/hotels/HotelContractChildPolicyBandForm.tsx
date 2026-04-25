'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { buildAuthHeaders } from '../lib/auth-client';
import { getErrorMessage } from '../lib/api';

type ChildPolicyBandFormValues = {
  label: string;
  minAge: string;
  maxAge: string;
  chargeBasis: 'FREE' | 'PERCENT_OF_ADULT' | 'FIXED_AMOUNT';
  chargeValue: string;
  isActive: boolean;
  notes: string;
};

type HotelContractChildPolicyBandFormProps = {
  apiBaseUrl: string;
  contractId: string;
  bandId?: string;
  submitLabel?: string;
  initialValues?: ChildPolicyBandFormValues;
};

function createDefaultValues(): ChildPolicyBandFormValues {
  return {
    label: '',
    minAge: '2',
    maxAge: '5',
    chargeBasis: 'FREE',
    chargeValue: '',
    isActive: true,
    notes: '',
  };
}

export function HotelContractChildPolicyBandForm({
  apiBaseUrl,
  contractId,
  bandId,
  submitLabel,
  initialValues,
}: HotelContractChildPolicyBandFormProps) {
  const router = useRouter();
  const initialState = initialValues || createDefaultValues();
  const [label, setLabel] = useState(initialState.label);
  const [minAge, setMinAge] = useState(initialState.minAge);
  const [maxAge, setMaxAge] = useState(initialState.maxAge);
  const [chargeBasis, setChargeBasis] = useState<'FREE' | 'PERCENT_OF_ADULT' | 'FIXED_AMOUNT'>(initialState.chargeBasis);
  const [chargeValue, setChargeValue] = useState(initialState.chargeValue);
  const [isActive, setIsActive] = useState(initialState.isActive);
  const [notes, setNotes] = useState(initialState.notes);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const isEditing = Boolean(bandId);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      const response = await fetch(`${apiBaseUrl}/contracts/${contractId}/child-policy/bands${bandId ? `/${bandId}` : ''}`, {
        method: bandId ? 'PATCH' : 'POST',
        headers: buildAuthHeaders({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          label,
          minAge,
          maxAge,
          chargeBasis,
          chargeValue: chargeBasis === 'FREE' ? null : chargeValue,
          isActive,
          notes,
        }),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, `Could not ${isEditing ? 'update' : 'create'} child policy band.`));
      }

      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : `Could not ${isEditing ? 'update' : 'create'} child policy band.`);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="entity-form" onSubmit={handleSubmit}>
      <div className="form-row form-row-4">
        <label>
          Band label
          <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Child sharing bed" required />
        </label>

        <label>
          Min age
          <input value={minAge} onChange={(event) => setMinAge(event.target.value)} type="number" min="0" step="1" required />
        </label>

        <label>
          Max age
          <input value={maxAge} onChange={(event) => setMaxAge(event.target.value)} type="number" min="0" step="1" required />
        </label>

        <label>
          Charge basis
          <select value={chargeBasis} onChange={(event) => setChargeBasis(event.target.value as 'FREE' | 'PERCENT_OF_ADULT' | 'FIXED_AMOUNT')}>
            <option value="FREE">Free</option>
            <option value="PERCENT_OF_ADULT">% of adult rate</option>
            <option value="FIXED_AMOUNT">Fixed amount</option>
          </select>
        </label>
      </div>

      <div className="form-row form-row-3">
        {chargeBasis !== 'FREE' ? (
          <label>
            Charge value
            <input value={chargeValue} onChange={(event) => setChargeValue(event.target.value)} type="number" min="0" step="0.01" required />
          </label>
        ) : null}

        <label className="checkbox-field">
          <input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} />
          Active band
        </label>

        <label>
          Notes
          <input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional charge note" />
        </label>
      </div>

      {error ? <p className="form-error">{error}</p> : null}

      <div className="table-action-row">
        <button type="submit" className="primary-button" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : submitLabel || (isEditing ? 'Save band' : 'Add band')}
        </button>
      </div>
    </form>
  );
}
