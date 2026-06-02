import Link from 'next/link';
import { notFound } from 'next/navigation';
import { adminPageFetchJson } from '../../../lib/admin-server';

type AgentBookingDetail = {
  id: string;
  bookingRef: string;
  title: string;
  clientName: string;
  status: string;
  finance: {
    totalSell: number;
    depositsReceived: number;
    remainingBalance: number;
    rateMode: 'GROSS' | 'NET';
    commissionPercent: number | null;
    commissionAmount: number | null;
    paymentStatus: string;
    paymentMethods: string[];
    paymentReferences: Array<{
      id: string;
      method: string;
      reference: string | null;
      amount: number;
      status: string;
    }>;
  };
  passengers: Array<{
    id: string;
    fullName: string;
    isLead: boolean;
    nationality: string | null;
    passportStatus: string;
    hotelCategoryVariant: string | null;
    branchExtension: string | null;
  }>;
  departure: {
    seriesName: string;
    departureCode: string | null;
    departureDate: string | null;
    availability: {
      seatsRemaining: number | null;
      stopSale: boolean;
    };
    hotelCategories: string[];
    branchExtensions: string[];
  } | null;
  vouchers: Array<{
    id: string;
    type: string;
    status: string;
    pdfUrl: string;
  }>;
  amendmentRequests: {
    enabled: boolean;
    endpoint: string;
  };
  services: Array<{
    id: string;
    description: string;
    serviceType: string;
    serviceDate: string | null;
    startTime: string | null;
    supplierName: string | null;
    confirmationStatus: string;
  }>;
};

type AgentBookingPageProps = {
  params: Promise<{ id: string }>;
};

function formatDate(value: string | null) {
  return value ? new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date(value)) : 'To be confirmed';
}

function formatMoney(amount: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount || 0);
}

async function getBooking(id: string) {
  return adminPageFetchJson<AgentBookingDetail | null>(`/api/agent/bookings/${id}`, 'Agent booking detail', {
    cache: 'no-store',
    allow404: true,
  });
}

export default async function AgentBookingDetailPage({ params }: AgentBookingPageProps) {
  const { id } = await params;
  const booking = await getBooking(id);

  if (!booking) {
    notFound();
  }

  return (
    <main className="page">
      <section className="panel workspace-panel">
        <div className="section-stack">
          <div className="workspace-section-head">
            <div>
              <p className="eyebrow">Agent Booking</p>
              <h1>{booking.title}</h1>
              <p className="detail-copy">{booking.clientName}</p>
            </div>
            <Link href="/agent/bookings" className="secondary-button">Back to bookings</Link>
          </div>

          <section className="quote-client-summary-strip" aria-label="Agent booking financial summary">
            {booking.finance.rateMode === 'NET' ? (
              <article className="quote-client-summary-card">
                <span>Your net rate</span>
                <strong>{formatMoney(booking.finance.totalSell)}</strong>
              </article>
            ) : null}
            <article className="quote-client-summary-card">
              <span>Payment status</span>
              <strong>{booking.finance.paymentStatus}</strong>
            </article>
            <article className="quote-client-summary-card">
              <span>Deposits</span>
              <strong>{formatMoney(booking.finance.depositsReceived)}</strong>
            </article>
            <article className="quote-client-summary-card">
              <span>Balance</span>
              <strong>{formatMoney(booking.finance.remainingBalance)}</strong>
            </article>
            {booking.finance.commissionAmount !== null ? (
              <article className="quote-client-summary-card">
                <span>Your commission{booking.finance.commissionPercent !== null ? ` (${booking.finance.commissionPercent}%)` : ''}</span>
                <strong>{formatMoney(booking.finance.commissionAmount)}</strong>
              </article>
            ) : null}
            <article className="quote-client-summary-card">
              <span>Vouchers</span>
              <strong>{booking.vouchers.length}</strong>
            </article>
          </section>

          <section className="quote-preview-grid">
            <article className="detail-card">
              <p className="eyebrow">Financial Visibility</p>
              <h2>Payments and references</h2>
              <p className="detail-copy">Payment methods: bank transfer, cash, CliQ, MB WAY, credit card, custom/manual.</p>
              <div className="entity-list">
                {booking.finance.paymentReferences.length === 0 ? <p className="empty-state">No payment references recorded yet.</p> : booking.finance.paymentReferences.map((payment) => (
                  <div key={payment.id} className="table-action-row" style={{ justifyContent: 'space-between' }}>
                    <span>{payment.reference || payment.method}</span>
                    <span className="status-badge">{payment.status}</span>
                  </div>
                ))}
              </div>
            </article>

            <article className="detail-card">
              <p className="eyebrow">Documents</p>
              <h2>Downloads</h2>
              <div className="table-action-row">
                <a href={`/api/agent/bookings/${booking.id}/voucher/pdf`} className="secondary-button">Download voucher</a>
                <Link href="/agent/invoices" className="secondary-button">Invoices and receipts</Link>
                <Link href={`/agent/bookings/${booking.id}`} className="secondary-button">Itinerary</Link>
              </div>
              <p className="detail-copy">Read-only portal documents are scoped to this agent account.</p>
            </article>
          </section>

          {booking.departure ? (
            <article className="detail-card">
              <p className="eyebrow">Departure Details</p>
              <h2>{booking.departure.departureCode || booking.departure.seriesName}</h2>
              <p className="detail-copy">
                {formatDate(booking.departure.departureDate)} | {booking.departure.availability.seatsRemaining === null ? 'Availability on request' : `${booking.departure.availability.seatsRemaining} seats remaining`} | {booking.departure.availability.stopSale ? 'Stop sale' : 'Open'}
              </p>
              <p className="detail-copy">Hotel categories: {booking.departure.hotelCategories.join(', ') || 'Pending'} | Branches: {booking.departure.branchExtensions.join(', ') || 'Core program'}</p>
            </article>
          ) : null}

          <article className="detail-card">
            <p className="eyebrow">Passengers</p>
            <h2>Passenger list</h2>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Nationality</th>
                    <th>Passport</th>
                    <th>Category</th>
                    <th>Branch</th>
                  </tr>
                </thead>
                <tbody>
                  {booking.passengers.map((passenger) => (
                    <tr key={passenger.id}>
                      <td>{passenger.fullName}{passenger.isLead ? ' | Lead' : ''}</td>
                      <td>{passenger.nationality || 'Pending'}</td>
                      <td>{passenger.passportStatus}</td>
                      <td>{passenger.hotelCategoryVariant || 'Pending'}</td>
                      <td>{passenger.branchExtension || 'Core program'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          <article className="detail-card">
            <p className="eyebrow">Amendment Request</p>
            <h2>Request a change</h2>
            <form action={booking.amendmentRequests.endpoint} method="post" className="entity-form">
              <label>
                Request type
                <select name="amendmentType" defaultValue="general_request">
                  <option value="general_request">General request</option>
                  <option value="passenger_update">Passenger update</option>
                  <option value="rooming_update">Rooming update</option>
                  <option value="service_change">Service change</option>
                </select>
              </label>
              <label>
                Notes
                <textarea name="notes" placeholder="Describe the requested change for operations review." />
              </label>
              <button type="submit">Submit amendment request</button>
            </form>
            <p className="detail-copy">No destructive operational editing is available in the agent portal.</p>
          </article>

          <article className="detail-card">
            <p className="eyebrow">Services</p>
            <h2>Booking services</h2>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Service</th>
                    <th>Date</th>
                    <th>Supplier</th>
                    <th>Confirmation</th>
                  </tr>
                </thead>
                <tbody>
                  {booking.services.map((service) => (
                    <tr key={service.id}>
                      <td>
                        <strong>{service.description}</strong>
                        <div className="table-subcopy">{service.serviceType}</div>
                      </td>
                      <td>{formatDate(service.serviceDate)}{service.startTime ? ` · ${service.startTime}` : ''}</td>
                      <td>{service.supplierName || 'Pending'}</td>
                      <td><span className="status-badge">{service.confirmationStatus}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        </div>
      </section>
    </main>
  );
}
