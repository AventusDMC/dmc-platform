import Link from 'next/link';
import { adminPageFetchJson } from '../../../../../lib/admin-server';

type QuoteVoucherPreviewPageProps = {
  params: Promise<{ id: string; itemId: string }>;
};

type VoucherPreview = {
  kind: 'HOTEL' | 'TRANSPORT' | 'SERVICE';
  status: 'PREVIEW';
  voucher: {
    type: string;
    quoteItemId: string;
    quoteDayId: string | null;
    operationalStatus: string;
    remarks: string[];
  };
  quote: {
    id: string;
    quoteNumber: string | null;
    title: string;
    pax: number;
  };
  itineraryDay: {
    dayNumber: number | null;
    title: string | null;
    notes: string | null;
  };
  hotel?: {
    name: string;
    city: string | null;
    roomingSummary: string;
    mealPlan: string;
    roomCategory: string;
    occupancy: string;
    checkIn: string | null;
    checkOut: string | null;
    pax: number;
    passengers: Array<{ id: string; name: string }>;
    rooms: Array<{
      id: string;
      label: string;
      roomType: string | null;
      occupancy: string;
      notes: string | null;
      passengers: Array<{ id: string; name: string }>;
    }>;
  };
  transport?: {
    route: string;
    serviceType: string;
    pickup: string | null;
    dropoff: string | null;
    vehicle: string | null;
    pax: number;
  };
  service?: {
    name: string;
    category: string | null;
    serviceType: string | null;
    operationalNotes: string[];
    pax: number;
  };
  source: {
    quoteItemId: string;
    itineraryDayId: string | null;
    packageTemplateId: string | null;
    packageTemplateDayId: string | null;
    packageTemplateComponentId: string | null;
    generatedFrom: 'live-operational-quote-data';
  };
};

function ValueCard({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value || 'Pending'}</strong>
    </div>
  );
}

function NotesList({ notes, emptyLabel }: { notes: string[]; emptyLabel: string }) {
  if (!notes.length) {
    return <p className="empty-state">{emptyLabel}</p>;
  }

  return (
    <ul className="check-list">
      {notes.map((note) => (
        <li key={note}>{note}</li>
      ))}
    </ul>
  );
}

async function getVoucherPreview(itemId: string) {
  return adminPageFetchJson<VoucherPreview>(`/api/vouchers/quote-items/${itemId}/preview`, 'Quote voucher preview', {
    cache: 'no-store',
  });
}

export default async function QuoteVoucherPreviewPage({ params }: QuoteVoucherPreviewPageProps) {
  const { id, itemId } = await params;
  const preview = await getVoucherPreview(itemId);

  return (
    <main className="workspace-page">
      <section className="workspace-section">
        <div className="section-header">
          <span>
            <span className="eyebrow">Operational voucher preview</span>
            <h1>{preview.kind} Voucher</h1>
            <p>
              {preview.quote.quoteNumber || preview.quote.id} · {preview.quote.title}
            </p>
          </span>
          <Link href={`/quotes/${id}?tab=itinerary`} className="secondary-button">
            Back to quote
          </Link>
        </div>

        <div className="summary-strip">
          <ValueCard label="Status" value={preview.voucher.operationalStatus} />
          <ValueCard label="Day" value={preview.itineraryDay.dayNumber ? `Day ${preview.itineraryDay.dayNumber}` : null} />
          <ValueCard label="Title" value={preview.itineraryDay.title} />
          <ValueCard label="Pax" value={preview.quote.pax} />
        </div>
      </section>

      {preview.hotel ? (
        <section className="detail-card">
          <div className="section-header">
            <span>
              <span className="eyebrow">Hotel voucher</span>
              <h2>{preview.hotel.name}</h2>
              <p>{preview.hotel.city || 'City pending'}</p>
            </span>
          </div>
          <div className="summary-strip">
            <ValueCard label="Check-in" value={preview.hotel.checkIn} />
            <ValueCard label="Check-out" value={preview.hotel.checkOut} />
            <ValueCard label="Rooming" value={preview.hotel.roomingSummary} />
            <ValueCard label="Meal plan" value={preview.hotel.mealPlan} />
            <ValueCard label="Room category" value={preview.hotel.roomCategory} />
            <ValueCard label="Occupancy" value={preview.hotel.occupancy} />
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Room</th>
                  <th>Type</th>
                  <th>Occupancy</th>
                  <th>Passengers</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {preview.hotel.rooms.length ? (
                  preview.hotel.rooms.map((room: NonNullable<VoucherPreview['hotel']>['rooms'][number]) => (
                    <tr key={room.id}>
                      <td>{room.label}</td>
                      <td>{room.roomType || 'Pending'}</td>
                      <td>{room.occupancy}</td>
                      <td>{room.passengers.map((passenger: { id: string; name: string }) => passenger.name).join(', ') || 'Unassigned'}</td>
                      <td>{room.notes || '-'}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5}>Rooming is pending for this hotel voucher.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {preview.transport ? (
        <section className="detail-card">
          <div className="section-header">
            <span>
              <span className="eyebrow">Transport voucher</span>
              <h2>{preview.transport.route}</h2>
              <p>{preview.transport.serviceType}</p>
            </span>
          </div>
          <div className="summary-strip">
            <ValueCard label="Pickup" value={preview.transport.pickup} />
            <ValueCard label="Dropoff / meeting" value={preview.transport.dropoff} />
            <ValueCard label="Vehicle" value={preview.transport.vehicle} />
            <ValueCard label="Pax" value={preview.transport.pax} />
          </div>
        </section>
      ) : null}

      {preview.service ? (
        <section className="detail-card">
          <div className="section-header">
            <span>
              <span className="eyebrow">Service voucher</span>
              <h2>{preview.service.name}</h2>
              <p>{preview.service.serviceType || preview.service.category || 'Operational service'}</p>
            </span>
          </div>
          <div className="summary-strip">
            <ValueCard label="Category" value={preview.service.category} />
            <ValueCard label="Service type" value={preview.service.serviceType} />
            <ValueCard label="Pax" value={preview.service.pax} />
          </div>
          <NotesList notes={preview.service.operationalNotes} emptyLabel="No operational service notes available." />
        </section>
      ) : null}

      <section className="detail-card">
        <div className="section-header">
          <span>
            <span className="eyebrow">Voucher foundation</span>
            <h2>Live quote source</h2>
          </span>
        </div>
        <div className="summary-strip">
          <ValueCard label="Quote item" value={preview.source.quoteItemId} />
          <ValueCard label="Quote day" value={preview.source.itineraryDayId} />
          <ValueCard label="Package template" value={preview.source.packageTemplateId} />
          <ValueCard label="Component" value={preview.source.packageTemplateComponentId} />
        </div>
        <NotesList notes={preview.voucher.remarks} emptyLabel="No operational remarks are available." />
      </section>
    </main>
  );
}
