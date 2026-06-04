import Link from 'next/link';
import { notFound } from 'next/navigation';
import { adminPageFetchJson, isNextRedirectError } from '../../../../../../../lib/admin-server';
import { deleteRate, updateRate } from './actions';

// Hotels Engine — rate cell edit (PR-A4).
//
// Same field set as the create form on the rates list page, but
// pre-populated from the existing row and posting to PATCH /hotel-rates/:id.
// Delete is a separate form button on the same page so the destructive
// action lives next to the rate context, not floating on a list row.

export const dynamic = 'force-dynamic';

const API_BASE_URL = '/api';

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
  salesTaxPercent: number | null;
  salesTaxIncluded: boolean | null;
  serviceChargePercent: number | null;
  serviceChargeIncluded: boolean | null;
  tourismFeeAmount: number | null;
  tourismFeeCurrency: string | null;
  tourismFeeMode: string | null;
};

async function getContract(contractId: string): Promise<ContractSummary | null> {
  try {
    return await adminPageFetchJson<ContractSummary>(
      `${API_BASE_URL}/hotel-contracts/${encodeURIComponent(contractId)}?summary=1`,
      'Hotel rate edit — contract',
      { cache: 'no-store', allow404: true },
    );
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    console.error('[hotels/rate/edit] contract unavailable', error);
    return null;
  }
}

async function getRate(rateId: string): Promise<RateRow | null> {
  try {
    return await adminPageFetchJson<RateRow>(
      `${API_BASE_URL}/hotel-rates/${encodeURIComponent(rateId)}`,
      'Hotel rate edit — rate',
      { cache: 'no-store', allow404: true },
    );
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    console.error('[hotels/rate/edit] rate unavailable', error);
    return null;
  }
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toISOString().slice(0, 10);
  } catch {
    return iso;
  }
}

type Props = { params: Promise<{ id: string; contractId: string; rateId: string }> };

export default async function RateEditPage({ params }: Props) {
  const { id: hotelId, contractId, rateId } = await params;
  const [contract, rate] = await Promise.all([getContract(contractId), getRate(rateId)]);

  if (!contract || !rate) notFound();
  if (contract.hotelId !== hotelId) notFound();
  if (rate.contractId !== contractId) notFound();

  const updateAction = updateRate.bind(null, hotelId, contractId, rateId);
  const deleteAction = deleteRate.bind(null, hotelId, contractId, rateId);
  const roomCategories = contract.hotel.roomCategories;
  // Match the rate's stored room even if it has since been deactivated, so
  // the dropdown shows what is actually persisted instead of falling back
  // to an empty selection.
  const dropdownRooms = roomCategories.some((rc) => rc.id === rate.roomCategoryId)
    ? roomCategories.filter((rc) => rc.isActive || rc.id === rate.roomCategoryId)
    : roomCategories.filter((rc) => rc.isActive);

  const currentBasis = rate.pricingBasis === 'PER_PERSON' ? 'PER_PERSON' : 'PER_ROOM';

  return (
    <main className="page">
      <section className="panel workspace-panel workspace-panel-wide">
        <header style={{ marginBottom: '1.5rem' }}>
          <p className="eyebrow">Hotels Engine — Edit rate cell</p>
          <h1 className="section-title">{contract.name}</h1>
          <p className="copy section-copy">
            {contract.hotel.name} · {formatDate(contract.validFrom)} →{' '}
            {formatDate(contract.validTo)} · {contract.currency}
          </p>
          <p className="table-subcopy" style={{ marginTop: '0.5rem' }}>
            <Link
              href={`/hotels/${hotelId}/contracts/${contractId}/rates`}
              prefetch={false}
            >
              ← Back to rate cells
            </Link>
            {' · '}
            <Link href={`/hotels/${hotelId}/contracts/${contractId}`} prefetch={false}>
              Contract overview
            </Link>
          </p>
        </header>

        <section
          data-testid="hotel-rate-edit"
          className="detail-card"
          style={{ marginBottom: '1.5rem' }}
        >
          <h2 className="section-title" style={{ fontSize: '1.05rem', marginBottom: '0.6rem' }}>
            Edit rate cell
          </h2>
          <p className="table-subcopy" style={{ marginTop: 0, marginBottom: '0.6rem' }}>
            All fields are editable. Changes apply immediately to future quote calculations
            that touch this contract.
          </p>

          <form action={updateAction} className="entity-form compact-form">
            <div className="form-row form-row-4">
              <label>
                Room type
                <select name="roomCategoryId" required defaultValue={rate.roomCategoryId}>
                  {dropdownRooms.map((rc) => (
                    <option key={rc.id} value={rc.id}>
                      {rc.name}
                      {rc.code ? ` (${rc.code})` : ''}
                      {!rc.isActive ? ' — inactive' : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Occupancy
                <select name="occupancyType" required defaultValue={rate.occupancyType}>
                  <option value="SGL">Single (SGL)</option>
                  <option value="DBL">Double (DBL)</option>
                  <option value="TPL">Triple (TPL)</option>
                </select>
              </label>
              <label>
                Meal plan
                <select name="mealPlan" required defaultValue={rate.mealPlan}>
                  <option value="RO">RO — Room only</option>
                  <option value="BB">BB — Bed & breakfast</option>
                  <option value="HB">HB — Half board</option>
                  <option value="FB">FB — Full board</option>
                  <option value="AI">AI — All inclusive</option>
                </select>
              </label>
              <label>
                Pricing basis
                <select name="pricingBasis" required defaultValue={currentBasis}>
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
                  required
                  maxLength={80}
                  defaultValue={rate.seasonName}
                />
              </label>
              <label>
                Season from
                <input
                  type="date"
                  name="seasonFrom"
                  required
                  defaultValue={formatDate(rate.seasonFrom)}
                />
              </label>
              <label>
                Season to
                <input
                  type="date"
                  name="seasonTo"
                  required
                  defaultValue={formatDate(rate.seasonTo)}
                />
              </label>
              <label>
                Currency
                <select name="currency" defaultValue={rate.currency} required>
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
                  required
                  defaultValue={rate.cost}
                />
              </label>
            </div>
            <p className="table-subcopy" style={{ margin: '0.2rem 0 0.4rem', fontWeight: 650 }}>
              Taxes &amp; charges — "included" means the Cost above already covers it
            </p>
            <div className="form-row form-row-4">
              <label>
                Sales tax %
                <input type="number" name="salesTaxPercent" min={0} step="0.01" defaultValue={rate.salesTaxPercent ?? 0} />
              </label>
              <label>
                Sales tax
                <select name="salesTaxIncluded" defaultValue={rate.salesTaxIncluded ? 'true' : 'false'}>
                  <option value="false">No — added on top</option>
                  <option value="true">Yes — in the cost</option>
                </select>
              </label>
              <label>
                Service charge %
                <input type="number" name="serviceChargePercent" min={0} step="0.01" defaultValue={rate.serviceChargePercent ?? 0} />
              </label>
              <label>
                Service charge
                <select name="serviceChargeIncluded" defaultValue={rate.serviceChargeIncluded ? 'true' : 'false'}>
                  <option value="false">No — added on top</option>
                  <option value="true">Yes — in the cost</option>
                </select>
              </label>
            </div>
            <div className="form-row form-row-4">
              <label>
                Tourism fee (optional)
                <input type="number" name="tourismFeeAmount" min={0} step="0.01" defaultValue={rate.tourismFeeAmount ?? ''} />
              </label>
              <label>
                Tourism fee currency
                <input type="text" name="tourismFeeCurrency" maxLength={3} defaultValue={rate.tourismFeeCurrency ?? ''} />
              </label>
              <label>
                Tourism fee charged
                <select name="tourismFeeMode" defaultValue={rate.tourismFeeMode ?? ''}>
                  <option value="">— No fee —</option>
                  <option value="PER_NIGHT_PER_PERSON">Per night, per person</option>
                  <option value="PER_NIGHT_PER_ROOM">Per night, per room</option>
                </select>
              </label>
              <span />
            </div>
            <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
              <button type="submit" className="primary-button">
                Save changes
              </button>
              <Link
                href={`/hotels/${hotelId}/contracts/${contractId}/rates`}
                prefetch={false}
                className="compact-button"
              >
                Cancel
              </Link>
            </div>
          </form>
        </section>

        <section
          data-testid="hotel-rate-delete"
          className="detail-card"
          style={{ background: '#fef2f2', border: '1px solid #fecaca' }}
        >
          <h2 className="section-title" style={{ fontSize: '1rem', marginBottom: '0.4rem' }}>
            Delete this rate cell
          </h2>
          <p className="table-subcopy" style={{ marginTop: 0, marginBottom: '0.6rem' }}>
            Removes this single rate row. Quotes that already booked under this rate keep
            their stored pricing; only future quote calculations are affected.
          </p>
          <form action={deleteAction}>
            <button
              type="submit"
              className="compact-button"
              style={{ background: '#dc2626', color: '#fff', borderColor: '#dc2626' }}
            >
              Delete rate cell
            </button>
          </form>
        </section>

        <p
          className="table-subcopy"
          style={{ marginTop: '1.5rem', color: 'var(--ds-color-text-faint, #94A3B8)', fontSize: '0.75rem' }}
        >
          /hotels/{hotelId}/contracts/{contractId}/rates/{rateId}/edit — server-rendered.
          PATCH / DELETE via Server Actions. Full matrix editor ships in PR-A5+.
        </p>
      </section>
    </main>
  );
}
