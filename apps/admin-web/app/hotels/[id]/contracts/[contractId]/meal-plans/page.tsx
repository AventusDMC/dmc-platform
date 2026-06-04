import Link from 'next/link';
import { notFound } from 'next/navigation';
import { adminPageFetchJson, isNextRedirectError } from '../../../../../lib/admin-server';
import { createMealPlan, deleteMealPlan, toggleMealPlanActive, updateMealPlan } from './actions';

// Hotels Engine — contract meal plans (PR-A9 — final wizard slice).
//
// Simpler shape than the other policy editors: a flat list of meal-plan
// rows the contract offers (RO / BB / HB / FB / AI), with isActive +
// optional notes. Inline create, per-row delete, per-row toggle-active.
//
// Pure UI integration. Backend endpoints (contract-meal-plans
// controller) are reached via the existing
// /api/hotel-contracts/[id]/[...path] catch-all proxy. No proxy changes.
//
// Backend enforces uniqueness on (contractId, code) so trying to add
// a code that already exists bubbles back as a 4xx — surfaced to the
// operator with the message intact.

export const dynamic = 'force-dynamic';

const API_BASE_URL = '/api';

const MEAL_PLAN_LABELS: Record<string, string> = {
  RO: 'Room only',
  BB: 'Bed & breakfast',
  HB: 'Half board',
  FB: 'Full board',
  AI: 'All inclusive',
};

const ALL_CODES = ['RO', 'BB', 'HB', 'FB', 'AI'] as const;

type ContractSummary = {
  id: string;
  hotelId: string;
  name: string;
  currency: string;
  hotel: { id: string; name: string };
};

type MealPlanRow = {
  id: string;
  hotelContractId: string;
  code: string;
  isDefault: boolean;
  isActive: boolean;
  notes: string | null;
};

async function getContract(contractId: string): Promise<ContractSummary | null> {
  try {
    return await adminPageFetchJson<ContractSummary>(
      `${API_BASE_URL}/hotel-contracts/${encodeURIComponent(contractId)}?summary=1`,
      'Hotel meal plans — contract',
      { cache: 'no-store', allow404: true },
    );
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    console.error('[hotels/contract/meal-plans] contract unavailable', error);
    return null;
  }
}

async function getMealPlans(contractId: string): Promise<MealPlanRow[]> {
  try {
    const rows = await adminPageFetchJson<MealPlanRow[]>(
      `${API_BASE_URL}/hotel-contracts/${encodeURIComponent(contractId)}/meal-plans`,
      'Hotel meal plans — list',
      { cache: 'no-store' },
    );
    return Array.isArray(rows) ? rows : [];
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    console.error('[hotels/contract/meal-plans] meal plans unavailable', error);
    return [];
  }
}

type Props = { params: Promise<{ id: string; contractId: string }> };

export default async function ContractMealPlansPage({ params }: Props) {
  const { id: hotelId, contractId } = await params;
  const [contract, mealPlans] = await Promise.all([
    getContract(contractId),
    getMealPlans(contractId),
  ]);

  if (!contract) notFound();
  if (contract.hotelId !== hotelId) notFound();

  const createAction = createMealPlan.bind(null, hotelId, contractId);
  // Pre-narrow the dropdown so the operator never sees codes that are
  // already on the contract (the backend would reject the dup anyway,
  // but this keeps the form clean).
  const existingCodes = new Set(mealPlans.map((m) => m.code));
  const availableCodes = ALL_CODES.filter((c) => !existingCodes.has(c));

  return (
    <main className="page">
      <section className="panel workspace-panel workspace-panel-wide">
        <header style={{ marginBottom: '1.5rem' }}>
          <p className="eyebrow">Hotels Engine — Meal plans</p>
          <h1 className="section-title">{contract.name}</h1>
          <p className="copy section-copy">
            {contract.hotel.name} · {contract.currency}
          </p>
          <p className="table-subcopy" style={{ marginTop: '0.5rem' }}>
            <Link href={`/hotels/${hotelId}/contracts/${contractId}`} prefetch={false}>
              ← Back to contract
            </Link>
            {' · '}
            <Link href={`/hotels/${hotelId}/contracts`} prefetch={false}>
              All contracts
            </Link>
          </p>
        </header>

        {/* Create form */}
        <section
          data-testid="hotel-meal-plan-create"
          className="detail-card"
          style={{ marginBottom: '1.5rem' }}
        >
          <h2 className="section-title" style={{ fontSize: '1.05rem', marginBottom: '0.6rem' }}>
            Add meal plan
          </h2>
          <p className="table-subcopy" style={{ marginTop: 0, marginBottom: '0.6rem' }}>
            Pick which board basis this contract offers. Rates can only quote a meal plan
            that's been added here; mark a plan inactive instead of deleting if you may
            re-enable it later.
          </p>
          {availableCodes.length === 0 ? (
            <p className="table-subcopy" style={{ color: '#15803d' }}>
              All five meal-plan codes (RO / BB / HB / FB / AI) are already on this
              contract. Use the Active toggle below if you want to disable one.
            </p>
          ) : (
            <form action={createAction} className="entity-form compact-form">
              <div className="form-row form-row-4">
                <label>
                  Code
                  <select name="code" required defaultValue={availableCodes[0]}>
                    {availableCodes.map((c) => (
                      <option key={c} value={c}>
                        {c} — {MEAL_PLAN_LABELS[c]}
                      </option>
                    ))}
                  </select>
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <input type="checkbox" name="isActive" defaultChecked />
                    Active
                  </span>
                </label>
                <label style={{ gridColumn: 'span 2' }}>
                  Notes (optional)
                  <input
                    type="text"
                    name="notes"
                    maxLength={240}
                    placeholder="Christmas-period extra fee applies"
                  />
                </label>
              </div>
              <button type="submit" className="primary-button">
                Add meal plan
              </button>
            </form>
          )}
        </section>

        {/* List */}
        <section data-testid="hotel-meal-plan-list">
          <h2 className="section-title" style={{ fontSize: '1.05rem', marginBottom: '0.6rem' }}>
            Existing meal plans ({mealPlans.length})
          </h2>
          {mealPlans.length === 0 ? (
            <p className="table-subcopy">
              No meal plans on this contract yet. Add at least one so the quote engine has
              a board basis to attach to each rate.
            </p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Board basis</th>
                    <th>Default</th>
                    <th>Active</th>
                    <th>Notes</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {mealPlans.map((m) => {
                    const toggleAction = toggleMealPlanActive.bind(null, hotelId, contractId, m.id, !m.isActive);
                    const deleteAction = deleteMealPlan.bind(null, hotelId, contractId, m.id);
                    const updateAction = updateMealPlan.bind(null, hotelId, contractId, m.id);
                    return (
                      <tr key={m.id}>
                        <td>
                          <strong>{m.code}</strong>
                        </td>
                        <td>{MEAL_PLAN_LABELS[m.code] || m.code}</td>
                        <td>{m.isDefault ? 'Yes' : 'No'}</td>
                        <td>{m.isActive ? 'Yes' : 'No'}</td>
                        <td style={{ maxWidth: '20rem' }}>{m.notes || '—'}</td>
                        <td>
                          <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
                            {/* Inline edit via native <details> — change code
                                / active / notes without a separate page. */}
                            <details>
                              <summary className="compact-button" style={{ cursor: 'pointer', display: 'inline-block' }}>
                                Edit
                              </summary>
                              <form
                                action={updateAction}
                                className="entity-form compact-form"
                                style={{ marginTop: '0.6rem', minWidth: '20rem' }}
                              >
                                <div className="form-row">
                                  <label>
                                    Code
                                    <select name="code" required defaultValue={m.code}>
                                      {ALL_CODES.map((c) => (
                                        <option key={c} value={c}>
                                          {c} — {MEAL_PLAN_LABELS[c]}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                  <label>
                                    Active
                                    <select name="isActive" defaultValue={m.isActive ? 'true' : 'false'}>
                                      <option value="true">Yes</option>
                                      <option value="false">No</option>
                                    </select>
                                  </label>
                                </div>
                                <label>
                                  Notes (optional)
                                  <input type="text" name="notes" maxLength={240} defaultValue={m.notes ?? ''} />
                                </label>
                                <button type="submit" className="primary-button" style={{ marginTop: '0.4rem' }}>
                                  Save meal plan
                                </button>
                              </form>
                            </details>
                            <form action={toggleAction}>
                              <button type="submit" className="compact-button">
                                {m.isActive ? 'Mark inactive' : 'Mark active'}
                              </button>
                            </form>
                            <form action={deleteAction}>
                              <button
                                type="submit"
                                className="compact-button"
                                style={{
                                  background: '#dc2626',
                                  color: '#fff',
                                  borderColor: '#dc2626',
                                }}
                              >
                                Delete
                              </button>
                            </form>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <p
          className="table-subcopy"
          style={{ marginTop: '1.5rem', color: 'var(--ds-color-text-faint, #94A3B8)', fontSize: '0.75rem' }}
        >
          /hotels/{hotelId}/contracts/{contractId}/meal-plans — server-rendered. Create
          / edit / toggle active / delete via Server Actions.
        </p>
      </section>
    </main>
  );
}
