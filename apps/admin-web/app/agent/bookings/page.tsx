import Link from 'next/link';
import { adminPageFetchJson } from '../../lib/admin-server';

type AgentBooking = {
  id: string;
  bookingRef: string;
  title: string;
  status: string;
  clientName: string;
  travelStartDate: string | null;
};

function formatDate(value: string | null) {
  return value ? new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date(value)) : 'To be confirmed';
}

async function getBookings() {
  return adminPageFetchJson<AgentBooking[]>('/api/agent/bookings', 'Agent bookings', { cache: 'no-store' });
}

export default async function AgentBookingsPage() {
  const bookings = await getBookings();

  return (
    <main className="page">
      <section className="panel workspace-panel">
        <div className="section-stack">
          <div className="workspace-section-head">
            <div>
              <p className="eyebrow">Agent Portal</p>
              <h1>Bookings</h1>
              <p className="detail-copy">Confirmed and active business only, without audit logs or internal financial breakdowns.</p>
            </div>
          </div>

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Booking</th>
                  <th>Client</th>
                  <th>Travel Date</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {bookings.map((booking) => (
                  <tr key={booking.id}>
                    <td>
                      <strong>{booking.title}</strong>
                      <div className="table-subcopy">{booking.bookingRef}</div>
                    </td>
                    <td>{booking.clientName}</td>
                    <td>{formatDate(booking.travelStartDate)}</td>
                    <td><span className="status-badge">{booking.status}</span></td>
                    <td>
                      <Link href={`/agent/bookings/${booking.id}`} className="compact-button">Open</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </main>
  );
}
