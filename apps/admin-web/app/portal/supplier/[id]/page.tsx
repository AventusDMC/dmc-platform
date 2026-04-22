import { notFound } from 'next/navigation';
import { adminPageFetchJson } from '../../../lib/admin-server';

const API_BASE_URL = '/api';

type SupplierPortalBooking = {
  id: string;
  bookingRef: string;
  adults: number;
  children: number;
  supplierGroups: Array<{
    key: string;
    supplierId: string | null;
    supplierName: string;
    services: Array<{
      id: string;
      description: string;
      serviceType: string;
      serviceDate: string | null;
      startTime: string | null;
      pickupTime: string | null;
      pickupLocation: string | null;
      meetingPoint: string | null;
      participantCount: number | null;
      adultCount: number | null;
      childCount: number | null;
      supplierReference: string | null;
      confirmationStatus: 'pending' | 'requested' | 'confirmed';
      confirmationNumber: string | null;
      confirmationNotes: string | null;
      notes: string | null;
    }>;
  }>;
};

type SupplierPortalPageProps = {
  params: Promise<{
    id: string;
  }>;
  searchParams?: Promise<{
    token?: string;
    success?: string;
    warningText?: string;
  }>;
};

async function getSupplierPortalBooking(id: string, token: string): Promise<SupplierPortalBooking | null> {
  return adminPageFetchJson<SupplierPortalBooking | null>(`${API_BASE_URL}/bookings/${id}/supplier-portal?token=${encodeURIComponent(token)}`, 'Supplier portal booking', {
    cache: 'no-store',
    allowAnonymous: true,
    allow404: true,
  });
}

type SupplierPortalServiceCategory = 'hotel' | 'transport' | 'activity' | 'guide' | 'meal' | 'other';

const SUPPLIER_PORTAL_SERVICE_CATEGORIES: SupplierPortalServiceCategory[] = ['hotel', 'transport', 'activity', 'guide', 'meal', 'other'];

const SUPPLIER_PORTAL_CATEGORY_LABELS: Record<SupplierPortalServiceCategory, string> = {
  hotel: 'Hotel',
  transport: 'Transport',
  activity: 'Activities',
  guide: 'Guide',
  meal: 'Meals',
  other: 'Other services',
};

function normalizeSupplierPortalCategory(value: string) {
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

function groupSupplierServicesByCategory(services: SupplierPortalBooking['supplierGroups'][number]['services']) {
  const groups = new Map<SupplierPortalServiceCategory, typeof services>();

  for (const service of services) {
    const category = normalizeSupplierPortalCategory(service.serviceType || service.description || '');
    const current = groups.get(category) || [];
    current.push(service);
    groups.set(category, current);
  }

  return groups;
}

function formatConfirmationStatus(status: 'pending' | 'requested' | 'confirmed') {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function getServiceNotes(service: SupplierPortalBooking['supplierGroups'][number]['services'][number]) {
  return [service.notes, service.confirmationNotes].filter(Boolean).join(' | ');
}

export default async function SupplierPortalPage({ params, searchParams }: SupplierPortalPageProps) {
  const { id } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const token = resolvedSearchParams?.token?.trim() || '';

  if (!token) {
    notFound();
  }

  const booking = await getSupplierPortalBooking(id, token);

  if (!booking) {
    notFound();
  }

  const totalPax = booking.adults + booking.children;

  return (
    <main className="page">
      <section className="panel quote-preview-page supplier-portal-page">
        <header className="quote-preview-hero supplier-portal-hero">
          <div>
            <p className="eyebrow">Supplier Portal</p>
            <h1 className="section-title quote-title">{booking.bookingRef}</h1>
            <p className="detail-copy">
              Confirm only the services assigned to each supplier group. Total guests: {totalPax} pax.
            </p>
          </div>
        </header>

        {resolvedSearchParams?.success ? (
          <section className="detail-card supplier-portal-feedback">
            <p>{resolvedSearchParams.success}</p>
          </section>
        ) : null}
        {resolvedSearchParams?.warningText ? (
          <section className="detail-card supplier-portal-feedback">
            <p className="form-error">{resolvedSearchParams.warningText}</p>
          </section>
        ) : null}

        {booking.supplierGroups.length === 0 ? (
          <section className="detail-card">
            <p className="empty-state">No supplier-assigned services are available for this booking.</p>
          </section>
        ) : (
          booking.supplierGroups.map((group) => (
            (() => {
              const groupedServices = groupSupplierServicesByCategory(group.services);

              return (
                <section key={group.key} className="detail-card supplier-portal-group">
                  <div className="supplier-portal-group-head">
                    <div>
                      <p className="eyebrow">Supplier</p>
                      <h2>{group.supplierName}</h2>
                    </div>
                    <div className="supplier-confirmation-summary">
                      <strong>{group.services.length} services</strong>
                    </div>
                  </div>

                  <div className="section-stack">
                    {SUPPLIER_PORTAL_SERVICE_CATEGORIES.map((category) => (
                      <div key={category}>
                        <p className="eyebrow">{SUPPLIER_PORTAL_CATEGORY_LABELS[category]}</p>
                        <div className="quote-preview-service-list">
                          {(groupedServices.get(category) || []).length === 0 ? (
                            <p className="empty-state">
                              {category === 'hotel'
                                ? 'No hotel services available.'
                                : category === 'transport'
                                  ? 'No transport services available.'
                                  : category === 'activity'
                                    ? 'No activities available.'
                                    : 'No services available.'}
                            </p>
                          ) : (
                            (groupedServices.get(category) || []).map((service) => (
                              <article key={service.id} className="quote-preview-service-row supplier-portal-service-row">
                                <div className="supplier-portal-service-copy">
                                  <strong>{service.description}</strong>
                                  <p>
                                    Status: {formatConfirmationStatus(service.confirmationStatus)}
                                    {(service.supplierReference || service.confirmationNumber)
                                      ? ` (${service.supplierReference || service.confirmationNumber})`
                                      : ''}
                                  </p>
                                  {service.serviceDate ? <p>Date: {formatDateTime(service.serviceDate)}</p> : null}
                                  {service.startTime || service.pickupTime ? <p>Start / Pickup: {service.startTime || '-'} / {service.pickupTime || '-'}</p> : null}
                                  {service.pickupLocation || service.meetingPoint ? <p>Pickup / Meeting: {service.pickupLocation || '-'} / {service.meetingPoint || '-'}</p> : null}
                                  {(service.participantCount || service.adultCount || service.childCount) ? (
                                    <p>
                                      Pax: {service.participantCount ?? 0} | Adults: {service.adultCount ?? 0} | Children: {service.childCount ?? 0}
                                    </p>
                                  ) : null}
                                  {getServiceNotes(service) ? <p>Notes: {getServiceNotes(service)}</p> : null}
                                </div>

                                {service.confirmationStatus === 'confirmed' ? (
                                  <span className="supplier-confirmation-status">Confirmed</span>
                                ) : (
                                  <form
                                    action={`/api/bookings/services/${service.id}/supplier-confirm?token=${encodeURIComponent(token)}`}
                                    method="post"
                                  >
                                    <input
                                      type="text"
                                      name="supplierReference"
                                      defaultValue={service.supplierReference || service.confirmationNumber || ''}
                                      placeholder="Supplier reference"
                                    />
                                    <input type="text" name="notes" defaultValue={service.confirmationNotes || ''} placeholder="Confirmation note" />
                                    <button type="submit" className="secondary-button">
                                      Confirm service
                                    </button>
                                  </form>
                                )}
                              </article>
                            ))
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })()
          ))
        )}
      </section>
    </main>
  );
}
