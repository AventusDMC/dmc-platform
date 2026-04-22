'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { InlineRowEditorShell } from '../components/InlineRowEditorShell';
import { RowDetailsPanel } from '../components/RowDetailsPanel';
import { buildAuthHeaders } from '../lib/auth-client';
import { getErrorMessage } from '../lib/api';
import { HotelContractMealPlanForm } from './HotelContractMealPlanForm';

type MealPlan = {
  id: string;
  code: 'RO' | 'BB' | 'HB' | 'FB' | 'AI';
  isActive: boolean;
  notes: string | null;
};

type HotelContractMealPlansTableProps = {
  apiBaseUrl: string;
  contractId: string;
  mealPlans: MealPlan[];
};

export function HotelContractMealPlansTable({
  apiBaseUrl,
  contractId,
  mealPlans,
}: HotelContractMealPlansTableProps) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function handleDelete(mealPlan: MealPlan) {
    if (!window.confirm(`Delete meal plan ${mealPlan.code}?`)) {
      return;
    }

    setDeletingId(mealPlan.id);
    setError('');

    try {
      const response = await fetch(`${apiBaseUrl}/hotel-contracts/${contractId}/meal-plans/${mealPlan.id}`, {
        method: 'DELETE',
        headers: buildAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not delete meal plan.'));
      }

      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not delete meal plan.');
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
            <th>Meal plan</th>
            <th>Status</th>
            <th>Notes</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody>
          {mealPlans.map((mealPlan) => (
            <tr key={mealPlan.id}>
              <td>
                <strong>{mealPlan.code}</strong>
              </td>
              <td>
                <span className={`quote-ui-badge ${mealPlan.isActive ? 'quote-ui-badge-success' : 'quote-ui-badge-info'}`}>
                  {mealPlan.isActive ? 'Active' : 'Inactive'}
                </span>
              </td>
              <td>{mealPlan.notes || 'No notes'}</td>
              <td>
                <RowDetailsPanel summary="View details" description="Edit meal plan availability and notes" groupId="hotel-contract-meal-plans">
                  <div className="section-stack">
                    <InlineRowEditorShell>
                      <HotelContractMealPlanForm
                        apiBaseUrl={apiBaseUrl}
                        contractId={contractId}
                        mealPlanId={mealPlan.id}
                        submitLabel="Save meal plan"
                        initialValues={{
                          code: mealPlan.code,
                          isActive: mealPlan.isActive,
                          notes: mealPlan.notes || '',
                        }}
                      />
                      <div className="table-action-row">
                        <button
                          type="button"
                          className="compact-button compact-button-danger"
                          onClick={() => handleDelete(mealPlan)}
                          disabled={deletingId === mealPlan.id}
                        >
                          {deletingId === mealPlan.id ? 'Deleting...' : 'Delete'}
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
