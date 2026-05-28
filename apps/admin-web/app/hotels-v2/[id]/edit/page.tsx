import Link from 'next/link';
import { notFound } from 'next/navigation';
import { adminPageFetchJson, isNextRedirectError } from '../../../lib/admin-server';
import { updateHotel } from './actions';

// Hotels Engine v2 — edit hotel master data.
//
// Server-rendered form pre-filled from the existing hotel record.
// Submits to the updateHotel Server Action which PATCHes the master
// row AND the fact-sheet row, then redirects back to the hotel
// detail. No client JS.

export const dynamic = 'force-dynamic';

const API_BASE_URL = '/api';

type HotelDetail = {
  id: string;
  name: string;
  city: string;
  category: string;
  supplierId: string;
  supplierName: string | null;
  factSheet: {
    shortDescription: string | null;
    checkInTime: string | null;
    checkOutTime: string | null;
  } | null;
};

async function getHotel(id: string): Promise<HotelDetail | null> {
  try {
    return await adminPageFetchJson<HotelDetail>(
      `${API_BASE_URL}/hotels/${encodeURIComponent(id)}`,
      'Hotel v2 edit form',
      { cache: 'no-store', allow404: true },
    );
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }
    console.error('[hotels-v2/edit] hotel detail unavailable', error);
    return null;
  }
}

type EditHotelPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditHotelPage({ params }: EditHotelPageProps) {
  const { id: hotelId } = await params;
  const hotel = await getHotel(hotelId);

  if (!hotel) {
    notFound();
  }

  const updateAction = updateHotel.bind(null, hotelId);

  return (
    <main className="page">
      <section className="panel workspace-panel workspace-panel-wide">
        <header style={{ marginBottom: '1.5rem' }}>
          <p className="eyebrow">Hotels Engine v2 — Edit hotel</p>
          <h1 className="section-title">{hotel.name}</h1>
          <p className="copy section-copy">
            Update master data + fact sheet for this hotel. Changes apply immediately
            and propagate to the hotels list, the directory summary, and any quote / booking
            that references this hotel by id.
          </p>
          <p className="table-subcopy" style={{ marginTop: '0.5rem' }}>
            <Link href={`/hotels-v2/${hotelId}`} prefetch={false}>
              ← Back to {hotel.name}
            </Link>
          </p>
        </header>

        <form action={updateAction}>
          {/* Master data */}
          <section
            className="detail-card"
            style={{ marginBottom: '1.5rem' }}
            data-testid="hotel-v2-edit-master"
          >
            <h2 className="section-title" style={{ fontSize: '1.05rem', marginBottom: '0.6rem' }}>
              Master data
            </h2>
            <div className="entity-form compact-form">
              <div className="form-row form-row-4">
                <label>
                  Name
                  <input
                    type="text"
                    name="name"
                    defaultValue={hotel.name || ''}
                    required
                    maxLength={200}
                  />
                </label>
                <label>
                  City
                  <input
                    type="text"
                    name="city"
                    defaultValue={hotel.city || ''}
                    placeholder="Amman"
                    maxLength={120}
                  />
                </label>
                <label>
                  Category
                  <input
                    type="text"
                    name="category"
                    defaultValue={hotel.category || ''}
                    placeholder="5 Star / 4 Star / Desert Camp / etc."
                    maxLength={80}
                  />
                </label>
                <label>
                  Supplier ID
                  <input
                    type="text"
                    name="supplierId"
                    defaultValue={hotel.supplierId || ''}
                    placeholder="Supplier identifier"
                    maxLength={120}
                  />
                </label>
              </div>
              {hotel.supplierName ? (
                <p className="table-subcopy" style={{ marginTop: '0.4rem', color: '#475467' }}>
                  Currently resolves to: <strong>{hotel.supplierName}</strong>
                </p>
              ) : (
                <p className="table-subcopy" style={{ marginTop: '0.4rem', color: '#b45309' }}>
                  ⚠ No supplier name resolved — the supplierId may be invalid.
                </p>
              )}
            </div>
          </section>

          {/* Fact sheet */}
          <section
            className="detail-card"
            style={{ marginBottom: '1.5rem' }}
            data-testid="hotel-v2-edit-factsheet"
          >
            <h2 className="section-title" style={{ fontSize: '1.05rem', marginBottom: '0.6rem' }}>
              Fact sheet
            </h2>
            <div className="entity-form compact-form">
              <div className="form-row form-row-1">
                <label>
                  Short description
                  <textarea
                    name="shortDescription"
                    defaultValue={hotel.factSheet?.shortDescription || ''}
                    placeholder="Sales-friendly summary used in proposals and quote previews"
                    maxLength={600}
                    rows={3}
                  />
                </label>
              </div>
              <div className="form-row form-row-2">
                <label>
                  Check-in time
                  <input
                    type="text"
                    name="checkInTime"
                    defaultValue={hotel.factSheet?.checkInTime || ''}
                    placeholder="15:00"
                    maxLength={32}
                  />
                </label>
                <label>
                  Check-out time
                  <input
                    type="text"
                    name="checkOutTime"
                    defaultValue={hotel.factSheet?.checkOutTime || ''}
                    placeholder="12:00"
                    maxLength={32}
                  />
                </label>
              </div>
              <p className="table-subcopy" style={{ marginTop: '0.4rem', color: '#94a3b8', fontSize: '0.75rem' }}>
                Leave a field blank to clear it. Times are free-text — use 24-hour or 12-hour
                format consistent with how your operations team writes them.
              </p>
            </div>
          </section>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="submit" className="primary-button">
              Save changes
            </button>
            <Link href={`/hotels-v2/${hotelId}`} prefetch={false} className="compact-button">
              Cancel
            </Link>
          </div>
        </form>
      </section>
    </main>
  );
}
