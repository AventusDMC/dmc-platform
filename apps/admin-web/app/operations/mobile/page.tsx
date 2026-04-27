import Link from 'next/link';
import { cookies } from 'next/headers';
import { AdminForbiddenState } from '../../components/AdminForbiddenState';
import { ADMIN_API_BASE_URL, adminPageFetchJson, isAdminForbiddenError } from '../../lib/admin-server';
import { canAccessOperations, readSessionActor } from '../../lib/auth-session';
import {
  formatMobileStatus,
  getManifestLabel,
  getMobileServiceContact,
  getServiceVoucherHref,
  type MobileOperationsData,
  type MobileService,
} from '../mobile-view';

const API_BASE_URL = ADMIN_API_BASE_URL;
const QUICK_STATUSES = ['REQUESTED', 'CONFIRMED', 'DONE'] as const;

type MobileOperationsPageProps = {
  searchParams?: Promise<{
    date?: string;
    warningMessage?: string;
    warningText?: string;
    success?: string;
  }>;
};

async function getMobileOperationsData(date?: string): Promise<MobileOperationsData> {
  const query = new URLSearchParams();
  if (date) query.set('date', date);

  return adminPageFetchJson<MobileOperationsData>(
    `${API_BASE_URL}/operations/mobile-data${query.size > 0 ? `?${query.toString()}` : ''}`,
    'Mobile operations',
    { cache: 'no-store' },
  );
}

function formatDate(value: string | null) {
  if (!value) return 'Date pending';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
}

function formatTime(value: string | null | undefined) {
  return value || 'Time pending';
}

function renderHiddenServiceFields(service: MobileService) {
  return (
    <>
      <input type="hidden" name="type" value={service.operationType || service.type || service.serviceType || 'ACTIVITY'} />
      <input type="hidden" name="supplierId" value={service.supplierId || ''} />
      <input type="hidden" name="referenceId" value={service.referenceId || ''} />
      <input type="hidden" name="assignedTo" value={service.assignedTo || ''} />
      <input type="hidden" name="guidePhone" value={service.guidePhone || ''} />
      <input type="hidden" name="vehicleId" value={service.vehicleId || ''} />
      <input type="hidden" name="pickupTime" value={service.pickupTime || ''} />
      <input type="hidden" name="confirmationNumber" value={service.confirmationNumber || ''} />
    </>
  );
}

export default async function MobileOperationsPage({ searchParams }: MobileOperationsPageProps) {
  const cookieStore = await cookies();
  const session = readSessionActor(cookieStore.get('dmc_session')?.value || '');

  if (!canAccessOperations(session?.role)) {
    return (
      <AdminForbiddenState
        title="Operations access restricted"
        description="Your account does not have permission to view the mobile operations workspace for this company."
      />
    );
  }

  try {
    const resolvedSearchParams = searchParams ? await searchParams : undefined;
    const data = await getMobileOperationsData(resolvedSearchParams?.date);
    const warningMessage = resolvedSearchParams?.warningMessage || resolvedSearchParams?.warningText || '';
    const success = resolvedSearchParams?.success || '';

    return (
      <main className="page operations-mobile-page">
        <section className="panel operations-mobile-shell">
          <header className="operations-mobile-header">
            <div>
              <p className="detail-label">Operations field view</p>
              <h1>Today&apos;s trips</h1>
              <p className="detail-copy">{formatDate(data.date)} | {data.bookings.length} active booking{data.bookings.length === 1 ? '' : 's'}</p>
            </div>
            <Link href="/operations" className="secondary-button">Control center</Link>
          </header>

          <form method="GET" className="operations-mobile-filter">
            <label>
              Date
              <input type="date" name="date" defaultValue={data.date} />
            </label>
            <button type="submit" className="primary-button">Load</button>
          </form>

          {warningMessage ? <p className="form-error">{warningMessage}</p> : null}
          {success ? <p className="form-helper">{success}</p> : null}

          <section className="operations-mobile-stack">
            {data.bookings.map((booking) => (
              <article key={booking.id} className="detail-card operations-mobile-booking">
                <div className="operations-mobile-booking-head">
                  <div>
                    <p className="detail-label">{booking.bookingRef}</p>
                    <h2>{booking.title}</h2>
                    <p className="detail-copy">
                      {formatDate(booking.startDate)} - {formatDate(booking.endDate)} | {booking.pax} pax | {booking.roomCount} rooms
                    </p>
                  </div>
                  <span className="dashboard-pill">{formatMobileStatus(booking.status)}</span>
                </div>

                <div className="operations-mobile-manifest">
                  <strong>Manifest</strong>
                  <span>{getManifestLabel(booking)}</span>
                  {booking.passengerSummary.missingReasons.length > 0 ? (
                    <p className="form-error">{booking.passengerSummary.missingReasons.join(', ')}</p>
                  ) : null}
                </div>

                <div className="operations-mobile-days">
                  {booking.days.map((day) => (
                    <section key={day.id} className="operations-mobile-day">
                      <div className="operations-mobile-day-head">
                        <strong>Day {day.dayNumber}: {day.title}</strong>
                        <span>{formatDate(day.date)}</span>
                      </div>
                      {day.notes ? <p className="detail-copy">{day.notes}</p> : null}

                      <div className="operations-mobile-services">
                        {day.services.map((service) => {
                          const voucherHref = getServiceVoucherHref(service);
                          return (
                            <article key={service.id} className="operations-mobile-service">
                              <div className="operations-mobile-service-head">
                                <div>
                                  <strong>{service.description || service.serviceType || 'Service'}</strong>
                                  <p className="detail-copy">
                                    Pickup {formatTime(service.pickupTime)} | {service.pickupLocation || service.meetingPoint || 'Location pending'}
                                  </p>
                                  <p className="detail-copy">{getMobileServiceContact(service)}</p>
                                  {service.notes ? <p className="detail-copy">Note: {service.notes}</p> : null}
                                </div>
                                <span className="dashboard-pill">{formatMobileStatus(service.operationStatus)}</span>
                              </div>

                              <div className="operations-mobile-actions">
                                {QUICK_STATUSES.map((status) => (
                                  <form key={status} action={`/api/bookings/${booking.id}/days/${day.id}/services/${service.id}`} method="POST">
                                    {renderHiddenServiceFields(service)}
                                    <input type="hidden" name="status" value={status} />
                                    <input type="hidden" name="notes" value={service.notes || ''} />
                                    <button type="submit" className="secondary-button">{formatMobileStatus(status)}</button>
                                  </form>
                                ))}
                                {voucherHref ? <Link href={voucherHref} className="secondary-button">Voucher PDF</Link> : null}
                              </div>

                              <form action={`/api/bookings/${booking.id}/days/${day.id}/services/${service.id}`} method="POST" className="operations-mobile-note">
                                {renderHiddenServiceFields(service)}
                                <input type="hidden" name="status" value={service.operationStatus || 'PENDING'} />
                                <label>
                                  Quick note
                                  <textarea name="notes" defaultValue={service.notes || ''} rows={2} />
                                </label>
                                <button type="submit" className="secondary-button">Save note</button>
                              </form>
                            </article>
                          );
                        })}
                        {day.services.length === 0 ? <p className="detail-copy">No assigned services for this day.</p> : null}
                      </div>
                    </section>
                  ))}
                  {booking.days.length === 0 ? <p className="detail-copy">No itinerary days available.</p> : null}
                </div>
              </article>
            ))}
            {data.bookings.length === 0 ? (
              <div className="empty-state">
                <h2>No trips for this date</h2>
                <p className="detail-copy">Choose another date or return to the control center.</p>
              </div>
            ) : null}
          </section>
        </section>
      </main>
    );
  } catch (error) {
    if (isAdminForbiddenError(error)) {
      return (
        <AdminForbiddenState
          title="Operations data restricted"
          description="Your account does not have permission to load mobile operations data for this company."
        />
      );
    }

    throw error;
  }
}
