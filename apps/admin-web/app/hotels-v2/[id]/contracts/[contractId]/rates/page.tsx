import Link from 'next/link';
import { notFound } from 'next/navigation';
import { adminPageFetchJson, isNextRedirectError } from '../../../../../lib/admin-server';
import { createRate } from './actions';

// Hotels Engine v2 — rate cells list for a single contract (PR-A3).
//
// Server-rendered. Lists every rate cell on this contract, grouped by
// season name, with a minimal inline create form (one rate row at a
// time). PR-A2 (per-contract seasons editor) was deferred because the
// schema stores seasons denormalized on each HotelRate row — operators
// address seasons here directly via the seasonName field.
//
// Pure UI integration: GET /hotel-rates?contractId=X for the list,
// POST /hotel-rates for create, both already exposed.

export const dynamic = 'force-dynamic';

const API_BASE_URL = '/api';

const MEAL_PLAN_LABELS: Record<string, string> = {
  RO: 'Room only',
  BB: 'Bed & breakfast',
  HB: 'Half board',
  FB: 'Full board',
  AI: 'All inclusive',
};

const OCCUPANCY_LABELS: Record<string, string> = {
  SGL: 'Single',
  DBL: 'Double',
  TPL: 'Triple',
};

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

type RateRow = {
  id: string;
  contractId: string;
  roomCategoryId: string;
  occupancyType: string;
  mealPlan: string;
  seasonName: string;
  seasonFrom: string;
  seasonTo: string;
  pricingBasis: string | null;
  pricingMode: string | null;
  currency: string;
  cost: number;
};

async function getContract(contractId: string): Promise<ContractSummary | null> {
  try {
    return await adminPageFetchJson<ContractSummary>(
      `${API_BASE_URL}/hotel-contracts/${encodeURIComponent(contractId)}?summary=1`,
      'Hotel v2 contract rates — contract',
      { cache: 'no-store', allow404: true },
    );
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    console.error('[hotels-v2/contract/rates] contract unavailable', error);
    return null;
  }
}

async function getRates(contractId: string): Promise<RateRow[]> {
  try {
    const rows = await adminPageFetchJson<RateRow[]>(
      `${API_BASE_URL}/hotel-rates?contractId=${encodeURIComponent(contractId)}`,
      'Hotel v2 contract rates — list',
      { cache: 'no-store' },
    );
    return Array.isArray(rows) ? rows : [];
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    console.error('[hotels-v2/contract/rates] rates unavailable', error);
    return [];
  }
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toISOString().slice(0, 10);
  } catch {
    return iso;
  }
}

function groupBySeason(
  rates: RateRow[],
): Array<{ key: string; name: string; from: string; to: string; rows: RateRow[] }> {
  const buckets = new Map<string, { name: string; from: string; to: string; rows: RateRow[] }>();
  for (const r of rates) {
    // Bucket key fuses name + dates so two distinct seasons that happen to
    // share a name (e.g. "Summer 2026" vs "Summer 2027") don't merge.
    const key = `${r.seasonName}::${r.seasonFrom}::${r.seasonTo}`;
    const existing = buckets.get(key);
    if (existing) {
      existing.rows.push(r);
    } else {
      buckets.set(key, { name: r.seasonName, from: r.seasonFrom, to: r.seasonTo, rows: [r] });
    }
  }
  const out = Array.from(buckets.entries()).map(([key, v]) => ({ key, ...v }));
  out.sort((a, b) => a.from.localeCompare(b.from) || a.name.localeCompare(b.name));
  return out;
}

type Props = { params: Promise<{ id: string; contractId: string }> };

export default async function ContractRatesPage({ params }: Props) {
  const { id: hotelId, contractId } = await params;
  const [contract, rates] = await Promise.all([getContract(contractId), getRates(contractId)]);

  if (!contract) notFound();
  if (contract.hotelId !== hotelId) notFound();

  const createAction = createRate.bind(null, hotelId, contractId);
  const roomCategories = contract.hotel.roomCategories.filter((rc) => rc.isActive);
  const seasonGroups = groupBySeason(rates);

  // Form defaults: season range falls inside the contract validity so the
  // operator can hit submit without re-picking dates for the first rate.
  const defaultFrom = formatDate(contract.validFrom);
  const defaultTo = formatDate(contract.validTo);

  return (
    <main className="page">
      <section className="panel workspace-panel workspace-panel-wide">
        <header style={{ marginBottom: '1.5rem' }}>
          <p className="eyebrow">Hotels Engine v2 — Rate cells</p>
          <h1 className="section-title">{contract.name}</h1>
          <p className="copy section-copy">
            {contract.hotel.name} · {formatDate(contract.validFrom)} →{' '}
            {formatDate(contract.validTo)} · {contract.currency}
          </p>
          <p className="table-subcopy" style={{ marginTop: '0.5rem' }}>
            <Link href={`/hotels-v2/${hotelId}/contracts/${contractId}`} prefetch={false}>
              ← Back to contract
            </Link>
            {' · '}
            <Link href={`/hotels-v2/${hotelId}/contracts`} prefetch={false}>
              All contracts
            </Link>
          </p>
        </header>

        {/* Create form */}
        <section
          data-testid="hotel-v2-rate-create"
          className="detail-card"
          style={{ marginBottom: '1.5rem' }}
        >
          <h2 className="section-title" style={{ fontSize: '1.05rem', marginBottom: '0.6rem' }}>
            Add rate cell
          </h2>
          <p className="table-subcopy" style={{ marginTop: 0, marginBottom: '0.6rem' }}>
            One row per room type × occupancy × meal plan × season. Season name + dates are
            stored directly on the rate (no separate seasons table yet — see PR-A2 note in the
            roadmap).
          </p>

          {roomCategories.length === 0 ? (
            <p className="table-subcopy" style={{ color: '#b45309' }}>
              This hotel has no active room types. Add room types from the hotel detail page
              before creating rates.
            </p>
          ) : (
            <form action={createAction} className="entity-form compact-form">
              <div className="form-row form-row-4">
                <label>
                  Room type
                  <select name="roomCategoryId" required defaultValue="">
                    <option value="" disabled>
                      Select…
                    </option>
                    {roomCategories.map((rc) => (
                      <option key={rc.id} value={rc.id}>
                        {rc.name}
                        {rc.code ? ` (${rc.code})` : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Occupancy
                  <select name="occupancyType" required defaultValue="DBL">
                    <option value="SGL">Single (SGL)</option>
                    <option value="DBL">Double (DBL)</option>
                    <option value="TPL">Triple (TPL)</option>
                  </select>
                </label>
                <label>
                  Meal plan
                  <select name="mealPlan" required defaultValue="BB">
                    <option value="RO">RO — Room only</option>
                    <option value="BB">BB — Bed & breakfast</option>
                    <option value="HB">HB — Half board</option>
                    <option value="FB">FB — Full board</option>
                    <option value="AI">AI — All inclusive</option>
                  </select>
                </label>
                <label>
                  Pricing basis
                  <select name="pricingBasis" required defaultValue="PER_ROOM">
                    <option value="PER_ROOM">Per room / night</option>
                    <option value="PER_PERSON">Per person / night</option>
                  </select>
                </label>
              </div>
              <div className="form-row form-row-4">
                <label>
                  Season name
                  <input
                    type="text"
                    name="seasonName"
                    placeholder="High season"
                    required
                    maxLength={80}
                  />
                </label>
                <label>
                  Season from
                  <input type="date" name="seasonFrom" required defaultValue={defaultFrom} />
                </label>
                <label>
                  Season to
                  <input type="date" name="seasonTo" required defaultValue={defaultTo} />
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
                  Cost
                  <input
                    type="number"
                    name="cost"
                    min={0}
                    step="0.01"
                    placeholder="120.00"
                    required
                  />
                </label>
              </div>
              <button type="submit" className="primary-button">
                Add rate
              </button>
            </form>
          )}
        </section>

        {/* List grouped by season */}
        <section data-testid="hotel-v2-rate-list">
          <h2 className="section-title" style={{ fontSize: '1.05rem', marginBottom: '0.6rem' }}>
            Existing rates ({rates.length})
          </h2>
          {rates.length === 0 ? (
            <p className="table-subcopy">
              No rates on this contract yet. Add your first rate cell above. Rates drive every
              quote that uses this contract.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {seasonGroups.map((g) => (
                <div key={g.key} data-testid="hotel-v2-rate-season-group">
                  <h3
                    className="section-title"
                    style={{ fontSize: '0.95rem', marginBottom: '0.4rem' }}
                  >
                    {g.name}{' '}
                    <span style={{ color: '#94a3b8', fontWeight: 400, fontSize: '0.82rem' }}>
                      ({formatDate(g.from)} → {formatDate(g.to)} · {g.rows.length} cell
                      {g.rows.length === 1 ? '' : 's'})
                    </span>
                  </h3>
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Room type</th>
                          <th>Occupancy</th>
                          <th>Meal plan</th>
                          <th>Basis</th>
                          <th className="numeric-cell">Cost</th>
                          <th>Currency</th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.rows.map((r) => {
                          const room = contract.hotel.roomCategories.find(
                            (rc) => rc.id === r.roomCategoryId,
                          );
                          return (
                            <tr key={r.id}>
                              <td>
                                <strong>{room?.name || r.roomCategoryId}</strong>
                                {room?.code ? (
                                  <span style={{ color: '#94a3b8', marginLeft: '0.4rem' }}>
                                    ({room.code})
                                  </span>
                                ) : null}
                              </td>
                              <td>{OCCUPANCY_LABELS[r.occupancyType] || r.occupancyType}</td>
                              <td>{MEAL_PLAN_LABELS[r.mealPlan] || r.mealPlan}</td>
                              <td>
                                {r.pricingBasis === 'PER_PERSON'
                                  ? 'Per person / night'
                                  : 'Per room / night'}
                              </td>
                              <td className="numeric-cell">{r.cost.toFixed(2)}</td>
                              <td>{r.currency}</td>
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

        {/* Stop-gap pointer to legacy editors for edit/delete */}
        <section
          data-testid="hotel-v2-rate-legacy-bridge"
          className="detail-card"
          style={{
            marginTop: '1.5rem',
            marginBottom: '1rem',
            background: '#fffbeb',
            border: '1px solid #fde68a',
          }}
        >
          <h2 className="section-title" style={{ fontSize: '1rem', marginBottom: '0.4rem' }}>
            Editing or deleting rate cells
          </h2>
          <p className="table-subcopy" style={{ margin: 0 }}>
            Inline edit / delete + the full matrix editor (room × season × occupancy grid) ship
            in PR-A4. For now, use the legacy workspace to amend existing rates:{' '}
            <Link
              href={`/hotels/contracts/${contractId}`}
              prefetch={false}
              style={{ fontWeight: 600 }}
            >
              Open in legacy workspace →
            </Link>
          </p>
        </section>

        <p
          className="table-subcopy"
          style={{ marginTop: '1.5rem', color: '#94a3b8', fontSize: '0.75rem' }}
        >
          /hotels-v2/{hotelId}/contracts/{contractId}/rates — server-rendered. Create via
          Server Action; edit / delete still routed to the legacy workspace until PR-A4.
        </p>
      </section>
    </main>
  );
}
