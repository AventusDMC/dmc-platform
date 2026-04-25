import Link from 'next/link';
import { notFound } from 'next/navigation';
import { adminPageFetchJson } from '../../../lib/admin-server';

type AgentBookingDetail = {
  id: string;
  bookingRef: string;
  title: string;
  clientName: string;
  status: string;
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
