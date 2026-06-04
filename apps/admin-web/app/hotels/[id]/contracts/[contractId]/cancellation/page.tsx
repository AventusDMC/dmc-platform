import Link from 'next/link';
import { notFound } from 'next/navigation';
import { adminPageFetchJson, isNextRedirectError } from '../../../../../lib/admin-server';
import { createRule, deleteRule, updateRule, upsertPolicy } from './actions';

// Hotels Engine — cancellation policy editor (PR-A7).
//
// Policy + rules in a single workspace:
//   - Policy header (summary, notes, no-show penalty) edited via PUT
//     (backend upsert — create if missing, update if exists)
//   - Rules table with inline add-rule form and per-row delete
//
// Pure UI integration. Backend endpoints exist on the contract-policies
// controller and are reached via the existing
// /api/hotel-contracts/[id]/[...path] catch-all proxy. This PR adds PUT
// to that proxy (only GET/POST/PATCH/DELETE were there before).
//
// findOne can return null when no policy has been created yet — that's
// the "blank slate" case the page renders explicitly (zero rules, empty
// header form).

export const dynamic = 'force-dynamic';

const API_BASE_URL = '/api';

const PENALTY_TYPE_LABELS: Record<string, string> = {
  PERCENT: 'Percent of stay',
  NIGHTS: 'Nights forfeited',
  FULL_STAY: 'Full stay',
  FIXED: 'Fixed amount',
};

const DEADLINE_UNIT_LABELS: Record<string, string> = {
  DAYS: 'days',
  HOURS: 'hours',
};

type ContractSummary = {
  id: string;
  hotelId: string;
  name: string;
  currency: string;
  hotel: { id: string; name: string };
};

type CancellationRule = {
  id: string;
  cancellationPolicyId: string;
  windowFromValue: number;
  windowToValue: number;
  deadlineUnit: string;
  penaltyType: string;
  penaltyValue: number | null;
  isActive: boolean;
  notes: string | null;
};

type CancellationPolicy = {
  id: string;
  hotelContractId: string;
  summary: string | null;
  notes: string | null;
  noShowPenaltyType: string | null;
  noShowPenaltyValue: number | null;
  rules: CancellationRule[];
};

async function getContract(contractId: string): Promise<ContractSummary | null> {
  try {
    return await adminPageFetchJson<ContractSummary>(
      `${API_BASE_URL}/hotel-contracts/${encodeURIComponent(contractId)}?summary=1`,
      'Hotel cancellation — contract',
      { cache: 'no-store', allow404: true },
    );
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    console.error('[hotels/contract/cancellation] contract unavailable', error);
    return null;
  }
}

async function getPolicy(contractId: string): Promise<CancellationPolicy | null> {
  try {
    return await adminPageFetchJson<CancellationPolicy | null>(
      `${API_BASE_URL}/hotel-contracts/${encodeURIComponent(contractId)}/cancellation-policy`,
      'Hotel cancellation — policy',
      { cache: 'no-store', allow404: true },
    );
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    console.error('[hotels/contract/cancellation] policy unavailable', error);
    return null;
  }
}

function formatPenaltyValue(rule: { penaltyType: string; penaltyValue: number | null }, currency: string): string {
  if (rule.penaltyType === 'FULL_STAY') return 'Full stay';
  if (rule.penaltyValue == null) return '—';
  if (rule.penaltyType === 'PERCENT') return `${rule.penaltyValue}%`;
  if (rule.penaltyType === 'NIGHTS') return `${rule.penaltyValue} night${rule.penaltyValue === 1 ? '' : 's'}`;
  if (rule.penaltyType === 'FIXED') return `${rule.penaltyValue.toFixed(2)} ${currency}`;
  return String(rule.penaltyValue);
}

type Props = { params: Promise<{ id: string; contractId: string }> };

export default async function ContractCancellationPage({ params }: Props) {
  const { id: hotelId, contractId } = await params;
  const [contract, policy] = await Promise.all([getContract(contractId), getPolicy(contractId)]);

  if (!contract) notFound();
  if (contract.hotelId !== hotelId) notFound();

  const upsertAction = upsertPolicy.bind(null, hotelId, contractId);
  const createRuleAction = createRule.bind(null, hotelId, contractId);
  const rules = policy?.rules ?? [];

  return (
    <main className="page">
      <section className="panel workspace-panel workspace-panel-wide">
        <header style={{ marginBottom: '1.5rem' }}>
          <p className="eyebrow">Hotels Engine — Cancellation policy</p>
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

        {/* Policy header — single PUT-upsert form */}
        <section
          data-testid="hotel-cancellation-policy-header"
          className="detail-card"
          style={{ marginBottom: '1.5rem' }}
        >
          <h2 className="section-title" style={{ fontSize: '1.05rem', marginBottom: '0.6rem' }}>
            Policy header
          </h2>
          <p className="table-subcopy" style={{ marginTop: 0, marginBottom: '0.6rem' }}>
            Free-text summary that operators see at-a-glance, internal notes that don't ship
            to guests, and the no-show penalty applied when a guest doesn't show up at all
            (separate from the time-window rules below).
          </p>
          <form action={upsertAction} className="entity-form compact-form">
            <div className="form-row">
              <label>
                Summary (shown to operators)
                <input
                  type="text"
                  name="summary"
                  defaultValue={policy?.summary ?? ''}
                  maxLength={240}
                  placeholder="Free until 30d before arrival, 100% after"
                />
              </label>
              <label>
                Internal notes
                <input
                  type="text"
                  name="notes"
                  defaultValue={policy?.notes ?? ''}
                  maxLength={500}
                  placeholder="Verified with revenue manager on contract signing"
                />
              </label>
            </div>
            <div className="form-row form-row-4">
              <label>
                No-show penalty type
                <select name="noShowPenaltyType" defaultValue={policy?.noShowPenaltyType ?? ''}>
                  <option value="">— None —</option>
                  <option value="PERCENT">Percent of stay</option>
                  <option value="NIGHTS">Nights forfeited</option>
                  <option value="FULL_STAY">Full stay</option>
                  <option value="FIXED">Fixed amount</option>
                </select>
              </label>
              <label>
                No-show penalty value
                <input
                  type="number"
                  name="noShowPenaltyValue"
                  min={0}
                  step="0.01"
                  defaultValue={policy?.noShowPenaltyValue ?? ''}
                  placeholder="e.g. 100 or 1"
                />
              </label>
            </div>
            <button type="submit" className="primary-button">
              {policy ? 'Save policy header' : 'Create policy'}
            </button>
          </form>
        </section>

        {/* Add rule form */}
        <section
          data-testid="hotel-cancellation-rule-create"
          className="detail-card"
          style={{ marginBottom: '1.5rem' }}
        >
          <h2 className="section-title" style={{ fontSize: '1.05rem', marginBottom: '0.6rem' }}>
            Add cancellation rule
          </h2>
          <p className="table-subcopy" style={{ marginTop: 0, marginBottom: '0.6rem' }}>
            Rules describe what penalty applies inside a cancel-before-arrival window — e.g.
            "between 30 and 14 days before arrival → 50% of stay". Use the larger number on
            the left (window counts down toward arrival).
          </p>
          {!policy ? (
            <p className="table-subcopy" style={{ color: '#b45309' }}>
              Save the policy header above first — rules attach to a policy, and the policy
              has to exist before rules can be added.
            </p>
          ) : (
            <form action={createRuleAction} className="entity-form compact-form">
              <div className="form-row form-row-4">
                <label>
                  Window start (further from arrival)
                  <input
                    type="number"
                    name="windowFromValue"
                    min={0}
                    step="1"
                    placeholder="30"
                    required
                  />
                </label>
                <label>
                  Window end (closer to arrival)
                  <input
                    type="number"
                    name="windowToValue"
                    min={0}
                    step="1"
                    placeholder="14"
                    required
                  />
                </label>
                <label>
                  Unit
                  <select name="deadlineUnit" required defaultValue="DAYS">
                    <option value="DAYS">Days</option>
                    <option value="HOURS">Hours</option>
                  </select>
                </label>
                <label>
                  Penalty type
                  <select name="penaltyType" required defaultValue="PERCENT">
                    <option value="PERCENT">Percent of stay</option>
                    <option value="NIGHTS">Nights forfeited</option>
                    <option value="FULL_STAY">Full stay</option>
                    <option value="FIXED">Fixed amount</option>
                  </select>
                </label>
              </div>
              <div className="form-row form-row-4">
                <label>
                  Penalty value (blank for Full stay)
                  <input
                    type="number"
                    name="penaltyValue"
                    min={0}
                    step="0.01"
                    placeholder="50"
                  />
                </label>
                <label style={{ gridColumn: 'span 3' }}>
                  Notes (optional)
                  <input
                    type="text"
                    name="notes"
                    maxLength={240}
                    placeholder="High-season override"
                  />
                </label>
              </div>
              <button type="submit" className="primary-button">
                Add rule
              </button>
            </form>
          )}
        </section>

        {/* Rules list */}
        <section data-testid="hotel-cancellation-rule-list">
          <h2 className="section-title" style={{ fontSize: '1.05rem', marginBottom: '0.6rem' }}>
            Existing rules ({rules.length})
          </h2>
          {rules.length === 0 ? (
            <p className="table-subcopy">
              No cancellation rules yet. Add your first rule above once the policy header is
              saved. The quote engine falls back to "no penalty" if no rule matches the
              cancel window.
            </p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Window</th>
                    <th>Penalty type</th>
                    <th>Value</th>
                    <th>Active</th>
                    <th>Notes</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rules.map((r) => {
                    const deleteRuleAction = deleteRule.bind(null, hotelId, contractId, r.id);
                    const updateRuleAction = updateRule.bind(null, hotelId, contractId, r.id);
                    const unit = DEADLINE_UNIT_LABELS[r.deadlineUnit] || r.deadlineUnit.toLowerCase();
                    return (
                      <tr key={r.id}>
                        <td>
                          {r.windowFromValue} → {r.windowToValue} {unit} before arrival
                        </td>
                        <td>{PENALTY_TYPE_LABELS[r.penaltyType] || r.penaltyType}</td>
                        <td>{formatPenaltyValue(r, contract.currency)}</td>
                        <td>{r.isActive ? 'Yes' : 'No'}</td>
                        <td style={{ maxWidth: '20rem' }}>{r.notes || '—'}</td>
                        <td>
                          {/* Inline edit via native <details> disclosure — no
                              client JS, same server-action style as the add
                              form. Expands an editable copy of the row. */}
                          <details>
                            <summary className="compact-button" style={{ cursor: 'pointer', display: 'inline-block' }}>
                              Edit
                            </summary>
                            <form
                              action={updateRuleAction}
                              className="entity-form compact-form"
                              style={{ marginTop: '0.6rem', minWidth: '22rem' }}
                            >
                              <div className="form-row">
                                <label>
                                  Window start
                                  <input type="number" name="windowFromValue" min={0} step="1" required defaultValue={r.windowFromValue} />
                                </label>
                                <label>
                                  Window end
                                  <input type="number" name="windowToValue" min={0} step="1" required defaultValue={r.windowToValue} />
                                </label>
                              </div>
                              <div className="form-row">
                                <label>
                                  Unit
                                  <select name="deadlineUnit" required defaultValue={r.deadlineUnit}>
                                    <option value="DAYS">Days</option>
                                    <option value="HOURS">Hours</option>
                                  </select>
                                </label>
                                <label>
                                  Penalty type
                                  <select name="penaltyType" required defaultValue={r.penaltyType}>
                                    <option value="PERCENT">Percent of stay</option>
                                    <option value="NIGHTS">Nights forfeited</option>
                                    <option value="FULL_STAY">Full stay</option>
                                    <option value="FIXED">Fixed amount</option>
                                  </select>
                                </label>
                              </div>
                              <div className="form-row">
                                <label>
                                  Penalty value (blank for Full stay)
                                  <input
                                    type="number"
                                    name="penaltyValue"
                                    min={0}
                                    step="0.01"
                                    defaultValue={r.penaltyValue ?? ''}
                                  />
                                </label>
                                <label>
                                  Active
                                  <select name="isActive" defaultValue={r.isActive ? 'true' : 'false'}>
                                    <option value="true">Yes</option>
                                    <option value="false">No</option>
                                  </select>
                                </label>
                              </div>
                              <label>
                                Notes (optional)
                                <input type="text" name="notes" maxLength={240} defaultValue={r.notes ?? ''} />
                              </label>
                              <button type="submit" className="primary-button" style={{ marginTop: '0.4rem' }}>
                                Save rule
                              </button>
                            </form>
                          </details>
                          <form action={deleteRuleAction} style={{ marginTop: '0.5rem' }}>
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
          /hotels/{hotelId}/contracts/{contractId}/cancellation — server-rendered.
          Policy upsert via PUT; rule create / edit / delete via Server Actions.
        </p>
      </section>
    </main>
  );
}
