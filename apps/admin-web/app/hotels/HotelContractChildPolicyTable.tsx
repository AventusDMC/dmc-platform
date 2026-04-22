'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { InlineRowEditorShell } from '../components/InlineRowEditorShell';
import { RowDetailsPanel } from '../components/RowDetailsPanel';
import { buildAuthHeaders } from '../lib/auth-client';
import { getErrorMessage } from '../lib/api';
import { HotelContractChildPolicyBandForm } from './HotelContractChildPolicyBandForm';
import { HotelContractChildPolicyForm } from './HotelContractChildPolicyForm';

type ChildPolicy = {
  id: string;
  infantMaxAge: number;
  childMaxAge: number;
  notes: string | null;
  bands: Array<{
    id: string;
    label: string;
    minAge: number;
    maxAge: number;
    chargeBasis: 'FREE' | 'PERCENT_OF_ADULT' | 'FIXED_AMOUNT';
    chargeValue: number | null;
    isActive: boolean;
    notes: string | null;
  }>;
};

type HotelContractChildPolicyTableProps = {
  apiBaseUrl: string;
  contractId: string;
  policy: ChildPolicy;
};

function formatChargeValue(band: ChildPolicy['bands'][number]) {
  if (band.chargeBasis === 'FREE') {
    return 'Free';
  }

  if (band.chargeBasis === 'FIXED_AMOUNT') {
    return `${Number(band.chargeValue || 0).toFixed(2)} fixed`;
  }

  return `${Number(band.chargeValue || 0).toFixed(2)}% adult`;
}

export function HotelContractChildPolicyTable({
  apiBaseUrl,
  contractId,
  policy,
}: HotelContractChildPolicyTableProps) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const safeBands = policy.bands ?? [];

  async function handleDeleteBand(bandId: string) {
    if (!window.confirm('Delete child policy band?')) {
      return;
    }

    setDeletingId(bandId);
    setError('');

    try {
      const response = await fetch(`${apiBaseUrl}/hotel-contracts/${contractId}/child-policy/bands/${bandId}`, {
        method: 'DELETE',
        headers: buildAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not delete child policy band.'));
      }

      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not delete child policy band.');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="section-stack">
      {error ? <p className="form-error">{error}</p> : null}

      <InlineRowEditorShell>
        <div className="quote-preview-total-list">
          <div>
            <span>Infant age</span>
            <strong>0 - {policy.infantMaxAge}</strong>
          </div>
          <div>
            <span>Child age</span>
            <strong>0 - {policy.childMaxAge}</strong>
          </div>
          <div>
            <span>Active bands</span>
            <strong>{safeBands.filter((band) => band.isActive).length}</strong>
          </div>
          <div>
            <span>Notes</span>
            <strong>{policy.notes || 'No notes'}</strong>
          </div>
        </div>
      </InlineRowEditorShell>

      <InlineRowEditorShell>
        <HotelContractChildPolicyForm
          apiBaseUrl={apiBaseUrl}
          contractId={contractId}
          submitLabel="Save policy"
          initialValues={{
            infantMaxAge: String(policy.infantMaxAge),
            childMaxAge: String(policy.childMaxAge),
            notes: policy.notes || '',
          }}
        />
      </InlineRowEditorShell>

      <div className="table-wrap">
        <table className="data-table quote-consistency-table">
          <thead>
            <tr>
              <th>Band</th>
              <th>Age Range</th>
              <th>Charge</th>
              <th>Status</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {safeBands.map((band) => (
              <tr key={band.id}>
                <td>
                  <strong>{band.label}</strong>
                  <div className="table-subcopy">{band.notes || 'No notes'}</div>
                </td>
                <td className="quote-table-number-cell">
                  {band.minAge} - {band.maxAge}
                </td>
                <td>{formatChargeValue(band)}</td>
                <td>
                  <span className={`quote-ui-badge ${band.isActive ? 'quote-ui-badge-success' : 'quote-ui-badge-info'}`}>
                    {band.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td>
                  <RowDetailsPanel summary="View details" description="Edit age band and charge basis" groupId="hotel-contract-child-policy-bands">
                    <div className="section-stack">
                      <InlineRowEditorShell>
                        <HotelContractChildPolicyBandForm
                          apiBaseUrl={apiBaseUrl}
                          contractId={contractId}
                          bandId={band.id}
                          submitLabel="Save band"
                          initialValues={{
                            label: band.label,
                            minAge: String(band.minAge),
                            maxAge: String(band.maxAge),
                            chargeBasis: band.chargeBasis,
                            chargeValue: band.chargeValue == null ? '' : String(band.chargeValue),
                            isActive: band.isActive,
                            notes: band.notes || '',
                          }}
                        />
                        <div className="table-action-row">
                          <button
                            type="button"
                            className="compact-button compact-button-danger"
                            onClick={() => handleDeleteBand(band.id)}
                            disabled={deletingId === band.id}
                          >
                            {deletingId === band.id ? 'Deleting...' : 'Delete'}
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
    </div>
  );
}
