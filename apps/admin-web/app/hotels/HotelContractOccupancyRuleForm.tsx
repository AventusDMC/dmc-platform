'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { buildAuthHeaders } from '../lib/auth-client';
import { getErrorMessage } from '../lib/api';

type RoomCategoryOption = {
  id: string;
  name: string;
  code: string | null;
};

type OccupancyRuleFormValues = {
  roomCategoryId: string;
  occupancyType: 'SGL' | 'DBL' | 'TPL';
  minAdults: string;
  maxAdults: string;
  maxChildren: string;
  maxOccupants: string;
  isActive: boolean;
  notes: string;
};

type HotelContractOccupancyRuleFormProps = {
  apiBaseUrl: string;
  contractId: string;
  roomCategories: RoomCategoryOption[];
  ruleId?: string;
  submitLabel?: string;
  initialValues?: OccupancyRuleFormValues;
};

function createDefaultValues(): OccupancyRuleFormValues {
  return {
    roomCategoryId: '',
    occupancyType: 'DBL',
    minAdults: '1',
    maxAdults: '2',
    maxChildren: '0',
    maxOccupants: '2',
    isActive: true,
    notes: '',
  };
}

export function HotelContractOccupancyRuleForm({
  apiBaseUrl,
  contractId,
  roomCategories,
  ruleId,
  submitLabel,
  initialValues,
}: HotelContractOccupancyRuleFormProps) {
  const router = useRouter();
  const initialState = initialValues || createDefaultValues();
  const [roomCategoryId, setRoomCategoryId] = useState(initialState.roomCategoryId);
  const [occupancyType, setOccupancyType] = useState<'SGL' | 'DBL' | 'TPL'>(initialState.occupancyType);
  const [minAdults, setMinAdults] = useState(initialState.minAdults);
  const [maxAdults, setMaxAdults] = useState(initialState.maxAdults);
  const [maxChildren, setMaxChildren] = useState(initialState.maxChildren);
  const [maxOccupants, setMaxOccupants] = useState(initialState.maxOccupants);
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
      const response = await fetch(`${apiBaseUrl}/hotel-contracts/${contractId}/occupancy-rules${ruleId ? `/${ruleId}` : ''}`, {
        method: ruleId ? 'PATCH' : 'POST',
        headers: buildAuthHeaders({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          roomCategoryId: roomCategoryId || null,
          occupancyType,
          minAdults,
          maxAdults,
          maxChildren,
          maxOccupants,
          isActive,
          notes,
        }),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, `Could not ${isEditing ? 'update' : 'create'} occupancy rule.`));
      }

      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : `Could not ${isEditing ? 'update' : 'create'} occupancy rule.`);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="entity-form" onSubmit={handleSubmit}>
      <div className="form-row form-row-4">
        <label>
          Room category
          <select value={roomCategoryId} onChange={(event) => setRoomCategoryId(event.target.value)}>
            <option value="">All room categories</option>
            {roomCategories.map((roomCategory) => (
              <option key={roomCategory.id} value={roomCategory.id}>
                {roomCategory.code ? `${roomCategory.name} (${roomCategory.code})` : roomCategory.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Occupancy
          <select value={occupancyType} onChange={(event) => setOccupancyType(event.target.value as 'SGL' | 'DBL' | 'TPL')}>
            <option value="SGL">Single</option>
            <option value="DBL">Double</option>
            <option value="TPL">Triple</option>
          </select>
        </label>

        <label>
          Min adults
          <input value={minAdults} onChange={(event) => setMinAdults(event.target.value)} type="number" min="1" step="1" required />
        </label>

        <label>
          Max adults
          <input value={maxAdults} onChange={(event) => setMaxAdults(event.target.value)} type="number" min="1" step="1" required />
        </label>
      </div>

      <div className="form-row form-row-4">
        <label>
          Max children
          <input value={maxChildren} onChange={(event) => setMaxChildren(event.target.value)} type="number" min="0" step="1" required />
        </label>

        <label>
          Max occupants
          <input value={maxOccupants} onChange={(event) => setMaxOccupants(event.target.value)} type="number" min="1" step="1" required />
        </label>

        <label className="checkbox-field">
          <input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} />
          Active rule
        </label>

        <label>
          Notes
          <input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional operational note" />
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
