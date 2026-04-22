import { notFound } from 'next/navigation';
import { BookingDocumentActions } from '../BookingDocumentActions';

import { ADMIN_API_BASE_URL, adminPageFetchJson } from '../../../lib/admin-server';

const API_BASE_URL = ADMIN_API_BASE_URL;

type Booking = {
  id: string;
  bookingRef: string;
  adults: number;
  children: number;
  snapshotJson?: {
    itineraries?: Array<{
      id: string;
      dayNumber: number;
      title: string;
    }>;
    quoteItems?: Array<{
      id: string;
      itineraryId?: string | null;
      pricingDescription?: string | null;
      service?: {
        name?: string | null;
        category?: string | null;
      } | null;
      appliedVehicleRate?: {
        routeName?: string | null;
        vehicle?: {
          name?: string | null;
        } | null;
        serviceType?: {
          name?: string | null;
        } | null;
      } | null;
    }>;
  };
  services: Array<{
    id: string;
    description: string;
    qty: number;
    sourceQuoteItemId?: string | null;
    serviceOrder?: number;
    supplierId: string | null;
    supplierName: string | null;
    notes?: string | null;
    confirmationStatus: 'pending' | 'requested' | 'confirmed';
    confirmationNotes?: string | null;
  }>;
};

type SupplierConfirmationPageProps = {
  params: Promise<{
    id: string;
  }>;
};

async function getBooking(id: string): Promise<Booking | null> {
  return adminPageFetchJson<Booking | null>(`${API_BASE_URL}/bookings/${id}`, 'Supplier confirmation booking', {
    cache: 'no-store',
    allow404: true,
  });
}

function formatConfirmationStatus(status: 'pending' | 'requested' | 'confirmed') {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function cleanDetailText(value: string) {
  return value
    .replace(/\bDescription:\s*/gi, '')
    .replace(/\bNotes:\s*/gi, '')
    .replace(/\s*\|\s*/g, ' | ')
    .replace(/\s+/g, ' ')
    .trim();
}

function dedupeParts(parts: Array<string | null | undefined>) {
  const seen = new Set<string>();

  return parts.filter((part): part is string => {
    const normalized = cleanDetailText(part || '');

    if (!normalized) {
      return false;
    }

    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function getServiceNotes(service: Booking['services'][number]) {
  return [service.notes, service.confirmationNotes].filter(Boolean).join('\n');
}

function getQuoteItemMap(booking: Booking) {
  return new Map((booking.snapshotJson?.quoteItems || []).map((item) => [item.id, item]));
}

function getItineraryMap(booking: Booking) {
  return new Map((booking.snapshotJson?.itineraries || []).map((day) => [day.id, day]));
}

function getServiceContext(
  service: Booking['services'][number],
  quoteItemMap: ReturnType<typeof getQuoteItemMap>,
  itineraryMap: ReturnType<typeof getItineraryMap>,
) {
  const quoteItem = service.sourceQuoteItemId ? quoteItemMap.get(service.sourceQuoteItemId) : null;
  const day = quoteItem?.itineraryId ? itineraryMap.get(quoteItem.itineraryId) : null;

  if (!day) {
    return 'Outside itinerary';
  }

  return `Day ${day.dayNumber} | ${day.title}`;
}

function getServiceDetail(
  service: Booking['services'][number],
  quoteItemMap: ReturnType<typeof getQuoteItemMap>,
) {
  const quoteItem = service.sourceQuoteItemId ? quoteItemMap.get(service.sourceQuoteItemId) : null;
  const transportDetail = quoteItem?.appliedVehicleRate
    ? [
        quoteItem.appliedVehicleRate.routeName,
        quoteItem.appliedVehicleRate.vehicle?.name,
        quoteItem.appliedVehicleRate.serviceType?.name,
      ]
        .filter(Boolean)
        .join(' | ')
    : null;
  const detailParts = dedupeParts([
    transportDetail,
    quoteItem?.pricingDescription,
  ]);

  return {
    title: cleanDetailText(service.description),
    detail: detailParts.join(' | '),
  };
}

export default async function SupplierConfirmationPage({ params }: SupplierConfirmationPageProps) {
  const { id } = await params;
  const booking = await getBooking(id);

  if (!booking) {
    notFound();
  }

  const totalPax = booking.adults + booking.children;
  const quoteItemMap = getQuoteItemMap(booking);
  const itineraryMap = getItineraryMap(booking);
  const supplierGroups = booking.services
    .filter((service) => service.supplierId || service.supplierName)
    .reduce<
      Array<{
        key: string;
        supplierName: string;
        services: Booking['services'];
      }>
    >((groups, service) => {
      const key = service.supplierId || service.supplierName || service.id;
      const existingGroup = groups.find((group) => group.key === key);

      if (existingGroup) {
        existingGroup.services.push(service);
        return groups;
      }

      groups.push({
        key,
        supplierName: service.supplierName || 'Unnamed supplier',
        services: [service],
      });

      return groups;
    }, [])
    .sort((a, b) => a.supplierName.localeCompare(b.supplierName));

  return (
    <main className="page">
      <section className="panel quote-preview-page supplier-confirmation-page">
        <header className="quote-preview-hero supplier-confirmation-hero">
          <div>
            <p className="eyebrow">Supplier Confirmation Sheet</p>
            <h1 className="section-title quote-title">{booking.bookingRef}</h1>
            <p className="detail-copy supplier-confirmation-instructions">
              Please review the services below, confirm availability, and advise any pending items or operational remarks
              directly against each service.
            </p>
          </div>
          <div className="quote-preview-meta">
            <strong>{totalPax} pax</strong>
            <p>{supplierGroups.length} supplier groups</p>
          </div>
        </header>

        <BookingDocumentActions
          apiBaseUrl={API_BASE_URL}
          bookingId={booking.id}
          bookingRef={booking.bookingRef}
          documentLabel="Supplier Confirmation Sheet"
          documentType="supplier-confirmation"
        />

        {supplierGroups.length === 0 ? (
          <section className="detail-card">
            <p className="empty-state">No supplier-assigned services available for this confirmation sheet.</p>
          </section>
        ) : (
          supplierGroups.map((group) => (
            <section key={group.key} className="detail-card supplier-confirmation-group">
              <div className="supplier-confirmation-group-head">
                <div>
                  <p className="eyebrow">Supplier</p>
                  <h2>{group.supplierName}</h2>
                </div>
                <div className="supplier-confirmation-summary">
                  <strong>{group.services.length} services</strong>
                </div>
              </div>

              <div className="table-wrap">
                <table className="data-table supplier-confirmation-table">
                  <thead>
                    <tr>
                      <th>Booking Ref</th>
                      <th>Service Description</th>
                      <th>Service Day / Context</th>
                      <th>Pax</th>
                      <th>Notes</th>
                      <th>Confirmation Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.services.map((service) => {
                      const serviceDetail = getServiceDetail(service, quoteItemMap);

                      return (
                        <tr
                          key={service.id}
                          className={
                            service.confirmationStatus === 'confirmed'
                              ? 'supplier-confirmation-row'
                              : 'supplier-confirmation-row supplier-confirmation-row-alert'
                          }
                        >
                          <td>{booking.bookingRef}</td>
                          <td>
                            <div className="supplier-confirmation-service-copy">
                              <strong>{serviceDetail.title}</strong>
                              {serviceDetail.detail ? <p>{serviceDetail.detail}</p> : null}
                            </div>
                          </td>
                          <td>{getServiceContext(service, quoteItemMap, itineraryMap)}</td>
                          <td>{totalPax}</td>
                          <td className="supplier-confirmation-notes">{getServiceNotes(service) || '-'}</td>
                          <td>
                            <span
                              className={
                                service.confirmationStatus === 'confirmed'
                                  ? 'supplier-confirmation-status'
                                  : 'supplier-confirmation-status supplier-confirmation-status-alert'
                              }
                            >
                              {formatConfirmationStatus(service.confirmationStatus)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ))
        )}
      </section>
    </main>
  );
}
