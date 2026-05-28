import Link from 'next/link';
import { notFound } from 'next/navigation';
import { adminPageFetchJson, isNextRedirectError } from '../../../../../../../lib/admin-server';
import { updateSupplement } from './actions';

// Hotels Engine v2 — supplement edit (PR-A6).
//
// Same field set as create on the parent supplements page, pre-populated
// from the existing supplement row. The backend doesn't expose a
// GET-single endpoint for supplements (only list/create/patch/delete on
// /hotel-contracts/:contractId/supplements/...) so we fetch the contract
// supplement list and filter to this id — cheap because contracts
// typically carry a handful of supplements, not thousands. See
// [[feedback-verify-api-shape]] in memory for why we read the controller
// first rather than guess a missing endpoint into existence.
//
// Delete still lives on the list page as a per-row button (PR-A5).

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

type SupplementRow = {
  id: string;
  hotelContractId: string;
  roomCategoryId: string | null;
  type: string;
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
      'Hotel v2 supplement edit — contract',
      { cache: 'no-store', allow404: true },
    );
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    console.error('[hotels-v2/supplement/edit] contract unavailable', error);
    return null;
  }
}

async function getSupplement(
  contractId: string,
  supplementId: string,
): Promise<SupplementRow | null> {
  try {
    const rows = await adminPageFetchJson<SupplementRow[]>(
      `${API_BASE_URL}/hotel-contracts/${encodeURIComponent(contractId)}/supplements`,
      'Hotel v2 supplement edit — list',
      { cache: 'no-store' },
    );
    if (!Array.isArray(rows)) return null;
    return rows.find((r) => r.id === supplementId) || null;
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    console.error('[hotels-v2/supplement/edit] supplement unavailable', error);
    return null;
  }
}

type Props = {
  params: Promise<{ id: string; contractId: string; supplementId: string }>;
};

export default async function SupplementEditPage({ params }: Props) {
  const { id: hotelId, contractId, supplementId } = await params;
  const [contract, supplement] = await Promise.all([
    getContract(contractId),
    getSupplement(contractId, supplementId),
  ]);

  if (!contract || !supplement) notFound();
  if (contract.hotelId !== hotelId) notFound();
  if (supplement.hotelContractId !== contractId) notFound();

  const updateAction = updateSupplement.bind(null, hotelId, contractId, supplementId);
  const roomCategories = contract.hotel.roomCategories;
  // Match the supplement's stored room (if any) even if deactivated since
  // — same approach as the rate edit page.
  const dropdownRooms = supplement.roomCategoryId
    ? roomCategories.some((rc) => rc.id === supplement.roomCategoryId)
      ? roomCategories.filter((rc) => rc.isActive || rc.id === supplement.roomCategoryId)
      : roomCategories.filter((rc) => rc.isActive)
    : roomCategories.filter((rc) => rc.isActive);

  return (
    <main className="page">
      <section className="panel workspace-panel workspace-panel-wide">
        <header style={{ marginBottom: '1.5rem' }}>
          <p className="eyebrow">Hotels Engine v2 — Edit supplement</p>
          <h1 className="section-title">{contract.name}</h1>
          <p className="copy section-copy">
            {contract.hotel.name} · {contract.currency}
          </p>
          <p className="table-subcopy" style={{ marginTop: '0.5rem' }}>
            <Link
              href={`/hotels-v2/${hotelId}/contracts/${contractId}/supplements`}
              prefetch={false}
            >
              ← Back to supplements
            </Link>
            {' · '}
            <Link href={`/hotels-v2/${hotelId}/contracts/${contractId}`} prefetch={false}>
              Contract overview
            </Link>
          </p>
        </header>

        <section
          data-testid="hotel-v2-supplement-edit"
          className="detail-card"
          style={{ marginBottom: '1.5rem' }}
        >
          <h2 className="section-title" style={{ fontSize: '1.05rem', marginBottom: '0.6rem' }}>
            Edit supplement
          </h2>
          <p className="table-subcopy" style={{ marginTop: 0, marginBottom: '0.6rem' }}>
            All fields are editable. Changes apply immediately to future quote calculations
            that touch this contract. To delete instead, go back to the supplements list and
            use the per-row Delete button.
          </p>

          <form action={updateAction} className="entity-form compact-form">
            <div className="form-row form-row-4">
              <label>
                Room type (optional)
                <select name="roomCategoryId" defaultValue={supplement.roomCategoryId ?? ''}>
                  <option value="">All room types</option>
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
                Type
                <select name="type" required defaultValue={supplement.type}>
                  <option value="EXTRA_BREAKFAST">Extra breakfast</option>
                  <option value="EXTRA_LUNCH">Extra lunch</option>
                  <option value="EXTRA_DINNER">Extra dinner</option>
                  <option value="GALA_DINNER">Gala dinner</option>
                  <option value="EXTRA_BED">Extra bed</option>
                </select>
              </label>
              <label>
                Charge basis
                <select name="chargeBasis" required defaultValue={supplement.chargeBasis}>
                  <option value="PER_PERSON">Per person</option>
                  <option value="PER_ROOM">Per room</option>
                  <option value="PER_STAY">Per stay</option>
                  <option value="PER_NIGHT">Per night</option>
                </select>
              </label>
              <label>
                Currency
                <select name="currency" defaultValue={supplement.currency} required>
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
                Amount
                <input
                  type="number"
                  name="amount"
                  min={0}
                  step="0.01"
                  required
                  defaultValue={supplement.amount}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <input
                    type="checkbox"
                    name="isMandatory"
                    defaultChecked={supplement.isMandatory}
                  />
                  Mandatory (cannot be opted out by guest)
                </span>
              </label>
              <label style={{ gridColumn: 'span 2' }}>
                Notes (optional)
                <input
                  type="text"
                  name="notes"
                  defaultValue={supplement.notes ?? ''}
                  maxLength={240}
                />
              </label>
            </div>
            <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
              <button type="submit" className="primary-button">
                Save changes
              </button>
              <Link
                href={`/hotels-v2/${hotelId}/contracts/${contractId}/supplements`}
                prefetch={false}
                className="compact-button"
              >
                Cancel
              </Link>
            </div>
          </form>
        </section>

        <p
          className="table-subcopy"
          style={{ marginTop: '1.5rem', color: '#94a3b8', fontSize: '0.75rem' }}
        >
          /hotels-v2/{hotelId}/contracts/{contractId}/supplements/{supplementId}/edit —
          server-rendered. PATCH via Server Action.
        </p>
      </section>
    </main>
  );
}
