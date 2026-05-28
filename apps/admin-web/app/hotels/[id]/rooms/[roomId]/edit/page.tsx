import Link from 'next/link';
import { notFound } from 'next/navigation';
import { adminPageFetchJson, isNextRedirectError } from '../../../../../lib/admin-server';
import { updateRoomType } from '../../actions';

// Hotels Engine — PR #146.
//
// Edit a room type. Server-rendered form pre-filled from the existing
// room data. Submits to the updateRoomType Server Action which PATCHes
// the API and redirects back to the rooms list.

export const dynamic = 'force-dynamic';

const API_BASE_URL = '/api';

type RoomCategoryDetail = {
  id: string;
  hotelId: string;
  name: string;
  code: string | null;
  description: string | null;
  isActive: boolean;
  hotel: { id: string; name: string; city: string } | null;
  counts: {
    rates: number;
    quoteItems: number;
    supplements: number;
    allotments: number;
  };
};

async function getRoom(roomId: string): Promise<RoomCategoryDetail | null> {
  try {
    return await adminPageFetchJson<RoomCategoryDetail>(
      `${API_BASE_URL}/hotels/room-categories/${encodeURIComponent(roomId)}`,
      'Hotel room detail',
      { cache: 'no-store', allow404: true },
    );
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }
    console.error('[hotels/rooms/edit] room detail unavailable', error);
    return null;
  }
}

type EditRoomPageProps = {
  params: Promise<{ id: string; roomId: string }>;
};

export default async function EditRoomTypePage({ params }: EditRoomPageProps) {
  const { id: hotelId, roomId } = await params;
  const room = await getRoom(roomId);

  if (!room || room.hotelId !== hotelId) {
    notFound();
  }

  const updateAction = updateRoomType.bind(null, hotelId, roomId);

  return (
    <main className="page">
      <section className="panel workspace-panel workspace-panel-wide">
        <header style={{ marginBottom: '1.5rem' }}>
          <p className="eyebrow">Hotels Engine — Edit room type</p>
          <h1 className="section-title">{room.name || '(unnamed)'}</h1>
          <p className="copy section-copy">
            {room.hotel?.name || 'Hotel'} · {room.counts.rates} linked rate
            {room.counts.rates === 1 ? '' : 's'} · {room.counts.quoteItems} quote item
            {room.counts.quoteItems === 1 ? '' : 's'}
          </p>
          <p className="table-subcopy" style={{ marginTop: '0.5rem' }}>
            <Link href={`/hotels/${hotelId}/rooms`} prefetch={false}>
              ← Back to room types
            </Link>
          </p>
        </header>

        <section className="detail-card">
          <h2 className="section-title" style={{ fontSize: '1.05rem', marginBottom: '0.6rem' }}>
            Edit details
          </h2>
          <form action={updateAction} className="entity-form compact-form">
            <div className="form-row form-row-4">
              <label>
                Name
                <input
                  type="text"
                  name="name"
                  defaultValue={room.name || ''}
                  required
                  maxLength={120}
                />
              </label>
              <label>
                Code
                <input
                  type="text"
                  name="code"
                  defaultValue={room.code || ''}
                  maxLength={32}
                />
              </label>
              <label>
                Description
                <input
                  type="text"
                  name="description"
                  defaultValue={room.description || ''}
                  maxLength={240}
                />
              </label>
              <label>
                Status
                <select name="isActive" defaultValue={room.isActive ? 'active' : 'inactive'}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </label>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              <button type="submit" className="primary-button">
                Save changes
              </button>
              <Link
                href={`/hotels/${hotelId}/rooms`}
                prefetch={false}
                className="compact-button"
              >
                Cancel
              </Link>
            </div>
          </form>
        </section>

        {room.counts.rates > 0 || room.counts.quoteItems > 0 ? (
          <p className="table-subcopy" style={{ marginTop: '1rem', color: '#b45309' }}>
            ⚠ This room type is referenced by {room.counts.rates} rate
            {room.counts.rates === 1 ? '' : 's'} and {room.counts.quoteItems} quote item
            {room.counts.quoteItems === 1 ? '' : 's'}. Renaming is safe; deletion is
            blocked.
          </p>
        ) : null}
      </section>
    </main>
  );
}
