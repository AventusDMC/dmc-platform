import { notFound } from 'next/navigation';
import { getItineraryDayDisplay } from '../../../lib/itineraryDayDisplay';
import { formatNightCountLabel } from '../../../lib/formatters';
import { getValidatedTripSummary } from '../../../lib/tripSummary';
import { adminPageFetchJson } from '../../../lib/admin-server';
import { VoucherDownloadButton } from './VoucherDownloadButton';

const API_BASE_URL = '/api';

type Company = {
  id: string;
  name: string;
};

type Contact = {
  id: string;
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
  adults: number;
  children: number;
  roomCount: number;
  nightCount: number;
  snapshotJson: QuoteSnapshot;
  contactSnapshotJson: Contact;
  services: Array<{
    id: string;
    description: string;
    confirmationStatus: 'pending' | 'requested' | 'confirmed';
    confirmationNumber: string | null;
  }>;
};

type PortalBookingPageProps = {
  params: Promise<{
    id: string;
  }>;
  searchParams?: Promise<{
    token?: string;
  }>;
};

async function getBooking(id: string, token: string): Promise<Booking | null> {
  return adminPageFetchJson<Booking | null>(`${API_BASE_URL}/bookings/${id}/portal?token=${encodeURIComponent(token)}`, 'Portal booking', {
    cache: 'no-store',
    allowAnonymous: true,
    allow404: true,
  });
}

type PortalServiceCategory = 'hotel' | 'transport' | 'activity' | 'guide' | 'meal' | 'other';

const PORTAL_SERVICE_CATEGORIES: PortalServiceCategory[] = ['hotel', 'transport', 'activity', 'guide', 'meal', 'other'];

const PORTAL_SERVICE_CATEGORY_LABELS: Record<PortalServiceCategory, string> = {
  hotel: 'Hotel',
  transport: 'Transport',
  activity: 'Activities',
  guide: 'Guide',
  meal: 'Meals',
  other: 'Other services',
};

function normalizePortalServiceCategory(value: string) {
  const normalized = value.trim().toLowerCase();

  if (!normalized) {
    return 'other' as const;
  }

  if (normalized.includes('hotel') || normalized.includes('accommodation') || normalized.includes('stay') || normalized.includes('room')) {
    return 'hotel' as const;
  }

  if (normalized.includes('transport') || normalized.includes('transfer') || normalized.includes('vehicle') || normalized.includes('drive')) {
    return 'transport' as const;
  }

  if (normalized.includes('activity') || normalized.includes('tour') || normalized.includes('excursion') || normalized.includes('experience')) {
    return 'activity' as const;
  }

  if (normalized.includes('guide') || normalized.includes('escort')) {
    return 'guide' as const;
  }

  if (normalized.includes('meal') || normalized.includes('breakfast') || normalized.includes('lunch') || normalized.includes('dinner')) {
    return 'meal' as const;
  }

  return 'other' as const;
}

function formatConfirmationStatus(status: 'pending' | 'requested' | 'confirmed') {
  return status.charAt(0).toUpperCase() + status.slice(1);
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

function getQuoteItemCategory(item: QuoteItem): PortalServiceCategory {
  if (item.hotel?.name) {
    return 'hotel';
  }

  return normalizePortalServiceCategory([
    item.service.category,
    item.service.name,
    item.appliedVehicleRate?.serviceType.name || '',
    item.pricingDescription || '',
  ].filter(Boolean).join(' '));
}

function groupQuoteItemsByCategory(items: QuoteItem[]) {
  const groups = new Map<PortalServiceCategory, QuoteItem[]>();

  for (const item of items) {
    const category = getQuoteItemCategory(item);
    const current = groups.get(category) || [];
    current.push(item);
    groups.set(category, current);
  }

  return groups;
}

function renderServices(items: QuoteItem[], emptyLabel: string) {
  if (items.length === 0) {
    return <p className="empty-state">{emptyLabel}</p>;
  }

  return (
    <div className="quote-preview-service-list">
      {items.map((item) => (
        <article key={item.id} className="quote-preview-service-row">
          <div>
            <strong>{item.service.name}</strong>
            <p>
              {item.service.category} | {getItemSummary(item)}
            </p>
          </div>
        </article>
      ))}
    </div>
  );
}

export default async function PortalBookingPage({ params, searchParams }: PortalBookingPageProps) {
  const { id } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const token = resolvedSearchParams?.token?.trim() || '';

  if (!token) {
    notFound();
  }

  const booking = await getBooking(id, token);

  if (!booking) {
    notFound();
  }

  const snapshot = booking.snapshotJson;

  if (!snapshot) {
    notFound();
  }

  const totalPax = snapshot.adults + snapshot.children;
  const sortedDays = [...snapshot.itineraries].sort((a, b) => a.dayNumber - b.dayNumber);
  const groupedQuoteItems = groupQuoteItemsByCategory(snapshot.quoteItems);
  const tripSummary = getValidatedTripSummary({
    quoteTitle: snapshot.title,
    quoteDescription: snapshot.description,
    dayTitles: sortedDays.map((day) => day.title),
    totalPax,
    nightCount: snapshot.nightCount,
  });

  return (
    <main className="page">
      <section className="panel quote-preview-page">
        <header className="quote-preview-hero">
          <div>
            <p className="eyebrow">Booking Portal</p>
            <h1 className="section-title quote-title">{booking.bookingRef}</h1>
            <p className="detail-copy">{snapshot.title}</p>
          </div>
        </header>

        <VoucherDownloadButton apiBaseUrl={API_BASE_URL} bookingId={booking.id} bookingRef={booking.bookingRef} token={token} />

        <section className="quote-preview-grid">
          <article className="detail-card">
            <p className="eyebrow">Trip Summary</p>
            <div className="quote-preview-total-list">
              <div>
                <span>Lead guest</span>
                <strong>
                  {booking.contactSnapshotJson.firstName} {booking.contactSnapshotJson.lastName}
                </strong>
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
                <span>Duration</span>
                <strong>{formatNightCountLabel(snapshot.nightCount)}</strong>
              </div>
            </div>
            <p className="detail-copy">{tripSummary}</p>
          </article>
        </section>

        <section className="detail-card">
          <p className="eyebrow">Products & Prices</p>
          <div className="section-stack">
            {PORTAL_SERVICE_CATEGORIES.map((category) => {
              const items = groupedQuoteItems.get(category) || [];

              return (
                <div key={category}>
                  <p className="eyebrow">{PORTAL_SERVICE_CATEGORY_LABELS[category]}</p>
                  {renderServices(
                    items,
                    category === 'hotel'
                      ? 'No hotel services available.'
                      : category === 'transport'
                        ? 'No transport services available.'
                        : category === 'activity'
                          ? 'No activities available.'
                          : 'No services available.',
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <section className="detail-card">
          <p className="eyebrow">Itinerary</p>
          <div className="quote-preview-day-list">
            {sortedDays.length === 0 ? (
              <p className="empty-state">Detailed itinerary will be provided separately.</p>
            ) : (
              sortedDays.map((day) => {
                const dayItems = snapshot.quoteItems.filter((item) => item.itineraryId === day.id);
                const displayDay = getItineraryDayDisplay(day);

                return (
                  <article key={day.id} className="quote-preview-day-card">
                    <div className="quote-preview-day-head">
                      <div>
                        <p className="eyebrow">{displayDay.dayLabel}</p>
                        <p className="detail-copy">{displayDay.city}</p>
                        <strong>{displayDay.title}</strong>
                        <p>{displayDay.description}</p>
                      </div>
                    </div>
                    {renderServices(dayItems, 'No services assigned to this day.')}
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
