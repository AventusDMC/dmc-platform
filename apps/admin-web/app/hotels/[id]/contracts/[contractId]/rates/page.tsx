import Link from 'next/link';
import { notFound } from 'next/navigation';
import { adminPageFetchJson, isNextRedirectError } from '../../../../../lib/admin-server';
import { createRate } from './actions';

// Hotels Engine — rate cells list for a single contract (PR-A3).
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
      'Hotel contract rates — contract',
      { cache: 'no-store', allow404: true },
    );
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    console.error('[hotels/contract/rates] contract unavailable', error);
    return null;
  }
}

async function getRates(contractId: string): Promise<RateRow[]> {
  try {
    // The list endpoint is paginated (max 250/page). A full contract can
    // carry hundreds of rate cells (room × season-range × occupancy × meal),
    // so fetch every page — otherwise only the first seasons would show.
    const pageSize = 250;
    const all: RateRow[] = [];
    for (let offset = 0; offset < 10000; offset += pageSize) {
      const rows = await adminPageFetchJson<RateRow[]>(
        `${API_BASE_URL}/hotel-rates?contractId=${encodeURIComponent(contractId)}&limit=${pageSize}&offset=${offset}`,
        'Hotel contract rates — list',
        { cache: 'no-store' },
      );
      if (!Array.isArray(rows) || rows.length === 0) break;
      all.push(...rows);
      if (rows.length < pageSize) break;
    }
    return all;
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    console.error('[hotels/contract/rates] rates unavailable', error);
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
): Array<{ key: string; name: string; ranges: Array<{ from: string; to: string }>; rows: RateRow[] }> {
  // Group by season NAME so a season with several date ranges (e.g. A Low
  // = Jan + Jun + Oct–Dec) shows as ONE section, with its ranges listed in
  // the header — instead of repeating the season name once per range. Rows
  // are kept individual (each carries its own dates) so editing still
  // targets the exact rate.
  const buckets = new Map<string, { name: string; ranges: Map<string, { from: string; to: string }>; rows: RateRow[] }>();
  for (const r of rates) {
    const b =
      buckets.get(r.seasonName) ??
      { name: r.seasonName, ranges: new Map<string, { from: string; to: string }>(), rows: [] as RateRow[] };
    b.ranges.set(`${r.seasonFrom}::${r.seasonTo}`, { from: r.seasonFrom, to: r.seasonTo });
    b.rows.push(r);
    buckets.set(r.seasonName, b);
  }
  const out = Array.from(buckets.values()).map((b) => ({
    key: b.name,
    name: b.name,
    ranges: Array.from(b.ranges.values()).sort((a, c) => a.from.localeCompare(c.from)),
    rows: b.rows.sort(
      (a, c) =>
        a.roomCategoryId.localeCompare(c.roomCategoryId) ||
        a.seasonFrom.localeCompare(c.seasonFrom) ||
        a.occupancyType.localeCompare(c.occupancyType) ||
        a.mealPlan.localeCompare(c.mealPlan),
    ),
  }));
  out.sort((a, b) => (a.ranges[0]?.from ?? '').localeCompare(b.ranges[0]?.from ?? '') || a.name.localeCompare(b.name));
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
          <p className="eyebrow">Hotels Engine — Rate cells</p>
          <h1 className="section-title">{contract.name}</h1>
          <p className="copy section-copy">
            {contract.hotel.name} · {formatDate(contract.validFrom)} →{' '}
            {formatDate(contract.validTo)} · {contract.currency}
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
          data-testid="hotel-rate-create"
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
              <p className="table-subcopy" style={{ margin: '0.2rem 0 0.4rem', fontWeight: 650 }}>
                Taxes &amp; charges (optional) — "included" means the Cost above already covers it
              </p>
              <div className="form-row form-row-4">
                <label>
                  Sales tax %
                  <input type="number" name="salesTaxPercent" min={0} step="0.01" defaultValue={0} />
                </label>
                <label>
                  Sales tax
                  <select name="salesTaxIncluded" defaultValue="false">
                    <option value="false">No — added on top</option>
                    <option value="true">Yes — in the cost</option>
                  </select>
                </label>
                <label>
                  Service charge %
                  <input type="number" name="serviceChargePercent" min={0} step="0.01" defaultValue={0} />
                </label>
                <label>
                  Service charge
                  <select name="serviceChargeIncluded" defaultValue="false">
                    <option value="false">No — added on top</option>
                    <option value="true">Yes — in the cost</option>
                  </select>
                </label>
              </div>
              <div className="form-row form-row-4">
                <label>
                  Tourism fee (optional)
                  <input type="number" name="tourismFeeAmount" min={0} step="0.01" placeholder="2.00" />
                </label>
                <label>
                  Tourism fee currency
                  <input type="text" name="tourismFeeCurrency" maxLength={3} placeholder={contract.currency} />
                </label>
                <label>
                  Tourism fee charged
                  <select name="tourismFeeMode" defaultValue="">
                    <option value="">— No fee —</option>
                    <option value="PER_NIGHT_PER_PERSON">Per night, per person</option>
                    <option value="PER_NIGHT_PER_ROOM">Per night, per room</option>
                  </select>
                </label>
                <span />
              </div>
              <button type="submit" className="primary-button">
                Add rate
              </button>
            </form>
          )}
        </section>

        {/* List grouped by season */}
        <section data-testid="hotel-rate-list">
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
                <div key={g.key} data-testid="hotel-rate-season-group">
                  <h3
                    className="section-title"
                    style={{ fontSize: '0.95rem', marginBottom: '0.4rem' }}
                  >
                    {g.name}{' '}
                    <span style={{ color: '#94a3b8', fontWeight: 400, fontSize: '0.82rem' }}>
                      ({g.ranges.map((rg) => `${formatDate(rg.from)}→${formatDate(rg.to)}`).join(', ')} ·{' '}
                      {g.rows.length} cell{g.rows.length === 1 ? '' : 's'})
                    </span>
                  </h3>
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Room type</th>
                          <th>Dates</th>
                          <th>Occupancy</th>
                          <th>Meal plan</th>
                          <th>Basis</th>
                          <th className="numeric-cell">Cost</th>
                          <th>Currency</th>
                          <th>Actions</th>
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
                              <td style={{ whiteSpace: 'nowrap', fontSize: '0.8rem' }}>
                                {formatDate(r.seasonFrom)} → {formatDate(r.seasonTo)}
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
                              <td>
                                <Link
                                  href={`/hotels/${hotelId}/contracts/${contractId}/rates/${r.id}/edit`}
                                  prefetch={false}
                                  className="compact-button"
                                >
                                  Edit
                                </Link>
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
          /hotels/{hotelId}/contracts/{contractId}/rates — server-rendered. Create / edit /
          delete via Server Actions. Bulk matrix editor still routed to legacy until PR-A5+.
        </p>
      </section>
    </main>
  );
}
