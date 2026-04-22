'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getErrorMessage } from '../lib/api';
import { buildAuthHeaders } from '../lib/auth-client';

type RoomCategoryOption = {
  id: string;
  hotelId: string;
  name: string;
  code: string | null;
  isActive: boolean;
};

type ContractOption = {
  id: string;
  name: string;
  validFrom: string;
  validTo: string;
  hotel: {
    id: string;
    name: string;
    roomCategories: RoomCategoryOption[];
  };
};

type HotelAllotmentsFormProps = {
  apiBaseUrl: string;
  contracts: ContractOption[];
  contractId?: string;
  allotmentId?: string;
  submitLabel?: string;
  initialValues?: {
    contractId: string;
    roomCategoryId: string;
    dateFrom: string;
    dateTo: string;
    allotment: string;
    releaseDays: string;
    stopSale: boolean;
    notes: string;
    isActive: boolean;
  };
};

export function HotelAllotmentsForm({
  apiBaseUrl,
  contracts,
  contractId,
  allotmentId,
  submitLabel,
  initialValues,
}: HotelAllotmentsFormProps) {
  const router = useRouter();
  const [selectedContractId, setSelectedContractId] = useState(initialValues?.contractId || contractId || contracts[0]?.id || '');
  const [roomCategoryId, setRoomCategoryId] = useState(initialValues?.roomCategoryId || '');
  const [dateFrom, setDateFrom] = useState(initialValues?.dateFrom || '');
  const [dateTo, setDateTo] = useState(initialValues?.dateTo || '');
  const [allotment, setAllotment] = useState(initialValues?.allotment || '');
  const [releaseDays, setReleaseDays] = useState(initialValues?.releaseDays || '0');
  const [stopSale, setStopSale] = useState(initialValues?.stopSale || false);
  const [notes, setNotes] = useState(initialValues?.notes || '');
  const [isActive, setIsActive] = useState(initialValues?.isActive ?? true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const isEditing = Boolean(allotmentId);

  const selectedContract = useMemo(
    () => contracts.find((contractOption) => contractOption.id === selectedContractId) || null,
    [contracts, selectedContractId],
  );
  const availableRoomCategories = useMemo(
    () => selectedContract?.hotel.roomCategories.filter((category) => category.isActive) || [],
    [selectedContract],
  );

  useEffect(() => {
    if (availableRoomCategories.length === 0) {
      if (roomCategoryId) {
        setRoomCategoryId('');
      }
      return;
    }

    if (availableRoomCategories.some((entry) => entry.id === roomCategoryId)) {
      return;
    }

    setRoomCategoryId(initialValues?.roomCategoryId || availableRoomCategories[0].id);
  }, [availableRoomCategories, initialValues?.roomCategoryId, roomCategoryId]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      const activeContractId = selectedContractId || contractId;

      const response = await fetch(
        `${apiBaseUrl}/hotel-contracts/${activeContractId}/allotments${allotmentId ? `/${allotmentId}` : ''}`,
        {
          method: allotmentId ? 'PATCH' : 'POST',
          headers: buildAuthHeaders({
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({
            roomCategoryId,
            dateFrom,
            dateTo,
            allotment: Number(allotment),
            releaseDays: Number(releaseDays),
            stopSale,
            notes,
            isActive,
          }),
        },
      );

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, `Could not ${isEditing ? 'update' : 'create'} hotel allotment.`));
      }

      if (!isEditing) {
        setDateFrom('');
        setDateTo('');
        setAllotment('');
        setReleaseDays('0');
        setStopSale(false);
        setNotes('');
        setIsActive(true);
      }

      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : `Could not ${isEditing ? 'update' : 'create'} hotel allotment.`);
    } finally {
      setIsSubmitting(false);
    }
  }

  const canSubmit = Boolean(selectedContractId || contractId) && availableRoomCategories.length > 0;

  return (
    <form className="entity-form" onSubmit={handleSubmit}>
      <div className="form-row form-row-2">
        <label>
          Contract
          <select value={selectedContractId} onChange={(event) => setSelectedContractId(event.target.value)} disabled={contracts.length === 0} required>
            {contracts.length === 0 ? (
              <option value="">Create a contract first</option>
            ) : (
              contracts.map((contractOption) => (
                <option key={contractOption.id} value={contractOption.id}>
                  {contractOption.hotel.name} - {contractOption.name}
                </option>
              ))
            )}
          </select>
        </label>

        <label>
          Room category
          <select value={roomCategoryId} onChange={(event) => setRoomCategoryId(event.target.value)} disabled={availableRoomCategories.length === 0} required>
            {availableRoomCategories.length === 0 ? <option value="">Create an active room category first</option> : null}
            {availableRoomCategories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
                {category.code ? ` (${category.code})` : ''}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="form-row form-row-4">
        <label>
          Date from
          <input value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} type="date" required />
        </label>

        <label>
          Date to
          <input value={dateTo} onChange={(event) => setDateTo(event.target.value)} type="date" required />
        </label>

        <label>
          Allotment
          <input value={allotment} onChange={(event) => setAllotment(event.target.value)} type="number" min="0" required />
        </label>

        <label>
          Release days
          <input value={releaseDays} onChange={(event) => setReleaseDays(event.target.value)} type="number" min="0" required />
        </label>
      </div>

      <div className="form-row form-row-2">
        <label className="checkbox-field">
          <input type="checkbox" checked={stopSale} onChange={(event) => setStopSale(event.target.checked)} />
          Stop sale
        </label>

        <label className="checkbox-field">
          <input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} />
          Active
        </label>
      </div>

      <label>
        Notes
        <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} placeholder="Optional commercial notes or release guidance." />
      </label>

      <button type="submit" disabled={isSubmitting || !canSubmit}>
        {isSubmitting ? 'Saving...' : submitLabel || (isEditing ? 'Save allotment' : 'Create allotment')}
      </button>

      {error ? <p className="form-error">{error}</p> : null}
    </form>
  );
}
