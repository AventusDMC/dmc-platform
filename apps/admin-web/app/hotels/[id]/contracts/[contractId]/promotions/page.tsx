import Link from 'next/link';
import { notFound } from 'next/navigation';
import { adminPageFetchJson, isNextRedirectError } from '../../../../../lib/admin-server';
import { createPromotion, deletePromotion, updatePromotion } from './actions';

// Hotels Engine — promotions editor (roadmap Phase 4).
//
// Surfaces the promotions engine, which had full backend CRUD + an
// evaluator but no UI. Promotions live at the top-level /promotions
// resource, so we fetch the full list and filter to this contract.
// Supports promotion CRUD plus a single optional applicability rule
// (the common case); promotions that already carry multiple rules are
// edited core-only with their rules preserved.

export const dynamic = 'force-dynamic';

const API_BASE_URL = '/api';

const TYPE_LABELS: Record<string, string> = {
  PERCENTAGE_DISCOUNT: 'Percentage discount',
  FIXED_DISCOUNT: 'Fixed discount',
  STAY_PAY: 'Stay / pay',
  FREE_NIGHT: 'Free night',
};

const COMBINABILITY_LABELS: Record<string, string> = {
  EXCLUSIVE: 'Exclusive',
  COMBINABLE: 'Combinable',
  BEST_OF_GROUP: 'Best of group',
};

const BOARD_CODES = ['RO', 'BB', 'HB', 'FB', 'AI'];

type RoomCategory = { id: string; name: string; code: string | null; isActive: boolean };

type PromotionRule = {
  id: string;
  roomCategoryId: string | null;
  travelDateFrom: string | null;
  travelDateTo: string | null;
  bookingDateFrom: string | null;
  bookingDateTo: string | null;
  boardBasis: string | null;
  minStay: number | null;
  isActive: boolean;
  roomCategory: { id: string; name: string; code: string | null } | null;
};

type Promotion = {
  id: string;
  hotelContractId: string;
  name: string;
  type: string;
  value: number | null;
  stayPayNights: number | null;
  payNights: number | null;
  freeNightCount: number | null;
  isActive: boolean;
  priority: number;
  combinabilityMode: string | null;
  notes: string | null;
  rules: PromotionRule[];
};

type ContractFull = {
  id: string;
  hotelId: string;
  name: string;
  validFrom: string;
  validTo: string;
  currency: string;
  hotel: { id: string; name: string; roomCategories: RoomCategory[] };
};

async function getContract(contractId: string): Promise<ContractFull | null> {
  try {
    return await adminPageFetchJson<ContractFull>(
      `${API_BASE_URL}/hotel-contracts/${encodeURIComponent(contractId)}`,
      'Promotions — contract',
      { cache: 'no-store', allow404: true },
    );
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    console.error('[hotels/contract/promotions] contract unavailable', error);
    return null;
  }
}

async function getPromotions(contractId: string): Promise<Promotion[]> {
  try {
    const all = await adminPageFetchJson<Promotion[]>(`${API_BASE_URL}/promotions`, 'Promotions list', {
      cache: 'no-store',
      allow404: true,
    });
    if (!Array.isArray(all)) return [];
    return all.filter((p) => p.hotelContractId === contractId);
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    console.error('[hotels/contract/promotions] list unavailable', error);
    return [];
  }
}

function toDateInput(iso: string | null): string {
  return iso ? iso.slice(0, 10) : '';
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

function formatBenefit(p: Promotion, currency: string): string {
  if (p.type === 'PERCENTAGE_DISCOUNT') return p.value != null ? `${p.value}% off` : '—';
  if (p.type === 'FIXED_DISCOUNT') return p.value != null ? `${p.value.toFixed(2)} ${currency} off` : '—';
  if (p.type === 'STAY_PAY') return `Stay ${p.stayPayNights ?? '?'} pay ${p.payNights ?? '?'}`;
  if (p.type === 'FREE_NIGHT') return `${p.freeNightCount ?? '?'} free night${p.freeNightCount === 1 ? '' : 's'}`;
  return '—';
}

function ruleSummary(rule: PromotionRule): string {
  const parts: string[] = [];
  parts.push(rule.roomCategory ? rule.roomCategory.name : 'All rooms');
  if (rule.boardBasis) parts.push(`board ${rule.boardBasis}`);
  if (rule.travelDateFrom || rule.travelDateTo)
    parts.push(`travel ${formatDate(rule.travelDateFrom) || '…'}→${formatDate(rule.travelDateTo) || '…'}`);
  if (rule.bookingDateFrom || rule.bookingDateTo)
    parts.push(`book ${formatDate(rule.bookingDateFrom) || '…'}→${formatDate(rule.bookingDateTo) || '…'}`);
  if (rule.minStay) parts.push(`min ${rule.minStay}n`);
  if (!rule.isActive) parts.push('(inactive)');
  return parts.join(' · ');
}

type Props = { params: Promise<{ id: string; contractId: string }> };

export default async function ContractPromotionsPage({ params }: Props) {
  const { id: hotelId, contractId } = await params;
  const [contract, promotions] = await Promise.all([getContract(contractId), getPromotions(contractId)]);

  if (!contract) notFound();
  if (contract.hotelId !== hotelId) notFound();

  const createAction = createPromotion.bind(null, hotelId, contractId);
  const rooms = (contract.hotel.roomCategories ?? []).filter((r) => r.isActive);
  const roomName = (r: { name: string; code: string | null } | null) =>
    r ? (r.code ? `${r.name} (${r.code})` : r.name) : 'All rooms';
  const validFromInput = toDateInput(contract.validFrom);
  const validToInput = toDateInput(contract.validTo);

  // The optional applicability-rule fields, reused by create + edit. A
  // server component can't show/hide by type, so all type-value inputs
  // are shown with a "fill what matches your type" hint.
  const ruleFields = (rule: PromotionRule | null) => (
    <>
      <div className="form-row form-row-4">
        <label>
          Room (blank = all)
          <select name="roomCategoryId" defaultValue={rule?.roomCategoryId ?? ''}>
            <option value="">All rooms</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {roomName(r)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Board (blank = any)
          <select name="boardBasis" defaultValue={rule?.boardBasis ?? ''}>
            <option value="">Any</option>
            {BOARD_CODES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label>
          Min stay (nights)
          <input type="number" name="minStay" min={1} step="1" defaultValue={rule?.minStay ?? ''} />
        </label>
        <span />
      </div>
      <div className="form-row form-row-4">
        <label>
          Travel from
          <input type="date" name="travelDateFrom" defaultValue={toDateInput(rule?.travelDateFrom ?? null)} />
        </label>
        <label>
          Travel to
          <input type="date" name="travelDateTo" defaultValue={toDateInput(rule?.travelDateTo ?? null)} />
        </label>
        <label>
          Booking from (early-bird)
          <input type="date" name="bookingDateFrom" defaultValue={toDateInput(rule?.bookingDateFrom ?? null)} />
        </label>
        <label>
          Booking to
          <input type="date" name="bookingDateTo" defaultValue={toDateInput(rule?.bookingDateTo ?? null)} />
        </label>
      </div>
    </>
  );

  const typeValueFields = (p: Promotion | null) => (
    <div className="form-row form-row-4">
      <label>
        Discount value (% or amount)
        <input type="number" name="value" min={0} step="0.01" defaultValue={p?.value ?? ''} placeholder="10" />
      </label>
      <label>
        Stay nights
        <input type="number" name="stayPayNights" min={1} step="1" defaultValue={p?.stayPayNights ?? ''} placeholder="4" />
      </label>
      <label>
        Pay nights
        <input type="number" name="payNights" min={1} step="1" defaultValue={p?.payNights ?? ''} placeholder="3" />
      </label>
      <label>
        Free nights
        <input type="number" name="freeNightCount" min={1} step="1" defaultValue={p?.freeNightCount ?? ''} placeholder="1" />
      </label>
    </div>
  );

  return (
    <main className="page">
      <section className="panel workspace-panel workspace-panel-wide">
        <header style={{ marginBottom: '1.5rem' }}>
          <p className="eyebrow">Hotels Engine — Promotions</p>
          <h1 className="section-title">{contract.name}</h1>
          <p className="copy section-copy">
            {contract.hotel.name} · {formatDate(contract.validFrom)} → {formatDate(contract.validTo)} ·{' '}
            {contract.currency}
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

        {/* Add promotion */}
        <section data-testid="hotel-promotion-create" className="detail-card" style={{ marginBottom: '1.5rem' }}>
          <h2 className="section-title" style={{ fontSize: '1.05rem', marginBottom: '0.6rem' }}>
            Add promotion
          </h2>
          <p className="table-subcopy" style={{ marginTop: 0, marginBottom: '0.6rem' }}>
            Pick a type and fill only the value fields it needs — % / amount for discounts,
            stay+pay nights for stay-pay, free-night count for free-night. The applicability
            rule below is optional (blank = applies to the whole contract); set a booking
            window for early-bird or a minimum stay for long-stay offers.
          </p>
          <form action={createAction} className="entity-form compact-form">
            <div className="form-row form-row-4">
              <label>
                Name
                <input type="text" name="name" required maxLength={120} placeholder="Early bird 2026" />
              </label>
              <label>
                Type
                <select name="type" required defaultValue="PERCENTAGE_DISCOUNT">
                  {Object.entries(TYPE_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Combinability
                <select name="combinabilityMode" required defaultValue="EXCLUSIVE">
                  {Object.entries(COMBINABILITY_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Priority
                <input type="number" name="priority" min={0} step="1" defaultValue={0} />
              </label>
            </div>
            {typeValueFields(null)}
            <p className="table-subcopy" style={{ margin: '0.2rem 0 0.4rem', fontWeight: 650 }}>
              Applicability rule (optional)
            </p>
            {ruleFields(null)}
            <label style={{ display: 'block', marginTop: '0.4rem' }}>
              Notes (optional)
              <input type="text" name="notes" maxLength={240} placeholder="Confirmed with revenue manager" />
            </label>
            <label style={{ display: 'inline-flex', gap: '0.4rem', alignItems: 'center', marginTop: '0.4rem' }}>
              <input type="checkbox" name="isActive" defaultChecked /> Active
            </label>
            <div>
              <button type="submit" className="primary-button" style={{ marginTop: '0.5rem' }}>
                Add promotion
              </button>
            </div>
          </form>
        </section>

        {/* Promotions list */}
        <section data-testid="hotel-promotion-list">
          <h2 className="section-title" style={{ fontSize: '1.05rem', marginBottom: '0.6rem' }}>
            Promotions ({promotions.length})
          </h2>
          {promotions.length === 0 ? (
            <p className="table-subcopy">
              No promotions on this contract yet. Add one above — discounts, stay-pay, or
              free-night offers, optionally scoped by travel/booking dates, room, board, or
              minimum stay.
            </p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Benefit</th>
                    <th className="numeric-cell">Priority</th>
                    <th>Combinability</th>
                    <th>Active</th>
                    <th>Applicability</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {promotions.map((p) => {
                    const updateAction = updatePromotion.bind(null, hotelId, contractId, p.id);
                    const deleteAction = deletePromotion.bind(null, hotelId, contractId, p.id);
                    const singleRuleEditable = p.rules.length <= 1;
                    const rule = p.rules[0] ?? null;
                    return (
                      <tr key={p.id} style={p.isActive ? undefined : { color: '#94a3b8' }}>
                        <td>
                          <strong>{p.name}</strong>
                          {p.notes ? (
                            <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{p.notes}</div>
                          ) : null}
                        </td>
                        <td>{TYPE_LABELS[p.type] || p.type}</td>
                        <td>{formatBenefit(p, contract.currency)}</td>
                        <td className="numeric-cell">{p.priority}</td>
                        <td>{COMBINABILITY_LABELS[p.combinabilityMode ?? ''] || p.combinabilityMode || '—'}</td>
                        <td>{p.isActive ? 'Yes' : 'No'}</td>
                        <td style={{ maxWidth: '20rem', fontSize: '0.8rem' }}>
                          {p.rules.length === 0
                            ? 'Whole contract'
                            : p.rules.map((r) => <div key={r.id}>{ruleSummary(r)}</div>)}
                        </td>
                        <td>
                          <details>
                            <summary className="compact-button" style={{ cursor: 'pointer', display: 'inline-block' }}>
                              Edit
                            </summary>
                            <form
                              action={updateAction}
                              className="entity-form compact-form"
                              style={{ marginTop: '0.6rem', minWidth: '28rem' }}
                            >
                              <input type="hidden" name="manageRule" value={singleRuleEditable ? '1' : '0'} />
                              <div className="form-row form-row-4">
                                <label>
                                  Name
                                  <input type="text" name="name" required maxLength={120} defaultValue={p.name} />
                                </label>
                                <label>
                                  Type
                                  <select name="type" required defaultValue={p.type}>
                                    {Object.entries(TYPE_LABELS).map(([v, l]) => (
                                      <option key={v} value={v}>
                                        {l}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label>
                                  Combinability
                                  <select name="combinabilityMode" required defaultValue={p.combinabilityMode ?? 'EXCLUSIVE'}>
                                    {Object.entries(COMBINABILITY_LABELS).map(([v, l]) => (
                                      <option key={v} value={v}>
                                        {l}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label>
                                  Priority
                                  <input type="number" name="priority" min={0} step="1" defaultValue={p.priority} />
                                </label>
                              </div>
                              {typeValueFields(p)}
                              {singleRuleEditable ? (
                                <>
                                  <p className="table-subcopy" style={{ margin: '0.2rem 0 0.4rem', fontWeight: 650 }}>
                                    Applicability rule (optional)
                                  </p>
                                  {ruleFields(rule)}
                                </>
                              ) : (
                                <p className="table-subcopy" style={{ color: '#b45309', margin: '0.3rem 0' }}>
                                  This promotion has {p.rules.length} rules — they're preserved on save. Multi-rule
                                  editing is a follow-up; delete &amp; recreate to change them here.
                                </p>
                              )}
                              <label style={{ display: 'block', marginTop: '0.4rem' }}>
                                Notes (optional)
                                <input type="text" name="notes" maxLength={240} defaultValue={p.notes ?? ''} />
                              </label>
                              <label style={{ display: 'inline-flex', gap: '0.4rem', alignItems: 'center', marginTop: '0.4rem' }}>
                                <input type="checkbox" name="isActive" defaultChecked={p.isActive} /> Active
                              </label>
                              <div>
                                <button type="submit" className="primary-button" style={{ marginTop: '0.5rem' }}>
                                  Save promotion
                                </button>
                              </div>
                            </form>
                          </details>
                          <form action={deleteAction} style={{ marginTop: '0.5rem' }}>
                            <button
                              type="submit"
                              className="compact-button"
                              style={{ background: '#dc2626', color: '#fff', borderColor: '#dc2626' }}
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
          style={{ marginTop: '1.5rem', color: '#94a3b8', fontSize: '0.75rem' }}
        >
          /hotels/{hotelId}/contracts/{contractId}/promotions — server-rendered. Create / edit
          / delete via Server Actions; applied at quote time by the promotions evaluator.
        </p>
      </section>
    </main>
  );
}
