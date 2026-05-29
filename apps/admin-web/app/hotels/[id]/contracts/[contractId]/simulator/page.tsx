import Link from 'next/link';
import { notFound } from 'next/navigation';
import { adminPageFetchJson, isNextRedirectError } from '../../../../../lib/admin-server';

// Hotels Engine — quote / pricing simulator (roadmap Phase 4).
//
// A read-only "price this stay" tool: pick room / dates / occupancy /
// board / pax, and see the computed cost broken down per night (rate +
// supplements + child policy + taxes) plus any promotions that would
// apply. Drives the existing backend compute endpoints — nothing is
// persisted.
//
// Implemented as a GET form: submitting reloads this page with the
// inputs as query params, which the server component reads and prices.
// No client JS.
//   GET /hotel-rates/calculate-hotel-cost   → nightly cost breakdown
//   GET /promotions/evaluate                → applicable promotions

export const dynamic = 'force-dynamic';

const API_BASE_URL = '/api';

const OCCUPANCIES = ['SGL', 'DBL', 'TPL'];
const BOARDS = ['RO', 'BB', 'HB', 'FB', 'AI'];

type RoomCategory = { id: string; name: string; code: string | null; isActive: boolean };
type Supplement = {
  id: string;
  type: string;
  mealPlanCode: string | null;
  chargeBasis: string;
  amount: number;
  currency: string;
  isMandatory: boolean;
  isActive: boolean;
  roomCategoryId: string | null;
};
type ContractFull = {
  id: string;
  hotelId: string;
  name: string;
  validFrom: string;
  validTo: string;
  currency: string;
  hotel: { id: string; name: string; roomCategories: RoomCategory[] };
  supplements: Supplement[];
};

type CostLine = { kind: string; label: string; basis: string; unitAmount: number; quantity: number; total: number };
type CostNight = {
  date: string;
  adultsCost: number;
  childrenCost: number;
  supplementsCost: number;
  cost: number;
  lines?: CostLine[];
  warnings?: string[];
};
type CostResult = {
  adultsCost: number;
  childrenCost: number;
  supplementsCost: number;
  totalCost: number;
  nights: number;
  breakdown: CostNight[];
};

type PromoEntry = { id: string; name: string; type: string; effectAmount: number; explanation: string };
type PromoResult = {
  appliedPromotions: PromoEntry[];
  adjustedPricing: { currency: string; baseSell: number; adjustedSell: number; discountAmount: number };
};

async function getContract(contractId: string): Promise<ContractFull | null> {
  try {
    return await adminPageFetchJson<ContractFull>(
      `${API_BASE_URL}/hotel-contracts/${encodeURIComponent(contractId)}`,
      'Quote simulator — contract',
      { cache: 'no-store', allow404: true },
    );
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    console.error('[hotels/contract/simulator] contract unavailable', error);
    return null;
  }
}

function one(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? '') : (v ?? '');
}
function many(v: string | string[] | undefined): string[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}
function money(n: number, currency: string): string {
  return `${currency} ${n.toFixed(2)}`;
}
function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toISOString().slice(0, 10);
}

type Props = {
  params: Promise<{ id: string; contractId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function QuoteSimulatorPage({ params, searchParams }: Props) {
  const { id: hotelId, contractId } = await params;
  const sp = await searchParams;
  const contract = await getContract(contractId);

  if (!contract) notFound();
  if (contract.hotelId !== hotelId) notFound();

  const rooms = (contract.hotel.roomCategories ?? []).filter((r) => r.isActive);
  const supplements = (contract.supplements ?? []).filter((s) => s.isActive);
  const optionalSupplements = supplements.filter((s) => !s.isMandatory);
  const validFromInput = contract.validFrom.slice(0, 10);
  const validToInput = contract.validTo.slice(0, 10);
  const currency = contract.currency;

  // Inputs (prefilled from the query string after a run, else defaults).
  const inRoom = one(sp.roomCategoryId) || rooms[0]?.id || '';
  const inOcc = one(sp.occupancy) || 'DBL';
  const inBoard = one(sp.mealPlan) || 'BB';
  const inCheckIn = one(sp.checkInDate) || validFromInput;
  const inCheckOut = one(sp.checkOutDate) || '';
  const inAdults = one(sp.adults) || '2';
  const inChildren = one(sp.childrenAges) || '';
  const inRoomCount = one(sp.roomCount) || '1';
  const selectedSupplementIds = many(sp.selectedSupplementIds);

  const shouldPrice = Boolean(one(sp.checkInDate) && one(sp.checkOutDate) && inRoom);

  let cost: CostResult | null = null;
  let promos: PromoResult | null = null;
  let priceError: string | null = null;
  let availability: { worst: string; worstDate: string | null; minRemaining: number | null } | null = null;

  if (shouldPrice) {
    const adultsNum = Number(inAdults) || 0;
    const childrenCount = inChildren
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean).length;
    const pax = Math.max(1, adultsNum + childrenCount);
    const costQuery = new URLSearchParams({
      hotelId: contract.hotelId,
      contractId,
      checkInDate: inCheckIn,
      checkOutDate: inCheckOut,
      occupancy: inOcc,
      mealPlan: inBoard,
      pax: String(pax),
      adults: inAdults,
      roomCount: inRoomCount,
      roomCategoryId: inRoom,
    });
    if (inChildren.trim()) costQuery.set('childrenAges', inChildren.trim());
    selectedSupplementIds.forEach((id) => costQuery.append('selectedSupplementIds', id));

    try {
      cost = await adminPageFetchJson<CostResult>(
        `${API_BASE_URL}/hotel-rates/calculate-hotel-cost?${costQuery.toString()}`,
        'Quote simulator — cost',
        { cache: 'no-store' },
      );
    } catch (error) {
      if (isNextRedirectError(error)) throw error;
      priceError =
        'Could not price this stay. Check that active rates exist for the chosen room, dates, occupancy and board basis.';
    }

    if (cost) {
      // Promotions are evaluated separately; feed the computed total in as
      // both cost and sell (no markup applied here) so applicable offers
      // and the post-discount total surface.
      const promoQuery = new URLSearchParams({
        hotelContractId: contractId,
        travelDate: inCheckIn,
        roomCategoryId: inRoom,
        boardBasis: inBoard,
        stayNights: String(cost.nights),
        baseCost: String(cost.totalCost),
        baseSell: String(cost.totalCost),
        currency,
      });
      try {
        promos = await adminPageFetchJson<PromoResult>(
          `${API_BASE_URL}/promotions/evaluate?${promoQuery.toString()}`,
          'Quote simulator — promotions',
          { cache: 'no-store' },
        );
      } catch (error) {
        if (isNextRedirectError(error)) throw error;
        promos = null; // non-fatal — just omit the promotions panel
      }

      // Allotment availability: evaluate each night and report the worst
      // status across the stay (the allotment evaluator is per stay-date).
      const nights: string[] = [];
      const cursor = new Date(`${inCheckIn}T00:00:00.000Z`);
      const end = new Date(`${inCheckOut}T00:00:00.000Z`);
      for (let guard = 0; cursor < end && guard < 60; guard += 1) {
        nights.push(cursor.toISOString().slice(0, 10));
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
      try {
        type AllotEval = { status: string; remainingAvailability: number };
        const evals = await Promise.all(
          nights.map(async (night) => {
            const q = new URLSearchParams({ roomCategoryId: inRoom, stayDate: night });
            const e = await adminPageFetchJson<AllotEval>(
              `${API_BASE_URL}/hotel-contracts/${encodeURIComponent(contractId)}/allotments/evaluate?${q.toString()}`,
              'Quote simulator — availability',
              { cache: 'no-store' },
            );
            return { night, status: e.status, remaining: e.remainingAvailability };
          }),
        );
        const severity: Record<string, number> = {
          stop_sale: 5,
          sold_out: 4,
          release_window: 3,
          not_configured: 2,
          inactive: 2,
          available: 1,
        };
        let worst = evals[0];
        for (const e of evals) {
          if ((severity[e.status] ?? 0) > (severity[worst.status] ?? 0)) worst = e;
        }
        const remainings = evals
          .filter((e) => e.status === 'available' || e.status === 'release_window')
          .map((e) => e.remaining);
        availability = worst
          ? {
              worst: worst.status,
              worstDate: worst.night,
              minRemaining: remainings.length ? Math.min(...remainings) : null,
            }
          : null;
      } catch (error) {
        if (isNextRedirectError(error)) throw error;
        availability = null; // non-fatal — omit the availability panel
      }
    }
  }

  return (
    <main className="page">
      <section className="panel workspace-panel workspace-panel-wide">
        <header style={{ marginBottom: '1.5rem' }}>
          <p className="eyebrow">Hotels Engine — Quote simulator</p>
          <h1 className="section-title">{contract.name}</h1>
          <p className="copy section-copy">
            {contract.hotel.name} · {fmtDate(contract.validFrom)} → {fmtDate(contract.validTo)} · {currency}
          </p>
          <p className="table-subcopy" style={{ marginTop: '0.5rem' }}>
            <Link href={`/hotels/${hotelId}/contracts/${contractId}`} prefetch={false}>
              ← Back to contract
            </Link>
          </p>
        </header>

        {/* Inputs — GET form reloads the page with the priced result */}
        <section data-testid="hotel-simulator-form" className="detail-card" style={{ marginBottom: '1.5rem' }}>
          <h2 className="section-title" style={{ fontSize: '1.05rem', marginBottom: '0.6rem' }}>
            Price a stay
          </h2>
          <p className="table-subcopy" style={{ marginTop: 0, marginBottom: '0.6rem' }}>
            A what-if calculator — nothing is saved. Dates must fall inside the contract
            validity. The result shows the per-night cost (rate + supplements + child policy
            + taxes) and any promotions that would apply.
          </p>
          {rooms.length === 0 ? (
            <p className="table-subcopy" style={{ color: '#b45309' }}>
              This hotel has no active room categories — add rooms and rates first.
            </p>
          ) : (
            <form method="get" className="entity-form compact-form">
              <div className="form-row form-row-4">
                <label>
                  Room category
                  <select name="roomCategoryId" defaultValue={inRoom}>
                    {rooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.code ? `${r.name} (${r.code})` : r.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Occupancy
                  <select name="occupancy" defaultValue={inOcc}>
                    {OCCUPANCIES.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Board basis
                  <select name="mealPlan" defaultValue={inBoard}>
                    {BOARDS.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Rooms
                  <input type="number" name="roomCount" min={1} step="1" defaultValue={inRoomCount} />
                </label>
              </div>
              <div className="form-row form-row-4">
                <label>
                  Check-in
                  <input type="date" name="checkInDate" required min={validFromInput} max={validToInput} defaultValue={inCheckIn} />
                </label>
                <label>
                  Check-out
                  <input type="date" name="checkOutDate" required min={validFromInput} max={validToInput} defaultValue={inCheckOut} />
                </label>
                <label>
                  Adults
                  <input type="number" name="adults" min={1} step="1" defaultValue={inAdults} />
                </label>
                <label>
                  Children ages (comma-sep)
                  <input type="text" name="childrenAges" defaultValue={inChildren} placeholder="5, 8" />
                </label>
              </div>
              {optionalSupplements.length > 0 ? (
                <div style={{ marginTop: '0.4rem' }}>
                  <p className="table-subcopy" style={{ margin: '0 0 0.3rem', fontWeight: 650 }}>
                    Optional supplements (mandatory ones apply automatically)
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                    {optionalSupplements.map((s) => (
                      <label key={s.id} style={{ display: 'inline-flex', gap: '0.4rem', alignItems: 'center', fontWeight: 500 }}>
                        <input
                          type="checkbox"
                          name="selectedSupplementIds"
                          value={s.id}
                          defaultChecked={selectedSupplementIds.includes(s.id)}
                        />
                        {s.type}
                        {s.mealPlanCode ? ` (${s.mealPlanCode})` : ''} — {money(s.amount, s.currency)} {s.chargeBasis}
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}
              <div>
                <button type="submit" className="primary-button" style={{ marginTop: '0.6rem' }}>
                  Calculate price
                </button>
              </div>
            </form>
          )}
        </section>

        {/* Result */}
        {priceError ? (
          <section className="detail-card" style={{ marginBottom: '1.5rem', borderColor: '#fca5a5' }}>
            <p style={{ color: '#b91c1c', margin: 0 }}>{priceError}</p>
          </section>
        ) : null}

        {cost ? (
          <section data-testid="hotel-simulator-result" style={{ marginBottom: '1.5rem' }}>
            <h2 className="section-title" style={{ fontSize: '1.05rem', marginBottom: '0.6rem' }}>
              Result — {cost.nights} night{cost.nights === 1 ? '' : 's'}
            </h2>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Night</th>
                    <th className="numeric-cell">Base</th>
                    <th className="numeric-cell">Children</th>
                    <th className="numeric-cell">Supplements</th>
                    <th className="numeric-cell">Night total</th>
                  </tr>
                </thead>
                <tbody>
                  {cost.breakdown.map((n) => (
                    <tr key={n.date}>
                      <td>{n.date}</td>
                      <td className="numeric-cell">{n.adultsCost.toFixed(2)}</td>
                      <td className="numeric-cell">{n.childrenCost.toFixed(2)}</td>
                      <td className="numeric-cell">{n.supplementsCost.toFixed(2)}</td>
                      <td className="numeric-cell">{n.cost.toFixed(2)}</td>
                    </tr>
                  ))}
                  <tr style={{ fontWeight: 700, borderTop: '2px solid #cbd5e1' }}>
                    <td>Total</td>
                    <td className="numeric-cell">{cost.adultsCost.toFixed(2)}</td>
                    <td className="numeric-cell">{cost.childrenCost.toFixed(2)}</td>
                    <td className="numeric-cell">{cost.supplementsCost.toFixed(2)}</td>
                    <td className="numeric-cell">{money(cost.totalCost, currency)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Promotions */}
            {promos && promos.appliedPromotions.length > 0 ? (
              <div className="detail-card" style={{ marginTop: '1rem' }}>
                <h3 className="section-title" style={{ fontSize: '0.95rem', marginBottom: '0.5rem' }}>
                  Promotions applied
                </h3>
                <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                  {promos.appliedPromotions.map((p) => (
                    <li key={p.id} style={{ marginBottom: '0.25rem' }}>
                      <strong>{p.name}</strong> — −{money(p.effectAmount, currency)}
                      {p.explanation ? <span style={{ color: '#64748b' }}> · {p.explanation}</span> : null}
                    </li>
                  ))}
                </ul>
                <p style={{ marginTop: '0.6rem', fontWeight: 700 }}>
                  After promotions: {money(promos.adjustedPricing.adjustedSell, currency)}{' '}
                  <span style={{ color: '#16a34a', fontWeight: 600 }}>
                    (saved {money(promos.adjustedPricing.discountAmount, currency)})
                  </span>
                </p>
              </div>
            ) : promos ? (
              <p className="table-subcopy" style={{ marginTop: '0.75rem' }}>
                No promotions apply to these inputs.
              </p>
            ) : null}

            {/* Inventory availability across the stay (worst night). */}
            {availability ? (
              <div className="detail-card" style={{ marginTop: '1rem' }}>
                <h3 className="section-title" style={{ fontSize: '0.95rem', marginBottom: '0.4rem' }}>
                  Inventory
                </h3>
                {(() => {
                  const a = availability;
                  if (a.worst === 'stop_sale')
                    return <p style={{ margin: 0, color: '#b91c1c', fontWeight: 600 }}>Stop-sale on {a.worstDate} — not bookable for these dates.</p>;
                  if (a.worst === 'sold_out')
                    return <p style={{ margin: 0, color: '#b91c1c', fontWeight: 600 }}>Sold out on {a.worstDate} — no rooms left in the allotment.</p>;
                  if (a.worst === 'release_window')
                    return <p style={{ margin: 0, color: '#b45309', fontWeight: 600 }}>Within the release window on {a.worstDate} — unsold rooms may have been returned to the hotel.</p>;
                  if (a.worst === 'not_configured' || a.worst === 'inactive')
                    return <p style={{ margin: 0, color: '#64748b' }}>On request — no committed allotment covers these dates.</p>;
                  return (
                    <p style={{ margin: 0, color: '#16a34a', fontWeight: 600 }}>
                      Available{a.minRemaining != null ? ` — at least ${a.minRemaining} room${a.minRemaining === 1 ? '' : 's'} every night` : ''}.
                    </p>
                  );
                })()}
              </div>
            ) : null}
          </section>
        ) : null}

        <p
          className="table-subcopy"
          style={{ marginTop: '1.5rem', color: '#94a3b8', fontSize: '0.75rem' }}
        >
          /hotels/{hotelId}/contracts/{contractId}/simulator — server-rendered, read-only.
          Cost from /hotel-rates/calculate-hotel-cost; promotions from /promotions/evaluate.
        </p>
      </section>
    </main>
  );
}
