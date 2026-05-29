import Link from 'next/link';
import { notFound } from 'next/navigation';
import { adminPageFetchJson, isNextRedirectError } from '../../../../../lib/admin-server';
import { createSupplement, deleteSupplement } from './actions';

// Hotels Engine — contract supplements list + inline create (PR-A5).
//
// Server-rendered. Lists every supplement on this contract grouped by
// type (EXTRA_BREAKFAST / EXTRA_LUNCH / ...), with an inline create form
// and per-row delete. Edit moves to a follow-up PR to match the rhythm
// PR-A3 → PR-A4 set for rate cells.
//
// Pure UI integration. Backend endpoints already exist:
//   GET    /hotel-contracts/:contractId/supplements
//   POST   /hotel-contracts/:contractId/supplements
//   DELETE /hotel-contracts/:contractId/supplements/:supplementId
// Routed through the existing /api/hotel-contracts/[id]/[...path] catch-all
// proxy — no proxy changes needed.

export const dynamic = 'force-dynamic';

const API_BASE_URL = '/api';

const SUPPLEMENT_TYPE_LABELS: Record<string, string> = {
  EXTRA_BREAKFAST: 'Extra breakfast',
  EXTRA_LUNCH: 'Extra lunch',
  EXTRA_DINNER: 'Extra dinner',
  GALA_DINNER: 'Gala dinner',
  EXTRA_BED: 'Extra bed',
};

const CHARGE_BASIS_LABELS: Record<string, string> = {
  PER_PERSON: 'Per person',
  PER_ROOM: 'Per room',
  PER_STAY: 'Per stay',
  PER_NIGHT: 'Per night',
};

const TYPE_ORDER = ['EXTRA_BREAKFAST', 'EXTRA_LUNCH', 'EXTRA_DINNER', 'GALA_DINNER', 'EXTRA_BED'];

type RoomCategoryRef = {
  id: string;
  name: string;
  code: string | null;
  isActive: boolean;
};

type ContractSummary = {
  id: string;
  hotelId: string;
  name: string;
  validFrom: string;
  validTo: string;
  currency: string;
  hotel: {
    id: string;
    name: string;
    roomCategories: RoomCategoryRef[];
  };
};

// Shape backend returns: a flat array of supplement records with optional
// roomCategory nested in. Verified by reading
// contract-supplements.service.ts (findAll returns `rows` directly, no
// envelope) — see [[feedback-verify-api-shape]] in memory.
type SupplementRow = {
  id: string;
  hotelContractId: string;
  roomCategoryId: string | null;
  type: string;
  mealPlanCode: string | null;
  chargeBasis: string;
  amount: number;
  currency: string;
  isMandatory: boolean;
  isActive: boolean;
  notes: string | null;
  roomCategory?: { id: string; name: string; code: string | null } | null;
};

async function getContract(contractId: string): Promise<ContractSummary | null> {
  try {
    return await adminPageFetchJson<ContractSummary>(
      `${API_BASE_URL}/hotel-contracts/${encodeURIComponent(contractId)}?summary=1`,
      'Hotel supplements — contract',
      { cache: 'no-store', allow404: true },
    );
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    console.error('[hotels/contract/supplements] contract unavailable', error);
    return null;
  }
}

async function getSupplements(contractId: string): Promise<SupplementRow[]> {
  try {
    const rows = await adminPageFetchJson<SupplementRow[]>(
      `${API_BASE_URL}/hotel-contracts/${encodeURIComponent(contractId)}/supplements`,
      'Hotel supplements — list',
      { cache: 'no-store' },
    );
    return Array.isArray(rows) ? rows : [];
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    console.error('[hotels/contract/supplements] supplements unavailable', error);
    return [];
  }
}

function groupByType(rows: SupplementRow[]): Array<{ type: string; rows: SupplementRow[] }> {
  const buckets = new Map<string, SupplementRow[]>();
  for (const r of rows) {
    const list = buckets.get(r.type) || [];
    list.push(r);
    buckets.set(r.type, list);
  }
  // Stable order: well-known types first in TYPE_ORDER, then any unknown
  // future types alphabetically.
  const known = TYPE_ORDER.filter((t) => buckets.has(t)).map((t) => ({ type: t, rows: buckets.get(t)! }));
  const unknown = Array.from(buckets.keys())
    .filter((t) => !TYPE_ORDER.includes(t))
    .sort()
    .map((t) => ({ type: t, rows: buckets.get(t)! }));
  return [...known, ...unknown];
}

type Props = { params: Promise<{ id: string; contractId: string }> };

export default async function ContractSupplementsPage({ params }: Props) {
  const { id: hotelId, contractId } = await params;
  const [contract, supplements] = await Promise.all([
    getContract(contractId),
    getSupplements(contractId),
  ]);

  if (!contract) notFound();
  if (contract.hotelId !== hotelId) notFound();

  const createAction = createSupplement.bind(null, hotelId, contractId);
  const roomCategories = contract.hotel.roomCategories.filter((rc) => rc.isActive);
  const groups = groupByType(supplements);

  return (
    <main className="page">
      <section className="panel workspace-panel workspace-panel-wide">
        <header style={{ marginBottom: '1.5rem' }}>
          <p className="eyebrow">Hotels Engine — Supplements</p>
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
          data-testid="hotel-supplement-create"
          className="detail-card"
          style={{ marginBottom: '1.5rem' }}
        >
          <h2 className="section-title" style={{ fontSize: '1.05rem', marginBottom: '0.6rem' }}>
            Add supplement
          </h2>
          <p className="table-subcopy" style={{ marginTop: 0, marginBottom: '0.6rem' }}>
            Supplements are extra charges applied alongside the base rate (e.g. an extra-bed
            fee or a gala-dinner surcharge). Leaving "Room type" blank applies the supplement
            to every room category on this contract.
          </p>
          <form action={createAction} className="entity-form compact-form">
            <div className="form-row form-row-4">
              <label>
                Room type (optional)
                <select name="roomCategoryId" defaultValue="">
                  <option value="">All room types</option>
                  {roomCategories.map((rc) => (
                    <option key={rc.id} value={rc.id}>
                      {rc.name}
                      {rc.code ? ` (${rc.code})` : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Type
                <select name="type" required defaultValue="EXTRA_BREAKFAST">
                  <option value="EXTRA_BREAKFAST">Extra breakfast</option>
                  <option value="EXTRA_LUNCH">Extra lunch</option>
                  <option value="EXTRA_DINNER">Extra dinner</option>
                  <option value="GALA_DINNER">Gala dinner</option>
                  <option value="EXTRA_BED">Extra bed</option>
                </select>
              </label>
              <label>
                Charge basis
                <select name="chargeBasis" required defaultValue="PER_PERSON">
                  <option value="PER_PERSON">Per person</option>
                  <option value="PER_ROOM">Per room</option>
                  <option value="PER_STAY">Per stay</option>
                  <option value="PER_NIGHT">Per night</option>
                </select>
              </label>
              <label>
                Currency
                <select name="currency" defaultValue={contract.currency} required>
                  <option value="USD">USD</option>
                  <option value="JOD">JOD</option>
                  <option value="AED">AED</option>
                  <option value="EUR">EUR</option>
                  <option value="GBP">GBP</option>
                </select>
              </label>
            </div>
            <div className="form-row form-row-4">
              <label>
                Meal plan tag (optional)
                <select name="mealPlanCode" defaultValue="">
                  <option value="">— Not meal-plan specific —</option>
                  <option value="HB">HB — Half Board upgrade</option>
                  <option value="FB">FB — Full Board upgrade</option>
                  <option value="AI">AI — All Inclusive upgrade</option>
                </select>
                <span
                  style={{ color: '#94a3b8', fontSize: '0.72rem', display: 'block', marginTop: '0.25rem' }}
                >
                  Tag HB / FB / AI when this supplement upgrades a base BB rate. The quote engine
                  auto-applies it only when the guest picks that meal plan.
                </span>
              </label>
              <label>
                Amount
                <input
                  type="number"
                  name="amount"
                  min={0}
                  step="0.01"
                  placeholder="25.00"
                  required
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <input type="checkbox" name="isMandatory" />
                  Mandatory (cannot be opted out by guest)
                </span>
              </label>
              <label>
                Notes (optional)
                <input
                  type="text"
                  name="notes"
                  placeholder="Christmas Eve gala — adults only"
                  maxLength={240}
                />
              </label>
            </div>
            <button type="submit" className="primary-button">
              Add supplement
            </button>
          </form>
        </section>

        {/* List grouped by type */}
        <section data-testid="hotel-supplement-list">
          <h2 className="section-title" style={{ fontSize: '1.05rem', marginBottom: '0.6rem' }}>
            Existing supplements ({supplements.length})
          </h2>
          {supplements.length === 0 ? (
            <p className="table-subcopy">
              No supplements on this contract yet. Add your first one above. Supplements
              feed the quote engine alongside the base rate.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {groups.map((g) => (
                <div key={g.type} data-testid="hotel-supplement-type-group">
                  <h3
                    className="section-title"
                    style={{ fontSize: '0.95rem', marginBottom: '0.4rem' }}
                  >
                    {SUPPLEMENT_TYPE_LABELS[g.type] || g.type}{' '}
                    <span style={{ color: '#94a3b8', fontWeight: 400, fontSize: '0.82rem' }}>
                      ({g.rows.length} supplement{g.rows.length === 1 ? '' : 's'})
                    </span>
                  </h3>
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Room type</th>
                          <th>Meal plan</th>
                          <th>Charge basis</th>
                          <th className="numeric-cell">Amount</th>
                          <th>Currency</th>
                          <th>Mandatory</th>
                          <th>Notes</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.rows.map((r) => {
                          const deleteAction = deleteSupplement.bind(null, hotelId, contractId, r.id);
                          return (
                            <tr key={r.id}>
                              <td>
                                {r.roomCategory ? (
                                  <>
                                    <strong>{r.roomCategory.name}</strong>
                                    {r.roomCategory.code ? (
                                      <span style={{ color: '#94a3b8', marginLeft: '0.4rem' }}>
                                        ({r.roomCategory.code})
                                      </span>
                                    ) : null}
                                  </>
                                ) : (
                                  <em style={{ color: '#64748b' }}>All room types</em>
                                )}
                              </td>
                              <td>
                                {r.mealPlanCode ? (
                                  <span
                                    style={{
                                      display: 'inline-block',
                                      padding: '0.1rem 0.4rem',
                                      borderRadius: '4px',
                                      background: '#e0e7ff',
                                      color: '#3730a3',
                                      fontSize: '0.78rem',
                                      fontWeight: 600,
                                    }}
                                  >
                                    {r.mealPlanCode}
                                  </span>
                                ) : (
                                  <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>—</span>
                                )}
                              </td>
                              <td>{CHARGE_BASIS_LABELS[r.chargeBasis] || r.chargeBasis}</td>
                              <td className="numeric-cell">{r.amount.toFixed(2)}</td>
                              <td>{r.currency}</td>
                              <td>{r.isMandatory ? 'Yes' : 'No'}</td>
                              <td style={{ maxWidth: '20rem' }}>{r.notes || '—'}</td>
                              <td>
                                <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                                  <Link
                                    href={`/hotels/${hotelId}/contracts/${contractId}/supplements/${r.id}/edit`}
                                    prefetch={false}
                                    className="compact-button"
                                  >
                                    Edit
                                  </Link>
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
                </div>
              ))}
            </div>
          )}
        </section>

        <p
          className="table-subcopy"
          style={{ marginTop: '1.5rem', color: '#94a3b8', fontSize: '0.75rem' }}
        >
          /hotels/{hotelId}/contracts/{contractId}/supplements — server-rendered. Create
          / edit / delete via Server Actions.
        </p>
      </section>
    </main>
  );
}
