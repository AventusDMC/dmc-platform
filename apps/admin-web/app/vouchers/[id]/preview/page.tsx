import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ADMIN_API_BASE_URL, adminPageFetchJson } from '../../../lib/admin-server';

type HotelVoucherPreview = {
  id: string;
  kind: 'HOTEL';
  status: string;
  booking: {
    id: string;
    bookingRef: string;
    quoteId: string;
    title: string;
    pax: number;
  };
  service: {
    id: string;
    sourceQuoteItemId: string | null;
    description: string;
    confirmationNumber: string | null;
    supplierReference: string | null;
  };
  itineraryDay: {
    id: string | null;
    dayNumber: number | null;
    title: string | null;
    date: string | null;
    notes: string | null;
  };
  hotel: {
    name: string;
    city: string;
    supplierName: string | null;
  };
  stay: {
    checkIn: string | null;
    checkOut: string | null;
    nights: number;
  };
  roomingSummary: string;
  rooms: Array<{
    id: string;
    label: string;
    roomType: string | null;
    occupancy: string;
    notes: string | null;
    passengers: Array<{
      id: string;
      name: string;
    }>;
  }>;
  passengers: Array<{
    id: string;
    name: string;
  }>;
  occupancy: string;
  mealPlan: string;
  roomCategory: string;
  operationalNotes: string[];
  supplierNotes: string[];
  source: {
    quoteItemId: string | null;
    itineraryDayId: string | null;
    generatedFrom: 'live-operational-data';
  };
};

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

async function getPreview(id: string) {
  return adminPageFetchJson<HotelVoucherPreview | null>(`${ADMIN_API_BASE_URL}/vouchers/${id}/preview`, 'Hotel voucher preview', {
    cache: 'no-store',
    allow404: true,
  });
}

function formatDate(value: string | null) {
  if (!value) {
    return 'Pending';
  }

  return value;
}

function Detail({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value || 'Pending'}</strong>
    </div>
  );
}

function NotesList({ notes, emptyLabel }: { notes: string[]; emptyLabel: string }) {
  if (notes.length === 0) {
    return <p className="empty-state">{emptyLabel}</p>;
  }

  return (
    <div className="quote-client-exclusions">
      {notes.map((note) => (
        <p key={note} className="detail-copy">
          {note}
        </p>
      ))}
    </div>
  );
}

export default async function HotelVoucherPreviewPage({ params }: PageProps) {
  const { id } = await params;
  const preview = await getPreview(id);

  if (!preview) {
    notFound();
  }

  return (
    <main className="page">
      <section className="panel quote-preview-page">
        <header className="workspace-section-head">
          <div>
            <p className="eyebrow">Operational Hotel Voucher Preview</p>
            <h1>{preview.hotel.name}</h1>
            <p className="detail-copy">
              {preview.booking.bookingRef} / {preview.hotel.city || 'City pending'} / {preview.status}
            </p>
          </div>
          <div className="quote-status-actions">
            <Link href={`/bookings/${preview.booking.id}?tab=operations`} className="secondary-button">
              Booking
            </Link>
            <Link href={`/api/vouchers/${preview.id}/pdf`} className="secondary-button">
              PDF
            </Link>
          </div>
        </header>

        <section className="quote-client-summary-strip" aria-label="Hotel voucher summary">
          <article className="quote-client-summary-card quote-client-summary-card-wide">
            <span>Hotel</span>
            <strong>{preview.hotel.name}</strong>
          </article>
          <article className="quote-client-summary-card">
            <span>City</span>
            <strong>{preview.hotel.city || 'Pending'}</strong>
          </article>
          <article className="quote-client-summary-card">
            <span>Check-in</span>
            <strong>{formatDate(preview.stay.checkIn)}</strong>
          </article>
          <article className="quote-client-summary-card">
            <span>Check-out</span>
            <strong>{formatDate(preview.stay.checkOut)}</strong>
          </article>
          <article className="quote-client-summary-card">
            <span>Rooms</span>
            <strong>{preview.roomingSummary}</strong>
          </article>
        </section>

        <section className="quote-preview-grid">
          <article className="detail-card">
            <p className="eyebrow">Stay</p>
            <h2>Hotel stay details</h2>
            <div className="quote-preview-total-list">
              <Detail label="Room category" value={preview.roomCategory} />
              <Detail label="Occupancy" value={preview.occupancy} />
              <Detail label="Meal plan" value={preview.mealPlan} />
              <Detail label="Nights" value={preview.stay.nights} />
              <Detail label="Supplier" value={preview.hotel.supplierName} />
              <Detail label="Confirmation" value={preview.service.confirmationNumber || preview.service.supplierReference} />
            </div>
          </article>

          <article className="detail-card">
            <p className="eyebrow">Source Context</p>
            <h2>Live operational data</h2>
            <div className="quote-preview-total-list">
              <Detail label="Quote item" value={preview.source.quoteItemId} />
              <Detail label="Itinerary day" value={preview.itineraryDay.dayNumber ? `Day ${preview.itineraryDay.dayNumber}` : null} />
              <Detail label="Day title" value={preview.itineraryDay.title} />
              <Detail label="Day date" value={formatDate(preview.itineraryDay.date)} />
              <Detail label="Service" value={preview.service.description} />
              <Detail label="Pax" value={preview.booking.pax} />
            </div>
          </article>
        </section>

        <section className="detail-card">
          <p className="eyebrow">Rooming Summary</p>
          <h2>Rooms, occupancy, and guests</h2>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Room</th>
                  <th>Category</th>
                  <th>Occupancy</th>
                  <th>Passengers</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {preview.rooms.map((room) => (
                  <tr key={room.id}>
                    <td>{room.label}</td>
                    <td>{room.roomType || preview.roomCategory}</td>
                    <td>{room.occupancy}</td>
                    <td>{room.passengers.length > 0 ? room.passengers.map((passenger) => passenger.name).join(', ') : 'Passengers pending'}</td>
                    <td>{room.notes || 'No notes'}</td>
                  </tr>
                ))}
                {preview.rooms.length === 0 ? (
                  <tr>
                    <td colSpan={5}>Rooming is pending for this hotel voucher.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="quote-preview-grid">
          <article className="detail-card">
            <p className="eyebrow">Passengers</p>
            <h2>Passenger names</h2>
            {preview.passengers.length > 0 ? (
              <div className="quote-client-exclusions">
                {preview.passengers.map((passenger) => (
                  <p key={passenger.id} className="detail-copy">
                    {passenger.name}
                  </p>
                ))}
              </div>
            ) : (
              <p className="empty-state">Passenger names are pending.</p>
            )}
          </article>

          <article className="detail-card">
            <p className="eyebrow">Operational Notes</p>
            <h2>Internal notes</h2>
            <NotesList notes={preview.operationalNotes} emptyLabel="No operational notes are available." />
          </article>
        </section>

        <section className="detail-card">
          <p className="eyebrow">Supplier Notes</p>
          <h2>Supplier-facing context</h2>
          <NotesList notes={preview.supplierNotes} emptyLabel="No supplier notes are available." />
        </section>
      </section>
    </main>
  );
}
