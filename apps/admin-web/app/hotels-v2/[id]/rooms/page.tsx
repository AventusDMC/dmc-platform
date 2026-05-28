import Link from 'next/link';
import { notFound } from 'next/navigation';
import { adminPageFetchJson, isNextRedirectError } from '../../../lib/admin-server';
import { autoFillEmptyRoomCodes, createRoomType, deleteRoomType } from './actions';

// Hotels Engine v2 — PR #146.
//
// Room types CRUD for a hotel. Server-rendered list + inline create
// form + per-row delete. Edit lives on its own page so the form can
// pre-fill from the existing row data without needing client state.
//
// No client components. The create / delete forms post to Server
// Actions defined in ./actions.ts, which mutate via the existing
// /hotels/:hotelId/room-categories REST endpoints and call
// revalidatePath() so the new state appears on next render.

export const dynamic = 'force-dynamic';

const API_BASE_URL = '/api';

type RoomCategorySummary = {
  id: string;
  hotelId: string;
  name: string;
  code: string | null;
  isActive: boolean;
  hotelName: string;
  hotelCity: string;
  linkedRateCount: number;
  linkedQuoteItemCount: number;
};

type HotelHeader = {
  id: string;
  name: string;
};

async function getHotel(id: string): Promise<HotelHeader | null> {
  try {
    return await adminPageFetchJson<HotelHeader>(
      `${API_BASE_URL}/hotels/${encodeURIComponent(id)}`,
      'Hotel v2 rooms header',
      { cache: 'no-store', allow404: true },
    );
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }
    console.error('[hotels-v2/rooms] hotel header unavailable', error);
    return null;
  }
}

async function getRooms(hotelId: string): Promise<RoomCategorySummary[]> {
  try {
    return await adminPageFetchJson<RoomCategorySummary[]>(
      `${API_BASE_URL}/hotels/${encodeURIComponent(hotelId)}/room-categories-summary`,
      'Hotel v2 rooms list',
      { cache: 'no-store' },
    );
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }
    console.error('[hotels-v2/rooms] rooms list unavailable', error);
    return [];
  }
}

type RoomsPageProps = {
  params: Promise<{ id: string }>;
};

export default async function HotelRoomsPage({ params }: RoomsPageProps) {
  const { id: hotelId } = await params;
  const [hotel, rooms] = await Promise.all([getHotel(hotelId), getRooms(hotelId)]);

  if (!hotel) {
    notFound();
  }

  // Server Actions can't be passed dynamic args via the form action prop
  // in App Router — bind them at the call site.
  const createAction = createRoomType.bind(null, hotelId);
  const autoFillAction = autoFillEmptyRoomCodes.bind(null, hotelId);
  const roomsMissingCode = rooms.filter((r) => !r.code || r.code.trim().length === 0).length;

  return (
    <main className="page">
      <section className="panel workspace-panel workspace-panel-wide">
        <header style={{ marginBottom: '1.5rem' }}>
          <p className="eyebrow">Hotels Engine v2 — Room types</p>
          <h1 className="section-title">{hotel.name}</h1>
          <p className="copy section-copy">
            Manage sellable room inventory. Each room type can be referenced by hotel
            contracts, rates, and bookings.
          </p>
          <p className="table-subcopy" style={{ marginTop: '0.5rem' }}>
            <Link href={`/hotels-v2/${hotelId}`} prefetch={false}>
              ← Back to {hotel.name}
            </Link>
            {' · '}
            <Link href="/hotels-v2" prefetch={false}>
              All hotels
            </Link>
          </p>
        </header>

        {/* Create form — plain HTML form, action is a Server Action */}
        <section
          data-testid="hotel-v2-room-create"
          className="detail-card"
          style={{ marginBottom: '1.5rem' }}
        >
          <h2 className="section-title" style={{ fontSize: '1.05rem', marginBottom: '0.6rem' }}>
            Add room type
          </h2>
          <form action={createAction} className="entity-form compact-form">
            <div className="form-row form-row-4">
              <label>
                Name
                <input
                  type="text"
                  name="name"
                  placeholder="Standard Double"
                  required
                  maxLength={120}
                />
              </label>
              <label>
                Code <span style={{ color: '#94a3b8', fontWeight: 400 }}>(auto-suggested if blank)</span>
                <input type="text" name="code" placeholder="STD — leave blank to auto-generate" maxLength={32} />
              </label>
              <label>
                Description
                <input type="text" name="description" placeholder="Optional" maxLength={240} />
              </label>
              <label>
                Status
                <select name="isActive" defaultValue="active">
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </label>
            </div>
            <button type="submit" className="primary-button">
              Add room type
            </button>
          </form>
        </section>

        {/* Existing rooms */}
        <section data-testid="hotel-v2-room-list">
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '0.5rem',
              marginBottom: '0.6rem',
            }}
          >
            <h2 className="section-title" style={{ fontSize: '1.05rem', margin: 0 }}>
              Existing room types ({rooms.length})
            </h2>
            {roomsMissingCode > 0 ? (
              <form action={autoFillAction} style={{ margin: 0 }}>
                <button
                  type="submit"
                  className="compact-button"
                  title={`Generate standardized codes for ${roomsMissingCode} room${roomsMissingCode === 1 ? '' : 's'} that have a blank code`}
                  data-testid="auto-fill-codes-button"
                >
                  Auto-fill codes ({roomsMissingCode})
                </button>
              </form>
            ) : null}
          </div>

          {rooms.length === 0 ? (
            <p className="table-subcopy">No room types yet — add your first above.</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Room type</th>
                    <th>Code</th>
                    <th>Status</th>
                    <th className="numeric-cell">Linked rates</th>
                    <th className="numeric-cell">Linked quote items</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rooms.map((room) => {
                    const isLinked = room.linkedRateCount > 0 || room.linkedQuoteItemCount > 0;
                    const deleteAction = deleteRoomType.bind(null, hotelId, room.id);
                    return (
                      <tr key={room.id}>
                        <td>
                          <strong>{room.name || '(unnamed)'}</strong>
                        </td>
                        <td>{room.code || '—'}</td>
                        <td>
                          <span
                            style={{
                              color: room.isActive ? '#15803d' : '#94a3b8',
                              fontWeight: 600,
                              fontSize: '0.78rem',
                            }}
                          >
                            {room.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="numeric-cell">{room.linkedRateCount}</td>
                        <td className="numeric-cell">{room.linkedQuoteItemCount}</td>
                        <td>
                          <div className="table-action-row" style={{ display: 'flex', gap: '0.4rem' }}>
                            <Link
                              href={`/hotels-v2/${hotelId}/rooms/${room.id}/edit`}
                              prefetch={false}
                              className="compact-button"
                            >
                              Edit
                            </Link>
                            <form action={deleteAction} style={{ display: 'inline' }}>
                              <button
                                type="submit"
                                className="compact-button compact-button-danger"
                                disabled={isLinked}
                                title={
                                  isLinked
                                    ? 'Cannot delete: this room type is referenced by rates or quote items'
                                    : 'Delete this room type'
                                }
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
          style={{ marginTop: '1.5rem', color: '#94a3b8', fontSize: '0.75rem' }}
        >
          /hotels-v2/{hotelId}/rooms — pure server-rendered with Next.js Server Actions for
          mutations. No client JS. Delete is blocked when the room is referenced by rates
          or quote items to protect historical data.
        </p>
      </section>
    </main>
  );
}
