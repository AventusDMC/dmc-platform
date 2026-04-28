import { notFound } from 'next/navigation';
import { getItineraryDayDisplay } from '../../../lib/itineraryDayDisplay';
import { formatNightCountLabel } from '../../../lib/formatters';
import { getValidatedTripSummary } from '../../../lib/tripSummary';
import { BookingDocumentActions } from '../BookingDocumentActions';

import { ADMIN_API_BASE_URL, adminPageFetchJson } from '../../../lib/admin-server';

const API_BASE_URL = ADMIN_API_BASE_URL;
const ACTION_API_BASE_URL = '/api';

type BookingType = 'FIT' | 'GROUP' | 'SERIES';

type Company = {
  id: string;
  name: string;
};

type Contact = {
  id: string;
  title?: string | null;
  firstName: string;
  lastName: string;
};

type Itinerary = {
  id: string;
  dayNumber: number;
  title: string;
  description: string | null;
  images: {
    id: string;
    sortOrder: number;
    galleryImage: {
      id: string;
      title: string;
      imageUrl: string;
    };
  }[];
};

type QuoteItem = {
  id: string;
  itineraryId: string | null;
  quantity: number;
  pricingDescription: string | null;
  service: {
    id: string;
    name: string;
    category: string;
  };
  appliedVehicleRate: {
    id: string;
    routeName: string;
    vehicle: {
      name: string;
    };
    serviceType: {
      name: string;
    };
  } | null;
  hotel: {
    name: string;
  } | null;
  contract: {
    name: string;
  } | null;
  seasonName: string | null;
  roomCategory: {
    name: string;
  } | null;
  occupancyType: 'SGL' | 'DBL' | 'TPL' | null;
  mealPlan: 'BB' | 'HB' | 'FB' | null;
};

type QuoteSnapshot = {
  id: string;
  quoteNumber?: string | null;
  bookingType?: BookingType | null;
  title: string;
  description: string | null;
  adults: number;
  children: number;
  roomCount: number;
  nightCount: number;
  company: Company;
  contact: Contact;
  itineraries: Itinerary[];
  quoteItems: QuoteItem[];
};

type Booking = {
  id: string;
  bookingRef: string;
  bookingType: BookingType;
  adults: number;
  children: number;
  roomCount: number;
  nightCount: number;
  snapshotJson: QuoteSnapshot;
  clientSnapshotJson: Company;
  contactSnapshotJson: Contact;
  passengers: Array<{
    id: string;
    firstName: string;
    lastName: string;
    title: string | null;
    isLead: boolean;
  }>;
  roomingEntries: Array<{
    id: string;
    roomType: string | null;
    occupancy: 'single' | 'double' | 'triple' | 'quad' | 'unknown';
    sortOrder: number;
    assignments: Array<{
      id: string;
      bookingPassenger: {
        id: string;
        firstName: string;
        lastName: string;
        title: string | null;
      };
    }>;
  }>;
  services: Array<{
    id: string;
    description: string;
    supplierName: string | null;
    confirmationStatus: 'pending' | 'requested' | 'confirmed';
    confirmationNumber: string | null;
  }>;
};

type BookingVoucherPageProps = {
  params: Promise<{
    id: string;
  }>;
};

async function getBooking(id: string): Promise<Booking | null> {
  return adminPageFetchJson<Booking | null>(`${API_BASE_URL}/bookings/${id}`, 'Booking voucher', {
    cache: 'no-store',
    allow404: true,
  });
}

function formatConfirmationStatus(status: 'pending' | 'requested' | 'confirmed') {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatPassengerName(passenger: { title?: string | null; firstName: string; lastName: string }) {
  return [passenger.title, passenger.firstName, passenger.lastName].filter(Boolean).join(' ').trim();
}

function formatRoomOccupancy(value: 'single' | 'double' | 'triple' | 'quad' | 'unknown') {
  if (value === 'unknown') {
    return 'Pending';
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}

function getItemSummary(item: QuoteItem) {
  if (item.hotel && item.contract && item.seasonName && item.roomCategory && item.occupancyType && item.mealPlan) {
    return `${item.hotel.name} | ${item.contract.name} | ${item.seasonName} | ${item.roomCategory.name} | ${item.occupancyType} / ${item.mealPlan}`;
  }

  if (item.appliedVehicleRate) {
    return `${item.appliedVehicleRate.routeName} | ${item.appliedVehicleRate.vehicle.name} | ${item.appliedVehicleRate.serviceType.name}`;
  }

  return item.pricingDescription || `Qty ${item.quantity}`;
}

function formatServiceTypeIcon(service: Booking['services'][number]) {
  const haystack = [service.description, service.supplierName].filter(Boolean).join(' ').toLowerCase();

  if (haystack.includes('hotel') || haystack.includes('room') || haystack.includes('stay')) {
    return 'Stay';
  }

  if (haystack.includes('transfer') || haystack.includes('vehicle') || haystack.includes('transport')) {
    return 'Ride';
  }

  if (haystack.includes('tour') || haystack.includes('activity') || haystack.includes('visit')) {
    return 'Explore';
  }

  return 'Plan';
}

function getTripWindowLabel(days: Itinerary[], nightCount: number) {
  if (days.length === 0) {
    return `${formatNightCountLabel(nightCount)} stay`;
  }

  return `${days.length} day${days.length === 1 ? '' : 's'} / ${formatNightCountLabel(nightCount)}`;
}

function renderDayServices(items: QuoteItem[], emptyLabel: string) {
  if (items.length === 0) {
    return <p className="empty-state">{emptyLabel}</p>;
  }

  return (
    <div className="quote-preview-service-list quote-client-service-grid">
      {items.map((item) => (
        <article key={item.id} className="quote-client-service-card voucher-service-card" aria-label={`Itinerary service: ${item.service.name}`}>
          <div className="quote-client-service-icon voucher-service-icon" aria-hidden="true">
            <span>{item.service.category || 'Plan'}</span>
          </div>
          <div className="quote-client-service-body">
            <div className="quote-client-service-head">
              <div>
                <p className="quote-client-service-type">{item.service.category || 'Planned service'}</p>
                <strong>{item.service.name}</strong>
              </div>
              <span className="quote-client-service-badge">Included</span>
            </div>
            <p className="detail-copy quote-client-service-summary">{getItemSummary(item)}</p>
          </div>
        </article>
      ))}
    </div>
  );
}

function VoucherHero({
  booking,
  leadGuestName,
  tripSummary,
  destinationSummary,
  tripWindowLabel,
}: {
  booking: Booking;
  leadGuestName: string;
  tripSummary: string;
  destinationSummary: string;
  tripWindowLabel: string;
}) {
  return (
    <header className="quote-preview-hero quote-client-hero quote-client-editorial-hero voucher-editorial-hero">
      <div className="quote-client-brand-block quote-client-editorial-copy">
        <div className="quote-client-brand-mark quote-client-editorial-mark voucher-editorial-mark" aria-hidden="true">
          <span>DMC</span>
        </div>
        <div className="quote-client-hero-stack">
          <p className="eyebrow">Booking Voucher</p>
          <p className="quote-client-kicker">{destinationSummary}</p>
          <h1 className="section-title quote-title quote-client-display-title">{booking.bookingRef}</h1>
          <p className="detail-copy quote-client-hero-description">{tripSummary}</p>
          <div className="quote-client-hero-meta">
            <span>{leadGuestName}</span>
            <span>{tripWindowLabel}</span>
            <span>{booking.bookingType}</span>
          </div>
        </div>
      </div>
      <div className="quote-preview-meta quote-client-meta quote-client-editorial-aside">
        <div className="quote-client-price-card voucher-identity-card">
          <p className="detail-copy">Voucher Identity</p>
          <strong>{booking.bookingRef}</strong>
          <span>{booking.clientSnapshotJson.name}</span>
        </div>
        <div className="quote-client-price-grid">
          <div>
            <span>Lead guest</span>
            <strong>{leadGuestName}</strong>
          </div>
          <div>
            <span>Travel party</span>
            <strong>{booking.adults + booking.children} guests</strong>
          </div>
          <div>
            <span>Rooms</span>
            <strong>{booking.roomCount || booking.snapshotJson.roomCount || 0}</strong>
          </div>
        </div>
      </div>
    </header>
  );
}

function VoucherFactsStrip({
  booking,
  totalPax,
  tripWindowLabel,
  primaryReference,
}: {
  booking: Booking;
  totalPax: number;
  tripWindowLabel: string;
  primaryReference: string;
}) {
  return (
    <section className="quote-client-summary-strip" aria-label="Voucher summary">
      <article className="quote-client-summary-card">
        <span>Booking type</span>
        <strong>{booking.bookingType}</strong>
      </article>
      <article className="quote-client-summary-card">
        <span>Guests</span>
        <strong>{totalPax} pax</strong>
      </article>
      <article className="quote-client-summary-card">
        <span>Room count</span>
        <strong>{booking.roomCount || booking.snapshotJson.roomCount || 0}</strong>
      </article>
      <article className="quote-client-summary-card">
        <span>Support</span>
        <strong>{booking.clientSnapshotJson.name}</strong>
      </article>
      <article className="quote-client-summary-card quote-client-summary-card-wide">
        <span>Primary reference</span>
        <strong>{primaryReference || `${tripWindowLabel} itinerary in place`}</strong>
      </article>
    </section>
  );
}

function VoucherServiceCard({ service }: { service: Booking['services'][number] }) {
  return (
    <article className="quote-client-service-card voucher-service-card" aria-label={`Voucher service: ${service.description}`}>
      <div className="quote-client-service-icon voucher-service-icon" aria-hidden="true">
        <span>{formatServiceTypeIcon(service)}</span>
      </div>
      <div className="quote-client-service-body">
        <div className="quote-client-service-head">
          <div>
            <p className="quote-client-service-type">Voucher service</p>
            <strong>{service.description}</strong>
          </div>
          <span className="quote-client-service-badge">{formatConfirmationStatus(service.confirmationStatus)}</span>
        </div>
        <div className="quote-client-service-meta">
          <span>Supplier: {service.supplierName || 'Pending confirmation'}</span>
          <span>Reference: {service.confirmationNumber || 'Pending'}</span>
        </div>
        <p className="detail-copy quote-client-service-summary">
          {service.confirmationNumber
            ? `Use confirmation ${service.confirmationNumber} when coordinating this service.`
            : 'Final supplier reference will be confirmed before operation.'}
        </p>
      </div>
    </article>
  );
}

export default async function BookingVoucherPage({ params }: BookingVoucherPageProps) {
  const { id } = await params;
  const booking = await getBooking(id);

  if (!booking) {
    notFound();
  }

  const snapshot = booking.snapshotJson;

  if (!snapshot) {
    notFound();
  }

  const totalPax = snapshot.adults + snapshot.children;
  const sortedDays = [...snapshot.itineraries].sort((a, b) => a.dayNumber - b.dayNumber);
  const leadPassenger = booking.passengers.find((passenger) => passenger.isLead) || null;
  const leadGuestName = leadPassenger
    ? formatPassengerName(leadPassenger)
    : `${booking.contactSnapshotJson.firstName} ${booking.contactSnapshotJson.lastName}`;
  const tripSummary = getValidatedTripSummary({
    quoteTitle: snapshot.title,
    quoteDescription: snapshot.description,
    dayTitles: sortedDays.map((day) => day.title),
    totalPax,
    nightCount: snapshot.nightCount,
  });
  const destinationSummary = sortedDays.length > 0 ? sortedDays.map((day) => getItineraryDayDisplay(day).city).filter(Boolean).join(' | ') : snapshot.title;
  const tripWindowLabel = getTripWindowLabel(sortedDays, snapshot.nightCount);
  const primaryReference = booking.services.find((service) => service.confirmationNumber)?.confirmationNumber || '';

  return (
    <main className="page">
      <section className="panel quote-preview-page voucher-editorial-page">
        <VoucherHero
          booking={booking}
          leadGuestName={leadGuestName}
          tripSummary={tripSummary}
          destinationSummary={destinationSummary}
          tripWindowLabel={tripWindowLabel}
        />

        <BookingDocumentActions
          apiBaseUrl={ACTION_API_BASE_URL}
          bookingId={booking.id}
          bookingRef={booking.bookingRef}
          documentLabel="Booking Voucher"
          documentType="voucher"
        />

        <VoucherFactsStrip
          booking={booking}
          totalPax={totalPax}
          tripWindowLabel={tripWindowLabel}
          primaryReference={primaryReference}
        />

        <section className="quote-preview-grid">
          <article className="detail-card quote-client-info-card voucher-info-card">
            <p className="eyebrow">Guest And Trip Summary</p>
            <h2 className="section-title voucher-section-title">Lead traveler and trip details</h2>
            <div className="quote-preview-total-list">
              <div>
                <span>Lead guest</span>
                <strong>{leadGuestName}</strong>
              </div>
              <div>
                <span>Booking type</span>
                <strong>{booking.bookingType}</strong>
              </div>
              <div>
                <span>Client</span>
                <strong>{booking.clientSnapshotJson.name}</strong>
              </div>
              <div>
                <span>Guests</span>
                <strong>{totalPax} pax</strong>
              </div>
              <div>
                <span>Rooms</span>
                <strong>{snapshot.roomCount}</strong>
              </div>
              <div>
                <span>Passenger records</span>
                <strong>{booking.passengers.length}</strong>
              </div>
              <div>
                <span>Duration</span>
                <strong>{formatNightCountLabel(snapshot.nightCount)}</strong>
              </div>
            </div>
            <p className="detail-copy">{tripSummary}</p>
          </article>

          <article className="detail-card quote-client-info-card voucher-info-card">
            <p className="eyebrow">Rooming Snapshot</p>
            <h2 className="section-title voucher-section-title">Rooms and assignments</h2>
            {booking.roomingEntries.length === 0 ? (
              <p className="empty-state">No rooming entries are available yet.</p>
            ) : (
              <div className="quote-preview-service-list quote-client-service-grid">
                {booking.roomingEntries.map((entry) => (
                  <article key={entry.id} className="quote-client-service-card voucher-rooming-card" aria-label={`Rooming: ${entry.roomType || `Room ${entry.sortOrder}`}`}>
                    <div className="quote-client-service-icon voucher-service-icon" aria-hidden="true">
                      <span>Room</span>
                    </div>
                    <div className="quote-client-service-body">
                      <div className="quote-client-service-head">
                        <div>
                          <p className="quote-client-service-type">Rooming</p>
                          <strong>{entry.roomType || `Room ${entry.sortOrder}`}</strong>
                        </div>
                        <span className="quote-client-service-badge">{formatRoomOccupancy(entry.occupancy)}</span>
                      </div>
                      <div className="quote-client-service-meta">
                        <span>Assignments: {entry.assignments.length}</span>
                      </div>
                      <p className="detail-copy quote-client-service-summary">
                        {entry.assignments.length > 0
                          ? entry.assignments.map((assignment) => formatPassengerName(assignment.bookingPassenger)).join(', ')
                          : 'Passengers to be assigned'}
                      </p>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </article>

          <article className="detail-card quote-client-info-card voucher-info-card">
            <p className="eyebrow">Support Information</p>
            <h2 className="section-title voucher-section-title">Operational support</h2>
            <div className="quote-preview-total-list">
              <div>
                <span>Client</span>
                <strong>{booking.clientSnapshotJson.name}</strong>
              </div>
              <div>
                <span>Booking reference</span>
                <strong>{booking.bookingRef}</strong>
              </div>
              <div>
                <span>Primary service reference</span>
                <strong>{primaryReference || 'Pending confirmation'}</strong>
              </div>
              <div>
                <span>Important note</span>
                <strong>Carry this voucher and present confirmation references when requested.</strong>
              </div>
            </div>
          </article>
        </section>

        <section className="detail-card quote-client-itinerary-card voucher-services-section">
          <p className="eyebrow">Booking Services</p>
          <h2 className="section-title voucher-section-title">Service references and confirmations</h2>
          {booking.services.length === 0 ? (
            <p className="empty-state">No booking services available for this voucher.</p>
          ) : (
            <div className="quote-preview-service-list quote-client-service-grid">
              {booking.services.map((service) => (
                <VoucherServiceCard key={service.id} service={service} />
              ))}
            </div>
          )}
        </section>

        <section className="detail-card quote-client-info-card voucher-info-card">
          <p className="eyebrow">Important Instructions</p>
          <h2 className="section-title voucher-section-title">Before and during travel</h2>
          <div className="quote-client-exclusions">
            <p className="detail-copy">Keep this voucher accessible throughout the journey and share the booking reference when reconfirmation is requested.</p>
            <p className="detail-copy">Supplier names and references are listed above for check-in, transfer coordination, and service verification.</p>
            <p className="detail-copy">If any service detail appears pending, contact your operator before travel or present the booking reference on site.</p>
          </div>
        </section>

        <section className="detail-card quote-client-itinerary-card">
          <p className="eyebrow">Itinerary By Day</p>
          <h2 className="section-title voucher-section-title">Day-by-day operating view</h2>
          <div className="quote-preview-day-list quote-client-editorial-day-list">
            {sortedDays.length === 0 ? (
              <p className="empty-state">Detailed itinerary will be provided separately.</p>
            ) : (
              sortedDays.map((day) => {
                const dayItems = snapshot.quoteItems.filter((item) => item.itineraryId === day.id);
                const displayDay = getItineraryDayDisplay(day);

                return (
                  <article key={day.id} className="quote-preview-day-card quote-client-editorial-day-card voucher-day-card">
                    <div className="quote-client-day-rail" aria-hidden="true">
                      <span className="quote-client-day-number">{String(day.dayNumber).padStart(2, '0')}</span>
                      <span className="quote-client-day-label">Day</span>
                    </div>
                    <div className="quote-client-day-content">
                      <div className="quote-preview-day-head quote-client-day-head quote-client-editorial-day-head">
                        <div>
                          <p className="quote-client-day-date">{displayDay.dayLabel}</p>
                          <h3 className="quote-client-day-title">{displayDay.title}</h3>
                          <p className="detail-copy quote-client-day-subtitle">{displayDay.city}</p>
                          <p className="quote-client-day-description">{displayDay.description}</p>
                        </div>
                      </div>
                      {renderDayServices(dayItems, 'No services assigned to this day.')}
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </section>
      </section>
    </main>
  );
}
