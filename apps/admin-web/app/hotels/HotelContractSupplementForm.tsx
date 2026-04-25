'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { buildAuthHeaders } from '../lib/auth-client';
import { getErrorMessage } from '../lib/api';
import { CurrencySelect } from '../components/CurrencySelect';
import { type SupportedCurrency } from '../lib/currencyOptions';

type RoomCategoryOption = {
  id: string;
  name: string;
  code: string | null;
};

type SupplementType = 'EXTRA_BREAKFAST' | 'EXTRA_LUNCH' | 'EXTRA_DINNER' | 'GALA_DINNER' | 'EXTRA_BED';
type ChargeBasis = 'PER_PERSON' | 'PER_ROOM' | 'PER_STAY' | 'PER_NIGHT';

type SupplementFormValues = {
  roomCategoryId: string;
  type: SupplementType;
  chargeBasis: ChargeBasis;
  amount: string;
  currency: SupportedCurrency;
  isMandatory: boolean;
  isActive: boolean;
  notes: string;
};

type HotelContractSupplementFormProps = {
  apiBaseUrl: string;
  contractId: string;
  roomCategories: RoomCategoryOption[];
  supplementId?: string;
  submitLabel?: string;
  initialValues?: SupplementFormValues;
};

function createDefaultValues(): SupplementFormValues {
  return {
    roomCategoryId: '',
    type: 'EXTRA_BREAKFAST',
    chargeBasis: 'PER_PERSON',
    amount: '0',
    currency: 'USD',
    isMandatory: false,
    isActive: true,
    notes: '',
  };
}

export function HotelContractSupplementForm({
  apiBaseUrl,
  contractId,
  roomCategories,
  supplementId,
  submitLabel,
  initialValues,
}: HotelContractSupplementFormProps) {
  const router = useRouter();
  const initialState = initialValues || createDefaultValues();
  const [roomCategoryId, setRoomCategoryId] = useState(initialState.roomCategoryId);
  const [type, setType] = useState<SupplementType>(initialState.type);
  const [chargeBasis, setChargeBasis] = useState<ChargeBasis>(initialState.chargeBasis);
  const [amount, setAmount] = useState(initialState.amount);
  const [currency, setCurrency] = useState<SupportedCurrency>(initialState.currency);
  const [isMandatory, setIsMandatory] = useState(initialState.isMandatory);
  const [isActive, setIsActive] = useState(initialState.isActive);
  const [notes, setNotes] = useState(initialState.notes);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const isEditing = Boolean(supplementId);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      const response = await fetch(`${apiBaseUrl}/contracts/${contractId}/supplements${supplementId ? `/${supplementId}` : ''}`, {
        method: supplementId ? 'PATCH' : 'POST',
        headers: buildAuthHeaders({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          roomCategoryId: roomCategoryId || null,
          type,
          chargeBasis,
          amount,
          currency,
          isMandatory,
          isActive,
          notes,
        }),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, `Could not ${isEditing ? 'update' : 'create'} supplement.`));
      }

      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : `Could not ${isEditing ? 'update' : 'create'} supplement.`);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="entity-form" onSubmit={handleSubmit}>
      <div className="form-row form-row-4">
        <label>
          Room scope
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
          Supplement
          <select value={type} onChange={(event) => setType(event.target.value as SupplementType)}>
            <option value="EXTRA_BREAKFAST">Extra breakfast</option>
            <option value="EXTRA_LUNCH">Extra lunch</option>
            <option value="EXTRA_DINNER">Extra dinner</option>
            <option value="GALA_DINNER">Gala dinner</option>
            <option value="EXTRA_BED">Extra bed</option>
          </select>
        </label>

        <label>
          Charge basis
          <select value={chargeBasis} onChange={(event) => setChargeBasis(event.target.value as ChargeBasis)}>
            <option value="PER_PERSON">Per person</option>
            <option value="PER_ROOM">Per room</option>
            <option value="PER_STAY">Per stay</option>
            <option value="PER_NIGHT">Per night</option>
          </select>
        </label>

        <label>
          Amount
          <input value={amount} onChange={(event) => setAmount(event.target.value)} type="number" min="0" step="0.01" required />
        </label>
      </div>

      <div className="form-row form-row-4">
        <label>
          Currency
          <CurrencySelect value={currency} onChange={(value) => setCurrency((value || 'USD') as SupportedCurrency)} required />
        </label>

        <label className="checkbox-field">
          <input type="checkbox" checked={isMandatory} onChange={(event) => setIsMandatory(event.target.checked)} />
          Mandatory supplement
        </label>

        <label className="checkbox-field">
          <input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} />
          Active supplement
        </label>

        <label>
          Notes
          <input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional contract note" />
        </label>
      </div>

      {error ? <p className="form-error">{error}</p> : null}

      <div className="table-action-row">
        <button type="submit" className="primary-button" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : submitLabel || (isEditing ? 'Save supplement' : 'Add supplement')}
        </button>
      </div>
    </form>
  );
}
