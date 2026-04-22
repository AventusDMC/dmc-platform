'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { InlineRowEditorShell } from '../components/InlineRowEditorShell';
import { RowDetailsPanel } from '../components/RowDetailsPanel';
import { buildAuthHeaders } from '../lib/auth-client';
import { getErrorMessage } from '../lib/api';
import { HotelContractOccupancyRuleForm } from './HotelContractOccupancyRuleForm';

type RoomCategoryOption = {
  id: string;
  name: string;
  code: string | null;
};

type OccupancyRule = {
  id: string;
  roomCategoryId: string | null;
  occupancyType: 'SGL' | 'DBL' | 'TPL';
  minAdults: number;
  maxAdults: number;
  maxChildren: number;
  maxOccupants: number;
  isActive: boolean;
  notes: string | null;
  roomCategory: {
    id: string;
    name: string;
    code: string | null;
  } | null;
};

type HotelContractOccupancyRulesTableProps = {
  apiBaseUrl: string;
  contractId: string;
  roomCategories: RoomCategoryOption[];
  rules: OccupancyRule[];
};

function formatOccupancyType(value: OccupancyRule['occupancyType']) {
  return value === 'SGL' ? 'Single' : value === 'DBL' ? 'Double' : 'Triple';
}

export function HotelContractOccupancyRulesTable({
  apiBaseUrl,
  contractId,
  roomCategories,
  rules,
}: HotelContractOccupancyRulesTableProps) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function handleDelete(rule: OccupancyRule) {
    if (!window.confirm(`Delete occupancy rule for ${formatOccupancyType(rule.occupancyType)}?`)) {
      return;
    }

    setDeletingId(rule.id);
    setError('');

    try {
      const response = await fetch(`${apiBaseUrl}/hotel-contracts/${contractId}/occupancy-rules/${rule.id}`, {
        method: 'DELETE',
        headers: buildAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not delete occupancy rule.'));
      }

      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not delete occupancy rule.');
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
            <th>Room Scope</th>
            <th>Occupancy</th>
            <th>Adults</th>
            <th>Children</th>
            <th>Occupants</th>
            <th>Status</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody>
          {rules.map((rule) => (
            <tr key={rule.id}>
              <td>
                <strong>{rule.roomCategory ? (rule.roomCategory.code ? `${rule.roomCategory.name} (${rule.roomCategory.code})` : rule.roomCategory.name) : 'All room categories'}</strong>
              </td>
              <td>{formatOccupancyType(rule.occupancyType)}</td>
              <td className="quote-table-number-cell">
                {rule.minAdults}-{rule.maxAdults}
              </td>
              <td className="quote-table-number-cell">{rule.maxChildren}</td>
              <td className="quote-table-number-cell">{rule.maxOccupants}</td>
              <td>
                <span className={`quote-ui-badge ${rule.isActive ? 'quote-ui-badge-success' : 'quote-ui-badge-info'}`}>
                  {rule.isActive ? 'Active' : 'Inactive'}
                </span>
              </td>
              <td>
                <RowDetailsPanel summary="View details" description="Edit rule and operational notes" groupId="hotel-contract-occupancy-rules">
                  <div className="section-stack">
                    {rule.notes ? (
                      <div className="detail-card">
                        <h3>Notes</h3>
                        <p className="table-subcopy">{rule.notes}</p>
                      </div>
                    ) : null}

                    <InlineRowEditorShell>
                      <HotelContractOccupancyRuleForm
                        apiBaseUrl={apiBaseUrl}
                        contractId={contractId}
                        roomCategories={roomCategories}
                        ruleId={rule.id}
                        submitLabel="Save rule"
                        initialValues={{
                          roomCategoryId: rule.roomCategoryId || '',
                          occupancyType: rule.occupancyType,
                          minAdults: String(rule.minAdults),
                          maxAdults: String(rule.maxAdults),
                          maxChildren: String(rule.maxChildren),
                          maxOccupants: String(rule.maxOccupants),
                          isActive: rule.isActive,
                          notes: rule.notes || '',
                        }}
                      />
                      <div className="table-action-row">
                        <button
                          type="button"
                          className="compact-button compact-button-danger"
                          onClick={() => handleDelete(rule)}
                          disabled={deletingId === rule.id}
                        >
                          {deletingId === rule.id ? 'Deleting...' : 'Delete'}
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
