'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { InlineRowEditorShell } from '../components/InlineRowEditorShell';
import { RowDetailsPanel } from '../components/RowDetailsPanel';
import { buildAuthHeaders } from '../lib/auth-client';
import { getErrorMessage } from '../lib/api';
import { HotelContractCancellationRuleForm } from './HotelContractCancellationRuleForm';

type CancellationPolicy = {
  id: string;
  summary: string | null;
  notes: string | null;
  noShowPenaltyType: 'PERCENT' | 'NIGHTS' | 'FULL_STAY' | 'FIXED' | null;
  noShowPenaltyValue: number | null;
  rules: Array<{
    id: string;
    windowFromValue: number;
    windowToValue: number;
    deadlineUnit: 'DAYS' | 'HOURS';
    penaltyType: 'PERCENT' | 'NIGHTS' | 'FULL_STAY' | 'FIXED';
    penaltyValue: number | null;
    isActive: boolean;
    notes: string | null;
  }>;
};

type HotelContractCancellationRulesTableProps = {
  apiBaseUrl: string;
  contractId: string;
  policy: CancellationPolicy;
};

function formatPenalty(rule: CancellationPolicy['rules'][number]) {
  if (rule.penaltyType === 'FULL_STAY') {
    return 'Full stay';
  }

  if (rule.penaltyType === 'PERCENT') {
    return `${Number(rule.penaltyValue || 0).toFixed(2)}%`;
  }

  if (rule.penaltyType === 'NIGHTS') {
    return `${Number(rule.penaltyValue || 0)} nights`;
  }

  return `Fixed ${Number(rule.penaltyValue || 0).toFixed(2)}`;
}

export function HotelContractCancellationRulesTable({
  apiBaseUrl,
  contractId,
  policy,
}: HotelContractCancellationRulesTableProps) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function handleDeleteRule(ruleId: string) {
    if (!window.confirm('Delete cancellation rule?')) {
      return;
    }

    setDeletingId(ruleId);
    setError('');

    try {
      const response = await fetch(`${apiBaseUrl}/contracts/${contractId}/cancellation-policy/rules/${ruleId}`, {
        method: 'DELETE',
        headers: buildAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not delete cancellation rule.'));
      }

      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not delete cancellation rule.');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="section-stack">
      {error ? <p className="form-error">{error}</p> : null}

      <div className="table-wrap">
        <table className="data-table quote-consistency-table">
          <thead>
            <tr>
              <th>Window</th>
              <th>Penalty</th>
              <th>Status</th>
              <th>Notes</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {policy.rules.map((rule) => (
              <tr key={rule.id}>
                <td>
                  <strong>
                    {rule.windowFromValue} - {rule.windowToValue} {rule.deadlineUnit.toLowerCase()}
                  </strong>
                </td>
                <td>{formatPenalty(rule)}</td>
                <td>
                  <span className={`quote-ui-badge ${rule.isActive ? 'quote-ui-badge-success' : 'quote-ui-badge-info'}`}>
                    {rule.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td>{rule.notes || 'No notes'}</td>
                <td>
                  <RowDetailsPanel summary="View details" description="Edit cancellation rule and notes" groupId="hotel-contract-cancellation-rules">
                    <div className="section-stack">
                      <InlineRowEditorShell>
                        <HotelContractCancellationRuleForm
                          apiBaseUrl={apiBaseUrl}
                          contractId={contractId}
                          ruleId={rule.id}
                          submitLabel="Save rule"
                          initialValues={{
                            windowFromValue: String(rule.windowFromValue),
                            windowToValue: String(rule.windowToValue),
                            deadlineUnit: rule.deadlineUnit,
                            penaltyType: rule.penaltyType,
                            penaltyValue: rule.penaltyValue == null ? '' : String(rule.penaltyValue),
                            isActive: rule.isActive,
                            notes: rule.notes || '',
                          }}
                        />
                        <div className="table-action-row">
                          <button
                            type="button"
                            className="compact-button compact-button-danger"
                            onClick={() => handleDeleteRule(rule.id)}
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
    </div>
  );
}
