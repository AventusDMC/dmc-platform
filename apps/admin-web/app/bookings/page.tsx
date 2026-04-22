import Link from 'next/link';
import { ModuleSwitcher } from '../components/ModuleSwitcher';
import { SummaryStrip } from '../components/SummaryStrip';
import { TableSectionShell } from '../components/TableSectionShell';
import { WorkspaceShell } from '../components/WorkspaceShell';
import { WorkspaceSubheader } from '../components/WorkspaceSubheader';
import { adminPageFetchJson } from '../lib/admin-server';

type BookingStatus = 'draft' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';

type Booking = {
  id: string;
  bookingRef?: string | null;
  sourceQuoteId: string;
  status: BookingStatus;
  createdAt: string;
  snapshotJson: {
    title: string;
    travelStartDate: string | null;
    company?: {
      name: string;
    } | null;
  };
};

async function getBookings(): Promise<Booking[]> {
  return adminPageFetchJson<Booking[]>('/api/bookings', 'Bookings', {
    cache: 'no-store',
  });
}

function formatDate(value: string | null) {
  if (!value) {
    return 'Not set';
  }

  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date(value));
}

function formatBookingStatus(status: BookingStatus) {
  return status
    .split('_')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

export default async function BookingsPage() {
  const bookings = await getBookings();
  const activeCount = bookings.filter((booking) => booking.status !== 'cancelled' && booking.status !== 'completed').length;
  const confirmedCount = bookings.filter((booking) => booking.status === 'confirmed' || booking.status === 'in_progress').length;

  return (
    <main className="page">
      <section className="panel workspace-panel">
        <WorkspaceShell
          eyebrow="Operations"
          title="Bookings"
          description="Move from accepted quotes into a lightweight execution queue without changing the underlying booking detail flow."
          switcher={
            <ModuleSwitcher
              ariaLabel="Operations modules"
              activeId="bookings"
              items={[
                { id: 'bookings', label: 'Bookings', href: '/bookings', helper: 'Execution queue' },
                { id: 'confirmations', label: 'Confirmations', href: '/operations?report=pending_confirmations', helper: 'Supplier follow-up' },
              ]}
            />
          }
          summary={
            <SummaryStrip
              items={[
                { id: 'bookings-total', label: 'Bookings', value: String(bookings.length), helper: `${activeCount} active` },
                { id: 'bookings-confirmed', label: 'Confirmed / live', value: String(confirmedCount), helper: 'Ready for operations' },
                { id: 'bookings-draft', label: 'Draft', value: String(bookings.filter((booking) => booking.status === 'draft').length), helper: 'Freshly converted from quotes' },
              ]}
            />
          }
        >
          <section className="section-stack">
            <WorkspaceSubheader
              eyebrow="Execution"
              title="Bookings list"
              description="Use this as the first operations step after quoting. Create bookings from accepted quotes, then open the booking detail page for deeper execution work."
              actions={
                <Link href="/quotes" className="dashboard-toolbar-link">
                  Open accepted quotes
                </Link>
              }
            />

            <TableSectionShell
              title="Bookings"
              description="A minimal execution queue showing which quotes have moved into delivery."
              context={<p>{bookings.length} bookings in scope</p>}
              emptyState={
                <div className="section-stack">
                  <p className="empty-state">No bookings yet.</p>
                  <p className="detail-copy">Create from accepted quote.</p>
                  <div>
                    <Link href="/quotes" className="secondary-button">
                      Open quotes
                    </Link>
                  </div>
                </div>
              }
            >
              {bookings.length > 0 ? (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Booking</th>
                        <th>Linked Quote</th>
                        <th>Start Date</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bookings.map((booking) => (
                        <tr key={booking.id}>
                          <td>
                            <strong>{booking.snapshotJson.title || booking.bookingRef || `Booking ${booking.id}`}</strong>
                            <div className="table-subcopy">{booking.bookingRef || `Booking ${booking.id}`}</div>
                          </td>
                          <td>
                            <Link href={`/quotes/${booking.sourceQuoteId}`} className="compact-button">
                              Quote {booking.sourceQuoteId}
                            </Link>
                          </td>
                          <td>{formatDate(booking.snapshotJson.travelStartDate)}</td>
                          <td>
                            <span className="status-badge">{formatBookingStatus(booking.status)}</span>
                          </td>
                          <td>
                            <div className="table-action-row">
                              <Link href={`/bookings/${booking.id}`} className="compact-button">
                                Open
                              </Link>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </TableSectionShell>
          </section>
        </WorkspaceShell>
      </section>
    </main>
  );
}
