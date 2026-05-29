import Link from 'next/link';
import { notFound } from 'next/navigation';
import { adminPageFetchJson, isNextRedirectError } from '../../../../../lib/admin-server';
import { createAllotment, deleteAllotment, updateAllotment } from './actions';

// Hotels Engine — allotment (inventory) editor.
//
// Phase 2 of the roadmap: manage the committed room blocks on a
// contract — how many rooms are held per room category + date range, the
// release deadline, and the stop-sale flag. Backend CRUD + the catch-all
// proxy already existed; this is the missing screen. Fetches the full
// contract (GET /hotel-contracts/:id includes allotments + room
// categories) and offers create / inline-edit / delete.

export const dynamic = 'force-dynamic';

const API_BASE_URL = '/api';

type RoomCategory = { id: string; name: string; code: string | null; isActive: boolean };

type Allotment = {
  id: string;
  roomCategoryId: string;
  dateFrom: string;
  dateTo: string;
  allotment: number;
  releaseDays: number;
  stopSale: boolean;
  isActive: boolean;
  notes: string | null;
  roomCategory: { id: string; name: string; code: string | null } | null;
};

type ContractFull = {
  id: string;
  hotelId: string;
  name: string;
  validFrom: string;
  validTo: string;
  currency: string;
  hotel: { id: string; name: string; roomCategories: RoomCategory[] };
  allotments: Allotment[];
};

async function getContract(contractId: string): Promise<ContractFull | null> {
  try {
    return await adminPageFetchJson<ContractFull>(
      `${API_BASE_URL}/hotel-contracts/${encodeURIComponent(contractId)}`,
      'Hotel allotments — contract',
      { cache: 'no-store', allow404: true },
    );
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    console.error('[hotels/contract/allotments] contract unavailable', error);
    return null;
  }
}

// ISO → YYYY-MM-DD for <input type="date"> value / min / max.
function toDateInput(iso: string): string {
  return typeof iso === 'string' ? iso.slice(0, 10) : '';
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toISOString().slice(0, 10);
}

type Props = { params: Promise<{ id: string; contractId: string }> };

export default async function ContractAllotmentsPage({ params }: Props) {
  const { id: hotelId, contractId } = await params;
  const contract = await getContract(contractId);

  if (!contract) notFound();
  if (contract.hotelId !== hotelId) notFound();

  const createAction = createAllotment.bind(null, hotelId, contractId);
  const allotments = contract.allotments ?? [];
  const rooms = contract.hotel.roomCategories ?? [];
  const activeRooms = rooms.filter((r) => r.isActive);
  const roomName = (r: { name: string; code: string | null } | null) =>
    r ? (r.code ? `${r.name} (${r.code})` : r.name) : '—';
  const validFromInput = toDateInput(contract.validFrom);
  const validToInput = toDateInput(contract.validTo);

  return (
    <main className="page">
      <section className="panel workspace-panel workspace-panel-wide">
        <header style={{ marginBottom: '1.5rem' }}>
          <p className="eyebrow">Hotels Engine — Allotments</p>
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

        {/* Add allotment */}
        <section
          data-testid="hotel-allotment-create"
          className="detail-card"
          style={{ marginBottom: '1.5rem' }}
        >
          <h2 className="section-title" style={{ fontSize: '1.05rem', marginBottom: '0.6rem' }}>
            Add allotment
          </h2>
          <p className="table-subcopy" style={{ marginTop: 0, marginBottom: '0.6rem' }}>
            A block of rooms held for a room category over a date range. Release days is how
            many days before arrival unsold rooms are returned to the hotel. Dates must fall
            inside the contract validity ({formatDate(contract.validFrom)} →{' '}
            {formatDate(contract.validTo)}).
          </p>
          {activeRooms.length === 0 ? (
            <p className="table-subcopy" style={{ color: '#b45309' }}>
              This hotel has no active room categories yet. Add room types first, then come
              back to set allotments.
            </p>
          ) : (
            <form action={createAction} className="entity-form compact-form">
              <div className="form-row form-row-4">
                <label>
                  Room category
                  <select name="roomCategoryId" required defaultValue={activeRooms[0]?.id}>
                    {activeRooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        {roomName(r)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Date from
                  <input
                    type="date"
                    name="dateFrom"
                    required
                    min={validFromInput}
                    max={validToInput}
                    defaultValue={validFromInput}
                  />
                </label>
                <label>
                  Date to
                  <input
                    type="date"
                    name="dateTo"
                    required
                    min={validFromInput}
                    max={validToInput}
                    defaultValue={validToInput}
                  />
                </label>
                <label>
                  Rooms held
                  <input type="number" name="allotment" min={0} step="1" required placeholder="10" />
                </label>
              </div>
              <div className="form-row form-row-4">
                <label>
                  Release days
                  <input type="number" name="releaseDays" min={0} step="1" required defaultValue={0} />
                </label>
                <label>
                  Stop sale
                  <select name="stopSale" defaultValue="false">
                    <option value="false">No — bookable</option>
                    <option value="true">Yes — stop sale</option>
                  </select>
                </label>
                <label style={{ gridColumn: 'span 2' }}>
                  Notes (optional)
                  <input type="text" name="notes" maxLength={240} placeholder="Trade-fair block" />
                </label>
              </div>
              <button type="submit" className="primary-button">
                Add allotment
              </button>
            </form>
          )}
        </section>

        {/* Allotments list */}
        <section data-testid="hotel-allotment-list">
          <h2 className="section-title" style={{ fontSize: '1.05rem', marginBottom: '0.6rem' }}>
            Allotments ({allotments.length})
          </h2>
          {allotments.length === 0 ? (
            <p className="table-subcopy">
              No allotments yet. Without an allotment the quote engine treats the room as
              on-request (no committed inventory).
            </p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Room category</th>
                    <th>Dates</th>
                    <th className="numeric-cell">Rooms</th>
                    <th className="numeric-cell">Release</th>
                    <th>Stop sale</th>
                    <th>Active</th>
                    <th>Notes</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {allotments.map((a) => {
                    const updateAction = updateAllotment.bind(null, hotelId, contractId, a.id);
                    const deleteAction = deleteAllotment.bind(null, hotelId, contractId, a.id);
                    // The current room may be inactive; make sure it's still
                    // selectable in the edit dropdown so editing doesn't force
                    // a room change.
                    const editRooms = rooms.some((r) => r.id === a.roomCategoryId)
                      ? rooms
                      : [...rooms, ...(a.roomCategory ? [{ ...a.roomCategory, isActive: true }] : [])];
                    return (
                      <tr key={a.id} style={a.stopSale ? { background: '#fef2f2' } : undefined}>
                        <td>{roomName(a.roomCategory)}</td>
                        <td>
                          {formatDate(a.dateFrom)} → {formatDate(a.dateTo)}
                        </td>
                        <td className="numeric-cell">{a.allotment}</td>
                        <td className="numeric-cell">{a.releaseDays}d</td>
                        <td>
                          {a.stopSale ? (
                            <span style={{ color: '#b91c1c', fontWeight: 600 }}>Stop sale</span>
                          ) : (
                            <span style={{ color: '#64748b' }}>—</span>
                          )}
                        </td>
                        <td>{a.isActive ? 'Yes' : 'No'}</td>
                        <td style={{ maxWidth: '16rem' }}>{a.notes || '—'}</td>
                        <td>
                          {/* Inline edit via native <details> — no client JS. */}
                          <details>
                            <summary className="compact-button" style={{ cursor: 'pointer', display: 'inline-block' }}>
                              Edit
                            </summary>
                            <form
                              action={updateAction}
                              className="entity-form compact-form"
                              style={{ marginTop: '0.6rem', minWidth: '24rem' }}
                            >
                              <div className="form-row">
                                <label>
                                  Room category
                                  <select name="roomCategoryId" required defaultValue={a.roomCategoryId}>
                                    {editRooms.map((r) => (
                                      <option key={r.id} value={r.id}>
                                        {roomName(r)}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label>
                                  Rooms held
                                  <input type="number" name="allotment" min={0} step="1" required defaultValue={a.allotment} />
                                </label>
                              </div>
                              <div className="form-row">
                                <label>
                                  Date from
                                  <input type="date" name="dateFrom" required min={validFromInput} max={validToInput} defaultValue={toDateInput(a.dateFrom)} />
                                </label>
                                <label>
                                  Date to
                                  <input type="date" name="dateTo" required min={validFromInput} max={validToInput} defaultValue={toDateInput(a.dateTo)} />
                                </label>
                              </div>
                              <div className="form-row">
                                <label>
                                  Release days
                                  <input type="number" name="releaseDays" min={0} step="1" required defaultValue={a.releaseDays} />
                                </label>
                                <label>
                                  Stop sale
                                  <select name="stopSale" defaultValue={a.stopSale ? 'true' : 'false'}>
                                    <option value="false">No — bookable</option>
                                    <option value="true">Yes — stop sale</option>
                                  </select>
                                </label>
                              </div>
                              <div className="form-row">
                                <label>
                                  Active
                                  <select name="isActive" defaultValue={a.isActive ? 'true' : 'false'}>
                                    <option value="true">Yes</option>
                                    <option value="false">No</option>
                                  </select>
                                </label>
                                <label>
                                  Notes (optional)
                                  <input type="text" name="notes" maxLength={240} defaultValue={a.notes ?? ''} />
                                </label>
                              </div>
                              <button type="submit" className="primary-button" style={{ marginTop: '0.4rem' }}>
                                Save allotment
                              </button>
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
          /hotels/{hotelId}/contracts/{contractId}/allotments — server-rendered. Create /
          edit / delete via Server Actions. Availability is evaluated at quote time from
          these blocks (release days + stop-sale).
        </p>
      </section>
    </main>
  );
}
