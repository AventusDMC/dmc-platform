'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { InlineRowEditorShell } from '../components/InlineRowEditorShell';
import { RowDetailsPanel } from '../components/RowDetailsPanel';
import { buildAuthHeaders } from '../lib/auth-client';
import { getErrorMessage } from '../lib/api';
import { HotelContractSupplementForm } from './HotelContractSupplementForm';
import { normalizeSupportedCurrency } from '../lib/currencyOptions';

type RoomCategoryOption = {
  id: string;
  name: string;
  code: string | null;
};

type Supplement = {
  id: string;
  roomCategoryId: string | null;
  type: 'EXTRA_BREAKFAST' | 'EXTRA_LUNCH' | 'EXTRA_DINNER' | 'GALA_DINNER' | 'EXTRA_BED';
  chargeBasis: 'PER_PERSON' | 'PER_ROOM' | 'PER_STAY' | 'PER_NIGHT';
  amount: number;
  currency: string;
  isMandatory: boolean;
  isActive: boolean;
  notes: string | null;
  roomCategory: {
    id: string;
    name: string;
    code: string | null;
  } | null;
};

type HotelContractSupplementsTableProps = {
  apiBaseUrl: string;
  contractId: string;
  roomCategories: RoomCategoryOption[];
  supplements: Supplement[];
};

function formatSupplementType(value: Supplement['type']) {
  return value === 'EXTRA_BREAKFAST'
    ? 'Extra breakfast'
    : value === 'EXTRA_LUNCH'
      ? 'Extra lunch'
      : value === 'EXTRA_DINNER'
        ? 'Extra dinner'
        : value === 'GALA_DINNER'
          ? 'Gala dinner'
          : 'Extra bed';
}

function formatChargeBasis(value: Supplement['chargeBasis']) {
  return value === 'PER_PERSON'
    ? 'Per person'
    : value === 'PER_ROOM'
      ? 'Per room'
      : value === 'PER_STAY'
        ? 'Per stay'
        : 'Per night';
}

export function HotelContractSupplementsTable({
  apiBaseUrl,
  contractId,
  roomCategories,
  supplements,
}: HotelContractSupplementsTableProps) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function handleDelete(supplement: Supplement) {
    if (!window.confirm(`Delete ${formatSupplementType(supplement.type)}?`)) {
      return;
    }

    setDeletingId(supplement.id);
    setError('');

    try {
      const response = await fetch(`${apiBaseUrl}/contracts/${contractId}/supplements/${supplement.id}`, {
        method: 'DELETE',
        headers: buildAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not delete supplement.'));
      }

      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not delete supplement.');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="table-wrap">
      {error ? <p className="form-error">{error}</p> : null}
      <table className="data-table quote-consistency-table">
        <thead>
          <tr>
            <th>Supplement</th>
            <th>Room scope</th>
            <th>Charge</th>
            <th>Status</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody>
          {supplements.map((supplement) => (
            <tr key={supplement.id}>
              <td>
                <strong>{formatSupplementType(supplement.type)}</strong>
                <div className="table-subcopy">{supplement.isMandatory ? 'Mandatory' : 'Optional'}</div>
              </td>
              <td>
                {supplement.roomCategory
                  ? supplement.roomCategory.code
                    ? `${supplement.roomCategory.name} (${supplement.roomCategory.code})`
                    : supplement.roomCategory.name
                  : 'All room categories'}
              </td>
              <td>
                {supplement.amount.toFixed(2)} {supplement.currency}
                <div className="table-subcopy">{formatChargeBasis(supplement.chargeBasis)}</div>
              </td>
              <td>
                <span className={`quote-ui-badge ${supplement.isActive ? 'quote-ui-badge-success' : 'quote-ui-badge-info'}`}>
                  {supplement.isActive ? 'Active' : 'Inactive'}
                </span>
              </td>
              <td>
                <RowDetailsPanel summary="View details" description="Edit supplement scope, charge basis, and notes" groupId="hotel-contract-supplements">
                  <div className="section-stack">
                    {supplement.notes ? (
                      <div className="detail-card">
                        <h3>Notes</h3>
                        <p className="table-subcopy">{supplement.notes}</p>
                      </div>
                    ) : null}

                    <InlineRowEditorShell>
                      <HotelContractSupplementForm
                        apiBaseUrl={apiBaseUrl}
                        contractId={contractId}
                        roomCategories={roomCategories}
                        supplementId={supplement.id}
                        submitLabel="Save supplement"
                        initialValues={{
                          roomCategoryId: supplement.roomCategoryId || '',
                          type: supplement.type,
                          chargeBasis: supplement.chargeBasis,
                          amount: String(supplement.amount),
                          currency: normalizeSupportedCurrency(supplement.currency),
                          isMandatory: supplement.isMandatory,
                          isActive: supplement.isActive,
                          notes: supplement.notes || '',
                        }}
                      />
                      <div className="table-action-row">
                        <button
                          type="button"
                          className="compact-button compact-button-danger"
                          onClick={() => handleDelete(supplement)}
                          disabled={deletingId === supplement.id}
                        >
                          {deletingId === supplement.id ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    </InlineRowEditorShell>
                  </div>
                </RowDetailsPanel>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
