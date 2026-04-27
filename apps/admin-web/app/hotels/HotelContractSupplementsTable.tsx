'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { InlineRowEditorShell } from '../components/InlineRowEditorShell';
import { RowDetailsPanel } from '../components/RowDetailsPanel';
import { buildAuthHeaders } from '../lib/auth-client';
import { getErrorMessage } from '../lib/api';
import { HotelContractSupplementForm } from './HotelContractSupplementForm';
import { normalizeSupportedCurrency } from '../lib/currencyOptions';
import { formatSupplementCharge, formatSupplementType } from './hotel-contract-display';

type RoomCategoryOption = {
  id: string;
  name: string;
  code: string | null;
};

type Supplement = {
  id: string;
  roomCategoryId: string | null;
  type: 'EXTRA_BREAKFAST' | 'EXTRA_LUNCH' | 'EXTRA_DINNER' | 'GALA_DINNER' | 'EXTRA_BED' | string | null;
  chargeBasis: 'PER_PERSON' | 'PER_ROOM' | 'PER_STAY' | 'PER_NIGHT' | string | null;
  amount: number | string | null;
  currency: string | null;
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

const SUPPLEMENT_TYPES = ['EXTRA_BREAKFAST', 'EXTRA_LUNCH', 'EXTRA_DINNER', 'GALA_DINNER', 'EXTRA_BED'] as const;
const CHARGE_BASIS_VALUES = ['PER_PERSON', 'PER_ROOM', 'PER_STAY', 'PER_NIGHT'] as const;

function normalizeSupplementType(value: Supplement['type']): (typeof SUPPLEMENT_TYPES)[number] {
  return SUPPLEMENT_TYPES.includes(value as (typeof SUPPLEMENT_TYPES)[number]) ? (value as (typeof SUPPLEMENT_TYPES)[number]) : 'EXTRA_BED';
}

function normalizeChargeBasis(value: Supplement['chargeBasis']): (typeof CHARGE_BASIS_VALUES)[number] {
  return CHARGE_BASIS_VALUES.includes(value as (typeof CHARGE_BASIS_VALUES)[number]) ? (value as (typeof CHARGE_BASIS_VALUES)[number]) : 'PER_NIGHT';
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
                {formatSupplementCharge(supplement).amountLabel}
                <div className="table-subcopy">{formatSupplementCharge(supplement).basisLabel}</div>
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
                          type: normalizeSupplementType(supplement.type),
                          chargeBasis: normalizeChargeBasis(supplement.chargeBasis),
                          amount: supplement.amount === null || supplement.amount === undefined ? '' : String(supplement.amount),
                          currency: normalizeSupportedCurrency(supplement.currency || undefined),
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
