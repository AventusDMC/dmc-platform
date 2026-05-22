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
  supplierId?: string | null;
  supplierName: string | null;
  assignedSupplierId?: string | null;
  assignedSupplierName?: string | null;
  assignmentStatus?: string | null;
  assignmentNotes?: string | null;
  status: string;
  operationalDate: string | null;
  operationalTime: string | null;
  voucherStatus: string;
  supplierConfirmationStatus: string;
  supplierConfirmationCode?: string | null;
  confirmationReference?: string | null;
  confirmationNotes?: string | null;
  confirmationRequestedAt?: string | null;
  confirmationReceivedAt?: string | null;
};

type SupplierOption = {
  id: string;
  name: string;
  type?: string | null;
  active?: boolean | null;
  isActive?: boolean | null;
  status?: string | null;
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

async function loadSuppliers() {
  try {
    return await adminPageFetchJson<SupplierOption[]>('/api/suppliers', 'Suppliers', {
      cache: 'no-store',
    });
  } catch {
    return [];
  }
}

function isSupplierVisible(supplier: SupplierOption) {
  return supplier.active !== false && supplier.isActive !== false && !['INACTIVE', 'ARCHIVED'].includes(String(supplier.status || '').toUpperCase());
}

function supplierMatchesService(supplier: SupplierOption, serviceType: string) {
  const type = `${supplier.type || ''} ${supplier.name || ''}`.toUpperCase();
  const normalized = String(serviceType || 'SERVICE').toUpperCase();
  if (normalized === 'TRANSPORT') return /(TRANSPORT|TRANSFER|LOGISTIC|VEHICLE|FLEET)/.test(type);
  if (normalized === 'ACTIVITY') return /(ACTIVITY|EXCURSION|EXPERIENCE|TOUR|ATTRACTION)/.test(type);
  if (normalized === 'HOTEL') return /(HOTEL|ACCOMMODATION|LODGING)/.test(type);
  if (normalized === 'GUIDE') return /(GUIDE|GUIDING)/.test(type);
  if (normalized === 'TICKET') return /(TICKET|ATTRACTION|SERVICE|MUSEUM|SITE)/.test(type);
  return true;
}

function getConfirmationRowClass(row: OperationsGridRow, assigned: string | null | undefined) {
  const classes: string[] = [];
  const status = String(row.supplierConfirmationStatus || 'NOT_SENT').toUpperCase();
  if (!assigned || row.assignmentStatus === 'UNASSIGNED') {
    classes.push('table-row-warning');
  }
  if (status === 'REJECTED') {
    classes.push('table-row-critical');
  } else if (status === 'REQUESTED' || status === 'NOT_SENT') {
    classes.push('table-row-warning');
  } else if (status === 'CONFIRMED') {
    classes.push('table-row-ready');
  }

  return classes.length > 0 ? classes.join(' ') : undefined;
}

export default async function BookingOperationsPage({ params }: PageProps) {
  const { id } = await params;
  const [grid, suppliers] = await Promise.all([loadOperationsGrid(id), loadSuppliers()]);
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
                <th>Assignment</th>
                <th>Status</th>
                <th>Operational date/time</th>
                <th>Voucher status</th>
                <th>Confirmation status</th>
              </tr>
            </thead>
            <tbody>
              {grid.rows.length === 0 ? (
                <tr>
                  <td colSpan={8}>No operational service rows have been generated for this booking.</td>
                </tr>
              ) : (
                grid.rows.map((row) => {
                  const assigned = row.assignedSupplierId || row.supplierId;
                  const rowSuppliers = suppliers.filter((supplier) => isSupplierVisible(supplier) && supplierMatchesService(supplier, row.serviceType));
                  return (
                  <tr key={row.id} className={getConfirmationRowClass(row, assigned)}>
                    <td>
                      {row.dayNumber ? `Day ${row.dayNumber}` : '-'}
                      {row.dayTitle ? <div className="table-subcopy">{row.dayTitle}</div> : null}
                    </td>
                    <td>
                      {formatLabel(row.serviceType)}
                      {row.description ? <div className="table-subcopy">{row.description}</div> : null}
                    </td>
                    <td>{row.assignedSupplierName || row.supplierName || '-'}</td>
                    <td>
                      <strong>{formatLabel(row.assignmentStatus || (assigned ? 'ASSIGNED' : 'UNASSIGNED'))}</strong>
                      <form className="inline-form" method="post" action={`/api/bookings/${id}/operations/${row.id}/assign-supplier`}>
                        <select name="supplierId" defaultValue={row.assignedSupplierId || row.supplierId || ''} aria-label={`Supplier for ${row.description || row.serviceType}`}>
                          <option value="">Unassigned</option>
                          {rowSuppliers.map((supplier) => (
                            <option key={supplier.id} value={supplier.id}>
                              {supplier.name}
                            </option>
                          ))}
                        </select>
                        <select name="assignmentStatus" defaultValue={row.assignmentStatus || (assigned ? 'ASSIGNED' : 'UNASSIGNED')} aria-label="Assignment status">
                          {['UNASSIGNED', 'ASSIGNED', 'REQUESTED', 'CONFIRMED', 'REJECTED'].map((status) => (
                            <option key={status} value={status}>{formatLabel(status)}</option>
                          ))}
                        </select>
                        <input name="assignmentNotes" defaultValue={row.assignmentNotes || ''} placeholder="Notes" aria-label="Assignment notes" />
                        <button type="submit" className="button button-secondary">Assign</button>
                      </form>
                    </td>
                    <td>{formatLabel(row.status)}</td>
                    <td>
                      {formatDate(row.operationalDate)}
                      {row.operationalTime ? <div className="table-subcopy">{row.operationalTime}</div> : null}
                    </td>
                    <td>{formatLabel(row.voucherStatus)}</td>
                    <td>
                      <strong>{formatLabel(row.supplierConfirmationStatus)}</strong>
                      {row.confirmationRequestedAt ? <div className="table-subcopy">Requested {formatDate(row.confirmationRequestedAt)}</div> : null}
                      {row.confirmationReceivedAt ? <div className="table-subcopy">Received {formatDate(row.confirmationReceivedAt)}</div> : null}
                      <form className="inline-form" method="post" action={`/api/bookings/${id}/operations/${row.id}/confirmation`}>
                        <select
                          name="supplierConfirmationStatus"
                          defaultValue={row.supplierConfirmationStatus || 'NOT_SENT'}
                          aria-label={`Confirmation status for ${row.description || row.serviceType}`}
                        >
                          {['NOT_SENT', 'REQUESTED', 'CONFIRMED', 'REJECTED'].map((status) => (
                            <option key={status} value={status}>
                              {formatLabel(status)}
                            </option>
                          ))}
                        </select>
                        <input
                          name="confirmationReference"
                          defaultValue={row.confirmationReference || row.supplierConfirmationCode || ''}
                          placeholder="Reference"
                          aria-label="Confirmation reference"
                        />
                        <input
                          name="confirmationNotes"
                          defaultValue={row.confirmationNotes || ''}
                          placeholder="Notes"
                          aria-label="Confirmation notes"
                        />
                        <button type="submit" name="supplierConfirmationStatus" value="REQUESTED" className="button button-secondary">
                          Request Confirmation
                        </button>
                        <button type="submit" name="supplierConfirmationStatus" value="CONFIRMED" className="button button-secondary">
                          Mark Confirmed
                        </button>
                        <button type="submit" name="supplierConfirmationStatus" value="REJECTED" className="button button-secondary">
                          Mark Rejected
                        </button>
                      </form>
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
