import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AdminBackButton } from '../../../components/AdminBackButton';
import { AdminBreadcrumbs } from '../../../components/AdminBreadcrumbs';
import { adminPageFetchJson } from '../../../lib/admin-server';

type OperationsGridRow = {
  id: string;
  order: number;
  dayNumber: number | null;
  dayTitle: string | null;
  serviceType: string;
  description: string | null;
  supplierName: string | null;
  status: string;
  operationalDate: string | null;
  operationalTime: string | null;
  voucherStatus: string;
  supplierConfirmationStatus: string;
};

type OperationsGridResponse = {
  booking: {
    id: string;
    bookingRef: string | null;
    title: string | null;
  };
  passengerManifest?: {
    status: 'PENDING' | 'INCOMPLETE' | 'COMPLETE' | string;
    expected: number;
    received: number;
    missingRecords: number;
    incompleteRecords: number;
    namesPending: boolean;
    voucherReady: boolean;
  };
  rows: OperationsGridRow[];
};

type PageProps = {
  params: Promise<{ id: string }>;
};

function formatDate(value: string | null) {
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function formatLabel(value: string | null | undefined) {
  if (!value) {
    return '-';
  }

  return value
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

async function loadOperationsGrid(id: string) {
  try {
    return await adminPageFetchJson<OperationsGridResponse>(`/api/bookings/${id}/operations-grid`, 'Booking operations', {
      cache: 'no-store',
    });
  } catch (error) {
    const status = (error as { status?: number } | null)?.status;
    if (status === 404) {
      notFound();
    }

    throw error;
  }
}

export default async function BookingOperationsPage({ params }: PageProps) {
  const { id } = await params;
  const grid = await loadOperationsGrid(id);
  const manifest = grid.passengerManifest;

  return (
    <main className="admin-page-shell">
      <div className="admin-page-heading">
        <AdminBreadcrumbs
          items={[
            { label: 'Bookings', href: '/bookings' },
            { label: grid.booking.bookingRef || 'Booking', href: `/bookings/${id}` },
            { label: 'Operations' },
          ]}
        />
        <div className="admin-heading-row">
          <div>
            <h1>Operational Service Grid</h1>
            <p className="admin-muted-copy">
              {grid.booking.bookingRef || 'Booking'} · {grid.rows.length} service rows
            </p>
          </div>
          <div className="admin-heading-actions">
            <AdminBackButton fallbackHref={`/bookings/${id}`} label="Back" />
            <Link className="button button-secondary" href={`/bookings/${id}`}>
              Booking
            </Link>
          </div>
        </div>
      </div>

      {manifest ? (
        <section className="admin-card">
          <div className="admin-heading-row">
            <div>
              <p className="eyebrow">Passenger Manifest</p>
              <h2>{manifest.status === 'COMPLETE' ? 'Complete' : 'Incomplete'}</h2>
              <p className="admin-muted-copy">
                {manifest.received}/{manifest.expected} passenger records received
                {manifest.missingRecords > 0 ? ` - ${manifest.missingRecords} names pending` : ''}
                {manifest.incompleteRecords > 0 ? ` - ${manifest.incompleteRecords} records incomplete` : ''}
              </p>
            </div>
            <div className="admin-status-pill">
              {manifest.voucherReady ? 'Voucher ready' : 'Final manifest pending'}
            </div>
          </div>
        </section>
      ) : null}

      <section className="admin-card">
        <div className="table-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Day</th>
                <th>Service type</th>
                <th>Supplier</th>
                <th>Status</th>
                <th>Operational date/time</th>
                <th>Voucher status</th>
                <th>Confirmation status</th>
              </tr>
            </thead>
            <tbody>
              {grid.rows.length === 0 ? (
                <tr>
                  <td colSpan={7}>No operational service rows have been generated for this booking.</td>
                </tr>
              ) : (
                grid.rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      {row.dayNumber ? `Day ${row.dayNumber}` : '-'}
                      {row.dayTitle ? <div className="table-subcopy">{row.dayTitle}</div> : null}
                    </td>
                    <td>
                      {formatLabel(row.serviceType)}
                      {row.description ? <div className="table-subcopy">{row.description}</div> : null}
                    </td>
                    <td>{row.supplierName || '-'}</td>
                    <td>{formatLabel(row.status)}</td>
                    <td>
                      {formatDate(row.operationalDate)}
                      {row.operationalTime ? <div className="table-subcopy">{row.operationalTime}</div> : null}
                    </td>
                    <td>{formatLabel(row.voucherStatus)}</td>
                    <td>{formatLabel(row.supplierConfirmationStatus)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
