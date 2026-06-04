import Link from 'next/link';
import { notFound } from 'next/navigation';
import { adminPageFetchJson, isNextRedirectError } from '../../lib/admin-server';
import { HotelPreferenceRankEditor } from './HotelPreferenceRankEditor';

// Hotels Engine — Phase 1 PR #145.
//
// Hotel detail page. Server-rendered. Shows hotel master data + linked
// room types + linked contracts summary. No client components — read-
// only view in this PR. Edit + CRUD actions get their own pages or
// client islands in subsequent PRs:
//
//   /hotels/[id]/edit               — edit master data (PR #146)
//   /hotels/[id]/rooms              — manage room types (PR #146/#147)
//   /hotels/[id]/contracts/new      — contract wizard (PR #148-#150)
//   /hotels/[id]/allotments         — inventory calendar (PR #151)

export const dynamic = 'force-dynamic';

const API_BASE_URL = '/api';

type HotelDetail = {
  id: string;
  name: string;
  city: string;
  category: string;
  supplierId: string;
  supplierName: string | null;
  preferenceRank: number | null;
  cityRecord: { id: string; name: string } | null;
  hotelCategory: { id: string; name: string } | null;
  factSheet: {
    shortDescription: string | null;
    checkInTime: string | null;
    checkOutTime: string | null;
  } | null;
  roomCategories: Array<{
    id: string;
    name: string;
    code: string | null;
    isActive: boolean;
    _count: { hotelRates: number; quoteItems: number };
  }>;
  _count: {
    contracts: number;
    roomCategories: number;
    quoteItems: number;
  };
};

async function getHotel(id: string): Promise<HotelDetail | null> {
  try {
    return await adminPageFetchJson<HotelDetail>(
      `${API_BASE_URL}/hotels/${encodeURIComponent(id)}`,
      'Hotel detail',
      { cache: 'no-store', allow404: true },
    );
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }
    console.error('[hotels/[id]] hotel detail unavailable', error);
    return null;
  }
}

type HotelDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function HotelDetailPage({ params }: HotelDetailPageProps) {
  const { id } = await params;
  const hotel = await getHotel(id);

  if (!hotel) {
    notFound();
  }

  const supplierLabel = hotel.supplierName || hotel.supplierId || '—';
  const cityLabel = hotel.cityRecord?.name || hotel.city || '—';
  const categoryLabel = hotel.hotelCategory?.name || hotel.category || '—';
  const activeRoomTypes = hotel.roomCategories.filter((r) => r.isActive).length;
  const totalRoomTypes = hotel.roomCategories.length;

  return (
    <main className="page">
      <section className="panel workspace-panel workspace-panel-wide">
        <header style={{ marginBottom: '1.5rem' }}>
          <p className="eyebrow">Hotels Engine — Hotel detail</p>
          <h1 className="section-title">{hotel.name}</h1>
          <p className="copy section-copy">
            {categoryLabel} in {cityLabel}. {totalRoomTypes} room type
            {totalRoomTypes === 1 ? '' : 's'} ({activeRoomTypes} active),{' '}
            {hotel._count.contracts} contract{hotel._count.contracts === 1 ? '' : 's'}.
          </p>
          <p className="table-subcopy" style={{ marginTop: '0.5rem' }}>
            <Link href="/hotels" prefetch={false}>
              ← Back to hotels
            </Link>
          </p>
        </header>

        {/* Action row — placeholders for future PRs */}
        <nav
          aria-label="Hotel actions"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.5rem',
            marginBottom: '1.5rem',
          }}
        >
          <ActionLink href={`/hotels/${hotel.id}/edit`}>
            Edit hotel
          </ActionLink>
          <ActionLink href={`/hotels/${hotel.id}/rooms`}>
            Manage room types
          </ActionLink>
          <ActionLink href={`/hotels/${hotel.id}/contracts`}>
            Contracts ({hotel._count.contracts})
          </ActionLink>
          <ActionLink href={`/hotels/${hotel.id}/allotments`} disabled>
            Allotments
          </ActionLink>
          <ActionLink href={`/admin/hotel-engine-health`}>
            Engine health
          </ActionLink>
        </nav>

        {/* Master data card */}
        <section
          data-testid="hotel-master-data"
          className="detail-card"
          style={{ marginBottom: '1.5rem' }}
        >
          <h2 className="section-title" style={{ fontSize: '1.05rem', marginBottom: '0.6rem' }}>
            Master data
          </h2>
          <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: '1rem', rowGap: '0.4rem', margin: 0 }}>
            <Field label="Name">{hotel.name || '—'}</Field>
            <Field label="City">{cityLabel}</Field>
            <Field label="Category">{categoryLabel}</Field>
            <Field label="Supplier">{supplierLabel}</Field>
            <Field label="Guided rank">{hotel.preferenceRank === null ? 'Unranked' : `Preferred (${hotel.preferenceRank})`}</Field>
            {hotel.factSheet?.shortDescription ? (
              <Field label="Description">{hotel.factSheet.shortDescription}</Field>
            ) : null}
            {hotel.factSheet?.checkInTime ? (
              <Field label="Check-in">{hotel.factSheet.checkInTime}</Field>
            ) : null}
            {hotel.factSheet?.checkOutTime ? (
              <Field label="Check-out">{hotel.factSheet.checkOutTime}</Field>
            ) : null}
          </dl>
        </section>

        {/* Preferred Hotel Ranking — client island */}
        <HotelPreferenceRankEditor hotelId={hotel.id} initialRank={hotel.preferenceRank} />

        {/* Room types */}
        <section data-testid="hotel-room-types" style={{ marginBottom: '1.5rem' }}>
          <h2 className="section-title" style={{ fontSize: '1.05rem', marginBottom: '0.6rem' }}>
            Room types ({totalRoomTypes})
          </h2>
          {totalRoomTypes === 0 ? (
            <p className="table-subcopy">
              No room types defined yet. Use "Manage room types" to add your first.
            </p>
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
                  </tr>
                </thead>
                <tbody>
                  {hotel.roomCategories.map((room) => (
                    <tr key={room.id}>
                      <td>
                        <strong>{room.name || '(unnamed)'}</strong>
                      </td>
                      <td>{room.code || '—'}</td>
                      <td>
                        <span
                          style={{
                            color: room.isActive ? '#15803d' : 'var(--ds-color-text-faint, #94A3B8)',
                            fontWeight: 600,
                            fontSize: '0.78rem',
                          }}
                        >
                          {room.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="numeric-cell">{room._count?.hotelRates || 0}</td>
                      <td className="numeric-cell">{room._count?.quoteItems || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Contracts summary */}
        <section data-testid="hotel-contracts">
          <h2 className="section-title" style={{ fontSize: '1.05rem', marginBottom: '0.6rem' }}>
            Contracts ({hotel._count.contracts})
          </h2>
          {hotel._count.contracts === 0 ? (
            <p className="table-subcopy">
              No contracts yet for this hotel.{' '}
              <Link href={`/hotels/${hotel.id}/contracts`} prefetch={false}>
                Create the first contract →
              </Link>
            </p>
          ) : (
            <p className="table-subcopy">
              {hotel._count.contracts} contract{hotel._count.contracts === 1 ? '' : 's'} on file.{' '}
              <Link href={`/hotels/${hotel.id}/contracts`} prefetch={false}>
                Open contracts →
              </Link>
            </p>
          )}
        </section>

        <p
          className="table-subcopy"
          style={{ marginTop: '1.5rem', color: 'var(--ds-color-text-faint, #94A3B8)', fontSize: '0.75rem' }}
        >
          /hotels/{hotel.id} — pure server component, no client JS. Action buttons are
          placeholders until their pages ship.
        </p>
      </section>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt style={{ color: 'var(--ds-color-text-muted, #475569)', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>{label}</dt>
      <dd style={{ margin: 0, fontWeight: 500 }}>{children}</dd>
    </>
  );
}

function ActionLink({
  href,
  disabled,
  children,
}: {
  href: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  if (disabled) {
    return (
      <span
        className="compact-button"
        style={{ opacity: 0.5, cursor: 'not-allowed' }}
        title="Coming in a subsequent PR"
        data-disabled="true"
      >
        {children}
      </span>
    );
  }
  return (
    <Link href={href} prefetch={false} className="compact-button">
      {children}
    </Link>
  );
}
