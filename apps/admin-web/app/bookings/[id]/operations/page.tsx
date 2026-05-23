import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AdminBackButton } from '../../../components/AdminBackButton';
import { AdminBreadcrumbs } from '../../../components/AdminBreadcrumbs';
import { adminPageFetchJson } from '../../../lib/admin-server';
import { OperationSupplierAssignmentForm } from './OperationSupplierAssignmentForm';

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
  pickupLocation?: string | null;
  dropoffLocation?: string | null;
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

type BookingReadinessResponse = {
  rooming?: {
    badge?: {
      count?: number;
      breakdown?: {
        unassignedPassengers?: number;
        unassignedRooms?: number;
        occupancyIssues?: number;
      };
    };
  };
};

type PageProps = {
  params: Promise<{ id: string }>;
};

type Severity = 'INFO' | 'ACTION REQUIRED' | 'CRITICAL';
type Readiness = 'Ready' | 'Pending' | 'Blocked' | 'Critical';
type Phase = 'Critical Issues' | 'Needs Assignment' | 'Needs Confirmation' | 'Ready for Voucher' | 'Operationally Ready';

const PHASES: Phase[] = ['Critical Issues', 'Needs Assignment', 'Needs Confirmation', 'Ready for Voucher', 'Operationally Ready'];

function formatDate(value: string | null | undefined) {
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

async function loadBookingReadiness(id: string) {
  try {
    return await adminPageFetchJson<BookingReadinessResponse>(`/api/bookings/${id}`, 'Booking readiness', {
      cache: 'no-store',
    });
  } catch {
    return null;
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

function isAssigned(row: OperationsGridRow) {
  return Boolean(row.assignedSupplierId || row.supplierId) && String(row.assignmentStatus || '').toUpperCase() !== 'UNASSIGNED';
}

function isConfirmationRejected(row: OperationsGridRow) {
  return String(row.supplierConfirmationStatus || '').toUpperCase() === 'REJECTED';
}

function isConfirmationConfirmed(row: OperationsGridRow) {
  return String(row.supplierConfirmationStatus || '').toUpperCase() === 'CONFIRMED';
}

function isVoucherPending(row: OperationsGridRow) {
  return !['GENERATED', 'SENT', 'ISSUED'].includes(String(row.voucherStatus || '').toUpperCase());
}

function isTimingMissing(row: OperationsGridRow) {
  return !row.operationalDate || !row.operationalTime;
}

function getRowReadiness(row: OperationsGridRow): { readiness: Readiness; severity: Severity; reasons: string[] } {
  const reasons: string[] = [];
  if (isConfirmationRejected(row)) reasons.push('Rejected supplier confirmation');
  if (isTimingMissing(row)) reasons.push('Missing operational date or time');
  if (!isAssigned(row)) reasons.push('Supplier unassigned');
  if (isAssigned(row) && !isConfirmationConfirmed(row) && !isConfirmationRejected(row)) reasons.push('Supplier confirmation pending');
  if (isAssigned(row) && isConfirmationConfirmed(row) && isVoucherPending(row)) reasons.push('Voucher pending');

  if (isConfirmationRejected(row) || isTimingMissing(row)) {
    return { readiness: 'Critical', severity: 'CRITICAL', reasons };
  }

  if (!isAssigned(row)) {
    return { readiness: 'Blocked', severity: 'ACTION REQUIRED', reasons };
  }

  if (!isConfirmationConfirmed(row) || isVoucherPending(row)) {
    return { readiness: 'Pending', severity: 'ACTION REQUIRED', reasons };
  }

  return { readiness: 'Ready', severity: 'INFO', reasons: ['Operationally ready'] };
}

function getRowPhase(row: OperationsGridRow): Phase {
  if (isConfirmationRejected(row) || isTimingMissing(row)) return 'Critical Issues';
  if (!isAssigned(row)) return 'Needs Assignment';
  if (!isConfirmationConfirmed(row)) return 'Needs Confirmation';
  if (isVoucherPending(row)) return 'Ready for Voucher';
  return 'Operationally Ready';
}

function getSeverityClass(value: string) {
  return value.toLowerCase().replace(/\s+/g, '-');
}

function getAffectedHref(rows: OperationsGridRow[]) {
  return rows[0] ? `#operation-${rows[0].id}` : '#operations-list';
}

function renderAssignmentForm(bookingId: string, row: OperationsGridRow, suppliers: SupplierOption[], compact = false) {
  const rowSuppliers = suppliers.filter((supplier) => isSupplierVisible(supplier) && supplierMatchesService(supplier, row.serviceType));
  return (
    <OperationSupplierAssignmentForm
      bookingId={bookingId}
      operationId={row.id}
      serviceLabel={row.description || row.serviceType}
      assignedSupplierId={row.assignedSupplierId}
      supplierId={row.supplierId}
      assignmentNotes={row.assignmentNotes}
      suppliers={rowSuppliers.map((supplier) => ({ id: supplier.id, name: supplier.name }))}
      compact={compact}
    />
  );
}

function renderConfirmationRequestForm(bookingId: string, row: OperationsGridRow) {
  return (
    <form className="operations-inline-form operations-quick-form" method="post" action={`/api/bookings/${bookingId}/operations/${row.id}/confirmation`}>
      <input type="hidden" name="supplierConfirmationStatus" value="REQUESTED" />
      <input type="hidden" name="confirmationReference" value={row.confirmationReference || row.supplierConfirmationCode || ''} />
      <button type="submit" className="button button-secondary">Request Confirmation</button>
    </form>
  );
}

function renderVoucherForm(bookingId: string, row: OperationsGridRow) {
  return (
    <form className="operations-inline-form operations-quick-form" method="post" action={`/api/bookings/${bookingId}/services/${row.id}/voucher`}>
      <input type="hidden" name="notes" value={row.confirmationNotes || row.assignmentNotes || ''} />
      <button type="submit" className="button button-secondary">Generate Voucher</button>
    </form>
  );
}

function renderConfirmationForm(bookingId: string, row: OperationsGridRow) {
  return (
    <form className="operations-inline-form" method="post" action={`/api/bookings/${bookingId}/operations/${row.id}/confirmation`}>
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
  );
}

export default async function BookingOperationsPage({ params }: PageProps) {
  const { id } = await params;
  const [grid, suppliers, bookingReadiness] = await Promise.all([loadOperationsGrid(id), loadSuppliers(), loadBookingReadiness(id)]);
  const manifest = grid.passengerManifest;
  const roomingIncompleteCount = Number(bookingReadiness?.rooming?.badge?.count || 0);
  const rows = grid.rows;
  const suppliersUnassignedRows = rows.filter((row) => !isAssigned(row));
  const confirmationsRejectedRows = rows.filter(isConfirmationRejected);
  const confirmationsPendingRows = rows.filter((row) => isAssigned(row) && !isConfirmationConfirmed(row) && !isConfirmationRejected(row));
  const vouchersPendingRows = rows.filter((row) => isAssigned(row) && isConfirmationConfirmed(row) && isVoucherPending(row));
  const manifestIncomplete = manifest ? manifest.status !== 'COMPLETE' || manifest.namesPending || manifest.incompleteRecords > 0 : false;
  const readyRows = rows.filter((row) => getRowReadiness(row).readiness === 'Ready').length;
  const readinessPercent = rows.length > 0 ? Math.round((readyRows / rows.length) * 100) : 0;
  const groupedRows = PHASES.map((phase) => ({
    phase,
    rows: rows.filter((row) => getRowPhase(row) === phase),
  }));
  const actionItems = [
    { label: 'Suppliers unassigned', count: suppliersUnassignedRows.length, severity: 'ACTION REQUIRED' as Severity, href: getAffectedHref(suppliersUnassignedRows) },
    { label: 'Confirmations pending', count: confirmationsPendingRows.length, severity: 'ACTION REQUIRED' as Severity, href: getAffectedHref(confirmationsPendingRows) },
    { label: 'Confirmations rejected', count: confirmationsRejectedRows.length, severity: 'CRITICAL' as Severity, href: getAffectedHref(confirmationsRejectedRows) },
    { label: 'Vouchers pending', count: vouchersPendingRows.length, severity: 'ACTION REQUIRED' as Severity, href: getAffectedHref(vouchersPendingRows) },
    { label: 'Manifest incomplete', count: manifestIncomplete ? 1 : 0, severity: 'INFO' as Severity, href: '#manifest-summary' },
    { label: 'Rooming incomplete', count: roomingIncompleteCount, severity: roomingIncompleteCount > 0 ? 'INFO' as Severity : 'INFO' as Severity, href: '#rooming-summary' },
  ];

  return (
    <main className="admin-page-shell booking-operations-simplified-page">
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
              {grid.booking.bookingRef || 'Booking'} - {rows.length} service rows
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

      <section className="admin-card booking-operations-action-center" aria-label="Operational Action Center">
        <div className="operations-card-head">
          <div>
            <p className="eyebrow">Operational Action Center</p>
            <h2>Next actions</h2>
          </div>
          <span className={`operations-readiness-badge operations-readiness-${readinessPercent === 100 ? 'ready' : 'pending'}`}>
            {readinessPercent}% ready
          </span>
        </div>
        <div className="booking-operations-action-grid">
          {actionItems.map((item) => (
            <a key={item.label} className={`booking-operations-action-card severity-${getSeverityClass(item.severity)}`} href={item.href}>
              <span>{item.severity}</span>
              <strong>{item.count}</strong>
              <p>{item.label}</p>
            </a>
          ))}
        </div>
      </section>

      <div className="booking-operations-layout">
        <aside className="booking-operations-sidebar app-sticky-panel" aria-label="Operational summary">
          <h2>Summary</h2>
          <div className="operations-summary-list">
            <div><span>Pending suppliers</span><strong>{suppliersUnassignedRows.length}</strong></div>
            <div><span>Pending confirmations</span><strong>{confirmationsPendingRows.length}</strong></div>
            <div><span>Vouchers pending</span><strong>{vouchersPendingRows.length}</strong></div>
            <div id="rooming-summary"><span>Rooming state</span><strong>{roomingIncompleteCount > 0 ? 'Incomplete' : 'Ready'}</strong></div>
            <div id="manifest-summary"><span>Manifest state</span><strong>{manifestIncomplete ? 'Incomplete' : 'Ready'}</strong></div>
            <div><span>Readiness</span><strong>{readinessPercent}%</strong></div>
          </div>
        </aside>

        <section id="operations-list" className="booking-operations-groups">
          {manifest ? (
            <article className="admin-card booking-operations-manifest-card">
              <div>
                <p className="eyebrow">Passenger Manifest</p>
                <h2>{manifest.status === 'COMPLETE' ? 'Complete' : 'Incomplete'}</h2>
                <p className="admin-muted-copy">
                  {manifest.received}/{manifest.expected} passenger records received
                  {manifest.missingRecords > 0 ? ` - ${manifest.missingRecords} names pending` : ''}
                  {manifest.incompleteRecords > 0 ? ` - ${manifest.incompleteRecords} records incomplete` : ''}
                </p>
              </div>
              <span className="admin-status-pill">{manifest.voucherReady ? 'Voucher ready' : 'Final manifest pending'}</span>
            </article>
          ) : null}

          {rows.length === 0 ? (
            <section className="admin-card">
              <p>No operational service rows have been generated for this booking.</p>
            </section>
          ) : null}

          {groupedRows.map((group) => (
            <section key={group.phase} className="admin-card booking-operations-phase">
              <div className="operations-card-head">
                <div>
                  <p className="eyebrow">Operational phase</p>
                  <h2>{group.phase}</h2>
                </div>
                <span className="admin-status-pill">{group.rows.length}</span>
              </div>
              {group.rows.length === 0 ? (
                <p className="admin-muted-copy">No rows in this phase.</p>
              ) : (
                <div className="booking-operations-row-stack">
                  {group.rows.map((row) => {
                    const assigned = isAssigned(row);
                    const supplierName = row.assignedSupplierName || row.supplierName || 'Unassigned';
                    const readiness = getRowReadiness(row);
                    const rowClass = `booking-operations-row-card readiness-${readiness.readiness.toLowerCase()} severity-${getSeverityClass(readiness.severity)}`;
                    return (
                      <article key={row.id} id={`operation-${row.id}`} className={rowClass}>
                        <header className="booking-operations-row-head">
                          <div>
                            <span className="operation-type-pill">{formatLabel(row.serviceType)}</span>
                            <h3>{row.description || formatLabel(row.serviceType)}</h3>
                            <p className="admin-muted-copy">
                              {row.dayNumber ? `Day ${row.dayNumber}` : 'Unscheduled'}{row.dayTitle ? ` - ${row.dayTitle}` : ''}
                            </p>
                          </div>
                          <span className={`operations-readiness-badge operations-readiness-${readiness.readiness.toLowerCase()}`}>
                            {readiness.readiness}
                          </span>
                        </header>

                        <div className="booking-operations-key-grid">
                          <div><span>Supplier</span><strong>{supplierName}</strong></div>
                          <div><span>Status</span><strong>{formatLabel(row.status)}</strong></div>
                          <div><span>Confirmation</span><strong>{formatLabel(row.supplierConfirmationStatus)}</strong></div>
                          <div><span>Voucher</span><strong>{formatLabel(row.voucherStatus)}</strong></div>
                          <div><span>Readiness</span><strong>{readiness.severity}</strong></div>
                        </div>
                        <div className="booking-operations-debug-grid" aria-label="Operation assignment debug">
                          <span>operationId: {row.id}</span>
                          <span>supplierId: {row.supplierId || '-'}</span>
                          <span>assignedSupplierId: {row.assignedSupplierId || '-'}</span>
                          <span>assignmentStatus: {row.assignmentStatus || '-'}</span>
                          <span>assignedSupplierName: {row.assignedSupplierName || '-'}</span>
                        </div>

                        {readiness.reasons.length > 0 ? (
                          <ul className="booking-operations-reason-list">
                            {readiness.reasons.map((reason) => (
                              <li key={reason}>{reason}</li>
                            ))}
                          </ul>
                        ) : null}

                        <div className="booking-operations-quick-actions">
                          {!assigned ? renderAssignmentForm(id, row, suppliers, true) : null}
                          {assigned && !isConfirmationConfirmed(row) && !isConfirmationRejected(row) ? renderConfirmationRequestForm(id, row) : null}
                          {assigned && isConfirmationConfirmed(row) && isVoucherPending(row) ? renderVoucherForm(id, row) : null}
                        </div>

                        <details className="operations-row-details">
                          <summary>Secondary details</summary>
                          <div className="operations-row-details-body">
                            <div className="booking-operations-secondary-grid">
                              <div><span>Operational date</span><strong>{formatDate(row.operationalDate)}</strong></div>
                              <div><span>Operational time</span><strong>{row.operationalTime || '-'}</strong></div>
                              <div><span>Reference</span><strong>{row.confirmationReference || row.supplierConfirmationCode || '-'}</strong></div>
                              <div><span>Requested</span><strong>{formatDate(row.confirmationRequestedAt)}</strong></div>
                              <div><span>Received</span><strong>{formatDate(row.confirmationReceivedAt)}</strong></div>
                              <div><span>Pickup</span><strong>{row.pickupLocation || '-'}</strong></div>
                              <div><span>Dropoff</span><strong>{row.dropoffLocation || '-'}</strong></div>
                              <div><span>Notes</span><strong>{row.confirmationNotes || row.assignmentNotes || '-'}</strong></div>
                            </div>
                            <div className="booking-operations-editor-grid">
                              {renderAssignmentForm(id, row, suppliers)}
                              {renderConfirmationForm(id, row)}
                            </div>
                          </div>
                        </details>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          ))}
        </section>
      </div>
    </main>
  );
}
